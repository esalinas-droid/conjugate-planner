/* Conjugate Planner — main application.
   Rebuilt from conjugate_session_planner.html. Session state shape and the
   Google Sheets sync payload are unchanged, so the existing Code.gs backend
   and old JSON backups keep working. */
(function () {
  'use strict';

  const { sessionMeta, exerciseDB, presets, categoryLabels, row } = window.ConjugateData;

  const APP_VERSION = '2.3.0';
  const DB_SHEET_ID = '1RMrZrcdkxUJUeDbWc-IZ8HMJlhzBEKuBAJXtJ7ngfWc';
  const STORAGE = {
    draft: 'conjugatePlannerDraftV2',
    history: 'conjugatePlannerHistoryV2',
    settings: 'conjugatePlannerSettingsV2',
    custom: 'conjugatePlannerCustomExercisesV2',
    outbox: 'conjugatePlannerOutboxV2'
  };

  const defaultSettings = { athlete: 'Eric Salinas', unit: 'lb', scriptUrl: '', token: '', sync: 'off', sheetId: DB_SHEET_ID };

  let settings = loadJSON(STORAGE.settings, defaultSettings);
  let customExercises = loadJSON(STORAGE.custom, []);
  /* In cloud mode `history` is an in-memory mirror of the Sheet, never persisted. */
  let history = loadJSON(STORAGE.history, []);
  let outbox = loadJSON(STORAGE.outbox, []);
  let state = createBlankState('ME Lower');
  let draftTimer;
  let currentView = 'train';
  let remoteLoaded = false;

  const isCloud = () => settings.sync === 'cloud';
  const sheetsEnabled = () => (settings.sync === 'on' || settings.sync === 'cloud') && !!settings.scriptUrl;

  /* ---------------- helpers ---------------- */
  function uid() { return 'sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
  function todayISO() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  function setRow(weight = '', reps = '', rpe = '', result = 'Successful', notes = '') { return { weight, reps, rpe, result, notes, done: false }; }
  function logSet(weight = '', reps = '', done = false) { return { weight, reps, done }; }
  function loadJSON(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : structuredClone(fallback); }
    catch { return structuredClone(fallback); }
  }
  function saveJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function escapeHTML(v = '') { return String(v).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
  function num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
  function formatDate(iso) { if (!iso) return ''; const d = new Date(iso + 'T12:00:00'); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  function e1rm(weight, reps) { const w = num(weight), r = num(reps) || 1; return r > 1 ? w * (1 + r / 30) : w; }
  function val(id) { return document.getElementById(id)?.value ?? ''; }
  function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v ?? ''; }
  function qv(root, sel) { return root.querySelector(sel)?.value ?? ''; }

  /* ---------------- state ---------------- */
  function createBlankState(sessionType = 'ME Lower') {
    return {
      id: uid(), athlete: settings.athlete || 'Eric Salinas', date: todayISO(), weekNumber: '', bodyweight: '',
      trainingPhase: 'General Conjugate Development', primaryGoal: '', weakPoint: '', painRestrictions: '',
      sessionType, mode: 'Plan',
      readiness: { sleep: '', energy: '', soreness: '', stress: '', painToday: 'No', action: '' },
      warmup: [row(defaultWarmup(sessionType)), row()],
      main: { exercise: '', bar: 'Straight Bar', stanceGrip: '', romSetup: '', resistance: 'Straight Weight', bandSetup: '', previousPR: '', target: '', topResultWeight: '', topResultReps: '1', isPR: false, sets: [setRow('', 5), setRow('', 3), setRow('', 1)] },
      de: { primer: '', primerSets: '', primerReps: '', contacts: '', heightDistance: '', wave: 'Week 1', baseMax: '', percentage: '50', barWeight: '', bar: 'Straight Bar', boxSetup: '', resistance: 'Straight Weight', bandSetup: '', sets: '12', reps: '2', rest: '45', speedQuality: 'Good', speedNotes: '', speedPullExercise: 'Speed Deadlift — Conventional', speedPullWeight: '', speedPullResistance: 'Straight Weight', speedPullSets: '6', speedPullReps: '1', speedPullRest: '60', speedPullQuality: 'Good', primerLog: [], mainLog: [], speedPullLog: [] },
      supplemental: [row()], accessories: [row(), row(), row()],
      gpp: { purpose: 'Work Capacity', focus: 'Posterior Chain', targetDuration: '20', intensity: 'RPE 5–6', preset: '', rows: [row(), row(), row()] },
      recovery: { mode: 'Restoration', reason: 'Post-ME Lower Recovery', availableTime: '20', preset: '', intensity: 'RPE 3–5', equipment: ['Bike', 'Reverse Hyper', 'Bands'], mainLiftLoad: 'Reduce', accessoryVolume: 'Reduce ~50%', gppStrategy: 'Easy Restoration', duration: '1 Week', rows: [row(), row(), row()] },
      sessionNotes: '', nextSessionNotes: '', createdAt: '', updatedAt: new Date().toISOString(), source: 'HTML Planner'
    };
  }

  function normalizeState(input) {
    const base = createBlankState(input && input.sessionType ? input.sessionType : 'ME Lower');
    const merged = { ...base, ...(input || {}) };
    merged.readiness = { ...base.readiness, ...((input && input.readiness) || {}) };
    merged.main = { ...base.main, ...((input && input.main) || {}) };
    merged.main.sets = Array.isArray(input && input.main && input.main.sets) ? input.main.sets : base.main.sets;
    merged.de = { ...base.de, ...((input && input.de) || {}) };
    merged.gpp = { ...base.gpp, ...((input && input.gpp) || {}) };
    merged.gpp.rows = Array.isArray(input && input.gpp && input.gpp.rows) ? input.gpp.rows : base.gpp.rows;
    merged.recovery = { ...base.recovery, ...((input && input.recovery) || {}) };
    merged.recovery.rows = Array.isArray(input && input.recovery && input.recovery.rows) ? input.recovery.rows : base.recovery.rows;
    merged.recovery.equipment = Array.isArray(input && input.recovery && input.recovery.equipment) ? input.recovery.equipment : base.recovery.equipment;
    merged.warmup = Array.isArray(input && input.warmup) ? input.warmup : base.warmup;
    merged.supplemental = Array.isArray(input && input.supplemental) ? input.supplemental : base.supplemental;
    merged.accessories = Array.isArray(input && input.accessories) ? input.accessories : base.accessories;
    return ensureLogShapes(merged);
  }

  function ensureLogShapes(s) {
    [s.warmup, s.supplemental, s.accessories, s.gpp.rows, s.recovery.rows]
      .forEach(rows => (rows || []).forEach(r => { if (!Array.isArray(r.log)) r.log = []; }));
    (s.main.sets || []).forEach(x => { if (typeof x.done !== 'boolean') x.done = false; });
    ['primerLog', 'mainLog', 'speedPullLog'].forEach(k => { if (!Array.isArray(s.de[k])) s.de[k] = []; });
    return s;
  }

  /* Pre-create logged-set rows from the plan so Log mode is ready to check off. */
  function seedLogs() {
    ensureLogShapes(state);
    /* Only carry a planned value into the logged field when it is a plain
       number. "8–12" or "5 min" is a target and shows as a placeholder. */
    const fill = v => (isNumeric(v) ? String(v).trim() : '');
    const seedRows = rows => rows.forEach(r => {
      if (!r.exercise || r.log.length) return;
      const n = Math.min(Math.max(parseInt(r.sets, 10) || 1, 1), 12);
      r.log = Array.from({ length: n }, () => logSet(fill(r.weight), fill(r.reps || r.duration)));
    });
    const seedCount = (sets, weight, reps, cap = 24) => {
      const n = Math.min(Math.max(parseInt(sets, 10) || 1, 1), cap);
      return Array.from({ length: n }, () => logSet(fill(weight), fill(reps)));
    };
    seedRows(state.warmup);
    const t = state.sessionType;
    if (t.startsWith('ME ') || t.startsWith('DE ')) { seedRows(state.supplemental); seedRows(state.accessories); }
    if (t.startsWith('DE ')) {
      const de = state.de;
      if (de.primer && !de.primerLog.length) de.primerLog = seedCount(de.primerSets, '', de.primerReps, 12);
      if (state.main.exercise && !de.mainLog.length) de.mainLog = seedCount(de.sets, de.barWeight, de.reps);
      if (t === 'DE Lower' && de.speedPullExercise && !de.speedPullLog.length) de.speedPullLog = seedCount(de.speedPullSets, de.speedPullWeight, de.speedPullReps);
    }
    if (t === 'GPP / Extra Workout') seedRows(state.gpp.rows);
    if (['Recovery / Restoration', 'Deload'].includes(t)) seedRows(state.recovery.rows);
  }

  function clearLogs(s) {
    [s.warmup, s.supplemental, s.accessories, s.gpp.rows, s.recovery.rows]
      .forEach(rows => (rows || []).forEach(r => { r.log = []; }));
    (s.main.sets || []).forEach(x => { x.done = false; });
    s.de.primerLog = []; s.de.mainLog = []; s.de.speedPullLog = [];
    return s;
  }

  function defaultWarmup(type) { return type.includes('Upper') ? 'Band Pull-Apart' : 'Easy Bike'; }

  /* ---------------- init ---------------- */
  function init() {
    renderSessionChips();
    renderReadiness();
    populateSessionTypeFilters();
    bindStaticEvents();
    populateSettingsForm();
    const draft = loadJSON(STORAGE.draft, null);
    if (draft && draft.sessionType) state = normalizeState(draft);
    applyStateToStaticFields();
    renderAll();
    updateSyncHelp();
    document.getElementById('appVersion').textContent = 'Conjugate Planner v' + APP_VERSION;
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    if (isCloud()) { history = []; localStorage.removeItem(STORAGE.history); }
    if (sheetsEnabled()) { flushOutbox(); loadRemoteHistory(false); }
    window.addEventListener('online', () => { if (sheetsEnabled()) flushOutbox(); });
  }

  /* ---------------- outbox (offline safety net) ---------------- */
  function queueOutbox(session) {
    outbox = outbox.filter(s => s.id !== session.id);
    outbox.push(structuredClone(session));
    saveJSON(STORAGE.outbox, outbox);
    updateOutboxBadge();
  }
  function updateOutboxBadge() {
    const el = document.getElementById('outboxNote');
    if (!el) return;
    el.textContent = outbox.length ? `${outbox.length} session${outbox.length > 1 ? 's' : ''} waiting to reach Google Sheets.` : '';
    el.classList.toggle('hidden', !outbox.length);
  }
  async function flushOutbox(showToast = false) {
    if (!sheetsEnabled() || !outbox.length) { updateOutboxBadge(); return; }
    const remaining = [];
    for (const session of outbox) {
      try { await postToSheets('saveSession', { payload: session }); }
      catch { remaining.push(session); }
    }
    const sent = outbox.length - remaining.length;
    outbox = remaining;
    saveJSON(STORAGE.outbox, outbox);
    updateOutboxBadge();
    if (sent > 0) {
      toast(`${sent} pending session${sent > 1 ? 's' : ''} synced to Google Sheets.`, 'success');
      remoteLoaded = false;
      loadRemoteHistory(false);
    } else if (showToast && remaining.length) {
      toast('Still cannot reach Google Sheets. Sessions are safe and will retry.', 'error');
    }
  }

  /* ---------------- Sheets transport ---------------- */
  async function postToSheets(action, body) {
    if (!settings.scriptUrl) throw new Error('No Apps Script URL configured.');
    const response = await fetch(settings.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: settings.token || '', ...body })
    });
    let result = {};
    try { result = await response.json(); } catch { throw new Error('Unreadable response from Apps Script.'); }
    if (!response.ok || result.ok === false) throw new Error(result.error || 'Request failed');
    return result;
  }
  async function getFromSheets(params) {
    if (!settings.scriptUrl) throw new Error('No Apps Script URL configured.');
    const url = new URL(settings.scriptUrl);
    Object.entries({ token: settings.token || '', ...params }).forEach(([k, v]) => url.searchParams.set(k, v));
    const response = await fetch(url.toString());
    const result = await response.json();
    if (!result.ok) throw new Error(result.error || 'Request failed');
    return result;
  }

  async function loadRemoteHistory(showToast = true) {
    if (!sheetsEnabled()) return;
    try {
      const result = await getFromSheets({ action: 'listSessions', limit: '300' });
      const remote = (Array.isArray(result.sessions) ? result.sessions : []).map(normalizeState);
      if (isCloud()) {
        history = remote;
      } else {
        const map = new Map(history.map(h => [h.id, h]));
        remote.forEach(h => { if (h.id) map.set(h.id, h); });
        history = [...map.values()];
        saveJSON(STORAGE.history, history);
      }
      history.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
      remoteLoaded = true;
      if (currentView === 'history') renderHistory();
      if (currentView === 'progress') renderProgress();
      if (showToast) toast(`Loaded ${remote.length} sessions from Google Sheets.`, 'success');
    } catch (err) {
      if (showToast) toast('Could not reach Google Sheets: ' + err.message, 'error');
    }
  }

  async function testConnection() {
    if (!settings.scriptUrl) return toast('Paste your Apps Script Web App URL first.', 'error');
    toast('Testing connection…');
    try {
      await getFromSheets({ action: 'ping' });
      toast('Connected to Google Sheets successfully.', 'success');
      loadRemoteHistory(false);
    } catch (err) {
      toast('Connection failed: ' + err.message, 'error');
    }
  }

  function updateSyncHelp() {
    const el = document.getElementById('syncHelp');
    if (!el) return;
    const messages = {
      off: 'Sessions are saved only in this browser. Export a backup regularly.',
      on: 'Sessions are saved here and pushed to Google Sheets. Safest option.',
      cloud: 'Sessions live in Google Sheets. Only the session you are currently editing is kept on the phone. Needs a connection to save — anything logged offline is held safely and synced automatically.'
    };
    el.textContent = messages[settings.sync] || '';
  }

  /* ---------------- views ---------------- */
  function showView(name) {
    currentView = name;
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    document.getElementById('restFab').hidden = name !== 'train';
    if ((name === 'history' || name === 'progress') && sheetsEnabled() && !remoteLoaded) loadRemoteHistory(false);
    if (name === 'history') renderHistory();
    if (name === 'progress') renderProgress();
    if (name === 'settings') updateOutboxBadge();
    window.scrollTo({ top: 0 });
  }

  function renderSessionChips() {
    document.getElementById('sessionChips').innerHTML = Object.entries(sessionMeta)
      .map(([type, meta]) => `<button class="chip-btn" data-session="${escapeHTML(type)}">${escapeHTML(meta.short)}</button>`).join('');
  }

  /* ---------------- events ---------------- */
  function bindStaticEvents() {
    document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
    document.getElementById('sessionChips').addEventListener('click', e => {
      const chip = e.target.closest('[data-session]');
      if (chip) changeSessionType(chip.dataset.session);
    });
    document.querySelectorAll('.mode-toggle button').forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
    document.getElementById('newBtn').addEventListener('click', newSession);
    document.getElementById('saveBtn').addEventListener('click', saveSession);
    document.getElementById('printBtn').addEventListener('click', printSession);

    document.querySelectorAll('#athlete,#sessionDate,#weekNumber,#bodyweight,#trainingPhase,#primaryGoal,#weakPoint,#painRestrictions,#painToday,#readinessAction,#sessionNotes,#nextSessionNotes')
      .forEach(el => el.addEventListener('input', scheduleDraft));
    document.getElementById('painToday').addEventListener('change', updateReadiness);

    document.addEventListener('click', e => {
      const add = e.target.closest('[data-add-row]');
      if (add) addRow(add.dataset.addRow);
      const remove = e.target.closest('[data-remove-row]');
      if (remove) removeRow(remove.dataset.removeRow, Number(remove.dataset.index));
      const move = e.target.closest('[data-move-row]');
      if (move) moveRow(move.dataset.moveRow, Number(move.dataset.index), Number(move.dataset.direction));
      const setAdd = e.target.closest('[data-add-set]');
      if (setAdd) {
        collectState();
        const last = state.main.sets[state.main.sets.length - 1];
        state.main.sets.push(last ? setRow(last.weight, last.reps) : setRow());
        renderAll(); scheduleDraft();
      }
      const applyPreset = e.target.closest('[data-apply-preset]');
      if (applyPreset) applySelectedPreset(applyPreset.dataset.applyPreset);
      const logAdd = e.target.closest('[data-log-add]');
      if (logAdd) {
        collectState();
        const [key, idx] = logAdd.dataset.logAdd.split(':');
        const arr = logSetsArray(key, Number(idx));
        if (arr) {
          const last = arr[arr.length - 1];
          arr.push(logSet(last ? last.weight : '', last ? last.reps : ''));
          renderAll(); scheduleDraft();
        }
      }
      const logDel = e.target.closest('[data-log-del]');
      if (logDel) {
        const setEl = logDel.closest('.log-set');
        const block = logDel.closest('[data-log-row]');
        if (setEl && block) {
          collectState();
          const [key, idx] = block.dataset.logRow.split(':');
          const arr = logSetsArray(key, Number(idx));
          const j = [...block.querySelectorAll('.log-set')].indexOf(setEl);
          if (arr && j >= 0) { arr.splice(j, 1); renderAll(); scheduleDraft(); }
        }
      }
    });

    document.addEventListener('input', e => {
      if (e.target.closest('#sessionSpecific') || e.target.closest('#warmupCard')) {
        if (e.target.matches('[data-de-calc]')) updateDECalculations();
        scheduleDraft();
      }
    });
    document.addEventListener('change', e => {
      if (e.target.closest('#sessionSpecific') || e.target.closest('#warmupCard')) {
        if (e.target.matches('[data-main-exercise], [data-main-variation]')) updatePreviousPRFromHistory();
        if (e.target.matches('.logDone')) {
          e.target.closest('.log-set')?.classList.toggle('done', e.target.checked);
          collectState(); updateLogProgress();
        }
        if (e.target.matches('.setDone')) {
          e.target.closest('tr')?.classList.toggle('done', e.target.checked);
          collectState(); updateLogProgress();
        }
        scheduleDraft();
      }
    });

    document.getElementById('historyTypeFilter').addEventListener('change', renderHistory);
    document.getElementById('historyExerciseFilter').addEventListener('input', renderHistory);
    document.getElementById('historyAthleteFilter').addEventListener('input', renderHistory);
    document.getElementById('remoteHistoryBtn').addEventListener('click', syncRemoteHistory);

    document.getElementById('progressVariation').addEventListener('change', renderProgress);
    document.getElementById('prSearch').addEventListener('input', renderPRs);
    document.getElementById('prAthlete').addEventListener('input', renderPRs);
    document.getElementById('exportPrCsvBtn').addEventListener('click', exportPRCsv);

    ['settingAthlete', 'settingUnit', 'settingScriptUrl', 'settingToken', 'settingSync']
      .forEach(id => document.getElementById(id).addEventListener('change', saveSettings));
    document.getElementById('testConnectionBtn').addEventListener('click', testConnection);
    document.getElementById('addCustomExerciseBtn').addEventListener('click', addCustomExercise);
    document.getElementById('exportBackupBtn').addEventListener('click', exportBackup);
    document.getElementById('importBackupInput').addEventListener('change', importBackup);
    document.getElementById('clearLocalDataBtn').addEventListener('click', clearLocalData);

    bindRestTimer();
  }

  /* ---------------- readiness ---------------- */
  function renderReadiness() {
    const defs = [['sleep', 'Sleep Quality'], ['energy', 'Energy'], ['soreness', 'Soreness'], ['stress', 'Stress']];
    document.getElementById('readinessGrid').innerHTML = defs.map(([key, label]) => `
      <div class="rating">
        <div class="rating-title"><strong>${label}</strong><span id="${key}Value">—</span></div>
        <div class="rating-options">
          ${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="${key}" value="${n}"><span>${n}</span></label>`).join('')}
        </div>
      </div>`).join('');
    defs.forEach(([key]) => document.querySelectorAll(`input[name="${key}"]`).forEach(r =>
      r.addEventListener('change', () => {
        state.readiness[key] = r.value;
        document.getElementById(key + 'Value').textContent = r.value + '/5';
        updateReadiness(); scheduleDraft();
      })));
  }

  function updateReadiness() {
    const r = state.readiness;
    r.painToday = val('painToday') || r.painToday;
    const vals = ['sleep', 'energy', 'soreness', 'stress'].map(k => num(r[k]));
    const complete = vals.every(Boolean);
    let score = 0, label = 'Not rated', cls = '';
    if (complete) {
      score = (vals[0] + vals[1] + (6 - vals[2]) + (6 - vals[3])) / 4;
      if (String(r.painToday).startsWith('Severe')) { label = 'Stop / Refer'; cls = 'bad'; }
      else if (String(r.painToday).startsWith('Moderate') || score < 2.5) { label = 'Modify Session'; cls = 'bad'; }
      else if (score < 3.5) { label = 'Train with Caution'; cls = 'warn'; }
      else { label = 'Good to Train'; cls = 'good'; }
    }
    const badge = document.getElementById('readinessBadge');
    badge.textContent = 'Readiness: ' + label; badge.className = 'status-pill ' + cls;
    const text = document.getElementById('readinessText');
    text.textContent = complete ? `Score ${score.toFixed(1)} / 5` : 'Complete all four ratings';
    text.className = 'status-pill ' + cls;
  }

  /* ---------------- rendering ---------------- */
  function renderAll() {
    const isLog = state.mode === 'Log';
    document.body.classList.toggle('log-mode', isLog);
    document.querySelectorAll('.chip-btn').forEach(b => b.classList.toggle('active', b.dataset.session === state.sessionType));
    document.getElementById('sessionTitle').textContent = state.sessionType;
    document.getElementById('sessionDescription').textContent = isLog ? 'Logging against your plan — tap ✓ as you complete sets.' : sessionMeta[state.sessionType].description;
    document.getElementById('modeLabel').textContent = state.mode.toUpperCase() + ' MODE';
    document.querySelectorAll('.mode-toggle button').forEach(b => b.classList.toggle('active', b.dataset.mode === state.mode));
    if (!isLog) renderExerciseTable('warmupTableWrap', 'warmup', state.warmup, 'warmup');
    renderSessionSpecific();
    updateReadiness();
    updatePrintSubtitle();
    updateWeightUnits();
  }

  function renderSessionSpecific() {
    const container = document.getElementById('sessionSpecific');
    if (state.mode === 'Log') {
      container.innerHTML = renderLogTemplate();
      if (state.sessionType.startsWith('ME ')) renderSetTable();
      bindDynamicStateValues();
      updateLogProgress();
      return;
    }
    if (state.sessionType.startsWith('ME ')) container.innerHTML = renderMETemplate();
    else if (state.sessionType.startsWith('DE ')) container.innerHTML = renderDETemplate();
    else if (state.sessionType === 'GPP / Extra Workout') container.innerHTML = renderGPPTemplate();
    else container.innerHTML = renderRecoveryTemplate();
    bindDynamicStateValues();
    if (state.sessionType.startsWith('ME ')) {
      renderSetTable();
      renderExerciseTable('supplementalWrap', 'supplemental', state.supplemental, 'supplemental');
      renderExerciseTable('accessoryWrap', 'accessories', state.accessories, 'accessory');
      updatePreviousPRFromHistory(false);
    }
    if (state.sessionType.startsWith('DE ')) {
      renderExerciseTable('supplementalWrap', 'supplemental', state.supplemental, 'supplemental');
      renderExerciseTable('accessoryWrap', 'accessories', state.accessories, 'accessory');
      updateDECalculations();
    }
    if (state.sessionType === 'GPP / Extra Workout') renderExerciseTable('gppRowsWrap', 'gppRows', state.gpp.rows, 'gpp');
    if (['Recovery / Restoration', 'Deload'].includes(state.sessionType)) renderExerciseTable('recoveryRowsWrap', 'recoveryRows', state.recovery.rows, 'recovery');
  }

  function renderMETemplate() {
    const upper = state.sessionType === 'ME Upper';
    return `
      <section class="card">
        <div class="card-head"><div><div class="eyebrow">Max Effort</div><h3>Main Special Exercise</h3></div><span class="status-pill">One core ME lift</span></div>
        <div class="card-body">
          <div class="section-note">Track the exact setup. A record only compares cleanly when bar, grip/stance, range of motion and resistance match.</div>
          <div class="grid grid-4">
            <div class="field span-2"><label>Main Exercise</label>${exerciseInput('mainExercise', state.main.exercise, upper ? 'meUpper' : 'meLower', 'data-main-exercise')}</div>
            <div class="field"><label>Bar / Implement</label><input id="mainBar" data-main-variation list="barList" value="${escapeHTML(state.main.bar)}"></div>
            <div class="field"><label>${upper ? 'Grip' : 'Stance'}</label><input id="mainStanceGrip" data-main-variation value="${escapeHTML(state.main.stanceGrip)}" placeholder="${upper ? 'Close, medium, wide' : 'Wide, moderate, sumo'}"></div>
            <div class="field"><label>ROM / Box / Board / Pin</label><input id="mainRomSetup" data-main-variation value="${escapeHTML(state.main.romSetup)}" placeholder="Exact setup"></div>
            <div class="field"><label>Resistance</label><input id="mainResistance" data-main-variation list="resistanceList" value="${escapeHTML(state.main.resistance)}"></div>
            <div class="field span-2"><label>Band / Chain Setup</label><input id="mainBandSetup" data-main-variation value="${escapeHTML(state.main.bandSetup)}" placeholder="Exact tension or chain load"></div>
            <div class="field"><label>Previous PR</label><div class="inline-field"><input id="mainPreviousPR" type="number" step="0.5" inputmode="decimal" value="${escapeHTML(state.main.previousPR)}"><span class="unit weight-unit">lb</span></div></div>
            <div class="field"><label>Today's Target</label><div class="inline-field"><input id="mainTarget" type="number" step="0.5" inputmode="decimal" value="${escapeHTML(state.main.target)}"><span class="unit weight-unit">lb</span></div></div>
            <div class="field"><label>Top Result Weight</label><div class="inline-field"><input id="mainTopWeight" type="number" step="0.5" inputmode="decimal" value="${escapeHTML(state.main.topResultWeight)}"><span class="unit weight-unit">lb</span></div></div>
            <div class="field"><label>Top Result Reps</label><input id="mainTopReps" type="number" min="1" inputmode="numeric" value="${escapeHTML(state.main.topResultReps)}"></div>
            <div class="field"><label>New PR?</label><select id="mainIsPR"><option value="false" ${!state.main.isPR ? 'selected' : ''}>No</option><option value="true" ${state.main.isPR ? 'selected' : ''}>Yes</option></select></div>
          </div>
          <datalist id="barList"><option>Straight Bar</option><option>Safety Squat Bar</option><option>Cambered Bar</option><option>Buffalo Bar</option><option>Football Bar</option><option>Fat Bar</option><option>Front Squat Harness</option><option>Trap Bar</option><option>Dumbbells</option></datalist>
          <datalist id="resistanceList"><option>Straight Weight</option><option>Bands</option><option>Chains</option><option>Bands + Chains</option><option>Reverse Bands</option><option>Weight Releasers</option><option>Concentric from Pins</option></datalist>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><div><div class="eyebrow">Work-Up</div><h3>Warm-Up &amp; Work-Up Sets</h3></div><button class="btn no-print" data-add-set>＋ Add Set</button></div>
        <div class="card-body"><div class="table-wrap" id="setTableWrap"></div></div>
      </section>

      <section class="card">
        <div class="card-head"><div><div class="eyebrow">Weak Point</div><h3>Primary Supplemental</h3></div><button class="btn no-print" data-add-row="supplemental">＋ Add</button></div>
        <div class="card-body"><div class="table-wrap" id="supplementalWrap"></div></div>
      </section>

      <section class="card">
        <div class="card-head"><div><div class="eyebrow">Special Work</div><h3>${upper ? 'Triceps, Lats, Upper Back &amp; Delts' : 'Posterior Chain, Back &amp; Abs'}</h3></div><button class="btn no-print" data-add-row="accessories">＋ Add</button></div>
        <div class="card-body"><div class="table-wrap" id="accessoryWrap"></div></div>
      </section>`;
  }

  function renderDETemplate() {
    const upper = state.sessionType === 'DE Upper';
    return `
      <section class="card">
        <div class="card-head"><div><div class="eyebrow">Explosive Primer</div><h3>${upper ? 'Ballistic Work' : 'Jumps &amp; Reactive Work'}</h3></div><span class="status-pill">Low fatigue</span></div>
        <div class="card-body">
          <div class="grid grid-5">
            <div class="field span-2"><label>Exercise</label>${exerciseInput('dePrimer', state.de.primer, upper ? 'explosiveUpper' : 'explosiveLower')}</div>
            <div class="field"><label>Sets</label><input id="dePrimerSets" type="number" min="0" inputmode="numeric" value="${escapeHTML(state.de.primerSets)}"></div>
            <div class="field"><label>Reps</label><input id="dePrimerReps" value="${escapeHTML(state.de.primerReps)}"></div>
            <div class="field"><label>${upper ? 'Throws' : 'Contacts'}</label><input id="deContacts" type="number" min="0" inputmode="numeric" value="${escapeHTML(state.de.contacts)}"></div>
            <div class="field span-2"><label>Height / Distance / Load</label><input id="deHeightDistance" value="${escapeHTML(state.de.heightDistance)}"></div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><div><div class="eyebrow">Dynamic Effort</div><h3>${upper ? 'Dynamic Bench Press' : 'Dynamic Squat'}</h3></div><span class="status-pill">Three-week wave</span></div>
        <div class="card-body">
          <div class="grid grid-4">
            <div class="field span-2"><label>Exercise</label>${exerciseInput('deMainExercise', state.main.exercise, upper ? 'deUpper' : 'deLower')}</div>
            <div class="field"><label>Wave</label><select id="deWave"><option ${state.de.wave === 'Week 1' ? 'selected' : ''}>Week 1</option><option ${state.de.wave === 'Week 2' ? 'selected' : ''}>Week 2</option><option ${state.de.wave === 'Week 3' ? 'selected' : ''}>Week 3</option></select></div>
            <div class="field"><label>Base Max</label><div class="inline-field"><input id="deBaseMax" data-de-calc type="number" step="0.5" inputmode="decimal" value="${escapeHTML(state.de.baseMax)}"><span class="unit weight-unit">lb</span></div></div>
            <div class="field"><label>Percentage</label><div class="inline-field"><input id="dePercentage" data-de-calc type="number" step="0.5" inputmode="decimal" value="${escapeHTML(state.de.percentage)}"><span class="unit">%</span></div></div>
            <div class="field"><label>Bar Weight</label><div class="inline-field"><input id="deBarWeight" data-de-calc type="number" step="0.5" inputmode="decimal" value="${escapeHTML(state.de.barWeight)}"><span class="unit weight-unit">lb</span></div></div>
            <div class="field"><label>Bar / Implement</label><input id="deBar" list="barListDE" value="${escapeHTML(state.de.bar)}"></div>
            <div class="field"><label>${upper ? 'Grip Sequence' : 'Box / Stance'}</label><input id="deBoxSetup" value="${escapeHTML(state.de.boxSetup)}"></div>
            <div class="field"><label>Resistance</label><input id="deResistance" list="resistanceListDE" value="${escapeHTML(state.de.resistance)}"></div>
            <div class="field span-2"><label>Band / Chain Setup</label><input id="deBandSetup" value="${escapeHTML(state.de.bandSetup)}" placeholder="Track bar and accommodating resistance separately"></div>
            <div class="field"><label>Sets</label><input id="deSets" data-de-calc type="number" min="1" inputmode="numeric" value="${escapeHTML(state.de.sets)}"></div>
            <div class="field"><label>Reps</label><input id="deReps" data-de-calc type="number" min="1" inputmode="numeric" value="${escapeHTML(state.de.reps)}"></div>
            <div class="field"><label>Rest</label><div class="inline-field"><input id="deRest" type="number" min="0" inputmode="numeric" value="${escapeHTML(state.de.rest)}"><span class="unit">sec</span></div></div>
            <div class="field"><label>Speed Quality</label><select id="deSpeedQuality"><option ${state.de.speedQuality === 'Excellent' ? 'selected' : ''}>Excellent</option><option ${state.de.speedQuality === 'Good' ? 'selected' : ''}>Good</option><option ${state.de.speedQuality === 'Declining' ? 'selected' : ''}>Declining</option></select></div>
            <div class="field span-full"><label>Speed / Technique Notes</label><input id="deSpeedNotes" value="${escapeHTML(state.de.speedNotes)}"></div>
          </div>
          <datalist id="barListDE"><option>Straight Bar</option><option>Safety Squat Bar</option><option>Cambered Bar</option><option>Football Bar</option><option>Buffalo Bar</option><option>Fat Bar</option></datalist>
          <datalist id="resistanceListDE"><option>Straight Weight</option><option>Mini-Bands</option><option>Light Bands</option><option>Medium Bands</option><option>Strong Bands</option><option>Chains</option><option>Bands + Chains</option><option>Weight Releasers</option></datalist>
          <div class="summary-strip">
            <div class="metric"><span>Calculated Bar Weight</span><strong id="deCalcWeight">—</strong></div>
            <div class="metric"><span>Barbell Volume</span><strong id="deVolume">—</strong></div>
            <div class="metric"><span>Total Reps</span><strong id="deTotalReps">—</strong></div>
            <div class="metric"><span>Wave</span><strong id="deWaveMetric">${escapeHTML(state.de.wave)}</strong></div>
          </div>
        </div>
      </section>

      ${upper ? '' : `
      <section class="card">
        <div class="card-head"><div><div class="eyebrow">Speed Pulls</div><h3>Dynamic Deadlift</h3></div><span class="status-pill">Singles</span></div>
        <div class="card-body"><div class="grid grid-4">
          <div class="field span-2"><label>Exercise</label>${exerciseInput('speedPullExercise', state.de.speedPullExercise, 'deLower')}</div>
          <div class="field"><label>Bar Weight</label><div class="inline-field"><input id="speedPullWeight" type="number" step="0.5" inputmode="decimal" value="${escapeHTML(state.de.speedPullWeight)}"><span class="unit weight-unit">lb</span></div></div>
          <div class="field"><label>Resistance</label><input id="speedPullResistance" value="${escapeHTML(state.de.speedPullResistance)}"></div>
          <div class="field"><label>Sets</label><input id="speedPullSets" type="number" min="0" inputmode="numeric" value="${escapeHTML(state.de.speedPullSets)}"></div>
          <div class="field"><label>Reps</label><input id="speedPullReps" type="number" min="1" inputmode="numeric" value="${escapeHTML(state.de.speedPullReps)}"></div>
          <div class="field"><label>Rest</label><div class="inline-field"><input id="speedPullRest" type="number" min="0" inputmode="numeric" value="${escapeHTML(state.de.speedPullRest)}"><span class="unit">sec</span></div></div>
          <div class="field"><label>Quality</label><select id="speedPullQuality"><option ${state.de.speedPullQuality === 'Excellent' ? 'selected' : ''}>Excellent</option><option ${state.de.speedPullQuality === 'Good' ? 'selected' : ''}>Good</option><option ${state.de.speedPullQuality === 'Declining' ? 'selected' : ''}>Declining</option></select></div>
        </div></div>
      </section>`}

      <section class="card">
        <div class="card-head"><div><div class="eyebrow">Weak Point</div><h3>Primary Supplemental</h3></div><button class="btn no-print" data-add-row="supplemental">＋ Add</button></div>
        <div class="card-body"><div class="table-wrap" id="supplementalWrap"></div></div>
      </section>
      <section class="card">
        <div class="card-head"><div><div class="eyebrow">Special Work</div><h3>${upper ? 'Triceps, Lats, Upper Back &amp; Delts' : 'Posterior Chain, Back, Abs &amp; GPP'}</h3></div><button class="btn no-print" data-add-row="accessories">＋ Add</button></div>
        <div class="card-body"><div class="table-wrap" id="accessoryWrap"></div></div>
      </section>`;
  }

  function renderGPPTemplate() {
    const options = Object.keys(presets.gpp).map(p => `<option ${state.gpp.preset === p ? 'selected' : ''}>${p}</option>`).join('');
    return `
      <section class="card">
        <div class="card-head"><div><div class="eyebrow">Session Purpose</div><h3>GPP / Extra Workout</h3></div><span class="status-pill">Purpose first</span></div>
        <div class="card-body">
          <div class="grid grid-4">
            <div class="field"><label>Purpose</label><select id="gppPurpose"><option ${state.gpp.purpose === 'Restoration' ? 'selected' : ''}>Restoration</option><option ${state.gpp.purpose === 'Work Capacity' ? 'selected' : ''}>Work Capacity</option><option ${state.gpp.purpose === 'Weak Point' ? 'selected' : ''}>Weak Point</option><option ${state.gpp.purpose === 'Conditioning' ? 'selected' : ''}>Conditioning</option></select></div>
            <div class="field"><label>Primary Focus</label><input id="gppFocus" list="weakPointList" value="${escapeHTML(state.gpp.focus)}"></div>
            <div class="field"><label>Target Duration</label><div class="inline-field"><input id="gppDuration" type="number" min="0" inputmode="numeric" value="${escapeHTML(state.gpp.targetDuration)}"><span class="unit">min</span></div></div>
            <div class="field"><label>Intensity</label><select id="gppIntensity"><option>RPE 2–4</option><option ${state.gpp.intensity === 'RPE 3–5' ? 'selected' : ''}>RPE 3–5</option><option ${state.gpp.intensity === 'RPE 5–6' ? 'selected' : ''}>RPE 5–6</option><option ${state.gpp.intensity === 'RPE 6–7' ? 'selected' : ''}>RPE 6–7</option></select></div>
            <div class="field span-3"><label>Preset</label><select id="gppPreset"><option value="">Custom Session</option>${options}</select></div>
            <div class="field"><label>&nbsp;</label><button class="btn" data-apply-preset="gpp">Load Preset</button></div>
          </div>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><div><div class="eyebrow">Work</div><h3>GPP Exercise Builder</h3></div><button class="btn no-print" data-add-row="gppRows">＋ Add</button></div>
        <div class="card-body"><div class="section-note">Restoration ≈ RPE 3–5. Work capacity ≈ RPE 5–6. Weak-point development ≈ RPE 6–7.</div><div class="table-wrap" id="gppRowsWrap"></div></div>
      </section>`;
  }

  function renderRecoveryTemplate() {
    const isDeload = state.sessionType === 'Deload';
    const options = Object.keys(presets.recovery).map(p => `<option ${state.recovery.preset === p ? 'selected' : ''}>${p}</option>`).join('');
    const equip = ['Bike', 'Treadmill', 'Sled', 'Belt Squat', 'Reverse Hyper', 'Bands', 'Cable Stack', 'StepMill', 'No Equipment'];
    return `
      <section class="card">
        <div class="card-head"><div><div class="eyebrow">${isDeload ? 'Fatigue Reduction' : 'Restoration'}</div><h3>${isDeload ? 'Deload Strategy' : 'Recovery Setup'}</h3></div><span class="status-pill">Preserve next session</span></div>
        <div class="card-body">
          <div class="grid grid-4">
            <div class="field"><label>Mode</label><select id="recoveryMode"><option ${state.recovery.mode === 'Recovery' ? 'selected' : ''}>Recovery</option><option ${state.recovery.mode === 'Restoration' ? 'selected' : ''}>Restoration</option><option ${state.recovery.mode === 'GPP / Recovery Blend' ? 'selected' : ''}>GPP / Recovery Blend</option><option ${state.recovery.mode === 'Deload' ? 'selected' : ''}>Deload</option></select></div>
            <div class="field"><label>Primary Reason</label><input id="recoveryReason" value="${escapeHTML(state.recovery.reason)}"></div>
            <div class="field"><label>Available Time</label><div class="inline-field"><input id="recoveryTime" type="number" min="0" inputmode="numeric" value="${escapeHTML(state.recovery.availableTime)}"><span class="unit">min</span></div></div>
            <div class="field"><label>Intensity</label><select id="recoveryIntensity"><option ${state.recovery.intensity === 'RPE 2–4' ? 'selected' : ''}>RPE 2–4</option><option ${state.recovery.intensity === 'RPE 3–5' ? 'selected' : ''}>RPE 3–5</option><option ${state.recovery.intensity === 'RPE 4–6' ? 'selected' : ''}>RPE 4–6</option></select></div>
            <div class="field span-3"><label>Preset</label><select id="recoveryPreset"><option value="">Custom Session</option>${options}</select></div>
            <div class="field"><label>&nbsp;</label><button class="btn" data-apply-preset="recovery">Load Preset</button></div>
          </div>
          <div style="margin-top:14px"><label class="muted small" style="display:block;margin-bottom:8px;text-transform:uppercase;font-weight:800">Available Equipment</label><div class="chip-group">${equip.map(x => `<label class="chip"><input type="checkbox" class="equipmentCheck" value="${x}" ${state.recovery.equipment.includes(x) ? 'checked' : ''}>${x}</label>`).join('')}</div></div>
          ${isDeload ? `<div class="grid grid-4" style="margin-top:16px">
            <div class="field"><label>Main Lift Load</label><select id="deloadMainLoad"><option ${state.recovery.mainLiftLoad === 'Reduce' ? 'selected' : ''}>Reduce</option><option>Technique Only</option><option>Remove Main Lift</option><option>Maintain Light Speed Work</option></select></div>
            <div class="field"><label>Accessory Volume</label><select id="deloadAccessory"><option ${state.recovery.accessoryVolume === 'Reduce ~50%' ? 'selected' : ''}>Reduce ~50%</option><option>Reduce ~25%</option><option>Minimal Accessories</option><option>Remove Accessories</option></select></div>
            <div class="field"><label>GPP</label><select id="deloadGpp"><option ${state.recovery.gppStrategy === 'Easy Restoration' ? 'selected' : ''}>Easy Restoration</option><option>Walking Only</option><option>Bike Only</option><option>No GPP</option></select></div>
            <div class="field"><label>Duration</label><select id="deloadDuration"><option ${state.recovery.duration === '1 Week' ? 'selected' : ''}>1 Week</option><option>3–4 Days</option><option>10–14 Days</option></select></div>
          </div>` : ''}
        </div>
      </section>
      <section class="card">
        <div class="card-head"><div><div class="eyebrow">Active Recovery</div><h3>${isDeload ? 'Deload Session Work' : 'Recovery Exercise Builder'}</h3></div><button class="btn no-print" data-add-row="recoveryRows">＋ Add</button></div>
        <div class="card-body"><div class="section-note">The session should leave the athlete at least as ready for the next ME or DE session as they would have been without it.</div><div class="table-wrap" id="recoveryRowsWrap"></div></div>
      </section>`;
  }

  /* ---------------- log mode ---------------- */
  function planRefText(r) {
    const parts = [];
    const sr = [r.sets, r.reps || r.duration].filter(Boolean).join(' × ');
    if (sr) parts.push(sr);
    if (r.weight) parts.push('@ ' + r.weight + ' ' + settings.unit);
    if (r.rpe) parts.push('RPE ' + r.rpe);
    if (r.rest) parts.push('Rest ' + r.rest);
    const note = r.weakPoint || r.notes;
    if (note) parts.push(note);
    return parts.join(' · ');
  }

  /* A planned value is only pre-filled when it is a plain number. Ranges like
     "8–12" or "5 min" are targets, not results, so they become placeholders. */
  const isNumeric = v => /^\s*\d+(\.\d+)?\s*$/.test(String(v ?? ''));

  function logSetsHTML(sets, plan = {}) {
    const wHint = isNumeric(plan.weight) ? settings.unit : (plan.weight || settings.unit);
    const rHint = plan.reps ? String(plan.reps) : 'reps';
    return (sets || []).map((s, j) => `
      <div class="log-set${s.done ? ' done' : ''}">
        <span class="log-set-num">${j + 1}</span>
        <input class="logW" inputmode="decimal" placeholder="${escapeHTML(wHint)}" aria-label="Weight" value="${escapeHTML(s.weight)}">
        <span class="log-x">×</span>
        <input class="logR" inputmode="text" placeholder="${escapeHTML(rHint)}" aria-label="Reps" value="${escapeHTML(s.reps)}">
        <label class="log-done-wrap no-print" title="Set complete"><input type="checkbox" class="logDone" ${s.done ? 'checked' : ''}><span>✓</span></label>
        <button class="log-del no-print" data-log-del aria-label="Remove set" title="Remove set">✕</button>
      </div>`).join('');
  }

  /* cfg: { key, index, name, context, nameAttr, ref, sets, plan } */
  function logBlockHTML(cfg) {
    const listId = `loglist-${cfg.key}-${cfg.index}`;
    const options = getExerciseOptions(cfg.context).map(x => `<option value="${escapeHTML(x.name)}" label="${escapeHTML(x.category)}"></option>`).join('');
    const nameAttr = cfg.nameAttr ? ` ${cfg.nameAttr}` : ' class="logExercise"';
    return `<div class="log-block" data-log-row="${cfg.key}:${cfg.index}">
      <div class="log-block-head">
        <input${nameAttr} list="${listId}" value="${escapeHTML(cfg.name)}" placeholder="Exercise"><datalist id="${listId}">${options}</datalist>
      </div>
      ${cfg.ref ? `<div class="log-plan-ref">Plan: ${escapeHTML(cfg.ref)}</div>` : ''}
      <div class="log-sets">${logSetsHTML(cfg.sets, cfg.plan)}</div>
      <button class="btn small no-print" type="button" data-log-add="${cfg.key}:${cfg.index}">＋ Add Set</button>
    </div>`;
  }

  function logSectionHTML(eyebrow, title, inner, addRowKey, meta) {
    const addBtn = addRowKey ? `<button class="btn small no-print" type="button" data-add-row="${addRowKey}">＋ Add</button>` : '';
    return `<section class="card">
      <div class="card-head">
        <div class="card-head-text"><div class="eyebrow">${eyebrow}</div><h3>${title}</h3></div>${addBtn}
      </div>
      <div class="card-body">
        ${meta ? `<div class="log-section-meta">${escapeHTML(meta)}</div>` : ''}
        ${inner || '<p class="muted small">Nothing planned. Add an exercise to log it.</p>'}
      </div>
    </section>`;
  }

  function rowBlocks(key, rows, context) {
    return rows.map((r, i) => logBlockHTML({
      key, index: i, name: r.exercise, context, ref: planRefText(r), sets: r.log,
      plan: { weight: r.weight, reps: r.reps || r.duration }
    })).join('');
  }

  function renderLogTemplate() {
    const t = state.sessionType;
    const upper = t.includes('Upper');
    const out = [];

    out.push(`<section class="card">
      <div class="card-body">
        <div class="summary-strip">
          <div class="metric"><span>Sets Done</span><strong id="logProgress">—</strong></div>
          <div class="metric"><span>Date</span><strong>${escapeHTML(formatDate(state.date) || '—')}</strong></div>
          <div class="metric"><span>Week</span><strong>${escapeHTML(state.weekNumber || '—')}</strong></div>
          <div class="metric"><span>Readiness</span><strong id="logReadinessMetric">—</strong></div>
        </div>
      </div>
    </section>`);

    out.push(logSectionHTML('Preparation', 'Warm-Up', rowBlocks('warmup', state.warmup, 'warmup'), 'warmup'));

    if (t.startsWith('ME ')) {
      const m = state.main;
      const variation = [m.bar, m.stanceGrip, m.romSetup, m.resistance, m.bandSetup].filter(Boolean).join(' · ');
      const targetLine = [variation, m.previousPR ? `Prev PR ${m.previousPR} ${settings.unit}` : '', m.target ? `Target ${m.target} ${settings.unit}` : ''].filter(Boolean).join(' · ');
      out.push(`<section class="card">
        <div class="card-head"><div><div class="eyebrow">Max Effort</div><h3>Main Lift — Work to Top Set</h3></div><button class="btn no-print" type="button" data-add-set>＋ Add Set</button></div>
        <div class="card-body">
          <div class="field"><label>Exercise</label>${exerciseInput('mainExercise', m.exercise, upper ? 'meUpper' : 'meLower')}</div>
          ${targetLine ? `<div class="log-plan-ref">Plan: ${escapeHTML(targetLine)}</div>` : ''}
          <div class="table-wrap" id="setTableWrap"></div>
          <div class="grid grid-3" style="margin-top:12px">
            <div class="field"><label>Top Result Weight</label><div class="inline-field"><input id="mainTopWeight" type="number" step="0.5" inputmode="decimal" value="${escapeHTML(m.topResultWeight)}"><span class="unit weight-unit">${settings.unit}</span></div></div>
            <div class="field"><label>Top Result Reps</label><input id="mainTopReps" type="number" min="1" inputmode="numeric" value="${escapeHTML(m.topResultReps)}"></div>
            <div class="field"><label>New PR?</label><select id="mainIsPR"><option value="false" ${!m.isPR ? 'selected' : ''}>No</option><option value="true" ${m.isPR ? 'selected' : ''}>Yes</option></select></div>
          </div>
        </div>
      </section>`);
      out.push(logSectionHTML('Weak Point', 'Primary Supplemental', rowBlocks('supplemental', state.supplemental, 'supplemental'), 'supplemental'));
      out.push(logSectionHTML('Special Work', upper ? 'Triceps, Lats, Upper Back & Delts' : 'Posterior Chain, Back & Abs', rowBlocks('accessories', state.accessories, 'accessory'), 'accessories'));
    } else if (t.startsWith('DE ')) {
      const de = state.de;
      const primerRef = [[de.primerSets, de.primerReps].filter(Boolean).join(' × '), de.contacts ? `${de.contacts} ${upper ? 'throws' : 'contacts'}` : '', de.heightDistance].filter(Boolean).join(' · ');
      out.push(logSectionHTML('Explosive Primer', upper ? 'Ballistic Work' : 'Jumps & Reactive Work',
        logBlockHTML({ key: 'dePrimer', index: 0, name: de.primer, context: upper ? 'explosiveUpper' : 'explosiveLower', nameAttr: 'id="dePrimer"', ref: primerRef, sets: de.primerLog, plan: { weight: '', reps: de.primerReps } })));
      const deRef = [de.wave, de.percentage && de.baseMax ? `${de.percentage}% of ${de.baseMax}` : '', de.barWeight ? `Bar ${de.barWeight} ${settings.unit}` : '', [de.sets, de.reps].filter(Boolean).join(' × '), de.rest ? `Rest ${de.rest}s` : '', de.resistance !== 'Straight Weight' ? de.resistance : '', de.bandSetup].filter(Boolean).join(' · ');
      out.push(`<section class="card">
        <div class="card-head"><div><div class="eyebrow">Dynamic Effort</div><h3>${upper ? 'Dynamic Bench Press' : 'Dynamic Squat'}</h3></div><span class="status-pill">Bar speed first</span></div>
        <div class="card-body">
          ${logBlockHTML({ key: 'deMain', index: 0, name: state.main.exercise, context: upper ? 'deUpper' : 'deLower', nameAttr: 'id="deMainExercise"', ref: deRef, sets: de.mainLog, plan: { weight: de.barWeight, reps: de.reps } })}
          <div class="grid grid-2" style="margin-top:12px">
            <div class="field"><label>Speed Quality</label><select id="deSpeedQuality"><option ${de.speedQuality === 'Excellent' ? 'selected' : ''}>Excellent</option><option ${de.speedQuality === 'Good' ? 'selected' : ''}>Good</option><option ${de.speedQuality === 'Declining' ? 'selected' : ''}>Declining</option></select></div>
            <div class="field"><label>Speed / Technique Notes</label><input id="deSpeedNotes" value="${escapeHTML(de.speedNotes)}"></div>
          </div>
        </div>
      </section>`);
      if (t === 'DE Lower') {
        const spRef = [[de.speedPullSets, de.speedPullReps].filter(Boolean).join(' × '), de.speedPullWeight ? `@ ${de.speedPullWeight} ${settings.unit}` : '', de.speedPullRest ? `Rest ${de.speedPullRest}s` : '', de.speedPullResistance !== 'Straight Weight' ? de.speedPullResistance : ''].filter(Boolean).join(' · ');
        out.push(`<section class="card">
          <div class="card-head"><div><div class="eyebrow">Speed Pulls</div><h3>Dynamic Deadlift</h3></div><span class="status-pill">Singles</span></div>
          <div class="card-body">
            ${logBlockHTML({ key: 'speedPull', index: 0, name: de.speedPullExercise, context: 'deLower', nameAttr: 'id="speedPullExercise"', ref: spRef, sets: de.speedPullLog, plan: { weight: de.speedPullWeight, reps: de.speedPullReps } })}
            <div class="field" style="margin-top:12px"><label>Quality</label><select id="speedPullQuality"><option ${de.speedPullQuality === 'Excellent' ? 'selected' : ''}>Excellent</option><option ${de.speedPullQuality === 'Good' ? 'selected' : ''}>Good</option><option ${de.speedPullQuality === 'Declining' ? 'selected' : ''}>Declining</option></select></div>
          </div>
        </section>`);
      }
      out.push(logSectionHTML('Weak Point', 'Primary Supplemental', rowBlocks('supplemental', state.supplemental, 'supplemental'), 'supplemental'));
      out.push(logSectionHTML('Special Work', upper ? 'Triceps, Lats, Upper Back & Delts' : 'Posterior Chain, Back, Abs & GPP', rowBlocks('accessories', state.accessories, 'accessory'), 'accessories'));
    } else if (t === 'GPP / Extra Workout') {
      const g = state.gpp;
      const ref = [g.purpose, g.focus, g.targetDuration ? g.targetDuration + ' min' : '', g.intensity].filter(Boolean).join(' · ');
      out.push(logSectionHTML('Work', 'GPP / Extra Workout', rowBlocks('gppRows', g.rows, 'gpp'), 'gppRows', ref));
    } else {
      const r = state.recovery;
      const ref = [r.mode, r.reason, r.availableTime ? r.availableTime + ' min' : '', r.intensity].filter(Boolean).join(' · ');
      out.push(logSectionHTML('Active Recovery', t === 'Deload' ? 'Deload Session Work' : 'Recovery Work', rowBlocks('recoveryRows', r.rows, 'recovery'), 'recoveryRows', ref));
    }
    return out.join('');
  }

  function logCounters() {
    const t = state.sessionType;
    let total = 0, done = 0;
    const count = sets => (sets || []).forEach(s => { total += 1; if (s.done) done += 1; });
    state.warmup.forEach(r => count(r.log));
    if (t.startsWith('ME ') || t.startsWith('DE ')) {
      state.supplemental.forEach(r => count(r.log));
      state.accessories.forEach(r => count(r.log));
    }
    if (t.startsWith('ME ')) count(state.main.sets);
    if (t.startsWith('DE ')) { count(state.de.primerLog); count(state.de.mainLog); if (t === 'DE Lower') count(state.de.speedPullLog); }
    if (t === 'GPP / Extra Workout') state.gpp.rows.forEach(r => count(r.log));
    if (['Recovery / Restoration', 'Deload'].includes(t)) state.recovery.rows.forEach(r => count(r.log));
    return { total, done };
  }

  function updateLogProgress() {
    const el = document.getElementById('logProgress');
    if (el) {
      const { total, done } = logCounters();
      el.textContent = total ? `${done} / ${total}` : '—';
    }
    const rm = document.getElementById('logReadinessMetric');
    if (rm) rm.textContent = document.getElementById('readinessBadge').textContent.replace('Readiness: ', '');
    /* Mark an exercise finished once every one of its sets is ticked, so
       progress is obvious while scrolling a long session. */
    document.querySelectorAll('[data-log-row]').forEach(block => {
      const boxes = [...block.querySelectorAll('.logDone')];
      block.classList.toggle('complete', boxes.length > 0 && boxes.every(b => b.checked));
    });
  }

  function logSetsArray(key, i) {
    const rowArr = getRowArray(key);
    if (rowArr) { const r = rowArr[i]; if (!r) return null; if (!Array.isArray(r.log)) r.log = []; return r.log; }
    if (key === 'deMain') return state.de.mainLog;
    if (key === 'dePrimer') return state.de.primerLog;
    if (key === 'speedPull') return state.de.speedPullLog;
    return null;
  }

  function collectLogDOM() {
    document.querySelectorAll('[data-log-row]').forEach(block => {
      const [key, idxStr] = block.dataset.logRow.split(':');
      const i = Number(idxStr);
      const sets = [...block.querySelectorAll('.log-set')].map(el => ({
        weight: qv(el, '.logW'), reps: qv(el, '.logR'), done: !!el.querySelector('.logDone')?.checked
      }));
      const rowArr = getRowArray(key);
      if (rowArr) {
        const r = rowArr[i];
        if (!r) return;
        const name = block.querySelector('.logExercise');
        if (name) r.exercise = name.value;
        r.log = sets;
      } else if (key === 'deMain') state.de.mainLog = sets;
      else if (key === 'dePrimer') state.de.primerLog = sets;
      else if (key === 'speedPull') state.de.speedPullLog = sets;
    });
    if (document.getElementById('setTableWrap')) {
      state.main.sets = [...document.querySelectorAll('[data-set-index]')].map(tr => ({ weight: qv(tr, '.setWeight'), reps: qv(tr, '.setReps'), rpe: qv(tr, '.setRpe'), result: qv(tr, '.setResult'), notes: qv(tr, '.setNotes'), done: !!tr.querySelector('.setDone')?.checked }));
    }
    [['mainExercise', v => { state.main.exercise = v; }], ['mainTopWeight', v => { state.main.topResultWeight = v; }],
     ['mainTopReps', v => { state.main.topResultReps = v; }], ['deMainExercise', v => { state.main.exercise = v; }],
     ['dePrimer', v => { state.de.primer = v; }], ['deSpeedQuality', v => { state.de.speedQuality = v; }],
     ['deSpeedNotes', v => { state.de.speedNotes = v; }], ['speedPullExercise', v => { state.de.speedPullExercise = v; }],
     ['speedPullQuality', v => { state.de.speedPullQuality = v; }]
    ].forEach(([id, apply]) => { const el = document.getElementById(id); if (el) apply(el.value); });
    const isPR = document.getElementById('mainIsPR');
    if (isPR) state.main.isPR = isPR.value === 'true';
  }

  /* ---------------- exercise pickers ---------------- */
  function exerciseInput(id, value, context, extra = '') {
    const listId = 'list-' + id;
    const options = getExerciseOptions(context).map(x => `<option value="${escapeHTML(x.name)}" label="${escapeHTML(x.category)}"></option>`).join('');
    return `<input id="${id}" list="${listId}" value="${escapeHTML(value)}" placeholder="Search or type an exercise" data-exercise-context="${context}" ${extra}><datalist id="${listId}">${options}</datalist>`;
  }

  function getExerciseOptions(context) {
    const upper = state.sessionType.includes('Upper');
    let priority = [];
    if (context === 'warmup') priority = upper ? exerciseDB.warmupUpper : exerciseDB.warmupLower;
    else if (context === 'meLower') priority = exerciseDB.meLower;
    else if (context === 'meUpper') priority = exerciseDB.meUpper;
    else if (context === 'deLower') priority = exerciseDB.deLower;
    else if (context === 'deUpper') priority = exerciseDB.deUpper;
    else if (context === 'explosiveLower') priority = exerciseDB.explosiveLower;
    else if (context === 'explosiveUpper') priority = exerciseDB.explosiveUpper;
    else if (context === 'supplemental') priority = upper ? [...exerciseDB.triceps, ...exerciseDB.upperBack, ...exerciseDB.delts] : [...exerciseDB.posterior, ...exerciseDB.abs, ...exerciseDB.upperBack];
    else if (context === 'accessory') priority = upper ? [...exerciseDB.triceps, ...exerciseDB.upperBack, ...exerciseDB.delts, ...exerciseDB.biceps, ...exerciseDB.rotatorCuff, ...exerciseDB.abs] : [...exerciseDB.posterior, ...exerciseDB.abs, ...exerciseDB.upperBack, ...exerciseDB.gpp];
    else if (context === 'gpp') priority = [...exerciseDB.gpp, ...exerciseDB.posterior, ...exerciseDB.upperBack, ...exerciseDB.abs];
    else if (context === 'recovery') priority = [...exerciseDB.recovery, ...exerciseDB.gpp];
    const categories = [];
    Object.entries(exerciseDB).forEach(([cat, arr]) => arr.forEach(name => categories.push({ name, category: categoryLabels[cat] || cat })));
    customExercises.forEach(x => categories.push({ name: x.name, category: x.category || 'Custom' }));
    const result = [];
    const seen = new Set();
    priority.forEach(name => { if (!seen.has(name.toLowerCase())) { result.push({ name, category: 'Suggested' }); seen.add(name.toLowerCase()); } });
    categories.forEach(x => { if (!seen.has(x.name.toLowerCase())) { result.push(x); seen.add(x.name.toLowerCase()); } });
    return result;
  }

  /* ---------------- tables ---------------- */
  function renderExerciseTable(wrapId, key, rows, context) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    wrap.classList.add('table-wrap');
    wrap.innerHTML = `
      <table class="exercise-table">
        <thead><tr><th>Exercise</th><th>Sets</th><th>Reps / Time</th><th>Weight</th><th>RPE</th><th>Rest</th><th>Weak Point / Notes</th><th></th></tr></thead>
        <tbody>${rows.map((r, i) => exerciseRowHTML(key, r, i, context)).join('')}</tbody>
      </table>`;
  }

  function exerciseRowHTML(key, r, i, context) {
    const listId = `list-${key}-${i}`;
    const opts = getExerciseOptions(context).map(x => `<option value="${escapeHTML(x.name)}" label="${escapeHTML(x.category)}"></option>`).join('');
    return `<tr data-row-key="${key}" data-index="${i}">
      <td data-label="Exercise" class="exercise-col"><input class="rowExercise" list="${listId}" value="${escapeHTML(r.exercise)}" placeholder="Search or type"><datalist id="${listId}">${opts}</datalist></td>
      <td data-label="Sets"><input class="rowSets" value="${escapeHTML(r.sets)}" inputmode="numeric"></td>
      <td data-label="Reps / Time"><input class="rowReps" value="${escapeHTML(r.reps || r.duration)}" placeholder="10 or 2 min"></td>
      <td data-label="Weight"><input class="rowWeight" value="${escapeHTML(r.weight)}" inputmode="decimal"></td>
      <td data-label="RPE"><input class="rowRpe" value="${escapeHTML(r.rpe)}"></td>
      <td data-label="Rest"><input class="rowRest" value="${escapeHTML(r.rest)}"></td>
      <td data-label="Weak Point / Notes"><input class="rowNotes" value="${escapeHTML(r.weakPoint ? r.weakPoint + (r.notes ? ' — ' + r.notes : '') : r.notes)}"></td>
      <td data-label="Actions"><div class="row-actions no-print"><button title="Move up" data-move-row="${key}" data-index="${i}" data-direction="-1">↑</button><button title="Move down" data-move-row="${key}" data-index="${i}" data-direction="1">↓</button><button title="Delete" data-remove-row="${key}" data-index="${i}">✕</button></div></td>
    </tr>`;
  }

  function renderSetTable() {
    const wrap = document.getElementById('setTableWrap');
    if (!wrap) return;
    wrap.classList.add('table-wrap');
    const isLog = state.mode === 'Log';
    wrap.innerHTML = `<table class="exercise-table set-table"><thead><tr><th>Weight</th><th>Reps</th>${isLog ? '<th>✓</th>' : ''}<th>RPE</th><th>Result</th><th>Notes</th><th></th></tr></thead><tbody>${state.main.sets.map((s, i) => `
      <tr data-set-index="${i}" class="${s.done ? 'done' : ''}">
        <td data-label="Weight"><input class="setWeight" type="number" step="0.5" inputmode="decimal" value="${escapeHTML(s.weight)}"></td>
        <td data-label="Reps"><input class="setReps" type="number" min="0" inputmode="numeric" value="${escapeHTML(s.reps)}"></td>
        ${isLog ? `<td data-label="Done"><label class="log-done-wrap small-done no-print"><input type="checkbox" class="setDone" ${s.done ? 'checked' : ''}><span>✓</span></label></td>` : ''}
        <td data-label="RPE"><input class="setRpe" value="${escapeHTML(s.rpe)}"></td>
        <td data-label="Result"><select class="setResult"><option ${s.result === 'Successful' ? 'selected' : ''}>Successful</option><option ${s.result === 'Missed' ? 'selected' : ''}>Missed</option><option ${s.result === 'Skipped' ? 'selected' : ''}>Skipped</option></select></td>
        <td data-label="Notes"><input class="setNotes" value="${escapeHTML(s.notes)}"></td>
        <td data-label="Actions"><div class="row-actions no-print"><button data-set-remove="${i}">✕</button></div></td>
      </tr>`).join('')}</tbody></table>`;
    wrap.querySelectorAll('[data-set-remove]').forEach(b => b.addEventListener('click', () => {
      collectState(); state.main.sets.splice(Number(b.dataset.setRemove), 1); renderSetTable(); scheduleDraft();
    }));
  }

  function bindDynamicStateValues() {
    const wave = document.getElementById('deWave');
    if (wave) wave.addEventListener('change', () => { document.getElementById('deWaveMetric').textContent = wave.value; });
    document.querySelectorAll('.equipmentCheck').forEach(c => c.addEventListener('change', scheduleDraft));
  }

  /* ---------------- collect ---------------- */
  function collectState() {
    state.athlete = val('athlete'); state.date = val('sessionDate'); state.weekNumber = val('weekNumber'); state.bodyweight = val('bodyweight');
    state.trainingPhase = val('trainingPhase'); state.primaryGoal = val('primaryGoal'); state.weakPoint = val('weakPoint'); state.painRestrictions = val('painRestrictions');
    state.readiness.painToday = val('painToday'); state.readiness.action = val('readinessAction'); state.sessionNotes = val('sessionNotes'); state.nextSessionNotes = val('nextSessionNotes');

    if (state.mode === 'Log') {
      collectLogDOM();
      state.updatedAt = new Date().toISOString();
      return state;
    }
    state.warmup = collectRows('warmup');

    if (state.sessionType.startsWith('ME ')) {
      state.main.exercise = val('mainExercise'); state.main.bar = val('mainBar'); state.main.stanceGrip = val('mainStanceGrip'); state.main.romSetup = val('mainRomSetup'); state.main.resistance = val('mainResistance'); state.main.bandSetup = val('mainBandSetup');
      state.main.previousPR = val('mainPreviousPR'); state.main.target = val('mainTarget'); state.main.topResultWeight = val('mainTopWeight'); state.main.topResultReps = val('mainTopReps'); state.main.isPR = val('mainIsPR') === 'true';
      state.main.sets = [...document.querySelectorAll('[data-set-index]')].map((tr, i) => ({ weight: qv(tr, '.setWeight'), reps: qv(tr, '.setReps'), rpe: qv(tr, '.setRpe'), result: qv(tr, '.setResult'), notes: qv(tr, '.setNotes'), done: state.main.sets[i] ? !!state.main.sets[i].done : false }));
      state.supplemental = collectRows('supplemental'); state.accessories = collectRows('accessories');
    } else if (state.sessionType.startsWith('DE ')) {
      state.de.primer = val('dePrimer'); state.de.primerSets = val('dePrimerSets'); state.de.primerReps = val('dePrimerReps'); state.de.contacts = val('deContacts'); state.de.heightDistance = val('deHeightDistance');
      state.main.exercise = val('deMainExercise'); state.de.wave = val('deWave'); state.de.baseMax = val('deBaseMax'); state.de.percentage = val('dePercentage'); state.de.barWeight = val('deBarWeight'); state.de.bar = val('deBar'); state.de.boxSetup = val('deBoxSetup'); state.de.resistance = val('deResistance'); state.de.bandSetup = val('deBandSetup'); state.de.sets = val('deSets'); state.de.reps = val('deReps'); state.de.rest = val('deRest'); state.de.speedQuality = val('deSpeedQuality'); state.de.speedNotes = val('deSpeedNotes');
      if (state.sessionType === 'DE Lower') { state.de.speedPullExercise = val('speedPullExercise'); state.de.speedPullWeight = val('speedPullWeight'); state.de.speedPullResistance = val('speedPullResistance'); state.de.speedPullSets = val('speedPullSets'); state.de.speedPullReps = val('speedPullReps'); state.de.speedPullRest = val('speedPullRest'); state.de.speedPullQuality = val('speedPullQuality'); }
      state.supplemental = collectRows('supplemental'); state.accessories = collectRows('accessories');
    } else if (state.sessionType === 'GPP / Extra Workout') {
      state.gpp.purpose = val('gppPurpose'); state.gpp.focus = val('gppFocus'); state.gpp.targetDuration = val('gppDuration'); state.gpp.intensity = val('gppIntensity'); state.gpp.preset = val('gppPreset'); state.gpp.rows = collectRows('gppRows');
    } else {
      state.recovery.mode = val('recoveryMode'); state.recovery.reason = val('recoveryReason'); state.recovery.availableTime = val('recoveryTime'); state.recovery.intensity = val('recoveryIntensity'); state.recovery.preset = val('recoveryPreset'); state.recovery.equipment = [...document.querySelectorAll('.equipmentCheck:checked')].map(x => x.value); state.recovery.rows = collectRows('recoveryRows');
      if (state.sessionType === 'Deload') { state.recovery.mainLiftLoad = val('deloadMainLoad'); state.recovery.accessoryVolume = val('deloadAccessory'); state.recovery.gppStrategy = val('deloadGpp'); state.recovery.duration = val('deloadDuration'); }
    }
    state.updatedAt = new Date().toISOString();
    return state;
  }

  function collectRows(key) {
    const prev = getRowArray(key) || [];
    return [...document.querySelectorAll(`[data-row-key="${key}"]`)].map((tr, i) => {
      const repTime = qv(tr, '.rowReps');
      return { exercise: qv(tr, '.rowExercise'), sets: qv(tr, '.rowSets'), reps: repTime, duration: '', weight: qv(tr, '.rowWeight'), rpe: qv(tr, '.rowRpe'), rest: qv(tr, '.rowRest'), notes: qv(tr, '.rowNotes'), weakPoint: '', distance: '', contacts: '', result: '', log: (prev[i] && Array.isArray(prev[i].log)) ? prev[i].log : [] };
    }).filter(r => [r.exercise, r.sets, r.reps, r.weight, r.rpe, r.rest, r.notes].some(v => v !== '') || r.log.length);
  }

  function applyStateToStaticFields() {
    setVal('athlete', state.athlete); setVal('sessionDate', state.date); setVal('weekNumber', state.weekNumber); setVal('bodyweight', state.bodyweight); setVal('trainingPhase', state.trainingPhase); setVal('primaryGoal', state.primaryGoal); setVal('weakPoint', state.weakPoint); setVal('painRestrictions', state.painRestrictions); setVal('painToday', state.readiness.painToday); setVal('readinessAction', state.readiness.action); setVal('sessionNotes', state.sessionNotes); setVal('nextSessionNotes', state.nextSessionNotes);
    ['sleep', 'energy', 'soreness', 'stress'].forEach(k => {
      document.querySelectorAll(`input[name="${k}"]`).forEach(r => r.checked = String(r.value) === String(state.readiness[k]));
      document.getElementById(k + 'Value').textContent = state.readiness[k] ? state.readiness[k] + '/5' : '—';
    });
  }

  /* ---------------- actions ---------------- */
  function changeSessionType(type) {
    collectState();
    const old = state.sessionType;
    state.sessionType = type;
    if ((old.includes('Upper') && type.includes('Lower')) || (old.includes('Lower') && type.includes('Upper'))) {
      state.warmup = [row(defaultWarmup(type)), row()]; state.main.exercise = ''; state.supplemental = [row()]; state.accessories = [row(), row(), row()];
    }
    if (type === 'Deload') state.recovery.mode = 'Deload';
    renderAll(); scheduleDraft();
  }

  function setMode(mode) {
    if (state.mode === mode) return;
    collectState();
    state.mode = mode;
    if (mode === 'Log') seedLogs();
    renderAll(); scheduleDraft();
    if (mode === 'Log') toast('Log mode — tap ✓ as you finish each set.', 'success');
  }

  function newSession() {
    if (!confirm('Start a new session? The current draft will be replaced.')) return;
    const type = state.sessionType;
    state = createBlankState(type);
    applyStateToStaticFields(); renderAll(); saveDraft(false);
    toast('New session started.', 'success');
  }

  function addRow(key) {
    collectState();
    const arr = getRowArray(key);
    if (arr) { arr.push(row()); renderAll(); scheduleDraft(); }
  }
  function removeRow(key, index) {
    collectState();
    const arr = getRowArray(key);
    if (!arr || arr.length <= 1) { toast('Keep at least one row.', 'error'); return; }
    arr.splice(index, 1); renderAll(); scheduleDraft();
  }
  function moveRow(key, index, direction) {
    collectState();
    const arr = getRowArray(key); const target = index + direction;
    if (!arr || target < 0 || target >= arr.length) return;
    [arr[index], arr[target]] = [arr[target], arr[index]];
    renderAll(); scheduleDraft();
  }
  function getRowArray(key) {
    return key === 'warmup' ? state.warmup : key === 'supplemental' ? state.supplemental : key === 'accessories' ? state.accessories : key === 'gppRows' ? state.gpp.rows : key === 'recoveryRows' ? state.recovery.rows : null;
  }

  function applySelectedPreset(kind) {
    collectState();
    if (kind === 'gpp') {
      const name = val('gppPreset');
      if (!name || !presets.gpp[name]) return toast('Choose a GPP preset first.', 'error');
      state.gpp.preset = name; state.gpp.rows = structuredClone(presets.gpp[name]);
    } else {
      const name = val('recoveryPreset');
      if (!name || !presets.recovery[name]) return toast('Choose a recovery preset first.', 'error');
      state.recovery.preset = name; state.recovery.rows = structuredClone(presets.recovery[name]);
    }
    renderAll(); scheduleDraft(); toast('Preset loaded. Adjust anything you need.', 'success');
  }

  function updateDECalculations() {
    const base = num(val('deBaseMax')), pct = num(val('dePercentage')), sets = num(val('deSets')), reps = num(val('deReps'));
    let bar = num(val('deBarWeight'));
    const calculated = base * pct / 100;
    const active = document.activeElement?.id;
    if (base && pct && active !== 'deBarWeight') { bar = Math.round(calculated * 2) / 2; setVal('deBarWeight', bar); }
    const volume = bar * sets * reps;
    const unit = settings.unit;
    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    set('deCalcWeight', bar ? `${bar.toLocaleString()} ${unit}` : '—');
    set('deVolume', volume ? `${volume.toLocaleString()} ${unit}` : '—');
    set('deTotalReps', sets && reps ? String(sets * reps) : '—');
    set('deWaveMetric', val('deWave') || '—');
  }

  function variationKey(s = state) {
    return [s.athlete, s.sessionType, s.main && s.main.exercise, s.main && s.main.bar, s.main && s.main.stanceGrip, s.main && s.main.romSetup, s.main && s.main.resistance, s.main && s.main.bandSetup]
      .map(v => String(v || '').trim().toLowerCase()).join('|');
  }

  function updatePreviousPRFromHistory(force = true) {
    if (!state.sessionType.startsWith('ME ')) return;
    if (force) collectState();
    const key = variationKey(state);
    let best = null;
    history.filter(h => h.sessionType && h.sessionType.startsWith('ME ') && variationKey(h) === key).forEach(h => {
      const w = num(h.main?.topResultWeight), r = num(h.main?.topResultReps || 1);
      if (!best || w > best.weight || (w === best.weight && r > best.reps)) best = { weight: w, reps: r, date: h.date };
    });
    if (best && (!state.main.previousPR || force)) { state.main.previousPR = best.weight; setVal('mainPreviousPR', best.weight); }
  }

  /* ---------------- draft + save ---------------- */
  function scheduleDraft() {
    clearTimeout(draftTimer);
    setDraftStatus('saving', 'Editing…');
    draftTimer = setTimeout(() => { collectState(); saveDraft(false); }, 650);
  }
  function saveDraft(showToast = false) {
    saveJSON(STORAGE.draft, state);
    setDraftStatus('saved', 'Draft saved locally');
    if (showToast) toast('Draft saved on this device.', 'success');
  }
  function setDraftStatus(cls, title) {
    const el = document.getElementById('draftStatus');
    el.className = 'status-dot ' + (cls || '');
    el.title = title || '';
  }

  async function saveSession() {
    collectState();
    if (!state.athlete || !state.date) return toast('Athlete and date are required.', 'error');
    if (!state.id) state.id = uid();
    state.createdAt = state.createdAt || new Date().toISOString();
    state.updatedAt = new Date().toISOString();

    const index = history.findIndex(h => h.id === state.id);
    if (index >= 0) history[index] = structuredClone(state); else history.unshift(structuredClone(state));
    history.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
    saveJSON(STORAGE.draft, state);

    if (isCloud()) {
      if (!settings.scriptUrl) {
        queueOutbox(state);
        return toast('No Apps Script URL set. Session held on this device until Sheets is configured.', 'error');
      }
      setDraftStatus('saving', 'Saving to Google Sheets…');
      try {
        await postToSheets('saveSession', { payload: state });
        setDraftStatus('saved', 'Saved to Google Sheets');
        toast(index >= 0 ? 'Session updated in Google Sheets.' : 'Session saved to Google Sheets.', 'success');
      } catch (err) {
        queueOutbox(state);
        setDraftStatus('error', 'Waiting to reach Google Sheets');
        toast('Offline or Sheets unreachable — session saved on this device and will sync automatically.', 'error');
      }
      return;
    }

    saveJSON(STORAGE.history, history);
    toast(index >= 0 ? 'Session updated locally.' : 'Session saved locally.', 'success');
    if (sheetsEnabled()) await syncSessionToSheets(state);
  }

  async function syncSessionToSheets(session) {
    setDraftStatus('saving', 'Syncing to Google Sheets…');
    try {
      await postToSheets('saveSession', { payload: session });
      setDraftStatus('saved', 'Saved locally + Google Sheets');
      toast('Session synced to Google Sheets.', 'success');
    } catch (err) {
      queueOutbox(session);
      setDraftStatus('error', 'Saved locally — Google sync will retry');
      toast('Saved locally. Google Sheets sync failed: ' + err.message, 'error');
    }
  }

  /* ---------------- history ---------------- */
  function populateSessionTypeFilters() {
    document.getElementById('historyTypeFilter').innerHTML = '<option value="">All Sessions</option>' + Object.keys(sessionMeta).map(x => `<option>${x}</option>`).join('');
  }

  function renderHistory() {
    const source = document.getElementById('historySource');
    if (source) source.textContent = isCloud() ? 'GOOGLE SHEETS' : sheetsEnabled() ? 'THIS DEVICE + GOOGLE SHEETS' : 'THIS DEVICE';
    const type = val('historyTypeFilter').toLowerCase(), ex = val('historyExerciseFilter').toLowerCase(), athlete = val('historyAthleteFilter').toLowerCase();
    const list = history.filter(h => (!type || String(h.sessionType).toLowerCase() === type) && (!ex || String(h.main?.exercise || '').toLowerCase().includes(ex)) && (!athlete || String(h.athlete || '').toLowerCase().includes(athlete)));
    const wrap = document.getElementById('historyList');
    if (!list.length) {
      const hint = isCloud() && !remoteLoaded
        ? 'Loading from Google Sheets… if this persists, check Settings and tap Test Connection.'
        : 'No saved sessions match the current filters.';
      wrap.innerHTML = `<p class="muted" style="text-align:center;padding:24px 0">${hint}</p>`;
      return;
    }
    wrap.innerHTML = list.map(h => `<div class="history-item">
      <div><strong>${escapeHTML(formatDate(h.date))}</strong><div class="muted small">Week ${escapeHTML(h.weekNumber || '—')}</div></div>
      <div><h4>${escapeHTML(h.sessionType)}</h4><p>${escapeHTML(h.main?.exercise || h.gpp?.preset || h.recovery?.preset || 'Custom session')}${h.main?.topResultWeight ? ` — ${escapeHTML(h.main.topResultWeight)} ${settings.unit} × ${escapeHTML(h.main.topResultReps || 1)}` : ''}${h.main?.isPR ? ' &nbsp;<span class="status-pill good">PR</span>' : ''}</p><p>${escapeHTML(h.sessionNotes || '')}</p></div>
      <div class="history-actions"><button class="btn" data-history-load="${h.id}">Open</button><button class="btn" data-history-copy="${h.id}">Copy</button><button class="btn danger" data-history-delete="${h.id}">Delete</button></div>
    </div>`).join('');
    wrap.querySelectorAll('[data-history-load]').forEach(b => b.addEventListener('click', () => loadHistorySession(b.dataset.historyLoad, false)));
    wrap.querySelectorAll('[data-history-copy]').forEach(b => b.addEventListener('click', () => loadHistorySession(b.dataset.historyCopy, true)));
    wrap.querySelectorAll('[data-history-delete]').forEach(b => b.addEventListener('click', () => deleteHistorySession(b.dataset.historyDelete)));
  }

  function loadHistorySession(id, copy) {
    const found = history.find(h => h.id === id);
    if (!found) return;
    state = normalizeState(structuredClone(found));
    if (copy) { state.id = uid(); state.date = todayISO(); state.createdAt = ''; state.main.isPR = false; state.sessionNotes = ''; state.mode = 'Plan'; clearLogs(state); }
    applyStateToStaticFields(); renderAll(); saveDraft(false);
    showView('train');
    toast(copy ? 'Session copied as a new draft.' : 'Saved session opened.', 'success');
  }

  async function deleteHistorySession(id) {
    const where = isCloud() ? 'Google Sheets' : 'local history';
    if (!confirm(`Delete this saved session from ${where}?`)) return;
    history = history.filter(h => h.id !== id);
    outbox = outbox.filter(h => h.id !== id);
    saveJSON(STORAGE.outbox, outbox);
    if (!isCloud()) saveJSON(STORAGE.history, history);
    renderHistory(); updateOutboxBadge();
    if (sheetsEnabled()) {
      try { await postToSheets('deleteSession', { id }); toast('Session deleted from Google Sheets.', 'success'); }
      catch (err) { toast('Removed here, but Google Sheets delete failed: ' + err.message, 'error'); }
    } else {
      toast('Session deleted from local history.', 'success');
    }
  }

  async function syncRemoteHistory() {
    if (!settings.scriptUrl) return toast('Add the Apps Script Web App URL in Settings first.', 'error');
    await flushOutbox();
    remoteLoaded = false;
    await loadRemoteHistory(true);
  }

  /* ---------------- PRs + progress ---------------- */
  function calculatePRs() {
    const records = new Map();
    history.filter(h => h.sessionType?.startsWith('ME ') && num(h.main?.topResultWeight) > 0).forEach(h => {
      const key = variationKey(h);
      const current = records.get(key);
      const candidate = { key, athlete: h.athlete, exercise: h.main.exercise, variation: [h.main.bar, h.main.stanceGrip, h.main.romSetup, h.main.resistance, h.main.bandSetup].filter(Boolean).join(' | '), weight: num(h.main.topResultWeight), reps: num(h.main.topResultReps || 1), date: h.date, id: h.id };
      if (!current || candidate.weight > current.weight || (candidate.weight === current.weight && candidate.reps > current.reps)) records.set(key, candidate);
    });
    return [...records.values()].sort((a, b) => b.weight - a.weight);
  }

  function renderPRs() {
    const ex = val('prSearch').toLowerCase(), athlete = val('prAthlete').toLowerCase();
    const prs = calculatePRs().filter(p => (!ex || p.exercise.toLowerCase().includes(ex) || p.variation.toLowerCase().includes(ex)) && (!athlete || String(p.athlete).toLowerCase().includes(athlete)));
    document.getElementById('prList').innerHTML = prs.length
      ? `<table class="exercise-table"><thead><tr><th>Exercise</th><th>Variation</th><th>Record</th><th>Date</th></tr></thead><tbody>${prs.map(p => `<tr><td data-label="Exercise">${escapeHTML(p.exercise)}</td><td data-label="Variation">${escapeHTML(p.variation)}</td><td data-label="Record"><strong>${p.weight} ${settings.unit} × ${p.reps}</strong></td><td data-label="Date">${escapeHTML(formatDate(p.date))}</td></tr>`).join('')}</tbody></table>`
      : '<p class="muted">No max-effort records yet. Save an ME session with a top result to start tracking.</p>';
  }

  function renderProgress() {
    const prs = calculatePRs();
    const select = document.getElementById('progressVariation');
    const previous = select.value;
    select.innerHTML = prs.length
      ? prs.map(p => `<option value="${escapeHTML(p.key)}" ${p.key === previous ? 'selected' : ''}>${escapeHTML(p.exercise)}${p.variation ? ' — ' + escapeHTML(p.variation) : ''}</option>`).join('')
      : '<option value="">No ME records yet</option>';

    renderVariationChart(select.value || (prs[0] && prs[0].key));
    renderVolumeChart();
    renderReadinessChart();
    renderPRs();
  }

  function renderVariationChart(key) {
    const statsEl = document.getElementById('variationStats');
    const chartEl = document.getElementById('variationChart');
    if (!key) { statsEl.innerHTML = ''; chartEl.innerHTML = '<p class="chart-empty">Log max-effort sessions to see your strength trend.</p>'; return; }
    const sessions = history
      .filter(h => h.sessionType?.startsWith('ME ') && variationKey(h) === key && num(h.main?.topResultWeight) > 0)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (!sessions.length) { statsEl.innerHTML = ''; chartEl.innerHTML = '<p class="chart-empty">No sessions for this variation yet.</p>'; return; }
    const points = sessions.map(h => ({ label: formatDate(h.date), value: Math.round(e1rm(h.main.topResultWeight, h.main.topResultReps)) }));
    const best = Math.max(...points.map(p => p.value));
    const latest = points[points.length - 1].value;
    const first = points[0].value;
    statsEl.innerHTML = `
      <div class="metric"><span>Best est. 1RM</span><strong>${best.toLocaleString()} ${settings.unit}</strong></div>
      <div class="metric"><span>Latest</span><strong>${latest.toLocaleString()} ${settings.unit}</strong></div>
      <div class="metric"><span>Change</span><strong>${latest - first >= 0 ? '+' : ''}${(latest - first).toLocaleString()} ${settings.unit}</strong></div>
      <div class="metric"><span>Sessions</span><strong>${points.length}</strong></div>`;
    chartEl.innerHTML = lineChartSVG(points, { unit: settings.unit });
  }

  function sessionTonnage(h) {
    let total = 0;
    (h.main?.sets || []).forEach(s => { total += num(s.weight) * num(s.reps); });
    total += num(h.main?.topResultWeight) * (num(h.main?.topResultReps) || 1);
    if (h.de) {
      const deLogged = (h.de.mainLog || []).filter(s => s.done);
      if (deLogged.length) deLogged.forEach(s => { total += num(s.weight) * num(s.reps); });
      else total += num(h.de.barWeight) * num(h.de.sets) * num(h.de.reps);
      const spLogged = (h.de.speedPullLog || []).filter(s => s.done);
      if (spLogged.length) spLogged.forEach(s => { total += num(s.weight) * num(s.reps); });
      else total += num(h.de.speedPullWeight) * num(h.de.speedPullSets) * num(h.de.speedPullReps);
    }
    [h.supplemental, h.accessories, h.gpp?.rows, h.recovery?.rows].forEach(rows =>
      (rows || []).forEach(r => (r.log || []).forEach(s => { if (s.done) total += num(s.weight) * num(s.reps); })));
    return total;
  }

  function weekStart(dateISO) {
    const d = new Date(dateISO + 'T12:00:00');
    if (isNaN(d)) return null;
    const day = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - day);
    return d.toISOString().slice(0, 10);
  }

  function renderVolumeChart() {
    const el = document.getElementById('volumeChart');
    const byWeek = new Map();
    history.forEach(h => {
      const wk = weekStart(h.date);
      if (!wk) return;
      byWeek.set(wk, (byWeek.get(wk) || 0) + sessionTonnage(h));
    });
    const weeks = [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
    const points = weeks.filter(([, v]) => v > 0).map(([wk, v]) => ({ label: formatDate(wk), value: Math.round(v) }));
    el.innerHTML = points.length ? barChartSVG(points, { unit: settings.unit }) : '<p class="chart-empty">Log sessions with weights to see weekly volume.</p>';
  }

  function renderReadinessChart() {
    const el = document.getElementById('readinessChart');
    const points = history
      .filter(h => ['sleep', 'energy', 'soreness', 'stress'].every(k => num(h.readiness?.[k]) > 0))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(-20)
      .map(h => {
        const r = h.readiness;
        return { label: formatDate(h.date), value: Math.round(((num(r.sleep) + num(r.energy) + (6 - num(r.soreness)) + (6 - num(r.stress))) / 4) * 10) / 10 };
      });
    el.innerHTML = points.length >= 2 ? lineChartSVG(points, { unit: '/5', min: 1, max: 5 }) : '<p class="chart-empty">Rate readiness in at least two sessions to see the trend.</p>';
  }

  /* ---------------- SVG charts ---------------- */
  function chartFrame(w, h, inner) {
    return `<svg viewBox="0 0 ${w} ${h}" role="img" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
  }

  function lineChartSVG(points, opts = {}) {
    const W = 640, H = 240, padL = 46, padR = 14, padT = 14, padB = 30;
    const values = points.map(p => p.value);
    let min = opts.min ?? Math.min(...values), max = opts.max ?? Math.max(...values);
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    min -= span * 0.06; max += span * 0.06;
    const x = i => points.length === 1 ? (padL + (W - padL - padR) / 2) : padL + (i / (points.length - 1)) * (W - padL - padR);
    const y = v => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
    const grid = [0, 0.25, 0.5, 0.75, 1].map(t => {
      const v = min + t * (max - min);
      const yy = y(v);
      return `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="#34343a" stroke-width="1"/><text x="${padL - 6}" y="${yy + 4}" text-anchor="end" font-size="10" fill="#a3a39c">${Math.round(v).toLocaleString()}</text>`;
    }).join('');
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const area = `${path} L${x(points.length - 1).toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z`;
    const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3.5" fill="#d4af5a"><title>${escapeHTML(p.label)}: ${p.value.toLocaleString()} ${opts.unit || ''}</title></circle>`).join('');
    const firstLabel = `<text x="${padL}" y="${H - 8}" font-size="10" fill="#a3a39c">${escapeHTML(points[0].label)}</text>`;
    const lastLabel = points.length > 1 ? `<text x="${W - padR}" y="${H - 8}" text-anchor="end" font-size="10" fill="#a3a39c">${escapeHTML(points[points.length - 1].label)}</text>` : '';
    return chartFrame(W, H, `${grid}<path d="${area}" fill="rgba(212,175,90,0.12)"/><path d="${path}" fill="none" stroke="#d4af5a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}${firstLabel}${lastLabel}`);
  }

  function barChartSVG(points, opts = {}) {
    const W = 640, H = 240, padL = 52, padR = 14, padT = 14, padB = 30;
    const max = Math.max(...points.map(p => p.value)) * 1.08;
    const bw = (W - padL - padR) / points.length;
    const grid = [0, 0.5, 1].map(t => {
      const v = t * max;
      const yy = padT + (1 - t) * (H - padT - padB);
      return `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="#34343a" stroke-width="1"/><text x="${padL - 6}" y="${yy + 4}" text-anchor="end" font-size="10" fill="#a3a39c">${Math.round(v).toLocaleString()}</text>`;
    }).join('');
    const bars = points.map((p, i) => {
      const h = (p.value / max) * (H - padT - padB);
      const xx = padL + i * bw + bw * 0.18;
      return `<rect x="${xx.toFixed(1)}" y="${(H - padB - h).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="#d4af5a" opacity="${i === points.length - 1 ? 1 : 0.6}"><title>Week of ${escapeHTML(p.label)}: ${p.value.toLocaleString()} ${opts.unit || ''}</title></rect>`;
    }).join('');
    const firstLabel = `<text x="${padL}" y="${H - 8}" font-size="10" fill="#a3a39c">${escapeHTML(points[0].label)}</text>`;
    const lastLabel = points.length > 1 ? `<text x="${W - padR}" y="${H - 8}" text-anchor="end" font-size="10" fill="#a3a39c">${escapeHTML(points[points.length - 1].label)}</text>` : '';
    return chartFrame(W, H, `${grid}${bars}${firstLabel}${lastLabel}`);
  }

  /* ---------------- print ---------------- */
  function printSession() { collectState(); updatePrintSubtitle(); window.print(); }
  function updatePrintSubtitle() {
    document.getElementById('printSubtitle').textContent = [state.athlete, state.sessionType, formatDate(state.date), state.weekNumber ? `Week ${state.weekNumber}` : ''].filter(Boolean).join(' • ');
  }

  /* ---------------- settings ---------------- */
  function populateSettingsForm() {
    setVal('settingAthlete', settings.athlete); setVal('settingUnit', settings.unit);
    setVal('settingScriptUrl', settings.scriptUrl); setVal('settingToken', settings.token); setVal('settingSync', settings.sync);
  }
  function saveSettings() {
    const previous = settings.sync;
    settings = { ...settings, athlete: val('settingAthlete') || 'Eric Salinas', unit: val('settingUnit') || 'lb', scriptUrl: val('settingScriptUrl').trim(), token: val('settingToken'), sync: val('settingSync'), sheetId: DB_SHEET_ID };
    saveJSON(STORAGE.settings, settings);
    updateWeightUnits();
    updateSyncHelp();

    if (settings.sync === 'cloud' && previous !== 'cloud') {
      if (!settings.scriptUrl) {
        toast('Add your Apps Script URL, then use Test Connection before relying on cloud-only storage.', 'error');
      } else {
        migrateLocalHistoryToCloud();
        return;
      }
    }
    if (sheetsEnabled()) { flushOutbox(); remoteLoaded = false; loadRemoteHistory(false); }
    toast('Settings saved.', 'success');
  }

  /* Push any device-held sessions to Sheets before local history is dropped. */
  async function migrateLocalHistoryToCloud() {
    const local = loadJSON(STORAGE.history, []);
    if (!local.length) {
      history = []; localStorage.removeItem(STORAGE.history);
      remoteLoaded = false; await loadRemoteHistory(true);
      return toast('Cloud-only storage is on. Sessions now save to Google Sheets.', 'success');
    }
    toast(`Uploading ${local.length} saved session${local.length > 1 ? 's' : ''} to Google Sheets…`);
    const failed = [];
    for (const session of local) {
      try { await postToSheets('saveSession', { payload: normalizeState(session) }); }
      catch { failed.push(session); }
    }
    if (failed.length) {
      failed.forEach(queueOutbox);
      toast(`${local.length - failed.length} uploaded. ${failed.length} will retry automatically — kept on this device until then.`, 'error');
    } else {
      toast(`All ${local.length} sessions uploaded to Google Sheets.`, 'success');
    }
    localStorage.removeItem(STORAGE.history);
    history = [];
    remoteLoaded = false;
    await loadRemoteHistory(false);
  }
  function updateWeightUnits() { document.querySelectorAll('.weight-unit').forEach(x => x.textContent = settings.unit); }

  async function addCustomExercise() {
    const name = val('customExerciseName').trim(), category = val('customExerciseCategory').trim() || 'Custom';
    if (!name) return toast('Enter a custom exercise name.', 'error');
    if (customExercises.some(x => x.name.toLowerCase() === name.toLowerCase())) return toast('That exercise already exists in your custom list.', 'error');
    customExercises.push({ name, category, createdAt: new Date().toISOString() });
    saveJSON(STORAGE.custom, customExercises);
    setVal('customExerciseName', ''); setVal('customExerciseCategory', '');
    renderAll();
    toast('Custom exercise added to all searchable menus.', 'success');
    if (settings.sync === 'on' && settings.scriptUrl) {
      try {
        await fetch(settings.scriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'saveCustomExercise', token: settings.token || '', payload: { name, category } }) });
      } catch { /* local save already succeeded */ }
    }
  }

  /* ---------------- backup ---------------- */
  function exportBackup() {
    downloadJSON({ version: 2, exportedAt: new Date().toISOString(), settings, customExercises, history, outbox, draft: state }, 'conjugate-planner-backup.json');
  }
  async function importBackup(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.history)) throw new Error('Invalid backup file');
      settings = { ...defaultSettings, ...data.settings };
      customExercises = data.customExercises || [];
      history = (data.history || []).map(normalizeState);
      state = normalizeState(data.draft || createBlankState('ME Lower'));
      saveJSON(STORAGE.settings, settings); saveJSON(STORAGE.custom, customExercises);
      saveJSON(STORAGE.draft, state);
      populateSettingsForm(); applyStateToStaticFields(); renderAll(); updateSyncHelp();
      if (isCloud() && settings.scriptUrl) {
        toast(`Backup read. Uploading ${history.length} sessions to Google Sheets…`);
        await migrateImportedToCloud();
      } else {
        saveJSON(STORAGE.history, history);
        toast('Backup imported.', 'success');
      }
    } catch (err) { toast('Import failed: ' + err.message, 'error'); }
    finally { e.target.value = ''; }
  }
  async function migrateImportedToCloud() {
    const failed = [];
    for (const session of history) {
      try { await postToSheets('saveSession', { payload: session }); }
      catch { failed.push(session); }
    }
    failed.forEach(queueOutbox);
    localStorage.removeItem(STORAGE.history);
    history = [];
    remoteLoaded = false;
    await loadRemoteHistory(false);
    toast(failed.length
      ? `Imported. ${failed.length} session${failed.length > 1 ? 's' : ''} still to upload — they will retry automatically.`
      : 'Backup imported into Google Sheets.', failed.length ? 'error' : 'success');
  }

  function clearLocalData() {
    if (outbox.length && !confirm(`${outbox.length} session(s) have not reached Google Sheets yet and will be lost. Continue?`)) return;
    const message = isCloud()
      ? 'Clear the cached copy on this device? Sessions in Google Sheets are not touched.'
      : 'Delete all local session history and custom exercises? This cannot be undone.';
    if (!confirm(message)) return;
    history = []; customExercises = []; outbox = [];
    localStorage.removeItem(STORAGE.history); localStorage.removeItem(STORAGE.custom); localStorage.removeItem(STORAGE.outbox);
    updateOutboxBadge(); renderAll();
    if (isCloud()) { remoteLoaded = false; loadRemoteHistory(false); }
    toast(isCloud() ? 'Device cache cleared. Google Sheets is untouched.' : 'Local history and custom exercises cleared.', 'success');
  }

  function exportPRCsv() {
    const rows = [['Athlete', 'Exercise', 'Variation', 'Weight', 'Reps', 'Date'], ...calculatePRs().map(p => [p.athlete, p.exercise, p.variation, p.weight, p.reps, p.date])];
    downloadText(rows.map(r => r.map(csvCell).join(',')).join('\n'), 'conjugate-pr-records.csv', 'text/csv');
  }
  function csvCell(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function downloadJSON(obj, name) { downloadText(JSON.stringify(obj, null, 2), name, 'application/json'); }
  function downloadText(text, name, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------------- rest timer ---------------- */
  let restInterval = null, restRemaining = 0;
  function bindRestTimer() {
    const fab = document.getElementById('restFabBtn');
    const popover = document.getElementById('restPopover');
    document.getElementById('restFab').hidden = false;
    fab.addEventListener('click', () => { popover.hidden = !popover.hidden; });
    document.querySelectorAll('[data-rest]').forEach(b => b.addEventListener('click', () => {
      startRest(Number(b.dataset.rest));
      popover.hidden = true;
    }));
    document.getElementById('restStopBtn').addEventListener('click', () => { stopRest(); popover.hidden = true; });
    document.addEventListener('click', e => {
      if (!e.target.closest('.rest-fab')) popover.hidden = true;
    });
  }
  function startRest(seconds) {
    stopRest();
    restRemaining = seconds;
    updateRestFab();
    restInterval = setInterval(() => {
      restRemaining -= 1;
      if (restRemaining <= 0) {
        stopRest();
        restDone();
      } else updateRestFab();
    }, 1000);
  }
  function stopRest() {
    clearInterval(restInterval); restInterval = null; restRemaining = 0;
    const fab = document.getElementById('restFabBtn');
    fab.classList.remove('running'); fab.textContent = '⏱';
  }
  function updateRestFab() {
    const fab = document.getElementById('restFabBtn');
    fab.classList.add('running');
    const m = Math.floor(restRemaining / 60), s = restRemaining % 60;
    fab.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }
  function restDone() {
    toast('Rest complete — next set.', 'success');
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880; gain.gain.value = 0.15;
      osc.start();
      setTimeout(() => { osc.stop(); ctx.close(); }, 350);
    } catch { /* audio unavailable */ }
  }

  /* ---------------- toast ---------------- */
  function toast(message, type = '') {
    const wrap = document.getElementById('toastWrap');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 4300);
  }

  init();
})();
