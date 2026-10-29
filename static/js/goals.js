(function () {
  'use strict';
  const M = window.MT;
  const { $, api, esc, money } = M;
  let goals = [];

  async function load() {
    try { goals = await api('GET', '/api/goals'); render(); } catch (e) { M.toast(e.message, 'error'); }
  }

  function render() {
    const saved = goals.reduce((a, g) => a + g.saved, 0), target = goals.reduce((a, g) => a + g.target_amount, 0);
    $('#goalStats').innerHTML = [['🐷', 'Saved across goals', money(saved), ''], ['🎯', 'Total targets', money(target), ''], ['✅', 'Goals reached', `${goals.filter((g) => g.reached).length} of ${goals.length}`, '']]
      .map(([i, l, v]) => `<article class="card stat"><div class="top"><span class="ico">${i}</span>${l}</div><div class="value num">${esc(v)}</div></article>`).join('');
    $('#goalList').innerHTML = goals.length ? goals.map((g) => {
      let plan = '';
      if (g.reached) plan = '<span class="chip income">🎉 Goal reached</span>';
      else if (g.overdue) plan = '<span class="chip expense">Target date has passed</span>';
      else if (g.per_week != null) plan = `<span class="small muted">To finish by ${esc(M.fmtDate(g.target_date))}: about <strong class="num">${esc(money(g.per_week))}</strong> per week (${g.days_left} days left)</span>`;
      return `<article class="card"><div class="row between"><div><h2 style="font-size:18px">${esc(g.name)}</h2>${g.target_date ? `<div class="xs muted">Target date ${esc(M.fmtDate(g.target_date))}</div>` : '<div class="xs muted">No target date</div>'}</div>
          <div class="row"><button class="icon-btn" data-edit="${g.id}" aria-label="Edit goal"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg></button><button class="icon-btn danger" data-del="${g.id}" aria-label="Delete goal"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button></div></div>
        <div style="margin:14px 0 6px" class="row between"><span class="num" style="font-size:22px;font-weight:750">${esc(money(g.saved))}</span><span class="muted num">of ${esc(money(g.target_amount))}</span></div>
        <div class="progress" role="progressbar" aria-valuenow="${g.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${g.pct}%"></i></div>
        <div class="row between small" style="margin-top:6px"><span>${g.pct}%</span><span class="num muted">${esc(money(g.remaining))} remaining</span></div>
        <div style="margin-top:10px;min-height:22px">${plan}</div>
        <div class="row" style="margin-top:12px"><button class="btn btn-primary btn-sm" data-add="${g.id}" data-dir="in">+ Add money</button><button class="btn btn-sm" data-add="${g.id}" data-dir="out" ${g.saved <= 0 ? 'disabled' : ''}>Take money back</button><a class="btn btn-ghost btn-sm" href="transactions.html?kind=savings">History</a>${g.is_demo ? '<span class="chip demo">demo</span>' : ''}</div></article>`;
    }).join('') : '<div class="card" style="grid-column:1/-1"><div class="empty"><strong>No savings goals yet</strong>Create a goal such as “New phone” or “Emergency fund”.</div></div>';
  }

  function openForm(existing) {
    const isEdit = !!existing;
    const body = `<form novalidate><div class="form-error" hidden></div>
      ${M.field('name', 'Goal name', `<input id="f_name" type="text" maxlength="80" placeholder="e.g. New phone" value="${esc(existing ? existing.name : '')}">`)}
      ${M.field('target_amount', 'Target amount', M.moneyInput('target_amount', existing && existing.target_amount, '0'))}
      ${M.field('initial_amount', 'Already saved (starting amount)', M.moneyInput('initial_amount', existing && existing.initial_amount ? existing.initial_amount : '', '0'), 'Money you had already set aside before using the app. Use “Add money” for new deposits.')}
      ${M.field('target_date', 'Target date (optional)', `<input id="f_target_date" type="date" value="${existing && existing.target_date ? existing.target_date : ''}">`)}
      ${M.field('notes', 'Notes (optional)', `<textarea id="f_notes" rows="2" maxlength="2000">${esc(existing ? existing.notes : '')}</textarea>`)}</form>`;
    const m = M.modal({ title: isEdit ? 'Edit goal' : 'New savings goal', body, footer: `<button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="button" data-submit>${isEdit ? 'Save changes' : 'Create goal'}</button>` });
    M.wireMoney(m.el);
    M.bindForm(m, async () => {
      const payload = { name: $('#f_name', m.el).value, target_amount: M.rawNum($('#f_target_amount', m.el).value), initial_amount: M.rawNum($('#f_initial_amount', m.el).value), target_date: $('#f_target_date', m.el).value, notes: $('#f_notes', m.el).value };
      isEdit ? await api('PUT', `/api/goals/${existing.id}`, payload) : await api('POST', '/api/goals', payload);
      M.toast(isEdit ? 'Goal updated.' : 'Goal created.'); load();
    });
  }

  $('#addGoal').addEventListener('click', () => openForm());
  $('#goalList').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]'), add = e.target.closest('[data-add]');
    if (add) { const g = goals.find((x) => String(x.id) === add.dataset.add); return M.openTransactionForm(null, { kind: 'savings', goal_id: g.id, direction: add.dataset.dir }); }
    const id = (ed || del) && (ed || del).dataset[ed ? 'edit' : 'del'];
    const g = id && goals.find((x) => String(x.id) === String(id));
    if (!g) return;
    if (ed) return openForm(g);
    const r = await M.confirmDialog({ title: 'Delete this goal?', message: `<strong>${esc(g.name)}</strong> and its deposit history will be deleted. The ${esc(money(g.saved))} it holds returns to your available balance. This can't be undone.`, confirmLabel: 'Delete goal' });
    if (!r) return;
    try { await api('DELETE', `/api/goals/${g.id}`); M.toast('Goal deleted.'); load(); } catch (er) { M.toast(er.message, 'error'); }
  });
  window.addEventListener('data:changed', load);
  load();
})();
