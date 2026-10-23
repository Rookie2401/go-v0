/* Biblia: registers the service worker once the page has loaded, and only over https or on localhost.
 * Inlined into index.html by the standalone build (never present in the default or the extension build: an extension page
 * must not register a worker).
 * The worker takes over as soon as a new build is installed; when it replaces a worker that was already controlling this page the
 * page reloads once, so the new shell and its new assets are what is on screen. The first install (no controller yet) does not reload. */
(function () {
  if (!('serviceWorker' in navigator)) return;
  var host = location.hostname;
  var secure = location.protocol === 'https:' || host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || /\.localhost$/.test(host);
  if (!secure) return;

  var hadController = !!navigator.serviceWorker.controller;
  var reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadController) { hadController = true; return; }   // the first worker claiming a page that had none: nothing to refresh
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js').then(function (reg) {
      // an installed app is rarely reloaded: look for a new build whenever it comes back to the foreground or the network returns
      var check = function () { reg.update().catch(function () { /* offline */ }); };
      document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
      window.addEventListener('online', check);
    }).catch(function () { /* the app works without the worker */ });
  });
}());
