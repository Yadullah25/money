(function () {
  'use strict';
  const M = window.MT;
  const { $, $$, api, esc, money } = M;
  let budgets = [];
  const PERIOD = { daily: ['Daily budgets', 'today'], weekly: ['Weekly budgets', 'this week'], monthly: ['Monthly budgets', 'this month'] };
  const STATUS = { ok: 'On track', warn: 'Nearly at limit', over: 'Over budget' };

  async function load() {
    try { const r = await api('GET', '/api/budgets'); budgets = r.budgets; render(); } catch (e) { M.toast(e.message, 'error'); }
  }

  function render() {
    const n = (s) => budgets.filter((b) => b.status === s).length;
    $('#summary').innerHTML = [['📋', 'Active budgets', budgets.length, ''], ['⚠️', 'Near the limit (≥ 80%)', n('warn'), n('warn') ? 'warn' : ''], ['🚨', 'Exceeded', n('over'), n('over') ? 'neg' : '']]
      .map(([i, l, v, c]) => `<article class="card stat"><div class="top"><span class="ico">${i}</span>${l}</div><div class="value num ${c === 'warn' ? 'gold' : c}">${v}</div></article>`).join('');
    if (!budgets.length) {
      $('#periods').innerHTML = '<div class="card"><div class="empty"><strong>No budgets yet</strong>Create one, for example “Fuel · weekly · 50,000”, to see progress bars and alerts here.</div></div>';
    } else {
      $('#periods').innerHTML = ['daily', 'weekly', 'monthly'].map((per) => {
        const list = budgets.filter((b) => b.period === per);
        if (!list.length) return '';
        return `<section class="card"><div class="card-head"><h2>${PERIOD[per][0]}</h2><span class="small muted">Spending ${PERIOD[per][1]}</span></div>
          ${list.map((b) => `<div class="budget" style="padding:12px 0;border-top:1px solid var(--line)">
            <div class="row between"><div class="row"><span style="font-size:22px">${esc(b.icon)}</span><div><strong>${esc(b.name)}</strong><div class="xs muted">${esc(M.fmtDate(b.window_start))}${b.window_start !== b.window_end ? ' – ' + esc(M.fmtDate(b.window_end)) : ''}</div></div></div>
              <div class="row"><span class="chip ${b.status === 'over' ? 'expense' : b.status === 'warn' ? 'warn' : 'income'}">${STATUS[b.status]}</span>
                <button class="icon-btn" data-edit="${b.id}" aria-label="Edit budget"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg></button>
                <button class="icon-btn danger" data-del="${b.id}" aria-label="Delete budget"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button></div></div>
            <div class="progress ${b.status}" style="margin:10px 0 6px" role="progressbar" aria-valuenow="${Math.min(b.pct, 100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.min(b.pct, 100)}%"></i></div>
            <div class="row between small"><span class="num">${esc(money(b.spent))} of ${esc(money(b.limit_amount))} · ${b.pct}%</span>
              <span class="num ${b.remaining < 0 ? 'neg' : 'muted'}">${b.remaining < 0 ? 'Over by ' + esc(money(-b.remaining)) : esc(money(b.remaining)) + ' left'}</span></div>
            ${b.status !== 'ok' ? `<div class="small ${b.status === 'over' ? 'neg' : 'gold'}" style="margin-top:6px">${b.status === 'over' ? '🚨 You have gone over this budget.' : '⚠️ You have used 80% or more of this budget.'}</div>` : ''}
            ${b.is_demo ? '<span class="chip demo" style="margin-top:6px">demo</span>' : ''}
          </div>`).join('')}</section>`;
      }).join('');
    }
    const p = M.palette(), L = budgets.map((b) => `${b.name} (${b.period})`);
    M.chart('chBudget', { type: 'bar', data: { labels: L, datasets: [
      { label: 'Planned (limit)', data: budgets.map((b) => b.limit_amount), backgroundColor: p.blue + 'aa', borderRadius: 5, maxBarThickness: 26 },
      { label: 'Actual spent', data: budgets.map((b) => b.spent), backgroundColor: budgets.map((b) => (b.status === 'over' ? p.red : b.status === 'warn' ? p.orange : p.green)), borderRadius: 5, maxBarThickness: 26 }] },
      options: { plugins: { legend: { display: true, labels: { boxWidth: 10, boxHeight: 10 } } }, scales: { y: M.yAxisMoney, x: M.xAxis } } });
    M.chartEmpty('chBudget', !budgets.length, 'Create a budget to compare planned and actual spending.');
  }

  function openForm(existing) {
    const isEdit = !!existing;
    const cats = M.boot.categories.filter((c) => !c.is_archived);
    const body = `<form novalidate><div class="form-error" hidden></div>
      ${M.field('category_id', 'Applies to', `<select id="f_category_id"><option value="">All spending (every category)</option>${cats.map((c) => `<option value="${c.id}" ${existing && existing.category_id === c.id ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</select>`)}
      ${M.field('period', 'Period', `<select id="f_period">${['daily', 'weekly', 'monthly'].map((p) => `<option value="${p}" ${existing && existing.period === p ? 'selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}</select>`, `Weeks start on ${M.boot.settings.week_start[0].toUpperCase() + M.boot.settings.week_start.slice(1)} (change in Settings).`)}
      ${M.field('limit_amount', 'Spending limit', M.moneyInput('limit_amount', existing && existing.limit_amount, '0'))}</form>`;
    const m = M.modal({ title: isEdit ? 'Edit budget' : 'New budget', size: 'small', body, footer: `<button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="button" data-submit>${isEdit ? 'Save changes' : 'Create budget'}</button>` });
    M.wireMoney(m.el);
    M.bindForm(m, async () => {
      const payload = { category_id: $('#f_category_id', m.el).value, period: $('#f_period', m.el).value, limit_amount: M.rawNum($('#f_limit_amount', m.el).value) };
      isEdit ? await api('PUT', `/api/budgets/${existing.id}`, payload) : await api('POST', '/api/budgets', payload);
      M.toast(isEdit ? 'Budget updated.' : 'Budget created.'); load();
    });
  }

  $('#addBudget').addEventListener('click', async () => { try { Object.assign(M.boot, await api('GET', '/api/bootstrap')); } catch (e) { /* use cached */ } openForm(); });
  $('#periods').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    const id = (ed || del) && (ed || del).dataset[ed ? 'edit' : 'del'];
    const b = id && budgets.find((x) => String(x.id) === String(id));
    if (!b) return;
    if (ed) return openForm(b);
    const r = await M.confirmDialog({ title: 'Delete this budget?', message: `The ${esc(b.period)} budget for <strong>${esc(b.name)}</strong> will be removed. Your transactions are not affected.` });
    if (!r) return;
    try { await api('DELETE', `/api/budgets/${b.id}`); M.toast('Budget deleted.'); load(); } catch (er) { M.toast(er.message, 'error'); }
  });
  window.addEventListener('data:changed', load);
  window.addEventListener('theme:changed', render);
  load();
})();
