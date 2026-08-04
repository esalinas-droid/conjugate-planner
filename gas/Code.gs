/**
 * Conjugate Planner — Google Sheets backend (v2)
 *
 * Stores every session twice:
 *   1. Sessions / Exercise_Log / PRs  — readable rows you can browse in the Sheet.
 *   2. Sessions_Raw                   — the complete session JSON, so the app can
 *                                       reload a session with nothing lost.
 *
 * Setup:
 * 1. Open the Sheet, then Extensions > Apps Script.
 * 2. Replace the editor contents with this file and Save.
 * 3. Change ACCESS_TOKEN below to a private phrase (or leave '' to disable checking).
 * 4. Run > setupSheets (once). Authorise when prompted.
 * 5. Deploy > New deployment > Web app.
 *      Execute as: Me
 *      Who has access: Anyone with the link
 * 6. Paste the deployment URL and the same token into the planner Settings.
 *
 * IMPORTANT: after editing this file you must Deploy > Manage deployments >
 * edit the existing deployment > Version: New version > Deploy. Saving alone
 * does not update the live web app.
 */

const SPREADSHEET_ID = '1RMrZrcdkxUJUeDbWc-IZ8HMJlhzBEKuBAJXtJ7ngfWc';
const ACCESS_TOKEN = 'CHANGE_ME'; // Set to '' to disable token checking.

const RAW_SHEET = 'Sessions_Raw';
const CHUNK = 40000;        // Sheets caps a cell at 50k characters.
const MAX_CHUNKS = 12;

/* ---------------- routing ---------------- */

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    verifyToken_(p.token || '');
    const action = (p.action || 'listSessions').trim();
    if (action === 'ping') return json_({ ok: true, version: 2 });
    if (action === 'listSessions') {
      return json_({ ok: true, sessions: listSessions_(Math.min(Number(p.limit || 300), 2000)) });
    }
    if (action === 'getSession') {
      return json_({ ok: true, session: getSession_(p.id || '') });
    }
    return json_({ ok: false, error: 'Unsupported GET action: ' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    verifyToken_(body.token || '');
    if (body.action === 'saveSession') {
      return json_({ ok: true, result: saveSession_(body.payload || {}) });
    }
    if (body.action === 'deleteSession') {
      return json_({ ok: true, result: deleteSession_(body.id || '') });
    }
    if (body.action === 'saveCustomExercise') {
      saveCustomExercise_(body.payload || {});
      return json_({ ok: true });
    }
    return json_({ ok: false, error: 'Unsupported POST action: ' + body.action });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function verifyToken_(token) {
  if (ACCESS_TOKEN && ACCESS_TOKEN !== 'CHANGE_ME' && token !== ACCESS_TOKEN) {
    throw new Error('Invalid access token.');
  }
}

/* ---------------- sheet setup ---------------- */

/** Run once from the Apps Script editor to create any missing tabs and headers. */
function setupSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const specs = {
    'Sessions': ['ID', 'Athlete', 'Date', 'Week', 'Session Type', 'Mode', 'Bodyweight', 'Training Phase',
      'Primary Goal', 'Weak Point', 'Pain / Restrictions', 'Sleep', 'Energy', 'Soreness', 'Stress',
      'Readiness', 'Main Exercise', 'Previous PR', 'Target', 'Top Result', 'PR?', 'Sets Logged',
      'Sets Completed', 'Tonnage', 'Session Notes', 'Next Session', 'Created At', 'Updated At', 'Source'],
    'Exercise_Log': ['Session ID', 'Athlete', 'Date', 'Session Type', 'Section', 'Order', 'Exercise',
      'Category', 'Variation', 'Bar', 'Stance / Grip', 'ROM / Setup', 'Resistance', 'Band / Chain Setup',
      'Planned Sets', 'Planned Reps', 'Planned Weight', 'RPE', 'Rest', 'Duration', 'Distance', 'Contacts',
      'Volume', 'Weak Point', 'Result', 'Notes', 'Logged Sets', 'Sets Completed', 'Logged Detail', 'Recorded At'],
    'PRs': ['Athlete', 'Exercise', 'Variation Key', 'Bar', 'Stance / Grip', 'ROM / Setup', 'Resistance',
      'Weight', 'Reps', 'Est. 1RM', 'Date', 'Session ID', 'Band / Chain Setup'],
    'Custom_Exercises': ['Name', 'Category', 'Region', 'Sections', 'Default Unit', 'Notes', 'Active', 'Created At'],
    'Athletes_Settings': ['Athlete', 'Key', 'Value', 'Updated At'],
    [RAW_SHEET]: ['ID', 'Updated At', 'JSON']
  };
  Object.keys(specs).forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    const headers = specs[name];
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  });
  if (ss.getSheetByName(RAW_SHEET)) ss.getSheetByName(RAW_SHEET).hideSheet();
  return 'Sheets ready.';
}

