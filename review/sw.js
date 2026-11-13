/* GoReview service worker (classic script). Built into dist-review/sw.js by packages/goreview/app/vite.config.ts --mode review,
 * which replaces the two tokens below: the build id (a hash of every shell file) and the list of files to precache.
 *
 *   shell        precached at install under "goreview-shell-<build id>": index, hashed assets, fonts, manifest, icons, config.json.
 *                Served cache-first (the cached index and its hashed assets are one consistent version); a new build installs
 *                beside it and WAITS: the page offers "Update ready - reload" and only then sends SKIP_WAITING.
 *   config.json  the kept copy at once, refreshed from the network for the next start (the network only when nothing is kept).
 *   dict/        the dictionary shards are NOT precached (hundreds of MB): cached on demand in "goreview-dict-v1", capped. The hosted
 *                edition reads them from BESIDE the app (config.json assetBaseUrl "../", so one dictionary tree serves every app of the site):
 *                that folder is outside this worker's scope, and its dict/ files are kept all the same (the third token below names it;
 *                until 2026-11-11 they were passed by, so the hosted app had no dictionary without a connection).
 *   assets/lang-*.js   one language's analyser (leanBuiltins.ts): NOT precached, fetched when the language is first used and then kept in a
 *                build-versioned cache, so a language that was used opens offline; one that was never used and has no connection fails to load
 *                (the app says so and offers to try again). The small shared chunk the language chunks import IS precached. A new build
 *                fetches, while it installs, its own chunks of the languages the build before it had kept (the fourth token lists them by
 *                language): an update applied later with no connection still opens those languages.
 *   lexicon/     Hebrew and Greek indexes are NOT precached: shards and the Koine index are cached on demand in a build-versioned cache, capped.
 *   everything else  untouched: the Repository service (any origin, /sync, /vocabulary, /candidates, /me, /sessions ...) is NEVER
 *                cached, and a request that carries an Authorization header is never answered from a cache.
 */
'use strict';

var BUILD_ID = 'b7cea7cb61db';
var PRECACHE = [
  "./",
  "./EB-Garamond-OFL.txt",
  "./THIRD-PARTY-NOTICES.md",
  "./assets/athens-CGnxwDV8.webp",
  "./assets/bangkok-r3GWRAT9.webp",
  "./assets/berat-CFdUV1uK.webp",
  "./assets/fonts/EB-Garamond-OFL.txt",
  "./assets/fonts/eb-garamond-latin-400-italic.woff2",
  "./assets/fonts/eb-garamond-latin-400.woff2",
  "./assets/fonts/eb-garamond-latin-600.woff2",
  "./assets/go-globe-frame-D8kaNpyf.png",
  "./assets/go-globe-rim-CzbKbQV5.png",
  "./assets/go-globe-turn-Dop5YaWE.png",
  "./assets/go-logo-D1Qp-DDg.png",
  "./assets/index-BF-qVhfb.js",
  "./assets/jerusalem-YWyJNBCG.webp",
  "./assets/oslo-CP39LCLT.webp",
  "./assets/roman-forum-BwyPrRQO.webp",
  "./assets/rothenburg-vv8nBX67.webp",
  "./assets/shared-f3Tn5VdE.js",
  "./assets/style-DK3r0fnI.css",
  "./assets/syntax-CGmPxLTF.js",
  "./assets/valle-de-angeles-BxOTzEvC.webp",
  "./assets/varanasi-D-p-TlCF.webp",
  "./config.json",
  "./icons/apple-touch-icon.png",
  "./icons/go-logo.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/icon.svg",
  "./index.html",
  "./manifest.webmanifest"
];
var ASSET_BASE = '../';
var LANG_CHUNKS = {
  "aramaic": [
    "./assets/lang-aramaic-CeD2obLb.js"
  ],
  "de": [
    "./assets/lang-de-3Bn6hHMX.js"
  ],
  "el": [
    "./assets/lang-el-DOEVExgU.js"
  ],
  "es": [
    "./assets/lang-es-CfcERIiN.js"
  ],
  "he": [
    "./assets/lang-he-a5gkQGPu.js"
  ],
  "hebrew": [
    "./assets/lang-hebrew-t9whJvzS.js"
  ],
  "hi": [
    "./assets/lang-hi-JRqO0Xpw.js"
  ],
  "la": [
    "./assets/lang-la-CqkJGOnK.js"
  ],
  "nb": [
    "./assets/lang-nb-BsQbk1Xe.js"
  ],
  "nn": [
    "./assets/lang-nn-DRytQZ55.js"
  ],
  "norwegian": [
    "./assets/lang-norwegian-BjR21Cv7.js"
  ],
  "sq": [
    "./assets/lang-sq-6J1rMegD.js"
  ],
  "th": [
    "./assets/lang-th-75UOkUHe.js"
  ]
};

