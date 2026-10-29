(function () {
  'use strict';
  const M = window.MT;
  const { $, $$, api, esc, money, num } = M;
  let data = null;

  const rb = M.rangeBar($('#rangeBar'), load, { default: 'month' });
  const hm = (h) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
  const dist = (km) => (km == null ? '—' : `${num(M.toDisp(km), 1)} ${M.unit()}`);

  async function load() {
    try {
      data = await api('GET', '/api/shifts?' + rb.params());
      $('#exportShifts').href = 'export/shifts.csv?' + rb.params();
      rb.setLabel(data.range.label);
      render();
    } catch (e) { M.toast(e.message, 'error'); }
  }

  function sorted() {
    const k = $('#sortShifts').value, a = data.shifts.slice();
    const f = { date: null, net: (s) => s.metrics.net, net_hour: (s) => (s.metrics.net_per_hour == null ? -Infinity : s.metrics.net_per_hour), tips: (s) => s.metrics.tips }[k];
    if (f) a.sort((x, y) => f(y) - f(x));
    return a;
  }

  function render() {
    const s = data.summary;
    $('#shiftStats').innerHTML = [
      ['🕒', 'Shifts', `${s.count}`, `${hm(s.hours)} worked · ${s.deliveries} deliveries`],
      ['💰', 'Income from shifts', money(s.income), `Tips ${M.short(s.tips)} included`],
      ['📈', 'Net profit', money(s.net), `Income ${M.short(s.income)} − costs ${M.short(s.expenses)}`, s.net >= 0 ? 'pos' : 'neg'],
      ['⏱️', 'Net per hour', s.net_per_hour == null ? '—' : money(s.net_per_hour), s.income_per_hour == null ? '' : `Gross ${money(s.income_per_hour)}/hour`],
    ].map(([i, l, v, sub, cls]) => `<article class="card stat"><div class="top"><span class="ico">${i}</span>${l}</div><div class="value num ${cls || ''}">${esc(v)}</div><div class="sub">${esc(sub || '')}</div></article>`).join('');

    const list = sorted();
    $('#shiftList').innerHTML = list.length ? list.map(card).join('') : `<div class="card" style="grid-column:1/-1"><div class="empty"><strong>No shifts in this period</strong>Record a shift to see earnings per hour, per delivery, and your most profitable days.</div></div>`;

    // charts (chronological)
    const chron = data.shifts.slice().reverse(), p = M.palette();
    M.chart('chShiftNet', { type: 'bar', data: { labels: chron.map((x) => `${M.fmtDate(x.shift_date)}`), datasets: [
      { label: 'Net profit', data: chron.map((x) => x.metrics.net), backgroundColor: chron.map((x) => (x.id === data.best_id ? p.gold : x.metrics.net >= 0 ? p.green : p.red)), borderRadius: 5, maxBarThickness: 28 }] },
      options: { scales: { y: Object.assign({}, M.yAxisMoney, { beginAtZero: false }), x: M.xAxis } } });
    M.chartEmpty('chShiftNet', !chron.length, 'No shifts recorded yet.');

    const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], acc = names.map(() => ({ n: 0, net: 0 }));
    chron.forEach((x) => { const i = (new Date(x.shift_date + 'T12:00:00').getDay() + 6) % 7; acc[i].n++; acc[i].net += x.metrics.net; });
    const avg = acc.map((a) => (a.n ? Math.round(a.net / a.n) : 0)), top = Math.max(...avg);
    M.chart('chShiftDays', { type: 'bar', data: { labels: names, datasets: [{ label: 'Avg net per shift', data: avg, backgroundColor: avg.map((v, i) => (acc[i].n && v === top && top > 0 ? p.gold : p.blue)), borderRadius: 5, maxBarThickness: 30 }] },
      options: { scales: { y: M.yAxisMoney, x: M.xAxis } } });
    M.chartEmpty('chShiftDays', !chron.length, 'No shifts recorded yet.');
  }

  function card(s) {
    const m = s.metrics, best = s.id === data.best_id;
    return `<article class="card shift-card ${best ? 'best' : ''}" data-id="${s.id}" tabindex="0" role="button" aria-label="Shift on ${esc(M.fmtDate(s.shift_date))}">
      <div class="row between"><div><strong>${esc(M.weekday(s.shift_date))}, ${esc(M.fmtDate(s.shift_date))}</strong><div class="small muted">${esc(s.start_time)} – ${esc(s.end_time)} · ${hm(m.hours)}</div></div>${best ? '<span class="chip tip">★ Most profitable</span>' : (s.is_demo ? '<span class="chip demo">demo</span>' : '')}</div>
      <div><div class="xs muted">Net profit</div><div class="value num ${m.net >= 0 ? 'pos' : 'neg'}" style="font-size:24px;font-weight:750">${esc(money(m.net))}</div></div>
      <div class="metric-grid" style="grid-template-columns:repeat(2,1fr)">
        <div class="metric"><div class="k">Income</div><div class="v num" style="font-size:15px">${esc(money(m.income))}</div></div>
        <div class="metric"><div class="k">Tips</div><div class="v num" style="font-size:15px">${esc(money(m.tips))}</div></div>
        <div class="metric"><div class="k">Net / hour</div><div class="v num" style="font-size:15px">${m.net_per_hour == null ? '—' : esc(money(m.net_per_hour))}</div></div>
        <div class="metric"><div class="k">Per delivery</div><div class="v num" style="font-size:15px">${m.income_per_delivery == null ? '—' : esc(money(m.income_per_delivery))}</div></div>
      </div>
      <div class="small muted">${s.deliveries} deliveries · ${esc(dist(s.distance_km))}${m.tips_per_delivery != null ? ` · tips ${esc(money(m.tips_per_delivery))}/delivery` : ''}</div>
    </article>`;
  }

  // ---------------------------------------------------- shift form -------
  async function openShiftForm(existing) {
    const isEdit = !!existing;
    const mg = existing ? existing.managed : {};
    const now = new Date(), hh = (d) => `${M.pad(d.getHours())}:${M.pad(d.getMinutes())}`;
    const start = existing ? existing.start_time : hh(new Date(now.getTime() - 6 * 3600e3));
    const end = existing ? existing.end_time : hh(now);
    const f = (n, l, i, h) => M.field(n, l, i, h);
    const body = `<form novalidate><div class="form-error" hidden></div>
      <div class="form-grid">
        ${f('shift_date', 'Date', `<input id="f_shift_date" type="date" value="${existing ? existing.shift_date : M.todayStr()}">`)}
        ${f('deliveries', 'Deliveries completed', `<input id="f_deliveries" type="text" inputmode="numeric" value="${existing ? existing.deliveries : ''}" placeholder="0">`)}
        ${f('start_time', 'Start time', `<input id="f_start_time" type="time" value="${start}">`)}
        ${f('end_time', 'End time', `<input id="f_end_time" type="time" value="${end}">`, 'Past midnight? Just enter the later time - it is handled.')}
        ${f('delivery_earnings', 'Delivery earnings', M.moneyInput('delivery_earnings', mg.delivery || '', '0'), 'Pay for deliveries, without tips.')}
        ${f('tips', 'Tips received', M.moneyInput('tips', mg.tip || '', '0'), 'Counted inside income, not on top of it.')}
        ${f('fuel_cost', 'Fuel cost for this shift', M.moneyInput('fuel_cost', mg.fuel || '', '0'), 'Leave empty if unknown.')}
        ${f('other_expenses', 'Other work expenses', M.moneyInput('other_expenses', mg.other || '', '0'), 'Parking, snacks, phone data used for work…')}
        ${f('distance_km', `Distance driven (${M.unit()})`, `<input id="f_distance_km" type="text" inputmode="decimal" value="${existing && existing.distance_km != null ? esc(String(Math.round(M.toDisp(existing.distance_km) * 10) / 10)) : ''}" placeholder="0">`, 'Optional - needed for fuel cost per distance.', 'full')}
      </div>
      ${f('notes', 'Notes (optional)', `<textarea id="f_notes" rows="2" maxlength="2000">${esc(existing ? existing.notes : '')}</textarea>`)}
      <div class="metric-grid" id="preview"></div>
      ${isEdit && existing.transactions.some((t) => !t.shift_role) ? '<div class="banner info small">This shift also has entries you linked by hand. They are included in its totals and are managed in the shift details.</div>' : ''}
    </form>`;
    const m = M.modal({ title: isEdit ? 'Edit shift' : 'Record a shift', body, size: 'wide', footer: `<button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="button" data-submit>${isEdit ? 'Save changes' : 'Save shift'}</button>` });
    M.wireMoney(m.el);
    const g = (id) => $('#f_' + id, m.el);
    const n = (id) => Number(M.rawNum(g(id).value)) || 0;
    function preview() {
      const handIncome = isEdit ? existing.transactions.filter((t) => !t.shift_role && t.kind === 'income').reduce((a, t) => a + t.amount, 0) : 0;
      const handExp = isEdit ? existing.transactions.filter((t) => !t.shift_role && t.kind === 'expense').reduce((a, t) => a + t.amount, 0) : 0;
      const income = n('delivery_earnings') + n('tips') + handIncome, exp = n('fuel_cost') + n('other_expenses') + handExp, net = income - exp;
      const [h1, m1] = (g('start_time').value || '0:0').split(':').map(Number), [h2, m2] = (g('end_time').value || '0:0').split(':').map(Number);
      const hours = (((h2 * 60 + m2) - (h1 * 60 + m1) + 1440) % 1440) / 60, d = n('deliveries');
      const cell = (k, v, cls) => `<div class="metric"><div class="k">${k}</div><div class="v num ${cls || ''}" style="font-size:16px">${v}</div></div>`;
      $('#preview', m.el).innerHTML = cell('Shift income', esc(money(income))) + cell('Shift expenses', esc(money(exp))) + cell('Net profit', esc(money(net)), net >= 0 ? 'pos' : 'neg')
        + cell('Hours', hours ? hm(hours) : '—') + cell('Net / hour', hours ? esc(money(Math.round(net / hours))) : '—') + cell('Income / delivery', d ? esc(money(Math.round(income / d))) : '—') + cell('Tips / delivery', d ? esc(money(Math.round(n('tips') / d))) : '—');
    }
    m.el.addEventListener('input', preview); preview();
    M.bindForm(m, async () => {
      const dv = g('distance_km').value.trim().replace(/,/g, '');
      const payload = { shift_date: g('shift_date').value, start_time: g('start_time').value, end_time: g('end_time').value, deliveries: M.rawNum(g('deliveries').value),
        delivery_earnings: M.rawNum(g('delivery_earnings').value), tips: M.rawNum(g('tips').value), fuel_cost: M.rawNum(g('fuel_cost').value), other_expenses: M.rawNum(g('other_expenses').value),
        distance_km: dv === '' ? '' : String(M.fromDisp(dv)), notes: g('notes').value };
      if (dv !== '' && isNaN(Number(dv))) { throw Object.assign(new Error('Distance must be a number.'), { field: 'distance_km' }); }
      isEdit ? await api('PUT', `/api/shifts/${existing.id}`, payload) : await api('POST', '/api/shifts', payload);
      M.toast(isEdit ? 'Shift updated.' : 'Shift saved.');
      window.dispatchEvent(new CustomEvent('data:changed'));
    });
  }

  // -------------------------------------------------- shift details -----
  async function openDetails(id) {
    let s;
    try { s = await api('GET', `/api/shifts/${id}`); } catch (e) { return M.toast(e.message, 'error'); }
    const m = s.metrics, cpk = data && data.avg_cost_per_km;
    const row = (k, v) => `<div class="kv"><span class="muted">${k}</span><strong class="num">${v}</strong></div>`;
    const body = `<div class="metric-grid">
        <div class="metric"><div class="k">Net profit</div><div class="v num ${m.net >= 0 ? 'pos' : 'neg'}">${esc(money(m.net))}</div></div>
        <div class="metric"><div class="k">Net per hour</div><div class="v num">${m.net_per_hour == null ? '—' : esc(money(m.net_per_hour))}</div></div>
        <div class="metric"><div class="k">Income per hour</div><div class="v num">${m.income_per_hour == null ? '—' : esc(money(m.income_per_hour))}</div></div>
        <div class="metric"><div class="k">Per delivery</div><div class="v num">${m.income_per_delivery == null ? '—' : esc(money(m.income_per_delivery))}</div></div></div>
      <div>${row('Delivery earnings', esc(money(m.delivery_earnings)))}${row('Tips', esc(money(m.tips)))}${m.other_income ? row('Bonus / other income', esc(money(m.other_income))) : ''}${row('Total income', esc(money(m.income)))}
        ${row('Fuel', esc(money(m.fuel)))}${row('Other expenses', esc(money(m.expenses - m.fuel)))}${row('Total expenses', esc(money(m.expenses)))}
        ${row('Hours · deliveries', `${hm(m.hours)} · ${s.deliveries}`)}${row('Tips per delivery', m.tips_per_delivery == null ? '—' : esc(money(m.tips_per_delivery)))}${row('Distance', esc(dist(s.distance_km)))}
        ${row(`Fuel cost per ${M.unit()}`, m.fuel_cost_per_km == null ? (m.est_fuel_cost != null ? `≈ ${esc(money(M.unit() === 'mi' ? cpk * 1.609344 : cpk))} <span class="xs muted">(estimate from your fill-ups)</span>` : '<span class="muted">needs fuel cost and distance</span>') : esc(money(M.unit() === 'mi' ? m.fuel_cost_per_km * 1.609344 : m.fuel_cost_per_km)))}
        ${m.est_fuel_cost != null ? row('Net after estimated fuel', `≈ ${esc(money(m.net_after_est_fuel))} <span class="xs muted">(no fuel was recorded)</span>`) : ''}</div>
      ${s.notes ? `<div class="small muted">📝 ${esc(s.notes)}</div>` : ''}
      <div><div class="card-head"><h3>Entries counted in this shift (${s.transactions.length})</h3><button class="btn btn-sm" id="linkBtn" type="button">🔗 Link existing entry</button></div>
        <div class="tx-list">${s.transactions.map((t) => `<div class="tx"><div class="tx-ico ${M.txVisual(t).cls}">${esc(M.txVisual(t).ico)}</div><div class="tx-main"><div class="tx-title">${esc(t.description || t.label)}</div><div class="tx-sub"><span class="chip ${M.txVisual(t).chip}">${M.txVisual(t).chipText}</span>${t.shift_role ? '<span class="chip">from shift form</span>' : '<span class="chip">linked</span>'}</div></div><div class="tx-amt num ${t.kind === 'income' ? 'pos' : 'neg'}">${t.kind === 'income' ? '+' : '−'}${esc(M.num(t.amount))}</div>${t.shift_role ? '' : `<button class="icon-btn" data-unlink="${t.id}" title="Unlink from shift" aria-label="Unlink"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`}</div>`).join('') || '<div class="empty small">No entries.</div>'}</div></div>
      <div id="linkPane" hidden></div>`;
    const dlg = M.modal({ title: `Shift · ${M.fmtDate(s.shift_date)}`, size: 'wide', body, footer: '<button class="btn btn-danger" type="button" data-del>Delete</button><button class="btn" type="button" data-edit>Edit</button><button class="btn btn-primary" type="button" data-close>Done</button>' });
    $('[data-edit]', dlg.el).addEventListener('click', () => { dlg.close(); openShiftForm(s); });
    $('[data-del]', dlg.el).addEventListener('click', async () => {
      const r = await M.confirmDialog({ title: 'Delete this shift?', message: `The shift on <strong>${esc(M.fmtDate(s.shift_date))}</strong> will be removed.`,
        extra: `<label class="check"><input type="checkbox" name="all"> <span>Also delete the delivery, tip and expense entries this shift created (${s.transactions.filter((t) => t.shift_role).length}). Entries you linked by hand are always kept.</span></label>`, confirmLabel: 'Delete shift' });
      if (!r) return;
      try { const out = await api('DELETE', `/api/shifts/${s.id}?mode=${r.extras.all ? 'all' : 'keep'}`); dlg.close(); M.toast(r.extras.all ? `Shift and ${out.removed_transactions} entries deleted.` : 'Shift deleted. Its money entries were kept.'); window.dispatchEvent(new CustomEvent('data:changed')); }
      catch (e) { M.toast(e.message, 'error'); }
    });
    dlg.el.addEventListener('click', async (e) => {
      const un = e.target.closest('[data-unlink]');
      if (un) { try { await api('POST', `/api/shifts/${s.id}/unlink`, { transaction_id: un.dataset.unlink }); dlg.close(); window.dispatchEvent(new CustomEvent('data:changed')); openDetails(s.id); } catch (er) { M.toast(er.message, 'error'); } }
    });
    $('#linkBtn', dlg.el).addEventListener('click', async () => {
      const pane = $('#linkPane', dlg.el); pane.hidden = false; pane.innerHTML = '<div class="muted small">Loading…</div>';
      try {
        const items = await api('GET', `/api/shifts/${s.id}/linkable`);
        pane.innerHTML = items.length ? `<div class="card-head"><h3>Choose an entry from around ${esc(M.fmtDate(s.shift_date))}</h3></div><div class="tx-list">${items.map((t) => `<div class="tx"><div class="tx-ico ${M.txVisual(t).cls}">${esc(M.txVisual(t).ico)}</div><div class="tx-main"><div class="tx-title">${esc(t.description || t.label)}</div><div class="tx-sub">${esc(t.label)} · ${esc(M.fmtDate(t.occurred_at, true))}</div></div><div class="tx-amt num">${esc(M.num(t.amount))}</div><button class="btn btn-sm" data-link="${t.id}">Link</button></div>`).join('')}</div>` : '<div class="empty small"><strong>Nothing to link</strong>There are no unlinked income or expense entries within 3 days of this shift.</div>';
        pane.onclick = async (e) => { const b = e.target.closest('[data-link]'); if (!b) return; try { await api('POST', `/api/shifts/${s.id}/link`, { transaction_id: b.dataset.link }); dlg.close(); M.toast('Linked. Your overall totals did not change.'); window.dispatchEvent(new CustomEvent('data:changed')); openDetails(s.id); } catch (er) { M.toast(er.message, 'error'); } };
      } catch (er) { pane.innerHTML = `<div class="form-error">${esc(er.message)}</div>`; }
    });
  }

  $('#addShift').addEventListener('click', () => openShiftForm());
  $('#sortShifts').addEventListener('change', () => data && render());
  $('#shiftList').addEventListener('click', (e) => { const c = e.target.closest('.shift-card'); if (c) openDetails(c.dataset.id); });
  $('#shiftList').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const c = e.target.closest('.shift-card'); if (c) { e.preventDefault(); openDetails(c.dataset.id); } } });
  window.addEventListener('data:changed', load);
  window.addEventListener('theme:changed', () => data && render());
  load();
})();
