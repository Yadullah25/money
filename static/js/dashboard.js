(function () {
  'use strict';
  const M = window.MT;
  const { $, $$, api, money, esc } = M;
  let last = null, lastCharts = null, recentItems = [];

  const rb = M.rangeBar($('#rangeBar'), load, { default: 'month' });

  function setStat(key, value, sub, cls) {
    const card = $(`[data-stat="${key}"]`);
    const v = $('.value', card);
    v.classList.remove('skeleton');
    v.className = 'value num' + (cls ? ' ' + cls : '');
    v.textContent = value;
    $('.sub', card).innerHTML = sub || '';
  }
  function deltaHTML(d, goodWhenUp) {
    if (!d || d.pct == null) return '';
    const up = d.change > 0, good = goodWhenUp ? up : !up;
    if (d.change === 0) return '<span class="muted">same as previous period</span>';
    return `<span class="delta ${good ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(d.pct)}%</span> <span>vs previous</span>`;
  }

  async function load() {
    const params = rb.params();
    try {
      const [s, c, rep] = await Promise.all([api('GET', '/api/summary?' + params), api('GET', '/api/charts?' + params), api('GET', '/api/report?' + params)]);
      last = s; lastCharts = c;
      rb.setLabel(s.range.label);
      render(s, rep);
      renderCharts(c);
    } catch (e) { M.toast(e.message, 'error'); }
  }

  function render(s, rep) {
    const t = s.totals, b = s.balance, d = rep.previous && rep.previous.deltas;
    $('#welcome').hidden = s.has_data;
    setStat('income', money(t.income), `Delivery ${M.short(t.delivery)} · Tips ${M.short(t.tips)}` + (d ? '<br>' + deltaHTML(d.income, true) : ''));
    setStat('expenses', money(t.expenses), `${t.fuel_pct}% is fuel` + (d ? '<br>' + deltaHTML(d.expenses, false) : ''));
    setStat('tips', money(t.tips), t.income ? `${M.num(t.tips * 100 / t.income, 1)}% of your income` : 'Included in total income');
    setStat('fuel', money(t.fuel), t.expenses ? `${t.fuel_pct}% of all expenses` : 'No spending yet');
    setStat('net', money(t.net), `Income − expenses · margin ${t.profit_margin}%` + (d ? '<br>' + deltaHTML(d.net, true) : ''), t.net > 0 ? 'pos' : t.net < 0 ? 'neg' : '');
    setStat('balance', money(b.available), `Start ${M.short(b.starting)} + income − expenses ± transfers − saved`, b.available < 0 ? 'neg' : '');
    setStat('avg', money(t.avg_daily_spending), t.active_days ? `Over ${t.active_days} active day${t.active_days === 1 ? '' : 's'}` : 'No active days');
    setStat('savings', money(b.in_savings), `${t.savings_net >= 0 ? '+' : '−'}${M.short(Math.abs(t.savings_net))} this period · savings rate ${t.savings_rate}%`);

    $('#alerts').innerHTML = s.alerts.map((a) => `<div class="banner ${a.status === 'over' ? 'bad' : 'warn'}"><span>${esc(a.icon)}</span><div><strong>${esc(a.name)} ${esc(a.period)} budget ${a.status === 'over' ? 'exceeded' : 'at ' + a.pct + '%'}</strong><div class="small muted">Spent ${esc(money(a.spent))} of ${esc(money(a.limit_amount))}${a.status === 'over' ? ` · over by ${esc(money(-a.remaining))}` : ` · ${esc(money(a.remaining))} left`}. <a class="gold" href="budgets.html">Manage budgets</a></div></div></div>`).join('');

    recentItems = s.recent;
    $('#recent').innerHTML = s.recent.length ? s.recent.map((t) => M.txRow(t)).join('') : '<div class="empty"><strong>No transactions yet</strong>Use “Quick add” to record your first one.</div>';
  }

  function renderCharts(c) {
    const p = M.palette(), S = c.series, labels = S.map((x) => x.label);
    const none = !S.some((x) => x.income || x.expenses);
    M.chart('chIncExp', { type: 'bar', data: { labels, datasets: [
      { label: 'Income', data: S.map((x) => x.income), backgroundColor: p.green, borderRadius: 5, maxBarThickness: 22 },
      { label: 'Expenses', data: S.map((x) => x.expenses), backgroundColor: p.red, borderRadius: 5, maxBarThickness: 22 }] },
      options: { scales: { y: M.yAxisMoney, x: M.xAxis } } });
    M.chartEmpty('chIncExp', none, 'Add income or expenses to see this chart.');

    const cats = c.categories, colors = M.CAT_COLORS();
    M.chart('chCats', { type: 'doughnut', data: { labels: cats.map((x) => `${x.icon} ${x.name}`), datasets: [{ data: cats.map((x) => x.total), backgroundColor: cats.map((_, i) => colors[i % colors.length]), borderColor: p.card, borderWidth: 3 }] },
      options: { cutout: '62%', interaction: { mode: 'nearest' }, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, padding: 10, font: { size: 11 } } },
        tooltip: { callbacks: { label: (x) => ` ${money(x.parsed)} (${(x.parsed * 100 / (cats.reduce((a, b) => a + b.total, 0) || 1)).toFixed(1)}%)` } } } } });
    M.chartEmpty('chCats', !cats.length, 'No expenses in this period.');

    M.chart('chNet', { type: 'bar', data: { labels, datasets: [{ label: 'Net profit', data: S.map((x) => x.net), backgroundColor: S.map((x) => (x.net >= 0 ? p.green : p.red)), borderRadius: 4, maxBarThickness: 20 }] },
      options: { scales: { y: Object.assign({}, M.yAxisMoney, { beginAtZero: false }), x: M.xAxis } } });
    M.chartEmpty('chNet', none, 'No activity in this period.');

    M.chart('chFuel', { type: 'line', data: { labels, datasets: [{ label: 'Fuel', data: S.map((x) => x.fuel), borderColor: p.orange, backgroundColor: p.orange + '33', fill: true, tension: .3, pointRadius: S.length > 40 ? 0 : 3, borderWidth: 2 }] },
      options: { scales: { y: M.yAxisMoney, x: M.xAxis } } });
    M.chartEmpty('chFuel', !S.some((x) => x.fuel), 'No fuel purchases in this period.');

    M.chart('chTips', { type: 'line', data: { labels, datasets: [{ label: 'Tips', data: S.map((x) => x.tips), borderColor: p.gold, backgroundColor: p.gold + '33', fill: true, tension: .3, pointRadius: S.length > 40 ? 0 : 3, borderWidth: 2 }] },
      options: { scales: { y: M.yAxisMoney, x: M.xAxis } } });
    M.chartEmpty('chTips', !S.some((x) => x.tips), 'No tips recorded in this period.');
  }

  M.bindTxActions($('#recent'), () => recentItems, load);
  window.addEventListener('data:changed', load);
  window.addEventListener('theme:changed', () => lastCharts && renderCharts(lastCharts));
  const demoBtn = $('#loadDemo');
  if (demoBtn) demoBtn.addEventListener('click', async () => {
    demoBtn.disabled = true;
    try { await api('POST', '/api/demo/load'); M.toast('Sample data loaded. Remove it any time in Settings.'); await load(); }
    catch (e) { M.toast(e.message, 'error'); demoBtn.disabled = false; }
  });
  load();
})();
