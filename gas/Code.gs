/**
 * Conjugate Session Planner — Google Sheets bridge
 *
 * Setup:
 * 1. Open the Google Sheet linked in SETUP_GUIDE.txt.
 * 2. Extensions > Apps Script.
 * 3. Replace the editor contents with this file.
 * 4. Change ACCESS_TOKEN or leave it blank.
 * 5. Deploy > New deployment > Web app.
 *    Execute as: Me
 *    Who has access: Anyone with the link
 * 6. Paste the deployment URL and the same token into the HTML planner Settings.
 */

const SPREADSHEET_ID = '1RMrZrcdkxUJUeDbWc-IZ8HMJlhzBEKuBAJXtJ7ngfWc';
const ACCESS_TOKEN = 'CHANGE_ME'; // Set to '' to disable token checking.

function doGet(e) {
  try {
    verifyToken_(e && e.parameter ? e.parameter.token : '');
    const action = (e.parameter.action || 'listSessions').trim();
    if (action === 'listSessions') {
      const limit = Math.min(Number(e.parameter.limit || 200), 1000);
      return json_({ ok: true, sessions: listSessions_(limit) });
    }
    if (action === 'getSession') {
      return json_({ ok: true, session: getSession_(e.parameter.id || '') });
    }
    return json_({ ok: false, error: 'Unsupported GET action.' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    verifyToken_(body.token || '');
    if (body.action === 'saveSession') {
      const result = saveSession_(body.payload || {});
      return json_({ ok: true, result: result });
    }
    if (body.action === 'saveCustomExercise') {
      saveCustomExercise_(body.payload || {});
      return json_({ ok: true });
    }
    return json_({ ok: false, error: 'Unsupported POST action.' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function verifyToken_(token) {
  if (ACCESS_TOKEN && ACCESS_TOKEN !== 'CHANGE_ME' && token !== ACCESS_TOKEN) {
    throw new Error('Invalid access token.');
  }
}

function saveSession_(session) {
  if (!session.id) throw new Error('Session ID is required.');
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sessions = ss.getSheetByName('Sessions');
  const exerciseLog = ss.getSheetByName('Exercise_Log');
  const existingRow = findRowByValue_(sessions, 1, session.id);
  const sessionRow = sessionToRow_(session);

  if (existingRow > 1) sessions.getRange(existingRow, 1, 1, sessionRow.length).setValues([sessionRow]);
  else sessions.appendRow(sessionRow);

  deleteRowsBySessionId_(exerciseLog, session.id);
  const exerciseRows = flattenExercises_(session);
  if (exerciseRows.length) {
    exerciseLog.getRange(exerciseLog.getLastRow() + 1, 1, exerciseRows.length, exerciseRows[0].length).setValues(exerciseRows);
  }

  updatePR_(ss, session);
  SpreadsheetApp.flush();
  return { sessionId: session.id, exerciseRows: exerciseRows.length };
}

function sessionToRow_(s) {
  return [
    s.id || '', s.athlete || '', s.date || '', s.weekNumber || '', s.sessionType || '', s.mode || '',
    numberOrBlank_(s.bodyweight), s.trainingPhase || '', s.primaryGoal || '', s.weakPoint || '', s.painRestrictions || '',
    numberOrBlank_(s.readiness && s.readiness.sleep), numberOrBlank_(s.readiness && s.readiness.energy),
    numberOrBlank_(s.readiness && s.readiness.soreness), numberOrBlank_(s.readiness && s.readiness.stress),
    readinessLabel_(s), s.main && s.main.exercise || '', numberOrBlank_(s.main && s.main.previousPR),
    numberOrBlank_(s.main && s.main.target), mainResult_(s), s.main && s.main.isPR ? 'Yes' : 'No',
    s.sessionNotes || '', s.nextSessionNotes || '', s.createdAt || new Date().toISOString(), s.source || 'HTML Planner'
  ];
}

function flattenExercises_(s) {
  const out = [];
  const push = (section, rows) => (rows || []).forEach((r, i) => {
    if (!r || !r.exercise) return;
    out.push(exerciseRow_(s, section, i + 1, r));
  });

  push('Warm-Up', s.warmup);

  if ((s.sessionType || '').indexOf('ME ') === 0) {
    if (s.main && s.main.exercise) {
      out.push(exerciseRow_(s, 'ME Main', 1, {
        exercise: s.main.exercise, sets: '', reps: s.main.topResultReps || 1, weight: s.main.topResultWeight || '',
        rpe: '', rest: '', notes: [s.main.bar, s.main.stanceGrip, s.main.romSetup, s.main.resistance, s.main.bandSetup].filter(Boolean).join(' | '),
        result: s.main.isPR ? 'PR' : 'Top Result'
      }));
    }
    (s.main && s.main.sets || []).forEach((r, i) => {
      out.push(exerciseRow_(s, 'ME Work-Up Set', i + 1, { exercise: s.main.exercise, sets: 1, reps: r.reps, weight: r.weight, rpe: r.rpe, result: r.result, notes: r.notes }));
    });
    push('Supplemental', s.supplemental);
    push('Accessory', s.accessories);
  } else if ((s.sessionType || '').indexOf('DE ') === 0) {
    if (s.de && s.de.primer) out.push(exerciseRow_(s, 'Explosive Primer', 1, { exercise: s.de.primer, sets: s.de.primerSets, reps: s.de.primerReps, contacts: s.de.contacts, notes: s.de.heightDistance }));
    if (s.main && s.main.exercise) out.push(exerciseRow_(s, 'DE Main', 1, { exercise: s.main.exercise, sets: s.de.sets, reps: s.de.reps, weight: s.de.barWeight, rest: s.de.rest, volume: Number(s.de.barWeight || 0) * Number(s.de.sets || 0) * Number(s.de.reps || 0), result: s.de.speedQuality, notes: [s.de.wave, s.de.bar, s.de.boxSetup, s.de.resistance, s.de.bandSetup, s.de.speedNotes].filter(Boolean).join(' | ') }));
    if (s.sessionType === 'DE Lower' && s.de && s.de.speedPullExercise) out.push(exerciseRow_(s, 'Speed Deadlift', 1, { exercise: s.de.speedPullExercise, sets: s.de.speedPullSets, reps: s.de.speedPullReps, weight: s.de.speedPullWeight, rest: s.de.speedPullRest, result: s.de.speedPullQuality, notes: s.de.speedPullResistance }));
    push('Supplemental', s.supplemental);
    push('Accessory', s.accessories);
  } else if (s.sessionType === 'GPP / Extra Workout') {
    push('GPP / Extra Workout', s.gpp && s.gpp.rows);
  } else {
    push(s.sessionType || 'Recovery', s.recovery && s.recovery.rows);
  }
  return out;
}

function exerciseRow_(s, section, order, r) {
  return [
    s.id || '', s.athlete || '', s.date || '', s.sessionType || '', section, order,
    r.exercise || '', r.category || '', r.variation || '', r.bar || '', r.stanceGrip || '', r.romSetup || '',
    r.resistance || '', r.bandSetup || '', numberOrBlank_(r.sets), r.reps || '', numberOrBlank_(r.weight),
    r.rpe || '', r.rest || '', r.duration || '', r.distance || '', numberOrBlank_(r.contacts), numberOrBlank_(r.volume),
    r.weakPoint || '', r.result || '', r.notes || '', new Date().toISOString()
  ];
}

function updatePR_(ss, s) {
  if (!(s.sessionType || '').match(/^ME /) || !s.main || !Number(s.main.topResultWeight)) return;
  const sheet = ss.getSheetByName('PRs');
  const key = variationKey_(s);
  const rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getValues() : [];
  let rowIndex = -1;
  for (let i = 0; i < rows.length; i++) if (rows[i][2] === key) { rowIndex = i + 2; break; }
  const weight = Number(s.main.topResultWeight || 0), reps = Number(s.main.topResultReps || 1);
  const existingWeight = rowIndex > 1 ? Number(sheet.getRange(rowIndex, 8).getValue() || 0) : 0;
  const existingReps = rowIndex > 1 ? Number(sheet.getRange(rowIndex, 9).getValue() || 0) : 0;
  if (weight < existingWeight || (weight === existingWeight && reps <= existingReps)) return;
  const e1rm = reps > 0 ? weight * (1 + reps / 30) : weight;
  const row = [s.athlete || '', s.main.exercise || '', key, s.main.bar || '', s.main.stanceGrip || '', s.main.romSetup || '', s.main.resistance || '', weight, reps, e1rm, s.date || '', s.id || '', s.main.bandSetup || ''];
  if (rowIndex > 1) sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]); else sheet.appendRow(row);
}

function listSessions_(limit) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Sessions');
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const start = Math.max(2, last - limit + 1);
  const values = sheet.getRange(start, 1, last - start + 1, 25).getValues();
  return values.reverse().map(r => ({
    id:r[0], athlete:r[1], date:dateString_(r[2]), weekNumber:r[3], sessionType:r[4], mode:r[5], bodyweight:r[6], trainingPhase:r[7], primaryGoal:r[8], weakPoint:r[9], painRestrictions:r[10],
    readiness:{sleep:r[11],energy:r[12],soreness:r[13],stress:r[14]}, main:{exercise:r[16],previousPR:r[17],target:r[18],topResultWeight:parseResultWeight_(r[19]),topResultReps:parseResultReps_(r[19]),isPR:String(r[20]).toLowerCase()==='yes'},
    sessionNotes:r[21], nextSessionNotes:r[22], createdAt:r[23], source:r[24]
  }));
}

function getSession_(id) {
  const sessions = listSessions_(1000);
  return sessions.find(s => s.id === id) || null;
}

function saveCustomExercise_(x) {
  if (!x.name) throw new Error('Custom exercise name is required.');
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ss.getSheetByName('Custom_Exercises').appendRow([x.name, x.category || 'Custom', x.region || 'Both', x.sections || '', x.defaultUnit || '', x.notes || '', true, new Date().toISOString()]);
}

function variationKey_(s) {
  return [s.athlete,s.sessionType,s.main && s.main.exercise,s.main && s.main.bar,s.main && s.main.stanceGrip,s.main && s.main.romSetup,s.main && s.main.resistance,s.main && s.main.bandSetup]
    .map(v => String(v || '').trim().toLowerCase()).join('|');
}
function mainResult_(s) { return s.main && s.main.topResultWeight ? `${s.main.topResultWeight} x ${s.main.topResultReps || 1}` : ''; }
function readinessLabel_(s) {
  const r = s.readiness || {};
  const vals = [Number(r.sleep),Number(r.energy),6-Number(r.soreness),6-Number(r.stress)];
  if (!vals.every(v => v > 0)) return '';
  const score = vals.reduce((a,b)=>a+b,0)/4;
  if (String(r.painToday || '').indexOf('Severe') === 0) return 'Stop / Refer';
  if (String(r.painToday || '').indexOf('Moderate') === 0 || score < 2.5) return 'Modify Session';
  if (score < 3.5) return 'Train with Caution';
  return 'Good to Train';
}
function findRowByValue_(sheet, column, value) {
  const last = sheet.getLastRow(); if (last < 2) return -1;
  const values = sheet.getRange(2, column, last - 1, 1).getValues();
  for (let i=0;i<values.length;i++) if (String(values[i][0]) === String(value)) return i + 2;
  return -1;
}
function deleteRowsBySessionId_(sheet, id) {
  const last = sheet.getLastRow(); if (last < 2) return;
  const values = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i=values.length-1;i>=0;i--) if (String(values[i][0])===String(id)) sheet.deleteRow(i+2);
}
function numberOrBlank_(v) { const n=Number(v); return Number.isFinite(n) && String(v).trim()!=='' ? n : ''; }
function dateString_(v) { return v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(v || ''); }
function parseResultWeight_(v) { const m=String(v||'').match(/^([\d.]+)/); return m?Number(m[1]):''; }
function parseResultReps_(v) { const m=String(v||'').match(/x\s*([\d.]+)/i); return m?Number(m[1]):1; }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