function sheet_(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet "' + name + '". Run setupSheets() once from the Apps Script editor.');
  return sheet;
}

/* ---------------- save ---------------- */

function saveSession_(session) {
  if (!session || !session.id) throw new Error('Session ID is required.');
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  writeRaw_(ss, session);

  const sessions = sheet_(ss, 'Sessions');
  const sessionRow = sessionToRow_(session);
  const existing = findRowByValue_(sessions, 1, session.id);
  if (existing > 1) sessions.getRange(existing, 1, 1, sessionRow.length).setValues([sessionRow]);
  else sessions.appendRow(sessionRow);

  const exerciseLog = sheet_(ss, 'Exercise_Log');
  deleteRowsBySessionId_(exerciseLog, session.id);
  const rows = flattenExercises_(session);
  if (rows.length) {
    exerciseLog.getRange(exerciseLog.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }

  updatePR_(ss, session);
  SpreadsheetApp.flush();
  return { sessionId: session.id, exerciseRows: rows.length };
}

/** Store the full session JSON, chunked across columns to stay under the 50k cell cap. */
function writeRaw_(ss, session) {
  const sheet = sheet_(ss, RAW_SHEET);
  const json = JSON.stringify(session);
  const chunks = [];
  for (let i = 0; i < json.length; i += CHUNK) chunks.push(json.slice(i, i + CHUNK));
  if (chunks.length > MAX_CHUNKS) throw new Error('Session is too large to store (' + json.length + ' chars).');

  const width = MAX_CHUNKS + 2;
  const row = new Array(width).fill('');
  row[0] = session.id;
  row[1] = session.updatedAt || new Date().toISOString();
  chunks.forEach((c, i) => { row[i + 2] = c; });

  const existing = findRowByValue_(sheet, 1, session.id);
  if (existing > 1) sheet.getRange(existing, 1, 1, width).setValues([row]);
  else sheet.getRange(sheet.getLastRow() + 1, 1, 1, width).setValues([row]);
}

function readRaw_(sheet, rowIndex) {
  const width = Math.max(sheet.getLastColumn(), 3);
  const values = sheet.getRange(rowIndex, 1, 1, width).getValues()[0];
  const json = values.slice(2).filter(v => v !== '' && v !== null).join('');
  if (!json) return null;
  try { return JSON.parse(json); } catch (err) { return null; }
}

function deleteSession_(id) {
  if (!id) throw new Error('Session ID is required.');
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  [RAW_SHEET, 'Sessions'].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    const row = findRowByValue_(sheet, 1, id);
    if (row > 1) sheet.deleteRow(row);
  });
  const log = ss.getSheetByName('Exercise_Log');
  if (log) deleteRowsBySessionId_(log, id);
  SpreadsheetApp.flush();
  return { deleted: id };
}

/* ---------------- read ---------------- */

function listSessions_(limit) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(RAW_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const last = sheet.getLastRow();
  const start = Math.max(2, last - limit + 1);
  const out = [];
  for (let r = last; r >= start; r--) {
    const session = readRaw_(sheet, r);
    if (session) out.push(session);
  }
  out.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) ||
                     String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return out;
}

