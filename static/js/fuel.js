(function () {
  'use strict';
  const M = window.MT;
  const { $, api, esc, money, num } = M;
  const mi = M.unit() === 'mi';
  let data = null;

  const rb = M.rangeBar($('#rangeBar'), load, { default: 'all' });
  $('#thOdo').textContent = `Odometer (${M.unit()})`;

  async function load() {
    try {
      data = await api('GET', '/api/fuel?' + rb.params());
      rb.setLabel(data.range.label);
      render();
    } catch (e) { M.toast(e.message, 'error'); }
  }

  function render() {
    const t = data.totals, s = data.summary;
    const econ = s.km_per_l == null ? null : (mi ? `≈ ${num(s.mpg, 1)} mpg (US)` : `≈ ${num(s.km_per_l, 2)} km/L`);
    const econ2 = s.km_per_l == null ? '' : (mi ? `${num(s.km_per_l, 2)} km/L` : `${num(s.l_per_100km, 2)} L/100 km`);
    const cpd = mi ? s.cost_per_mile : s.cost_per_km;
    $('#fuelStats').innerHTML = [
      ['⛽', 'Total fuel spent', money(t.fuel_spent), `${t.fill_ups} fill-up${t.fill_ups === 1 ? '' : 's'} · ${t.fuel_pct}% of all expenses`],
      ['🧪', 'Liters purchased', t.liters ? `${num(t.liters, 1)} L` : '—', t.liters ? 'Only fill-ups with liters recorded' : 'Add liters to each fill-up'],
      ['🏷️', 'Average price / liter', t.avg_price_per_liter == null ? '—' : money(t.avg_price_per_liter), 'Paid ÷ liters, fill-ups with liters only'],
      ['📊', 'Estimated economy', econ || 'Not enough data', econ ? `${econ2} · over ${num(M.toDisp(s.km), 0)} ${M.unit()} (estimate)` : 'Needs two full-tank fill-ups with odometer and liters'],
      ['🛣️', `Cost per ${M.unit()}`, cpd == null ? 'Not enough data' : `≈ ${money(cpd)}`, cpd == null ? 'Same data as economy' : 'Estimate from full-tank intervals'],
    ].map(([i, l, v, sub]) => `<article class="card stat"><div class="top"><span class="ico">${i}</span>${l}</div><div class="value num" style="${v.length > 14 ? 'font-size:18px' : ''}">${esc(v)}</div><div class="sub">${esc(sub)}</div></article>`).join('')
      + `<article class="card stat"><div class="top"><span class="ico">🗓️</span>This range, by month</div><div class="value num" style="font-size:18px">${data.monthly.length ? esc(money(Math.round(t.fuel_spent / Math.max(data.monthly.length, 1)))) : '—'}</div><div class="sub">Average per month shown</div></article>`;

    $('#logCount').textContent = `${data.logs.length} shown`;
    $('#fuelRows').innerHTML = data.logs.length ? data.logs.map((l) => `<tr>
      <td>${esc(M.fmtDate(l.logged_at, true))}${l.is_full ? '' : ' <span class="chip">partial</span>'}${l.ac_used ? ' <span class="chip">❄ A/C</span>' : ''}${l.is_demo ? ' <span class="chip demo">demo</span>' : ''}</td>
      <td class="r num">${esc(num(l.amount))}</td><td class="r num">${l.liters == null ? '—' : esc(num(l.liters, 2))}</td>
      <td class="r num">${l.price_per_liter == null ? '—' : esc(num(l.price_per_liter))}</td>
      <td class="r num">${l.odometer_km == null ? '—' : esc(num(M.toDisp(l.odometer_km), 1))}</td>
      <td class="r num">${l.km_per_l == null ? '<span class="muted">—</span>' : `≈ ${esc(mi ? num(l.km_per_l * 2.352145833, 1) + ' mpg' : num(l.km_per_l, 2) + ' km/L')}`}</td>
      <td class="r" style="white-space:nowrap"><button class="icon-btn" data-edit="${l.id}" aria-label="Edit"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg></button><button class="icon-btn danger" data-del="${l.id}" aria-label="Delete"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button></td></tr>`).join('')
      : '<tr><td colspan="7"><div class="empty"><strong>No fill-ups recorded</strong>Add your first fill-up with the button above.</div></td></tr>';

    const withAc = s.ac, noAc = s.no_ac;
    $('#acBody').innerHTML = withAc && noAc ? `<div class="kv"><span>With A/C</span><strong class="num">≈ ${esc(num(withAc.km_per_l, 2))} km/L</strong></div><div class="kv"><span>Without A/C</span><strong class="num">≈ ${esc(num(noAc.km_per_l, 2))} km/L</strong></div><div class="xs faint" style="margin-top:8px">${withAc.km_per_l < noAc.km_per_l ? `A/C use costs about ${num((1 - withAc.km_per_l / noAc.km_per_l) * 100, 0)}% in economy here.` : 'No visible A/C penalty in your data.'} Few fill-ups = rough estimate; driving style and traffic matter too.</div>`
      : 'Tick “A/C used” on fill-ups. Once you have full-tank intervals both with and without A/C, they are compared here.';

    const p = M.palette();
    M.chart('chFuelMonth', { type: 'bar', data: { labels: data.monthly.map((x) => x.label), datasets: [{ label: 'Fuel', data: data.monthly.map((x) => x.fuel), backgroundColor: p.orange, borderRadius: 6, maxBarThickness: 40 }] }, options: { scales: { y: M.yAxisMoney, x: M.xAxis } } });
    M.chartEmpty('chFuelMonth', !data.monthly.some((x) => x.fuel), 'No fuel spending in this range.');
    M.chart('chFuelPrice', { type: 'line', data: { labels: data.price_series.map((x) => M.fmtDate(x.date)), datasets: [{ label: 'Price per liter', data: data.price_series.map((x) => x.price), borderColor: p.gold, backgroundColor: p.gold + '33', fill: true, tension: .25, pointRadius: 3, borderWidth: 2 }] },
      options: { scales: { y: Object.assign({}, M.yAxisMoney, { beginAtZero: false }), x: M.xAxis } } });
    M.chartEmpty('chFuelPrice', !data.price_series.length, 'Record liters to see the price per liter.');
  }

  function openForm(existing) {
    const isEdit = !!existing;
    const f = (n, l, i, h, c) => M.field(n, l, i, h, c);
    const body = `<form novalidate><div class="form-error" hidden></div>
      <div class="form-grid">
        ${f('occurred_at', 'Date and time', `<input id="f_occurred_at" type="datetime-local" value="${M.toInputDT(existing && existing.logged_at)}">`)}
        ${f('amount', 'Amount paid', M.moneyInput('amount', existing && existing.amount, '0'))}
        ${f('liters', 'Liters purchased', `<input id="f_liters" type="text" inputmode="decimal" placeholder="e.g. 28.5" value="${existing && existing.liters != null ? existing.liters : ''}">`, 'From the pump display.')}
        ${f('ppl', 'Price per liter', '<input id="f_ppl" type="text" readonly tabindex="-1" placeholder="calculated">', 'Calculated automatically from amount ÷ liters.')}
        ${f('odometer_km', `Odometer (${M.unit()})`, `<input id="f_odometer_km" type="text" inputmode="decimal" placeholder="e.g. 38,420" value="${existing && existing.odometer_km != null ? Math.round(M.toDisp(existing.odometer_km) * 10) / 10 : ''}">`, 'Needed for economy and cost per distance.')}
        <div class="field"><span class="label">Options</span>
          <label class="check"><input id="f_is_full" type="checkbox" ${!existing || existing.is_full ? 'checked' : ''}> <span>Filled the tank completely</span></label>
          <label class="check"><input id="f_ac_used" type="checkbox" ${existing && existing.ac_used ? 'checked' : ''}> <span>A/C was used since the last fill-up</span></label></div>
      </div>
      ${f('notes', 'Notes (optional)', `<textarea id="f_notes" rows="2" maxlength="2000">${esc(existing ? existing.notes : '')}</textarea>`)}
      <div class="small muted">This also appears as a <strong>Fuel</strong> expense in your transactions, counted once.</div></form>`;
    const m = M.modal({ title: isEdit ? 'Edit fill-up' : 'Add fill-up', body, footer: `<button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="button" data-submit>${isEdit ? 'Save changes' : 'Save fill-up'}</button>` });
    M.wireMoney(m.el);
    const g = (id) => $('#f_' + id, m.el);
    const calc = () => { const a = Number(M.rawNum(g('amount').value)), l = Number(g('liters').value.replace(/,/g, '')); g('ppl').value = a > 0 && l > 0 ? `${num(Math.round(a / l))} ${M.boot.settings.currency_label}/L` : ''; };
    m.el.addEventListener('input', calc); calc();
    M.bindForm(m, async () => {
      const od = g('odometer_km').value.trim().replace(/,/g, '');
      if (od !== '' && isNaN(Number(od))) throw Object.assign(new Error('Odometer must be a number.'), { field: 'odometer_km' });
      const payload = { occurred_at: g('occurred_at').value, amount: M.rawNum(g('amount').value), liters: g('liters').value.trim(), odometer_km: od === '' ? '' : String(M.fromDisp(od)),
        is_full: g('is_full').checked, ac_used: g('ac_used').checked, notes: g('notes').value };
      isEdit ? await api('PUT', `/api/fuel/${existing.id}`, payload) : await api('POST', '/api/fuel', payload);
      M.toast(isEdit ? 'Fill-up updated.' : 'Fill-up added.');
      window.dispatchEvent(new CustomEvent('data:changed'));
    });
  }

  $('#addFuel').addEventListener('click', () => openForm());
  $('#fuelRows').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    const id = (ed || del) && (ed || del).dataset[ed ? 'edit' : 'del'];
    const log = id && data.logs.find((l) => String(l.id) === String(id));
    if (!log) return;
    if (ed) return openForm(log);
    const r = await M.confirmDialog({ title: 'Delete this fill-up?', message: `Fill-up of <strong>${esc(money(log.amount))}</strong> on ${esc(M.fmtDate(log.logged_at, true))} will be deleted, including its fuel expense. This can't be undone.` });
    if (!r) return;
    try { await api('DELETE', `/api/fuel/${log.id}`); M.toast('Fill-up deleted.'); load(); window.dispatchEvent(new CustomEvent('data:deleted')); } catch (er) { M.toast(er.message, 'error'); }
  });
  window.addEventListener('data:changed', load);
  window.addEventListener('theme:changed', () => data && render());
  $('#exportFuel').href = 'export/fuel.csv';
  load();
})();
