(function () {
  'use strict';
  const M = window.MT;
  const { $, $$, api, esc, money } = M;
  let rep = null, group = M.store.get('group', '');

  const rb = M.rangeBar($('#rangeBar'), load, { default: 'month' });
  const GN = { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' };

  function paintGroup() { $$('#groupSeg [data-g]').forEach((b) => b.classList.toggle('active', b.dataset.g === group)); }
  $('#groupSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (b) { group = b.dataset.g; M.store.set('group', group); paintGroup(); load(); } });
  paintGroup();

  async function load() {
    const q = rb.params() + (group ? '&group=' + group : '');
    try {
      rep = await api('GET', '/api/report?' + q);
      rb.setLabel(rep.range.label);
      $('#csvBtn').href = 'export/report.csv?' + q;
      $('#printBtn').href = 'print.html?' + q;
      render();
    } catch (e) { M.toast(e.message, 'error'); }
  }

  function render() {
    const t = rep.totals, p = M.palette(), S = rep.series, labels = S.map((x) => x.label), none = !S.some((x) => x.income || x.expenses);
    $('#repStats').innerHTML = [
      ['💰', 'Total income', money(t.income), `Delivery ${M.short(t.delivery)} · bonus/other ${M.short(t.bonus + t.other_income)}`],
      ['💸', 'Total expenses', money(t.expenses), `Fuel ${money(t.fuel)} (${t.fuel_pct}%)`],
      ['📈', 'Net profit', money(t.net), `Profit margin ${t.profit_margin}%`, t.net >= 0 ? 'pos' : 'neg'],
      ['🪙', 'Total tips', money(t.tips), t.income ? `${M.num(t.tips * 100 / t.income, 1)}% of income` : ''],
      ['⛽', 'Total fuel spending', money(t.fuel), `${t.fuel_pct}% of expenses`],
      ['📅', 'Avg daily net profit', money(t.avg_daily_net), `Over ${t.active_days} active day${t.active_days === 1 ? '' : 's'}`, t.avg_daily_net >= 0 ? 'pos' : 'neg'],
      ['🐷', 'Savings rate', `${t.savings_rate}%`, `${money(t.savings_net)} set aside ÷ income`],
      ['🏆', 'Most expensive category', rep.top_categories[0] ? `${rep.top_categories[0].icon} ${rep.top_categories[0].name}` : '—', rep.top_categories[0] ? `${money(rep.top_categories[0].total)} · ${rep.top_categories[0].pct}%` : 'No expenses'],
    ].map(([i, l, v, sub, cls]) => `<article class="card stat"><div class="top"><span class="ico">${i}</span>${l}</div><div class="value num ${cls || ''}" style="${String(v).length > 16 ? 'font-size:17px' : ''}">${esc(v)}</div><div class="sub">${esc(sub || '')}</div></article>`).join('');

    M.chart('chIE', { type: 'bar', data: { labels, datasets: [{ label: 'Income', data: S.map((x) => x.income), backgroundColor: p.green, borderRadius: 5, maxBarThickness: 26 }, { label: 'Expenses', data: S.map((x) => x.expenses), backgroundColor: p.red, borderRadius: 5, maxBarThickness: 26 }] }, options: { scales: { y: M.yAxisMoney, x: M.xAxis } } });
    M.chartEmpty('chIE', none);
    const mix = rep.income_mix.filter((x) => x.total > 0), mc = [p.blue, p.gold, p.purple, p.green];
    M.chart('chMix', { type: 'doughnut', data: { labels: mix.map((x) => x.label), datasets: [{ data: mix.map((x) => x.total), backgroundColor: mix.map((x) => mc[['delivery', 'tip', 'bonus', 'other'].indexOf(x.key)]), borderColor: p.card, borderWidth: 3 }] },
      options: { cutout: '62%', interaction: { mode: 'nearest' }, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10 } }, tooltip: { callbacks: { label: (c) => ` ${money(c.parsed)} (${mix[c.dataIndex].pct}%)` } } } } });
    M.chartEmpty('chMix', !mix.length, 'No income in this period.');
    M.chart('chTrend', { type: 'line', data: { labels, datasets: [{ label: 'Net profit', data: S.map((x) => x.net), borderColor: p.gold, backgroundColor: p.gold + '26', fill: true, tension: .3, pointRadius: S.length > 40 ? 0 : 3, borderWidth: 2 }] }, options: { scales: { y: Object.assign({}, M.yAxisMoney, { beginAtZero: false }), x: M.xAxis } } });
    M.chartEmpty('chTrend', none);
    const wd = rep.weekdays, best = Math.max(...wd.map((w) => w.avg_net));
    M.chart('chWeekday', { type: 'bar', data: { labels: wd.map((w) => w.name.slice(0, 3)), datasets: [{ label: 'Avg net', data: wd.map((w) => w.avg_net), backgroundColor: wd.map((w) => (w.days && w.avg_net === best && best > 0 ? p.gold : p.blue)), borderRadius: 5, maxBarThickness: 32 }] },
      options: { scales: { y: Object.assign({}, M.yAxisMoney, { beginAtZero: false }), x: M.xAxis }, plugins: { tooltip: { callbacks: { label: (c) => ` ${money(c.parsed.y)} avg · ${wd[c.dataIndex].days} day(s)` } } } } });
    M.chartEmpty('chWeekday', !wd.some((w) => w.days), 'No active days in this period.');

    const colors = M.CAT_COLORS();
    $('#catBars').innerHTML = rep.categories.length ? rep.categories.map((c, i) => `<div class="bar-row"><span>${esc(c.icon)} ${esc(c.name)}</span><div class="progress"><i style="width:${c.pct}%;background:${colors[i % colors.length]}"></i></div><span class="num"><strong>${esc(money(c.total))}</strong> <span class="muted xs">${c.pct}%</span></span></div>`).join('') : '<div class="empty small">No expenses in this period.</div>';
    $('#bestDays').innerHTML = rep.best_days.length ? rep.best_days.map((d) => `<tr><td>${esc(d.weekday.slice(0, 3))}, ${esc(M.fmtDate(d.date))}</td><td class="r num">${esc(M.num(d.income))}</td><td class="r num">${esc(M.num(d.expenses))}</td><td class="r num ${d.net >= 0 ? 'pos' : 'neg'}"><strong>${esc(M.num(d.net))}</strong></td></tr>`).join('') : '<tr><td colspan="4"><div class="empty small">No earning days in this period.</div></td></tr>';

    const pv = rep.previous;
    $('#prevLabel').textContent = pv ? pv.range.label : '';
    const rows = [['Income', 'income', true], ['Expenses', 'expenses', false], ['Net profit', 'net', true], ['Tips', 'tips', true], ['Fuel', 'fuel', false]];
    $('#compare').innerHTML = pv ? rows.map(([l, k, good]) => { const d = pv.deltas[k], up = d.change > 0, ok = d.change === 0 ? null : (good ? up : !up);
      return `<tr><td>${l}</td><td class="r num">${esc(money(t[k]))}</td><td class="r num muted">${esc(money(d.previous))}</td><td class="r num ${ok === null ? 'muted' : ok ? 'pos' : 'neg'}">${esc(money(d.change, { plus: true }))}${d.pct == null ? '' : ` (${d.pct > 0 ? '+' : ''}${d.pct}%)`}</td></tr>`; }).join('')
      : '<tr><td colspan="4"><div class="empty small">“All time” has no previous period to compare with.</div></td></tr>';

    $('#tableTitle').textContent = `${GN[rep.group]} breakdown`;
    $('#series').innerHTML = S.length ? S.map((x) => `<tr><td>${esc(x.label)}</td><td class="r num">${esc(M.num(x.income))}</td><td class="r num">${esc(M.num(x.tips))}</td><td class="r num">${esc(M.num(x.expenses))}</td><td class="r num">${esc(M.num(x.fuel))}</td><td class="r num ${x.net >= 0 ? 'pos' : 'neg'}">${esc(M.num(x.net))}</td></tr>`).join('') : '<tr><td colspan="6"><div class="empty small">No data.</div></td></tr>';
    $('#seriesFoot').innerHTML = `<tr><td>Total</td><td class="r num">${esc(M.num(t.income))}</td><td class="r num">${esc(M.num(t.tips))}</td><td class="r num">${esc(M.num(t.expenses))}</td><td class="r num">${esc(M.num(t.fuel))}</td><td class="r num ${t.net >= 0 ? 'pos' : 'neg'}">${esc(M.num(t.net))}</td></tr>`;
  }

  window.addEventListener('data:changed', load);
  window.addEventListener('theme:changed', () => rep && render());
  load();
})();