function getSession_(id) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(RAW_SHEET);
  if (!sheet) return null;
  const row = findRowByValue_(sheet, 1, id);
  return row > 1 ? readRaw_(sheet, row) : null;
}

/* ---------------- row shaping ---------------- */

function sessionToRow_(s) {
  const counts = setCounts_(s);
  return [
    s.id || '', s.athlete || '', s.date || '', s.weekNumber || '', s.sessionType || '', s.mode || '',
    numberOrBlank_(s.bodyweight), s.trainingPhase || '', s.primaryGoal || '', s.weakPoint || '', s.painRestrictions || '',
    numberOrBlank_(s.readiness && s.readiness.sleep), numberOrBlank_(s.readiness && s.readiness.energy),
    numberOrBlank_(s.readiness && s.readiness.soreness), numberOrBlank_(s.readiness && s.readiness.stress),
    readinessLabel_(s), (s.main && s.main.exercise) || '', numberOrBlank_(s.main && s.main.previousPR),
    numberOrBlank_(s.main && s.main.target), mainResult_(s), (s.main && s.main.isPR) ? 'Yes' : 'No',
    counts.total, counts.done, tonnage_(s),
    s.sessionNotes || '', s.nextSessionNotes || '',
    s.createdAt || new Date().toISOString(), s.updatedAt || new Date().toISOString(), s.source || 'Conjugate Planner'
  ];
}

function flattenExercises_(s) {
  const out = [];
  const push = (section, rows) => (rows || []).forEach((r, i) => {
    if (!r || !r.exercise) return;
    out.push(exerciseRow_(s, section, i + 1, r));
  });
  const type = s.sessionType || '';

  push('Warm-Up', s.warmup);

  if (type.indexOf('ME ') === 0) {
    if (s.main && s.main.exercise) {
      out.push(exerciseRow_(s, 'ME Main', 1, {
        exercise: s.main.exercise, sets: '', reps: s.main.topResultReps || 1, weight: s.main.topResultWeight || '',
        bar: s.main.bar, stanceGrip: s.main.stanceGrip, romSetup: s.main.romSetup,
        resistance: s.main.resistance, bandSetup: s.main.bandSetup,
        result: s.main.isPR ? 'PR' : 'Top Result'
      }));
    }
    ((s.main && s.main.sets) || []).forEach((r, i) => {
      out.push(exerciseRow_(s, 'ME Work-Up Set', i + 1, {
        exercise: (s.main && s.main.exercise) || '', sets: 1, reps: r.reps, weight: r.weight,
        rpe: r.rpe, result: r.result, notes: r.notes, done: r.done
      }));
    });
    push('Supplemental', s.supplemental);
    push('Accessory', s.accessories);

  } else if (type.indexOf('DE ') === 0) {
    const de = s.de || {};
    if (de.primer) {
      out.push(exerciseRow_(s, 'Explosive Primer', 1, {
        exercise: de.primer, sets: de.primerSets, reps: de.primerReps,
        contacts: de.contacts, notes: de.heightDistance, log: de.primerLog
      }));
    }
    if (s.main && s.main.exercise) {
      out.push(exerciseRow_(s, 'DE Main', 1, {
        exercise: s.main.exercise, sets: de.sets, reps: de.reps, weight: de.barWeight, rest: de.rest,
        bar: de.bar, romSetup: de.boxSetup, resistance: de.resistance, bandSetup: de.bandSetup,
        volume: Number(de.barWeight || 0) * Number(de.sets || 0) * Number(de.reps || 0),
        result: de.speedQuality, notes: [de.wave, de.speedNotes].filter(Boolean).join(' | '), log: de.mainLog
      }));
    }
    if (type === 'DE Lower' && de.speedPullExercise) {
      out.push(exerciseRow_(s, 'Speed Deadlift', 1, {
        exercise: de.speedPullExercise, sets: de.speedPullSets, reps: de.speedPullReps,
        weight: de.speedPullWeight, rest: de.speedPullRest, resistance: de.speedPullResistance,
        result: de.speedPullQuality, log: de.speedPullLog
      }));
    }
    push('Supplemental', s.supplemental);
    push('Accessory', s.accessories);

  } else if (type === 'GPP / Extra Workout') {
    push('GPP / Extra Workout', s.gpp && s.gpp.rows);
  } else {
    push(type || 'Recovery', s.recovery && s.recovery.rows);
  }
  return out;
}

