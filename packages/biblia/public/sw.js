/* Biblia service worker (classic script). Built into dist-standalone/sw.js by packages/biblia/vite.config.ts --mode standalone,
 * which replaces the three tokens used below: the shell's build id (a hash of every shell file), the data id (a hash of the
 * texts and lexicon files) and the list of shell files to precache.
 *
 *   shell        index.html, the hashed assets, styles, manifest, icons and config.json are precached at install under
 *                "biblia-shell-<build id>" and served cache-first (the cached index and its hashed assets are one consistent
 *                version). config.json is the exception: network-first, the cached copy only when the network fails, so a
 *                changed service address reaches an installed app.
 *   data/ lexicon/   the texts (about 20 MB) and the lexicon indexes and shards (about 20 MB) are NOT precached. Each file is
 *                cached cache-first the first time it is fetched, in "biblia-data-<data id>", so a chapter once read works
 *                offline. A build whose texts changed has a new data id and starts a fresh data cache.
 *   everything else  untouched. Responses of the Repository service are NEVER cached: another origin is not handled at all, and
 *                a request carrying an Authorization header, or a path that is neither in the shell nor under data/ or
 *                lexicon/, goes straight to the network.
 *
 * A new build installs, takes over at once (skipWaiting + clients.claim) and deletes the old caches; register.js reloads the page
 * once when that happens. The old Biblia app's caches (Workbox precache, "biblia-data-<hash>") are deleted the same way. Only
 * caches this app made are touched: the origin is shared with other apps on github.io. */
'use strict';

var BUILD_ID = '__BUILD_ID__';
var DATA_ID = '__DATA_ID__';
var PRECACHE = __PRECACHE__;

var SHELL_PREFIX = 'biblia-shell-';
var DATA_PREFIX = 'biblia-data-';
var SHELL_CACHE = SHELL_PREFIX + BUILD_ID;
var DATA_CACHE = DATA_PREFIX + DATA_ID;
var DATA_MAX_ENTRIES = 1000;

var scope = self.registration.scope;
var scopePath = new URL(scope).pathname;

/** The shell's files as absolute URLs (without query), for the allow-list. './' is the folder itself. */
var SHELL_URLS = {};
PRECACHE.forEach(function (p) { SHELL_URLS[new URL(p, self.location.href).href] = true; });
var INDEX_URL = new URL('./index.html', self.location.href).href;
var CONFIG_URL = new URL('./config.json', self.location.href).href;

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      return cache.addAll(PRECACHE.map(function (p) { return new Request(p, { cache: 'reload' }); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        if (k.indexOf(SHELL_PREFIX) === 0) return k !== SHELL_CACHE;
        if (k.indexOf(DATA_PREFIX) === 0) return k !== DATA_CACHE;   // also the old app's "biblia-data-<hash>"
        // the old Biblia app's Workbox precache, named after the scope it was installed for
        return k.indexOf('workbox-precache') === 0 && k.indexOf(scope) !== -1;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function fromShell(request) {
  return caches.open(SHELL_CACHE).then(function (cache) { return cache.match(request, { ignoreSearch: true }); });
}

function networkFirstConfig(request) {
  return fetch(request).then(function (response) {
    if (response && response.ok && response.status === 200) {
      var copy = response.clone();
      caches.open(SHELL_CACHE).then(function (cache) { return cache.put(CONFIG_URL, copy); });
    }
    return response;
  }).catch(function () {
    return fromShell(CONFIG_URL).then(function (r) { return r || Response.error(); });
  });
}

function trim(cache) {
  return cache.keys().then(function (keys) {
    var extra = keys.length - DATA_MAX_ENTRIES;
    return Promise.all(keys.slice(0, Math.max(0, extra)).map(function (k) { return cache.delete(k); }));
  });
}

function dataCacheFirst(request) {
  return caches.open(DATA_CACHE).then(function (cache) {
    return cache.match(request).then(function (hit) {
      if (hit) return hit;
      return fetch(request).then(function (response) {
        // a partial (206) or failed response is served but not kept
        if (response && response.ok && response.status === 200) cache.put(request, response.clone()).then(function () { return trim(cache); });
        return response;
      });
    });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;                 // another origin (the Repository service): the network, untouched
  if (request.headers.get('Authorization')) return;                // never answered from or written to a cache
  if (url.pathname.indexOf(scopePath) !== 0) return;               // outside this app's scope
  var rel = url.pathname.slice(scopePath.length);
  var bare = url.origin + url.pathname;

  if (request.mode === 'navigate') {
    event.respondWith(fromShell(INDEX_URL).then(function (r) { return r || fetch(request); }));
    return;
  }
  if (bare === CONFIG_URL) { event.respondWith(networkFirstConfig(request)); return; }
  if (rel.indexOf('data/') === 0 || rel.indexOf('lexicon/') === 0) { event.respondWith(dataCacheFirst(request)); return; }
  if (SHELL_URLS[bare]) { event.respondWith(fromShell(request).then(function (r) { return r || fetch(request); })); return; }
  // anything else: not ours to cache
});
