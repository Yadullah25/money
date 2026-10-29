(function () {
  'use strict';
  const M = window.MT;
  const { $, api, esc, money } = M;
  let items = [], page = 1, timer = null;

  const cat = $('#category');
  cat.innerHTML += M.boot.categories.map((c) => `<option value="${c.id}">${esc(c.icon)} ${esc(c.name)}${c.is_archived ? ' (deleted)' : ''}</option>`).join('');

  // allow deep links such as /transactions?kind=income
  const url = new URLSearchParams(location.search);
  ['q', 'kind', 'start', 'end', 'sort'].forEach((k) => { if (url.get(k) && $('#' + k)) $('#' + k).value = url.get(k); });
  if (url.get('category_id')) cat.value = url.get('category_id');

  function params(extra) {
    const o = { q: $('#q').value.trim(), start: $('#start').value, end: $('#end').value, sort: $('#sort').value, category_id: cat.value };
    const k = $('#kind').value;
    if (k === 'tip') o.income_type = 'tip'; else o.kind = k;
    return M.qs(Object.assign(o, extra || {}));
  }

  async function load() {
    $('#exportBtn').href = 'export/transactions.csv?' + params();
    try {
      const r = await api('GET', '/api/transactions?' + params({ page, per_page: 25 }));
      items = r.items; page = r.page;
      $('#resultInfo').textContent = `${r.total} entr${r.total === 1 ? 'y' : 'ies'} found`;
      $('#sums').innerHTML = r.total ? `<div class="metric"><div class="k">Income in results</div><div class="v pos num">${esc(money(r.sums.income))}</div></div><div class="metric"><div class="k">Expenses in results</div><div class="v neg num">${esc(money(r.sums.expenses))}</div></div><div class="metric"><div class="k">Net (income − expenses)</div><div class="v num">${esc(money(r.sums.income - r.sums.expenses))}</div></div>` : '';
      $('#list').innerHTML = r.items.length ? r.items.map((t) => M.txRow(t)).join('') :
        `<div class="empty"><strong>Nothing found</strong>${$('#q').value || $('#kind').value || cat.value || $('#start').value || $('#end').value ? 'Try clearing the filters.' : 'Add your first transaction with the + button.'}</div>`;
      $('#pager').innerHTML = r.pages > 1 ? `<button class="btn btn-sm" id="prev" ${page <= 1 ? 'disabled' : ''}>← Previous</button><span class="small muted">Page ${page} of ${r.pages}</span><button class="btn btn-sm" id="next" ${page >= r.pages ? 'disabled' : ''}>Next →</button>` : '';
    } catch (e) { $('#list').innerHTML = `<div class="empty"><strong>Couldn't load</strong>${esc(e.message)}</div>`; $('#pager').innerHTML = ''; }
  }
  const reset = () => { page = 1; load(); };
  $('#filters').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(reset, e.target.id === 'q' ? 250 : 0); });
  $('#filters').addEventListener('submit', (e) => e.preventDefault());
  $('#clear').addEventListener('click', () => { $('#filters').reset(); $('#sort').value = 'newest'; reset(); });
  $('#pager').addEventListener('click', (e) => { if (e.target.id === 'prev') { page--; load(); } if (e.target.id === 'next') { page++; load(); } });
  M.bindTxActions($('#list'), () => items, load);
  window.addEventListener('data:changed', load);
  load();
})();
