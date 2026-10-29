/* GoReview: registers the service worker once the page has loaded, and only over https or on localhost.
 * Inlined into index.html by the review build (never present in the default or the extension build).
 * When a newer worker is installed and waiting it tells the app (event "goreview:update-ready"); the app's quiet
 * "Update ready - reload" link calls window.__goreviewApplyUpdate(), which sends SKIP_WAITING and reloads on controllerchange. */
(function () {
  if (!('serviceWorker' in navigator)) return;
  var host = location.hostname;
  var secure = location.protocol === 'https:' || host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || /\.localhost$/.test(host);
  if (!secure) return;

  var reloading = false;
  var applying = false;

  window.__goreviewApplyUpdate = function () {
    var u = window.__goreviewUpdate;
    if (!u || !u.waiting) return false;
    applying = true;
    u.waiting.postMessage({ type: 'SKIP_WAITING' });
    return true;
  };

  function announce(worker) {
    window.__goreviewUpdate = { waiting: worker };
    window.dispatchEvent(new CustomEvent('goreview:update-ready'));
  }

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js').then(function (reg) {
      if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
      reg.addEventListener('updatefound', function () {
        var w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', function () {
          if (w.state === 'installed' && navigator.serviceWorker.controller) announce(w);
        });
      });
      // a phone app is rarely reloaded: look for a new build whenever it comes back to the foreground
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) reg.update().catch(function () { /* offline */ });
      });
    }).catch(function () { /* the app works without the worker */ });
  });

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!applying || reloading) return;
    reloading = true;
    location.reload();
  });
}());
