/* Printable report (offline build): builds the same page as the Flask /report/print view from /api/report. */
(function () {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var n = function (v) { return Math.round(v).toLocaleString('en-US'); };
  var sg = function (v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v)).toLocaleString('en-US'); };
  var f1 = function (v) { return Number.isInteger(v) ? v.toFixed(1) : String(v); };
  var sf = function (v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + f1(Math.abs(v)); };
  var NAMES = { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' };

  async function run() {
    var q = location.search.replace(/^\?/, '');
    var rep = await window.__API__('GET', '/api/report' + (q ? '?' + q : ''));
    var cur = window.__BOOT__.settings.currency_label, t = rep.totals, g = NAMES[rep.group] || rep.group;
    var d = new Date(), gen = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    document.title = 'Report · ' + rep.range.label;
    var kpi = function (label, val, cls) { return '<div class="kpi"><small>' + label + '</small><b class="num ' + (cls || '') + '">' + val + '</b></div>'; };
    var h = '<div class="actions"><button id="printNow" type="button">🖨 Print / Save as PDF</button></div>';
    h += '<h1>Money &amp; Spending Report</h1><div class="sub">' + esc(rep.range.label) + ' · ' + g + ' grouping · generated ' + gen + '</div>';
    h += '<div class="kpis">' + kpi('Total income', n(t.income) + ' ' + esc(cur)) + kpi('Total expenses', n(t.expenses) + ' ' + esc(cur)) + kpi('Net profit', n(t.net) + ' ' + esc(cur), t.net >= 0 ? 'pos' : 'neg')
      + kpi('Tips (inside income)', n(t.tips) + ' ' + esc(cur)) + kpi('Fuel spending', n(t.fuel) + ' ' + esc(cur)) + kpi('Avg daily net profit', n(t.avg_daily_net) + ' ' + esc(cur))
      + kpi('Savings rate', f1(t.savings_rate) + '%') + kpi('Active days', t.active_days) + '</div>';
    h += '<h2>Income by type</h2><table><thead><tr><th>Type</th><th class="r">Amount</th><th class="r">Share</th></tr></thead><tbody>'
      + rep.income_mix.map(function (m) { return '<tr><td>' + esc(m.label) + '</td><td class="r num">' + n(m.total) + '</td><td class="r num">' + f1(m.pct) + '%</td></tr>'; }).join('') + '</tbody></table>';
    h += '<h2>Spending by category</h2>';
    h += rep.categories.length ? '<table><thead><tr><th>Category</th><th class="r">Amount</th><th class="r">Share</th><th style="width:30%"></th></tr></thead><tbody>'
      + rep.categories.map(function (c) { return '<tr><td>' + esc(c.icon) + ' ' + esc(c.name) + '</td><td class="r num">' + n(c.total) + '</td><td class="r num">' + f1(c.pct) + '%</td><td><div class="bar"><i style="width:' + Math.min(100, c.pct) + '%"></i></div></td></tr>'; }).join('') + '</tbody></table>'
      : '<p class="sub">No expenses in this period.</p>';
    if (rep.previous) {
      h += '<h2>Compared with the previous period (' + esc(rep.previous.range.label) + ')</h2><table><thead><tr><th></th><th class="r">This period</th><th class="r">Previous</th><th class="r">Change</th></tr></thead><tbody>';
      [['Income', 'income'], ['Expenses', 'expenses'], ['Net profit', 'net'], ['Tips', 'tips'], ['Fuel', 'fuel']].forEach(function (p) {
        var dl = rep.previous.deltas[p[1]];
        h += '<tr><td>' + p[0] + '</td><td class="r num">' + n(t[p[1]]) + '</td><td class="r num">' + n(dl.previous) + '</td><td class="r num">' + sg(dl.change) + (dl.pct != null ? ' (' + sf(dl.pct) + '%)' : '') + '</td></tr>';
      });
      h += '</tbody></table>';
    }
    h += '<h2>' + g + ' breakdown</h2><table><thead><tr><th>Period</th><th class="r">Income</th><th class="r">Tips</th><th class="r">Expenses</th><th class="r">Fuel</th><th class="r">Net profit</th></tr></thead><tbody>'
      + rep.series.map(function (s) { return '<tr><td>' + esc(s.label) + '</td><td class="r num">' + n(s.income) + '</td><td class="r num">' + n(s.tips) + '</td><td class="r num">' + n(s.expenses) + '</td><td class="r num">' + n(s.fuel) + '</td><td class="r num ' + (s.net >= 0 ? 'pos' : 'neg') + '">' + n(s.net) + '</td></tr>'; }).join('')
      + '</tbody><tfoot><tr><td>Total</td><td class="r num">' + n(t.income) + '</td><td class="r num">' + n(t.tips) + '</td><td class="r num">' + n(t.expenses) + '</td><td class="r num">' + n(t.fuel) + '</td><td class="r num">' + n(t.net) + '</td></tr></tfoot></table>';
    if (rep.best_days.length) {
      h += '<h2>Best days</h2><table><thead><tr><th>Date</th><th class="r">Income</th><th class="r">Expenses</th><th class="r">Net</th></tr></thead><tbody>'
        + rep.best_days.map(function (x) { return '<tr><td>' + esc(x.weekday) + ', ' + esc(x.date) + '</td><td class="r num">' + n(x.income) + '</td><td class="r num">' + n(x.expenses) + '</td><td class="r num">' + n(x.net) + '</td></tr>'; }).join('') + '</tbody></table>';
    }
    h += '<footer>Net profit = total income − total expenses. Tips are part of income and are not added twice. Transfers and money set aside for savings are not income or expenses. All amounts in ' + esc(cur) + '.</footer>';
    document.getElementById('report').innerHTML = h;
    document.getElementById('printNow').addEventListener('click', function () { window.print(); });
  }
  run().catch(function (e) { document.getElementById('report').innerHTML = '<p>' + esc(e.message) + '</p>'; });
})();
