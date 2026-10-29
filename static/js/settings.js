(function () {
  'use strict';
  const M = window.MT;
  const { $, api, esc } = M;
  let info = null;

  M.wireMoney(document);
  async function load() {
    try {
      info = await api('GET', '/api/settings');
      const s = info.settings;
      $('#s_start').value = s.starting_balance ? M.num(s.starting_balance) : '';
      $('#s_unit').value = s.distance_unit; $('#s_week').value = s.week_start; $('#s_currency').value = s.currency_label; $('#s_vehicle').value = s.vehicle_name;
      $('#s_cur').textContent = s.currency_label;
      $('#dbPath').textContent = info.db_path;
      const c = info.counts;
      const undo = $('#undoRestore'); if (undo) undo.hidden = !info.has_safety;
      $('#counts').textContent = `Currently stored: ${c.transactions} transactions, ${c.shifts} shifts, ${c.fuel_logs} fill-ups, ${c.budgets} budgets, ${c.goals} goals.`;
      $('#demoInfo').innerHTML = info.demo_count ? `<span class="gold">${info.demo_count} sample records are currently loaded.</span>` : '<span class="muted">No sample data loaded.</span>';
      $('#loadDemo').disabled = info.demo_count > 0; $('#removeDemo').disabled = info.demo_count === 0;
      $('#authInfo').textContent = info.auth_enabled ? '🔒 A password is set. You must sign in to open the app.' : 'No password is set. Anyone who can open the app address can see your data. That is fine if you only use it on this computer.';
      $('#curWrap').hidden = !info.auth_enabled; $('#removePass').hidden = !info.auth_enabled; $('#setPass').textContent = info.auth_enabled ? 'Change password' : 'Set password';
      const cats = await api('GET', '/api/categories');
      $('#catList').innerHTML = cats.filter((x) => !x.is_archived || x.tx_count).map((x) => `<div class="tx"><div class="tx-ico">${esc(x.icon)}</div><div class="tx-main"><div class="tx-title">${esc(x.name)}</div><div class="tx-sub">${x.is_default ? '<span class="chip">built-in</span>' : '<span class="chip tip">custom</span>'}${x.is_archived ? '<span class="chip warn">deleted · history kept</span>' : ''}<span>${x.tx_count} transaction${x.tx_count === 1 ? '' : 's'}</span></div></div>${x.is_default ? '' : `<button class="icon-btn" data-edit="${x.id}" aria-label="Edit"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg></button>${x.is_archived ? '' : `<button class="icon-btn danger" data-del="${x.id}" aria-label="Delete"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>`}`}</div>`).join('');
      window._cats = cats;
    } catch (e) { M.toast(e.message, 'error'); }
  }

  $('#saveGeneral').addEventListener('click', async () => {
    const err = $('#genErr'); err.hidden = true;
    try {
      await api('PUT', '/api/settings', { starting_balance: M.rawNum($('#s_start').value) || '0', distance_unit: $('#s_unit').value, week_start: $('#s_week').value, currency_label: $('#s_currency').value, vehicle_name: $('#s_vehicle').value });
      M.toast('Settings saved.'); setTimeout(() => location.reload(), 400);
    } catch (e) { err.textContent = e.message; err.hidden = false; }
  });

  $('#addCat').addEventListener('click', () => M.openCategoryForm());
  $('#catList').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    const id = (ed || del) && (ed || del).dataset[ed ? 'edit' : 'del'];
    const cat = id && window._cats.find((c) => String(c.id) === String(id));
    if (!cat) return;
    if (ed) return M.openCategoryForm(cat);
    const r = await M.confirmDialog({ title: 'Delete this category?', message: cat.tx_count ? `<strong>${esc(cat.name)}</strong> has ${cat.tx_count} transactions. It will be hidden from new entries, but your history and reports stay unchanged.` : `<strong>${esc(cat.name)}</strong> isn't used by any transaction and will be removed.`, confirmLabel: 'Delete' });
    if (!r) return;
    try { await api('DELETE', `/api/categories/${cat.id}`); M.toast('Category removed.'); load(); } catch (er) { M.toast(er.message, 'error'); }
  });
  window.addEventListener('data:changed', load);

  $('#restoreBtn').addEventListener('click', async () => {
    const file = $('#restoreFile').files[0];
    if (!file) return M.toast('Choose a backup file first.', 'error');
    const r = await M.confirmDialog({ title: 'Restore this backup?', message: `This replaces <strong>all</strong> current data with the contents of <strong>${esc(file.name)}</strong>. A safety copy of the current data is saved first.`, confirmLabel: 'Restore' });
    if (!r) return;
    const fd = new FormData(); fd.append('file', file);
    try { const out = await api('POST', '/api/restore', fd, true); M.toast(`Backup restored. Previous data saved as ${out.safety_copy}.`); setTimeout(() => location.reload(), 900); }
    catch (e) { M.toast(e.message, 'error'); }
  });

  const undoBtn = $('#undoRestore');
  if (undoBtn) undoBtn.addEventListener('click', async () => {
    const r = await M.confirmDialog({ title: 'Undo the last restore?', message: 'This brings back the data you had <strong>before</strong> the last restore and replaces what is in the app now.', confirmLabel: 'Undo restore' });
    if (!r) return;
    try { await api('POST', '/api/restore/undo'); M.toast('Previous data brought back.'); setTimeout(() => location.reload(), 700); } catch (e) { M.toast(e.message, 'error'); }
  });

  $('#loadDemo').addEventListener('click', async () => { try { await api('POST', '/api/demo/load'); M.toast('Sample data loaded.'); setTimeout(() => location.reload(), 500); } catch (e) { M.toast(e.message, 'error'); } });
  $('#removeDemo').addEventListener('click', async () => {
    const r = await M.confirmDialog({ title: 'Remove sample data?', message: 'Only the entries marked <strong>demo</strong> are deleted. Everything you added or edited yourself is kept.', confirmLabel: 'Remove sample data' });
    if (!r) return;
    try { const o = await api('POST', '/api/demo/remove'); M.toast(`Removed ${o.removed.transactions} sample transactions.`); setTimeout(() => location.reload(), 500); } catch (e) { M.toast(e.message, 'error'); }
  });

  function authErr(e) {
    const f = e.field && document.querySelector(`[data-field="${e.field}"]`);
    if (f) { f.classList.add('invalid'); $('.err', f).textContent = e.message; } else M.toast(e.message, 'error');
  }
  $('#setPass').addEventListener('click', async () => {
    document.querySelectorAll('#authForm .invalid').forEach((f) => { f.classList.remove('invalid'); $('.err', f).textContent = ''; });
    try { await api('POST', '/api/auth/password', { current: $('#p_cur').value, new: $('#p_new').value }); M.toast('Password saved.'); $('#p_cur').value = ''; $('#p_new').value = ''; setTimeout(() => location.reload(), 500); }
    catch (e) { authErr(e); }
  });
  $('#removePass').addEventListener('click', async () => {
    try { await api('POST', '/api/auth/remove', { current: $('#p_cur').value }); M.toast('Password removed.'); setTimeout(() => location.reload(), 500); } catch (e) { authErr(e); }
  });
  load();
})();
