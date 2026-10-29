/* Money Tracker (offline build) - glue between the pages and the in-browser data engine.
   Loaded first on every page. It opens the database stored on this device, exposes window.__BOOT__ and
   window.__API__ (which replace the server), then loads the normal page scripts in order. */
(function () {
  'use strict';
  var scripts = (document.currentScript && document.currentScript.dataset.scripts || '').split(',').filter(Boolean);
  var baseDir = location.pathname.replace(/[^/]*$/, '');

  // ------------------------------------------------------------------ storage (IndexedDB) --
  var DB_NAME = 'money-tracker', KV = 'kv';
  function openIDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(KV); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('IndexedDB unavailable')); };
    });
  }
  function makeStore(idb) {
    function get(key) { return new Promise(function (res, rej) { var r = idb.transaction(KV).objectStore(KV).get(key); r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
    function putMany(pairs) {
      return new Promise(function (res, rej) {
        var tx = idb.transaction(KV, 'readwrite'), os = tx.objectStore(KV);
        pairs.forEach(function (p) { os.put(p[1], p[0]); });
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(tx.error); };
        tx.onabort = function () { rej(tx.error || new Error('Storage write was aborted')); };
      });
    }
    return {
      load: function () { return Promise.all([get('db'), get('rev')]).then(function (v) { return v[0] ? { bytes: v[0], rev: v[1] || 0 } : null; }); },
      getRev: function () { return get('rev').then(function (v) { return v || 0; }); },
      save: function (bytes) { return get('rev').then(function (r) { var next = (r || 0) + 1; return putMany([['db', bytes], ['rev', next]]).then(function () { return next; }); }); },
      saveSafety: function (bytes) { return putMany([['safety', bytes]]); },
      loadSafety: function () { return get('safety').then(function (v) { return v || null; }); },
      hasSafety: function () { return get('safety').then(function (v) { return !!v; }); }
    };
  }

  // ------------------------------------------------------------------ helpers --
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = src; s.async = false;
      s.onload = resolve; s.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function fatal(msg) {
    document.body.innerHTML = '<div style="max-width:460px;margin:12vh auto;padding:0 20px;font:16px/1.5 -apple-system,system-ui,sans-serif;color:#eee;background:#0e0e10"><h2 style="color:#f5b82e">Money Tracker can\'t start</h2><p>' + msg + '</p><p style="color:#999;font-size:14px">Tip: this app cannot store data in Safari Private Browsing. Open it in a normal Safari tab, then add it to the Home Screen.</p></div>';
    document.body.style.background = '#0e0e10';
  }

  // ------------------------------------------------------------------ downloads --
  function toBlob(file) {
    if (file.bytes) return new Blob([file.bytes], { type: file.mime || 'application/octet-stream' });
    return new Blob([file.text], { type: (file.mime || 'text/plain') + ';charset=utf-8' });
  }
  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
  }
  async function deliver(file) {
    var blob = toBlob(file);
    try {   // on iPhone the share sheet offers "Save to Files", which is the most reliable way to keep a backup
      var f = new File([blob], file.name, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: file.name }); return true; }
    } catch (e) { if (e && e.name === 'AbortError') return false; }
    saveBlob(blob, file.name); return true;
  }

  // ------------------------------------------------------------------ main --
  async function main() {
    var SQL, engine, idb;
    try {
      if (!window.indexedDB) throw new Error('This browser does not allow storing data.');
      idb = await openIDB();
      SQL = await initSqlJs({ locateFile: function (f) { return baseDir + 'vendor/' + f; } });
      engine = await MTEngine.create({ SQL: SQL, store: makeStore(idb) });
    } catch (e) { console.error(e); return fatal('The data store could not be opened (' + (e && e.message || e) + ').'); }

    var queue = Promise.resolve();
    function call(method, url, body) {                  // one request at a time, like a real server
      var run = queue.then(function () { return engine.handle(method, url, body); });
      queue = run.catch(function () {});
      return run;
    }
    window.__API__ = async function (method, url, data, isForm) {
      var body = data;
      if (isForm) { var file = data.get('file'); body = { file: file ? new Uint8Array(await file.arrayBuffer()) : null }; }
      var res = await call(method, url, body);
      if (res.status >= 400) throw Object.assign(new Error((res.json && res.json.error) || 'Something went wrong (' + res.status + ').'), { field: res.json && res.json.field, status: res.status });
      return res.json;
    };
    window.__ENGINE_CALL__ = call;
    var boot = (await call('GET', '/api/bootstrap')).json;
    window.__BOOT__ = boot;
    document.documentElement.setAttribute('data-theme', boot.settings.theme);
    lsSet('mt.themeCache', boot.settings.theme);
    if (!lsGet('mt.firstUse')) lsSet('mt.firstUse', String(Date.now()));
    Array.prototype.forEach.call(document.querySelectorAll('[data-vehicle]'), function (el) { el.textContent = boot.settings.vehicle_name; });
    window.addEventListener('theme:changed', function () { lsSet('mt.themeCache', document.documentElement.getAttribute('data-theme')); });

    // export / backup / print links: build the file here instead of asking a server
    document.addEventListener('click', async function (ev) {
      var a = ev.target.closest && ev.target.closest('a[href]');
      if (!a) return;
      var u; try { u = new URL(a.href, location.href); } catch (e) { return; }
      if (u.origin !== location.origin) return;
      var rel = u.pathname.slice(baseDir.length);
      var isExport = /^export\//.test(rel), isBackup = rel === 'backup';
      if (!isExport && !isBackup) return;
      ev.preventDefault();
      var res = await call('GET', '/' + rel + u.search);
      if (res.status >= 400 || !res.file) { if (window.MT) window.MT.toast((res.json && res.json.error) || 'Could not create the file.', 'error'); return; }
      var done = await deliver(res.file);
      if (isBackup && done) { lsSet('mt.lastBackup', String(Date.now())); var b = document.getElementById('backupNag'); if (b) b.remove(); if (window.MT) window.MT.toast('Backup created. Save it to Files or iCloud.'); }
    }, true);

    // ask the browser not to evict our data
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* optional */ }

    // load Chart.js, app.js and the page script now that the data is ready
    try { for (var i = 0; i < scripts.length; i++) await loadScript(scripts[i]); }
    catch (e) { console.error(e); return fatal('A page file could not be loaded. Connect to the internet once and reopen the app.'); }

    // gentle reminder to back up (iOS can clear website data)
    if (document.body.dataset.page === 'dashboard') {
      var last = Number(lsGet('mt.lastBackup') || lsGet('mt.firstUse') || Date.now());
      var days = Math.floor((Date.now() - last) / 86400000);
      var cnt = (await call('GET', '/api/settings')).json.counts;
      if (days >= 7 && cnt && cnt.transactions > 0) {
        var host = document.getElementById('content');
        if (host) {
          var n = document.createElement('div'); n.id = 'backupNag'; n.className = 'banner warn';
          n.innerHTML = '<span>💾</span><div><strong>Time for a backup.</strong> ' + (lsGet('mt.lastBackup') ? 'Your last backup was ' + days + ' days ago.' : 'You have not made a backup yet.') + ' <a class="gold" href="settings.html"><strong>Open Settings →</strong></a></div>';
          host.insertBefore(n, host.firstChild);
        }
      }
    }

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('Offline cache unavailable', e); });
    }
    document.documentElement.classList.add('mt-ready');
  }

  Promise.all([loadScript(baseDir + 'vendor/sql-wasm.js'), loadScript(baseDir + 'engine.js')]).then(main).catch(function (e) {
    console.error(e); fatal('The app files could not be loaded. Connect to the internet once and reopen the app.');
  });
})();