function exerciseRow_(s, section, order, r) {
  const log = r.log || [];
  const logged = log.filter(function (x) { return x && (x.weight !== '' || x.reps !== '' || x.done); });
  const completed = log.filter(function (x) { return x && x.done; }).length;
  const detail = logged.map(function (x) {
    return (x.weight === '' ? '—' : x.weight) + '×' + (x.reps === '' ? '—' : x.reps) + (x.done ? '✓' : '');
  }).join(', ');
  const variation = [r.bar, r.stanceGrip, r.romSetup, r.resistance, r.bandSetup].filter(Boolean).join(' | ');
  return [
    s.id || '', s.athlete || '', s.date || '', s.sessionType || '', section, order,
    r.exercise || '', r.category || '', variation, r.bar || '', r.stanceGrip || '', r.romSetup || '',
    r.resistance || '', r.bandSetup || '', numberOrBlank_(r.sets), r.reps || '', numberOrBlank_(r.weight),
    r.rpe || '', r.rest || '', r.duration || '', r.distance || '', numberOrBlank_(r.contacts),
    numberOrBlank_(r.volume), r.weakPoint || '', r.result || '', r.notes || '',
    logged.length || (r.done ? 1 : 0), completed || (r.done ? 1 : 0), detail, new Date().toISOString()
  ];
}

/* ---------------- derived values ---------------- */

function setCounts_(s) {
  let total = 0, done = 0;
  const count = function (sets) {
    (sets || []).forEach(function (x) {
      if (!x) return;
      total += 1;
      if (x.done) done += 1;
    });
  };
  const countRows = function (rows) { (rows || []).forEach(function (r) { count(r && r.log); }); };
  const type = s.sessionType || '';
  countRows(s.warmup);
  if (type.indexOf('ME ') === 0) count(s.main && s.main.sets);
  if (type.indexOf('ME ') === 0 || type.indexOf('DE ') === 0) {
    countRows(s.supplemental);
    countRows(s.accessories);
  }
  if (type.indexOf('DE ') === 0 && s.de) {
    count(s.de.primerLog); count(s.de.mainLog);
    if (type === 'DE Lower') count(s.de.speedPullLog);
  }
  if (type === 'GPP / Extra Workout') countRows(s.gpp && s.gpp.rows);
  if (type === 'Recovery / Restoration' || type === 'Deload') countRows(s.recovery && s.recovery.rows);
  return { total: total, done: done };
}

function tonnage_(s) {
  let total = 0;
  const n = function (v) { const x = Number(v); return isFinite(x) ? x : 0; };
  ((s.main && s.main.sets) || []).forEach(function (x) { total += n(x.weight) * n(x.reps); });
  total += n(s.main && s.main.topResultWeight) * (n(s.main && s.main.topResultReps) || 1);
  const addLogged = function (sets, fallback) {
    const done = (sets || []).filter(function (x) { return x && x.done; });
    if (done.length) done.forEach(function (x) { total += n(x.weight) * n(x.reps); });
    else total += fallback;
  };
  if (s.de) {
    addLogged(s.de.mainLog, n(s.de.barWeight) * n(s.de.sets) * n(s.de.reps));
    addLogged(s.de.speedPullLog, n(s.de.speedPullWeight) * n(s.de.speedPullSets) * n(s.de.speedPullReps));
  }
  [s.supplemental, s.accessories, s.gpp && s.gpp.rows, s.recovery && s.recovery.rows].forEach(function (rows) {
    (rows || []).forEach(function (r) {
      (r.log || []).forEach(function (x) { if (x && x.done) total += n(x.weight) * n(x.reps); });
    });
  });
  return Math.round(total) || '';
}