var SHELL_PREFIX = 'goreview-shell-';
var SHELL_CACHE = SHELL_PREFIX + BUILD_ID;
var DICT_CACHE = 'goreview-dict-v1';
var LEXICON_PREFIX = 'goreview-lexicon-';
var LEXICON_CACHE = LEXICON_PREFIX + BUILD_ID;
var LANG_PREFIX = 'goreview-lang-';
var LANG_CACHE = LANG_PREFIX + BUILD_ID;
var DICT_MAX_ENTRIES = 400;
var DICT_MAX_BYTES = 3 * 1024 * 1024; // one shard larger than this is served but not kept

/** Paths of the Repository service. A request whose path from the scope root starts with one is never cached (nor is anything outside the scope). */
var SERVICE_PATH = /^\/?(sync|vocabulary|candidates|me|sessions|events|knowledge|units|enrolments|documents|corrections|reviews|writing|preferences|lookups|health|export)(\/|$)/;

var scopePath = new URL(self.registration.scope).pathname;

function relativePath(url) {
  return url.pathname.indexOf(scopePath) === 0 ? url.pathname.slice(scopePath.length) : null;
}

// Where the dictionary is read from when that is not this app's own folder: the same origin, a folder outside the scope (assetBaseUrl "../").
// Null when the dictionary is inside the scope (the bundled editions) or on another origin (never this worker's business).
var outsideAssetPath = (function () {
  try {
    var u = new URL(ASSET_BASE || './', self.registration.scope);
    if (u.origin !== self.location.origin) return null;
    var p = u.pathname.charAt(u.pathname.length - 1) === '/' ? u.pathname : u.pathname + '/';
    return p.indexOf(scopePath) === 0 ? null : p;
  } catch (e) { return null; }
}());

/** A dictionary file under the outside asset folder: a plain GET with no credential, of `<asset folder>dict/...`. Nothing else outside the scope is touched. */
function isOutsideDictionary(request, url) {
  if (outsideAssetPath === null) return false;
  if (request.headers && request.headers.get('Authorization')) return false;
  return url.pathname.indexOf(outsideAssetPath + 'dict/') === 0;
}

/** The languages an earlier build's cache holds chunks of (their names are assets/lang-<language>-<hash>.js). */
function keptLanguages() {
  return caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf(LANG_PREFIX) === 0 && k !== LANG_CACHE; }).map(function (k) {
      return caches.open(k).then(function (cache) { return cache.keys(); });
    }));
  }).then(function (lists) {
    var ids = {};
    lists.forEach(function (list) {
      list.forEach(function (r) {
        var m = /\/assets\/lang-([a-z]+)-[^/]+\.js$/.exec(new URL(typeof r === 'string' ? r : r.url, self.registration.scope).pathname);
        if (m) ids[m[1]] = true;
      });
    });
    return Object.keys(ids);
  });
}

/** This build's chunks of those languages, fetched into its own cache. Never fails the install: a chunk that could not be fetched is fetched when the language is next used. */
function carryLanguages() {
  return keptLanguages().then(function (ids) {
    var files = [];
    ids.forEach(function (id) { (LANG_CHUNKS[id] || []).forEach(function (f) { files.push(f); }); });
    if (!files.length) return undefined;
    return caches.open(LANG_CACHE).then(function (cache) {
      return Promise.all(files.map(function (f) { return cache.add(new Request(f, { cache: 'reload' })).catch(function () { return undefined; }); }));
    });
  }).catch(function () { return undefined; });
}

