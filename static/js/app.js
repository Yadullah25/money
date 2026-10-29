/* Money Tracker - shared front-end code (no framework). Every number shown comes from the server API. */
(function () {
  'use strict';

  const bootEl = document.getElementById('boot');
  const boot = window.__BOOT__ || (bootEl ? JSON.parse(bootEl.textContent) : { settings: {}, categories: [], goals: [], shifts: [] });
  const csrf = document.body.dataset.csrf;

  // ------------------------------------------------------------ helpers --
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const nowLocal = () => { const d = new Date(); return `${todayStr()}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const toInputDT = (s) => (s ? s.replace(' ', 'T').slice(0, 16) : nowLocal());
  const unit = () => boot.settings.distance_unit || 'km';
  const KM_PER_MILE = 1.609344;
  const toDisp = (km) => (km == null ? null : unit() === 'mi' ? km / KM_PER_MILE : km);
  const fromDisp = (v) => (v == null || v === '' ? v : unit() === 'mi' ? Number(v) * KM_PER_MILE : Number(v));

  const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const curLabel = () => boot.settings.currency_label || 'IQD';
  function money(n, opts) {
    if (n == null || isNaN(n)) return '—';
    const sign = n < 0 ? '−' : (opts && opts.plus && n > 0 ? '+' : '');
    const body = nf.format(Math.abs(Math.round(n)));
    const c = curLabel();
    return `${sign}${body} ${c}`;
  }
  const moneyHTML = (n, opts) => `<span class="num">${esc(money(n, opts))}</span>`;
  const num = (n, d) => (n == null ? '—' : (d === 2 ? nf2 : d === 1 ? nf1 : nf).format(n));
  function short(n) {
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return String(Math.round(n));
  }
  function fmtDate(s, withTime) {
    if (!s) return '';
    const [d, t] = s.split(/[ T]/);
    const [y, m, day] = d.split('-').map(Number);
    const dt = new Date(y, m - 1, day);
    let out = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: y === new Date().getFullYear() ? undefined : 'numeric' });
    if (withTime && t) out += ' · ' + t.slice(0, 5);
    return out;
  }
  const weekday = (s) => new Date(s + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' });
  const store = {
    get(k, d) { try { const v = localStorage.getItem('mt.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('mt.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable: fine */ } },
  };

  // --------------------------------------------------------------- API --
  async function api(method, url, data, isForm) {
    if (window.__API__) return window.__API__(method, url, data, isForm);   // offline build: the data engine runs inside the page
    const opts = { method, headers: { 'X-CSRF-Token': csrf, Accept: 'application/json' } };
    if (data !== undefined) {
      if (isForm) opts.body = data;
      else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(data); }
    }
    let res;
    try { res = await fetch(url, opts); }
    catch (e) { throw Object.assign(new Error('Could not reach the app. Is the server still running?'), { network: true }); }
    let json = null;
    try { json = await res.json(); } catch (e) { /* not json */ }
    if (res.status === 401) { location.href = '/login'; throw new Error('Please sign in again.'); }
    if (!res.ok) throw Object.assign(new Error((json && json.error) || `Something went wrong (${res.status}).`), { field: json && json.field, status: res.status });
    return json;
  }
  const qs = (o) => Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

  // --------------------------------------------------- toasts & modals --
  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind === 'error' ? ' error' : '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, kind === 'error' ? 6000 : 3200);
  }

  function modal({ title, body, footer, size, onClose }) {
    const root = $('#modalRoot');
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${size || ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" type="button" data-close aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="modal-body"></div><div class="modal-foot"></div></div>`;
    const bodyEl = $('.modal-body', back), footEl = $('.modal-foot', back);
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
    if (footer === false) footEl.remove(); else if (typeof footer === 'string') footEl.innerHTML = footer;
    const prevFocus = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function close(result) {
      document.removeEventListener('keydown', onKey);
      back.remove();
      document.body.style.overflow = prevOverflow;
      if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) { /* ignore */ }
      if (onClose) onClose(result);
    }
    function onKey(e) { if (e.key === 'Escape') { const all = $$('.modal-back'); if (all[all.length - 1] === back) close(); } }
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    $$('[data-close]', back).forEach((b) => b.addEventListener('click', () => close()));
    document.addEventListener('keydown', onKey);
    root.appendChild(back);
    const first = $('input:not([type=hidden]), select, textarea', bodyEl);
    if (first && window.innerWidth > 700) first.focus();
    return { el: back, body: bodyEl, foot: footEl, close };
  }

  function confirmDialog({ title, message, confirmLabel, danger, extra }) {
    return new Promise((resolve) => {
      let answer = false;
      const m = modal({
        title, size: 'small',
        body: `<p>${message}</p>${extra || ''}`,
        footer: `<button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn ${danger === false ? 'btn-primary' : 'btn-danger solid'}" type="button" data-ok>${esc(confirmLabel || 'Delete')}</button>`,
        onClose: () => resolve(answer),
      });
      $('[data-ok]', m.el).addEventListener('click', () => {
        const extras = {};
        $$('input[type=checkbox], input[type=radio]:checked', m.body).forEach((i) => { extras[i.name] = i.type === 'checkbox' ? i.checked : i.value; });
        answer = { ok: true, extras };
        m.close();
      });
      $('[data-ok]', m.el).focus();
    });
  }

  // generic "save with error display" for modal forms
  function bindForm(m, submitFn, opts) {
    const form = $('form', m.el) || m.el;
    const btn = $('[data-submit]', m.el);
    const errBox = $('.form-error', m.el);
    async function go(e) {
      if (e) e.preventDefault();
      $$('.field.invalid', m.el).forEach((f) => { f.classList.remove('invalid'); const er = $('.err', f); if (er) er.textContent = ''; });
      if (errBox) errBox.hidden = true;
      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = 'Saving…';
      try {
        const out = await submitFn();
        m.close('saved');
        return out;
      } catch (err) {
        btn.disabled = false; btn.textContent = label;
        const f = err.field && $(`[data-field="${err.field}"]`, m.el);
        if (f) { f.classList.add('invalid'); const er = $('.err', f); if (er) er.textContent = err.message; const inp = $('input,select,textarea', f); if (inp) inp.focus(); }
        else if (errBox) { errBox.textContent = err.message; errBox.hidden = false; }
        else toast(err.message, 'error');
      }
    }
    form.addEventListener('submit', go);
    btn.addEventListener('click', go);
  }

  const field = (name, label, inner, hint, cls) =>
    `<div class="field ${cls || ''}" data-field="${name}"><label for="f_${name}">${label}</label>${inner}${hint ? `<span class="hint">${hint}</span>` : ''}<span class="err" role="alert"></span></div>`;
  const moneyInput = (name, value, placeholder) =>
    `<div class="amount-wrap"><input id="f_${name}" name="${name}" type="text" inputmode="numeric" autocomplete="off" placeholder="${placeholder || '0'}" value="${value == null ? '' : esc(nf.format(value))}"><span>${esc(curLabel())}</span></div>`;
  function wireMoney(root) {
    $$('input[inputmode=numeric]', root).forEach((inp) => {
      inp.addEventListener('input', () => {
        const digits = inp.value.replace(/[^\d٠-٩]/g, '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
        const pos = inp.selectionStart, before = inp.value.length;
        inp.value = digits ? nf.format(Number(digits)) : '';
        const np = Math.max(0, pos + inp.value.length - before);
        try { inp.setSelectionRange(np, np); } catch (e) { /* ignore */ }
      });
    });
  }
  const rawNum = (v) => String(v == null ? '' : v).replace(/[,\s]/g, '');

  // ----------------------------------------------- transaction form -----
  const EXPENSE_HINT = { fuel: 'For odometer and litres, use the Fuel page instead.' };

  async function openTransactionForm(existing, defaults) {
    try { const fresh = await api('GET', '/api/bootstrap'); Object.assign(boot, fresh); } catch (e) { /* fall back to cached lists */ }
    defaults = defaults || {};
    const isEdit = !!(existing && existing.id);
    const st = {
      kind: (existing && existing.kind) || defaults.kind || 'expense',
      income_type: (existing && existing.income_type) || defaults.income_type || 'delivery',
      category_id: (existing && existing.category_id) || defaults.category_id || null,
      direction: (existing && existing.direction) || (defaults.direction || (existing && existing.kind === 'savings' ? 'in' : 'out')),
    };
    const m = modal({ title: isEdit ? 'Edit transaction' : 'Add transaction', size: '', body: '<form novalidate></form>', footer: `<button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="button" data-submit>${isEdit ? 'Save changes' : 'Save'}</button>` });
    const form = $('form', m.el);

    function render() {
      const cats = boot.categories.filter((c) => !c.is_archived || c.id === st.category_id);
      let html = `<div class="type-tabs" role="tablist">${['income', 'expense', 'transfer', 'savings'].map((k) =>
        `<button type="button" data-kind="${k}" class="${st.kind === k ? 'active' : ''}" role="tab" aria-selected="${st.kind === k}">${{ income: 'Income', expense: 'Expense', transfer: 'Transfer', savings: 'Savings' }[k]}</button>`).join('')}</div>`;
      html += '<div class="form-error" hidden></div>';
      html += field('amount', 'Amount', moneyInput('amount', existing && existing.amount, '0'));
      if (st.kind === 'income') {
        const types = [['delivery', 'Delivery earnings'], ['tip', 'Tip'], ['bonus', 'Bonus'], ['other', 'Other income']];
        html += `<div class="field" data-field="income_type"><span class="label">Income type</span><div class="pills">${types.map(([k, l]) => `<button type="button" data-itype="${k}" class="${st.income_type === k ? 'active' : ''}">${l}</button>`).join('')}</div><span class="hint">Tips are part of total income - they are tracked separately but never counted twice.</span><span class="err"></span></div>`;
      } else if (st.kind === 'expense') {
        html += `<div class="field" data-field="category_id"><span class="label">Category</span><div class="cat-grid">${cats.map((c) => `<button type="button" data-cat="${c.id}" class="${st.category_id === c.id ? 'active' : ''}"><span class="ic">${esc(c.icon)}</span>${esc(c.name)}</button>`).join('')}<button type="button" data-newcat><span class="ic">＋</span>New category</button></div><span class="hint" id="catHint"></span><span class="err"></span></div>`;
      } else if (st.kind === 'transfer') {
        html += `<div class="field" data-field="direction"><span class="label">Direction</span><div class="pills"><button type="button" data-dir="out" class="${st.direction === 'out' ? 'active' : ''}">Money out (sent / withdrawn)</button><button type="button" data-dir="in" class="${st.direction === 'in' ? 'active' : ''}">Money in (received)</button></div><span class="hint">Transfers move money in or out of your balance. They are not income or spending, so they don't change profit.</span><span class="err"></span></div>`;
      } else {
        const goals = boot.goals;
        if (!goals.length) html += `<div class="banner info">You don't have a savings goal yet. <a href="goals.html" class="gold"><strong>Create one first →</strong></a></div>`;
        html += field('goal_id', 'Savings goal', `<select id="f_goal_id" name="goal_id"><option value="">Choose a goal…</option>${goals.map((g) => `<option value="${g.id}" ${(existing && existing.goal_id === g.id) || defaults.goal_id === g.id ? 'selected' : ''}>${esc(g.name)} (${esc(money(g.saved))} saved)</option>`).join('')}</select>`);
        html += `<div class="field" data-field="direction"><span class="label">Action</span><div class="pills"><button type="button" data-dir="in" class="${st.direction === 'in' ? 'active' : ''}">Set money aside</button><button type="button" data-dir="out" class="${st.direction === 'out' ? 'active' : ''}">Take money back</button></div><span class="hint">Saving is not spending: it leaves your balance but doesn't count as an expense.</span><span class="err"></span></div>`;
      }
      html += '<div class="form-grid">';
      html += field('occurred_at', 'Date and time', `<input id="f_occurred_at" name="occurred_at" type="datetime-local" value="${toInputDT(existing && existing.occurred_at)}">`);
      html += field('description', 'Description (optional)', `<input id="f_description" name="description" type="text" maxlength="200" placeholder="e.g. Lunch at the restaurant" value="${esc(existing ? existing.description : '')}">`);
      html += '</div>';
      if (st.kind === 'income' || st.kind === 'expense') {
        const sel = (existing && existing.shift_id) || defaults.shift_id || '';
        html += field('shift_id', 'Linked shift (optional)', `<select id="f_shift_id" name="shift_id"><option value="">Not linked to a shift</option>${boot.shifts.map((s) => `<option value="${s.id}" ${String(sel) === String(s.id) ? 'selected' : ''}>${esc(fmtDate(s.shift_date))} · ${esc(s.start_time)}–${esc(s.end_time)}</option>`).join('')}</select>`, 'Linking only groups this entry under a shift. It is still counted once.');
      }
      html += field('notes', 'Notes (optional)', `<textarea id="f_notes" name="notes" maxlength="2000" rows="2">${esc(existing ? existing.notes : '')}</textarea>`);
      const keep = form.querySelector('[name=amount]') ? { amount: form.querySelector('[name=amount]').value, occurred_at: $('#f_occurred_at', form) && $('#f_occurred_at', form).value, description: $('#f_description', form) && $('#f_description', form).value, notes: $('#f_notes', form) && $('#f_notes', form).value } : null;
      form.innerHTML = html;
      if (keep) { $('#f_amount', form).value = keep.amount; $('#f_occurred_at', form).value = keep.occurred_at; $('#f_description', form).value = keep.description; $('#f_notes', form).value = keep.notes; }
      wireMoney(form);
      if (!isEdit && !keep && defaults.amount) $('#f_amount', form).value = nf.format(defaults.amount);
    }
    render();

    form.addEventListener('click', async (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.kind) { st.kind = t.dataset.kind; if (st.kind === 'savings' && !['in', 'out'].includes(st.direction)) st.direction = 'in'; if (st.kind === 'savings') st.direction = 'in'; render(); }
      else if (t.dataset.itype) { st.income_type = t.dataset.itype; $$('[data-itype]', form).forEach((b) => b.classList.toggle('active', b === t)); }
      else if (t.dataset.cat) { st.category_id = Number(t.dataset.cat); $$('[data-cat]', form).forEach((b) => b.classList.toggle('active', b === t)); const c = boot.categories.find((x) => x.id === st.category_id); $('#catHint', form).textContent = (c && EXPENSE_HINT[c.slug]) || ''; }
      else if (t.dataset.dir) { st.direction = t.dataset.dir; $$('[data-dir]', form).forEach((b) => b.classList.toggle('active', b === t)); }
      else if (t.hasAttribute('data-newcat')) { const c = await openCategoryForm(); if (c) { st.category_id = c.id; render(); } }
    });

    bindForm(m, async () => {
      const payload = {
        kind: st.kind, amount: rawNum($('#f_amount', form).value), occurred_at: $('#f_occurred_at', form).value,
        description: $('#f_description', form).value, notes: $('#f_notes', form).value,
      };
      if (st.kind === 'income') payload.income_type = st.income_type;
      if (st.kind === 'expense') payload.category_id = st.category_id;
      if (st.kind === 'transfer' || st.kind === 'savings') payload.direction = st.direction;
      if (st.kind === 'savings') payload.goal_id = $('#f_goal_id', form).value;
      if (st.kind === 'income' || st.kind === 'expense') payload.shift_id = $('#f_shift_id', form).value;
      const saved = isEdit ? await api('PUT', `/api/transactions/${existing.id}`, payload) : await api('POST', '/api/transactions', payload);
      toast(isEdit ? 'Changes saved.' : 'Transaction added.');
      window.dispatchEvent(new CustomEvent('data:changed', { detail: { transaction: saved } }));
      return saved;
    });
    return m;
  }

  function openCategoryForm(existing) {
    return new Promise((resolve) => {
      const icons = ['🧽', '🚿', '🧴', '🎁', '🍔', '☕', '💊', '📚', '🔧', '🚌', '🧾', '🎮', '👕', '🛒', '🐾', '💡'];
      let result = null;
      const m = modal({
        title: existing ? 'Edit category' : 'New category', size: 'small',
        body: `<form novalidate><div class="form-error" hidden></div>${field('name', 'Name', `<input id="f_name" name="name" type="text" maxlength="40" value="${esc(existing ? existing.name : '')}" placeholder="e.g. Car wash">`)}
          ${field('icon', 'Icon', `<input id="f_icon" name="icon" type="text" maxlength="4" value="${esc(existing ? existing.icon : '🧽')}"><div class="pills" style="margin-top:6px">${icons.map((i) => `<button type="button" data-ic="${i}">${i}</button>`).join('')}</div>`, 'Pick one or paste any emoji.')}</form>`,
        footer: '<button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="button" data-submit>Save</button>',
        onClose: () => resolve(result),
      });
      $$('[data-ic]', m.el).forEach((b) => b.addEventListener('click', () => { $('#f_icon', m.el).value = b.dataset.ic; }));
      bindForm(m, async () => {
        const payload = { name: $('#f_name', m.el).value, icon: $('#f_icon', m.el).value };
        result = existing ? await api('PUT', `/api/categories/${existing.id}`, payload) : await api('POST', '/api/categories', payload);
        const fresh = await api('GET', '/api/bootstrap'); Object.assign(boot, fresh);
        toast('Category saved.');
        window.dispatchEvent(new CustomEvent('data:changed'));
        return result;
      });
    });
  }

  async function deleteTransaction(tx) {
    const r = await confirmDialog({ title: 'Delete this entry?', message: `This will permanently delete <strong>${esc(tx.description || tx.label)}</strong> (${esc(money(tx.amount))}) from ${esc(fmtDate(tx.occurred_at, true))}. This can't be undone.`, confirmLabel: 'Delete' });
    if (!r) return false;
    try { await api('DELETE', `/api/transactions/${tx.id}`); toast('Entry deleted.'); window.dispatchEvent(new CustomEvent('data:changed')); return true; }
    catch (e) { toast(e.message, 'error'); return false; }
  }

  // --------------------------------------------- shared renderers -------
  const KIND_ICON = { income: '💰', tip: '🪙', expense: '💸', transfer: '🔁', savings: '🐷' };
  function txVisual(t) {
    if (t.kind === 'income') return t.income_type === 'tip' ? { cls: 'tip', ico: KIND_ICON.tip, chip: 'tip', chipText: 'Tip' } : { cls: 'income', ico: KIND_ICON.income, chip: 'income', chipText: 'Income' };
    if (t.kind === 'expense') return { cls: 'expense', ico: t.category_icon || KIND_ICON.expense, chip: 'expense', chipText: 'Expense' };
    if (t.kind === 'transfer') return { cls: 'transfer', ico: KIND_ICON.transfer, chip: 'transfer', chipText: 'Transfer' };
    return { cls: 'savings', ico: KIND_ICON.savings, chip: 'savings', chipText: 'Savings' };
  }
  function txRow(t, opts) {
    opts = opts || {};
    const v = txVisual(t);
    const eff = t.balance_effect;
    const amtCls = t.kind === 'income' ? 'pos' : t.kind === 'expense' ? 'neg' : '';
    const sign = t.kind === 'income' || (t.kind === 'transfer' && t.direction === 'in') || (t.kind === 'savings' && t.direction === 'out') ? '+' : '−';
    const title = t.description || t.label;
    const detail = t.kind === 'savings' && t.goal_name ? t.goal_name : (t.kind === 'income' ? t.label : (t.kind === 'expense' ? t.category_name : t.label));
    return `<div class="tx" data-id="${t.id}">
      <div class="tx-ico ${v.cls}" aria-hidden="true">${esc(v.ico)}</div>
      <div class="tx-main"><div class="tx-title">${esc(title)}</div>
        <div class="tx-sub"><span class="chip ${v.chip}">${v.chipText}</span><span>${esc(detail !== title ? detail : '')}</span><span>${esc(fmtDate(t.occurred_at, true))}</span>${t.shift_id ? '<span class="chip">Shift</span>' : ''}${t.is_demo ? '<span class="chip demo">demo</span>' : ''}</div></div>
      <div class="tx-amt ${amtCls} num">${sign}${esc(nf.format(t.amount))} <span class="xs muted">${esc(curLabel())}</span></div>
      ${opts.actions === false ? '' : `<div class="tx-actions"><button class="icon-btn" data-edit="${t.id}" aria-label="Edit"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg></button><button class="icon-btn danger" data-del="${t.id}" aria-label="Delete"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button></div>`}
    </div>`;
  }
  function bindTxActions(root, items, reload) {
    root.addEventListener('click', async (e) => {
      const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
      if (!ed && !del) return;
      const tx = items().find((x) => String(x.id) === String((ed || del).dataset.edit || (ed || del).dataset.del));
      if (!tx) return;
      if (ed) {
        if (tx.is_fuel_log) { toast('Fuel fill-ups are edited on the Fuel page.', 'error'); location.href = 'fuel.html'; return; }
        openTransactionForm(tx);
      } else if (await deleteTransaction(tx)) reload && reload();
    });
  }

  // ------------------------------------------------ date range bar ------
  const PRESETS = [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year'], ['all', 'All time'], ['custom', 'Custom']];
  function rangeBar(el, onChange, opts) {
    opts = opts || {};
    const saved = store.get('range', { range: opts.default || 'month' });
    const state = { range: saved.range || 'month', start: saved.start || '', end: saved.end || '' };
    if (opts.presets && !opts.presets.includes(state.range)) state.range = opts.default || 'month';
    const presets = PRESETS.filter(([k]) => !opts.presets || opts.presets.includes(k));
    el.classList.add('range-bar');
    el.innerHTML = `<div class="seg" role="group" aria-label="Date range">${presets.map(([k, l]) => `<button type="button" data-r="${k}">${l}</button>`).join('')}</div>
      <div class="range-custom" hidden><input type="date" aria-label="Start date" data-s><span class="muted">to</span><input type="date" aria-label="End date" data-e><button class="btn btn-sm btn-primary" type="button" data-apply>Apply</button></div>
      <span class="range-label" data-label></span>`;
    const custom = $('.range-custom', el);
    function paint() {
      $$('[data-r]', el).forEach((b) => b.classList.toggle('active', b.dataset.r === state.range));
      custom.hidden = state.range !== 'custom';
      $('[data-s]', el).value = state.start; $('[data-e]', el).value = state.end;
    }
    function fire() { store.set('range', state); onChange(Object.assign({}, state)); }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (b) {
        state.range = b.dataset.r;
        if (state.range === 'custom' && !state.start) { const d = new Date(); d.setDate(d.getDate() - 6); state.start = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; state.end = todayStr(); }
        paint(); if (state.range !== 'custom') fire(); else fire();
      }
      if (e.target.closest('[data-apply]')) { state.start = $('[data-s]', el).value; state.end = $('[data-e]', el).value; fire(); }
    });
    paint();
    return { state, setLabel: (t) => { $('[data-label]', el).textContent = t || ''; }, params: () => qs({ range: state.range, start: state.range === 'custom' ? state.start : '', end: state.range === 'custom' ? state.end : '' }), fire, repaint: paint };
  }

  // -------------------------------------------------------- charts ------
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const palette = () => ({ gold: css('--gold'), green: css('--green'), red: css('--red'), blue: css('--blue'), purple: css('--purple'), orange: css('--orange'), text: css('--text'), muted: css('--muted'), grid: css('--line'), card: css('--card') });
  const CAT_COLORS = () => { const p = palette(); return [p.gold, p.blue, p.green, p.purple, p.orange, p.red, '#4fd1c5', '#e879a8', '#9aa5b1', '#c0a062', '#7bd88f', '#ffb86b']; };
  const charts = {};
  function chart(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas || !window.Chart) return null;
    if (charts[id]) charts[id].destroy();
    const p = palette();
    Chart.defaults.color = p.muted; Chart.defaults.font.family = getComputedStyle(document.body).fontFamily; Chart.defaults.borderColor = p.grid;
    config.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: { duration: 500 }, interaction: { mode: 'index', intersect: false } }, config.options || {});
    config.options.plugins = Object.assign({ legend: { display: false } }, config.options.plugins || {});
    config.options.plugins.tooltip = Object.assign({ backgroundColor: css('--card-2'), titleColor: p.text, bodyColor: p.text, borderColor: css('--line-2'), borderWidth: 1, padding: 10, callbacks: { label: (c) => ` ${c.dataset.label}: ${money(c.parsed.y != null ? c.parsed.y : c.parsed)}` } }, config.options.plugins.tooltip || {});
    charts[id] = new Chart(canvas, config);
    canvas.setAttribute('role', 'img');
    return charts[id];
  }
  const yAxisMoney = { beginAtZero: true, grace: '5%', ticks: { callback: (v) => short(v), maxTicksLimit: 6 }, grid: { color: () => css('--line'), tickColor: () => css('--line') }, border: { display: false } };
  const xAxis = { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 9 } };
  const chartEmpty = (id, isEmpty, msg) => {
    const box = document.getElementById(id) && document.getElementById(id).parentElement;
    if (!box) return;
    let note = box.querySelector('.chart-empty');
    if (isEmpty) {
      if (!note) { note = document.createElement('div'); note.className = 'empty chart-empty'; note.style.cssText = 'position:absolute;inset:0;display:grid;place-content:center;background:var(--card)'; box.appendChild(note); }
      note.innerHTML = `<div><strong>No data yet</strong>${esc(msg || 'Nothing recorded for this period.')}</div>`;
    } else if (note) note.remove();
  };

  // ---------------------------------------------------- global wiring ---
  async function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { await api('PUT', '/api/settings', { theme: next }); } catch (e) { /* theme still applied locally */ }
    boot.settings.theme = next;
    window.dispatchEvent(new CustomEvent('theme:changed'));
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-quick-add]')) { openTransactionForm(); }
    if (e.target.closest('#themeToggle, #themeToggle2')) toggleTheme();
    const more = $('#moreSheet');
    if (e.target.closest('#moreBtn')) { more.hidden = !more.hidden; }
    else if (more && !more.hidden && !e.target.closest('#moreSheet')) more.hidden = true;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !$('.modal-back')) { e.preventDefault(); openTransactionForm(); }
  });
  const demoNote = $('#demoNote');
  if (demoNote && boot.demo_count > 0) demoNote.hidden = false;

  window.MT = { boot, api, qs, esc, $, $$, money, moneyHTML, num, short, fmtDate, weekday, todayStr, nowLocal, toInputDT, unit, toDisp, fromDisp, store, toast, modal,
    confirmDialog, bindForm, field, moneyInput, wireMoney, rawNum, openTransactionForm, openCategoryForm, deleteTransaction, txRow, txVisual, bindTxActions, rangeBar,
    chart, palette, CAT_COLORS, yAxisMoney, xAxis, chartEmpty, css, pad };
})();