function updatePR_(ss, s) {
  if (!(s.sessionType || '').match(/^ME /) || !s.main || !Number(s.main.topResultWeight)) return;
  const sheet = sheet_(ss, 'PRs');
  const key = variationKey_(s);
  const last = sheet.getLastRow();
  const rows = last > 1 ? sheet.getRange(2, 1, last - 1, 13).getValues() : [];
  let rowIndex = -1;
  for (let i = 0; i < rows.length; i++) if (rows[i][2] === key) { rowIndex = i + 2; break; }
  const weight = Number(s.main.topResultWeight || 0), reps = Number(s.main.topResultReps || 1);
  const existingWeight = rowIndex > 1 ? Number(sheet.getRange(rowIndex, 8).getValue() || 0) : 0;
  const existingReps = rowIndex > 1 ? Number(sheet.getRange(rowIndex, 9).getValue() || 0) : 0;
  if (rowIndex > 1 && (weight < existingWeight || (weight === existingWeight && reps <= existingReps))) return;
  const e1rm = reps > 1 ? weight * (1 + reps / 30) : weight;
  const row = [s.athlete || '', s.main.exercise || '', key, s.main.bar || '', s.main.stanceGrip || '',
    s.main.romSetup || '', s.main.resistance || '', weight, reps, Math.round(e1rm * 10) / 10,
    s.date || '', s.id || '', s.main.bandSetup || ''];
  if (rowIndex > 1) sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
}

function saveCustomExercise_(x) {
  if (!x.name) throw new Error('Custom exercise name is required.');
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  sheet_(ss, 'Custom_Exercises').appendRow([x.name, x.category || 'Custom', x.region || 'Both',
    x.sections || '', x.defaultUnit || '', x.notes || '', true, new Date().toISOString()]);
}

/* ---------------- helpers ---------------- */

function variationKey_(s) {
  return [s.athlete, s.sessionType, s.main && s.main.exercise, s.main && s.main.bar,
    s.main && s.main.stanceGrip, s.main && s.main.romSetup, s.main && s.main.resistance,
    s.main && s.main.bandSetup].map(function (v) { return String(v || '').trim().toLowerCase(); }).join('|');
}
function mainResult_(s) {
  return (s.main && s.main.topResultWeight) ? (s.main.topResultWeight + ' x ' + (s.main.topResultReps || 1)) : '';
}
function readinessLabel_(s) {
  const r = s.readiness || {};
  const vals = [Number(r.sleep), Number(r.energy), 6 - Number(r.soreness), 6 - Number(r.stress)];
  if (!vals.every(function (v) { return v > 0; })) return '';
  const score = vals.reduce(function (a, b) { return a + b; }, 0) / 4;
  if (String(r.painToday || '').indexOf('Severe') === 0) return 'Stop / Refer';
  if (String(r.painToday || '').indexOf('Moderate') === 0 || score < 2.5) return 'Modify Session';
  if (score < 3.5) return 'Train with Caution';
  return 'Good to Train';
}
function findRowByValue_(sheet, column, value) {
  const last = sheet.getLastRow();
  if (last < 2) return -1;
  const values = sheet.getRange(2, column, last - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) if (String(values[i][0]) === String(value)) return i + 2;
  return -1;
}
function deleteRowsBySessionId_(sheet, id) {
  const last = sheet.getLastRow();
  if (last < 2) return;
  const values = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = values.length - 1; i >= 0; i--) if (String(values[i][0]) === String(id)) sheet.deleteRow(i + 2);
}
function numberOrBlank_(v) {
  const n = Number(v);
  return isFinite(n) && String(v).trim() !== '' ? n : '';
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