function isServiceRequest(request, url) {
  if (request.headers && request.headers.get('Authorization')) return true;
  var rel = relativePath(url);
  // outside the scope is never this app's file; inside it, the path from the scope root is what is tested (an app hosted at /me/ is not the service)
  return rel === null || SERVICE_PATH.test(rel);
}

self.addEventListener('install', function (event) {
  // no skipWaiting here: an update waits until the learner taps "Update ready - reload"
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      return cache.addAll(PRECACHE.map(function (p) { return new Request(p, { cache: 'reload' }); }));
    }).then(carryLanguages)
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return (k.indexOf(SHELL_PREFIX) === 0 && k !== SHELL_CACHE) || (k.indexOf(LEXICON_PREFIX) === 0 && k !== LEXICON_CACHE) || (k.indexOf(LANG_PREFIX) === 0 && k !== LANG_CACHE);
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function cachedShell(request) {
  return caches.open(SHELL_CACHE).then(function (cache) { return cache.match(request, { ignoreSearch: true }); });
}

function navigationFallback() {
  return cachedShell('./index.html').then(function (r) { return r || cachedShell(scopePath + 'index.html'); });
}

// The kept copy answers at once and the network refreshes it for the next start (2026-11-09): the app waits for config.json before it
// shows anything, and a phone on a weak signal waited seconds for it on every launch. Only without a kept copy does the network answer.
function configFromCache(event, request) {
  var refresh = fetch(request).then(function (response) {
    if (response && response.ok) {
      var copy = response.clone();
      return caches.open(SHELL_CACHE).then(function (cache) { return cache.put(request, copy); }).then(function () { return response; });
    }
    return response;
  });
  return cachedShell(request).then(function (kept) {
    if (kept) {
      var quiet = refresh.catch(function () { return undefined; });
      if (event.waitUntil) event.waitUntil(quiet);
      return kept;
    }
    return refresh.catch(function () { return Response.error(); });
  });
}

function trim(cache) {
  return cache.keys().then(function (keys) {
    var extra = keys.length - DICT_MAX_ENTRIES;
    return Promise.all(keys.slice(0, Math.max(0, extra)).map(function (k) { return cache.delete(k); }));
  });
}

function dictOnDemand(request, cacheName) {
  return caches.open(cacheName || DICT_CACHE).then(function (cache) {
    return cache.match(request).then(function (hit) {
      if (hit) return hit;
      return fetch(request).then(function (response) {
        var size = Number(response.headers.get('content-length') || 0);
        if (response.ok && response.status === 200 && (!size || size <= DICT_MAX_BYTES)) {
          cache.put(request, response.clone()).then(function () { return trim(cache); });
        }
        return response;
      });
    });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;       // another origin (the service, a speech proxy): the network, untouched
  if (isOutsideDictionary(request, url)) { event.respondWith(dictOnDemand(request)); return; } // the shared dictionary beside the app
  if (isServiceRequest(request, url)) return;            // never cached, never answered from a cache
  var rel = relativePath(url);
  if (rel === null) return;                              // outside this app's scope

  if (request.mode === 'navigate') {
    event.respondWith(navigationFallback().then(function (r) { return r || fetch(request); }));
    return;
  }
  if (rel === 'config.json') { event.respondWith(configFromCache(event, request)); return; }
  if (rel.indexOf('dict/') === 0) { event.respondWith(dictOnDemand(request)); return; }
  if (rel.indexOf('lexicon/') === 0) { event.respondWith(dictOnDemand(request, LEXICON_CACHE)); return; }
  if (/^assets\/lang-[a-z]+-[^/]+\.js$/.test(rel)) { event.respondWith(dictOnDemand(request, LANG_CACHE)); return; }
  event.respondWith(cachedShell(request).then(function (r) { return r || fetch(request); }));
});
