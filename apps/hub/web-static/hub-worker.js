/*
 * The Hub web service worker (32-SS1, Milestone 844, PD-123, PD-144): the STOCK Angular worker, unchanged, plus one extra behavior. When this
 * browser has loaded DUDE from this Hub before and the Hub cannot be reached now, a page navigation is answered with the pre-cached
 * Hub-offline page (offline.html) instead of the cached app shell. Everything else (asset caching, versions, updates, the API) is the stock
 * worker's and is never touched; if anything here is unavailable the stock answer is used.
 *
 * Only the Hub build registers this file (`BUILD_HOST === 'hub'` in app.config.ts); GitHub Pages keeps `ngsw-worker.js`, so the anonymous
 * companion is unchanged. The first-time visitor limitation is accepted (PD-123): with no worker yet, an unreachable Hub shows the ingress
 * provider's own error page.
 *
 * How: `ngsw-worker.js` registers its `fetch` listener while it evaluates. The wrapper below records that listener instead of installing it,
 * and installs one listener of its own. For anything but a page navigation it calls the stock listener unchanged; for a page navigation it
 * lets the stock listener build its response, probes the public `hello` endpoint, and answers with the offline page only when the Hub is down.
 */
'use strict';

importScripts('./hub-offline-logic.js');

(function () {
  var logic = self.DudeHubOffline;
  var stockFetchListeners = [];
  var nativeAdd = self.addEventListener.bind(self);

  self.addEventListener = function (type, listener, options) {
    if (type === 'fetch') stockFetchListeners.push(listener);
    else nativeAdd(type, listener, options);
  };
  try {
    importScripts('./ngsw-worker.js');
  } finally {
    // Whatever happened, later registrations must reach the real thing.
    self.addEventListener = nativeAdd;
  }

  nativeAdd('fetch', function (event) {
    var origin = self.location.origin;
    if (!logic.isFallbackNavigation(event.request, origin)) {
      for (var i = 0; i < stockFetchListeners.length; i += 1) stockFetchListeners[i](event);
      return;
    }
    // Run the stock listener against a view of the event whose respondWith is captured, so its answer is a value we can still choose.
    var stock;
    var view = new Proxy(event, {
      get: function (target, prop) {
        if (prop === 'respondWith') return function (answer) { stock = answer; };
        var value = target[prop];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    for (var j = 0; j < stockFetchListeners.length; j += 1) stockFetchListeners[j](view);
    if (stock === undefined) return; // the stock worker declined this request: the browser handles it as usual
    event.respondWith(logic.chooseNavigationResponse(
      stock,
      function () { return logic.probeHub(origin); },
      function () { return logic.findOfflinePage(self.caches, origin); }
    ));
  });
})();
