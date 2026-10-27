/*
 * The pure logic of the Hub-offline navigation fallback (32-SS1, Milestone 844, PD-123, PD-144). Loaded by hub-worker.js with importScripts
 * (it attaches `DudeHubOffline` to the worker global) and by the Node spec `server/hub-offline.spec.ts` (it evaluates the file in a `vm` context with a fake `self`).
 * No DOM, no Angular, no application data: it decides only whether a navigation should be answered with the cached Hub-offline page.
 */
(function (root) {
  'use strict';

  var OFFLINE_PAGE = '/offline.html';
  var PROBE_PATH = '/api/v1/hello';
  var PROBE_TIMEOUT_MS = 4000;

  /** Mirrors the `navigationUrls` of ngsw-config.hub.json: a document navigation to an extension-less path outside /api and /sandbox. */
  function isFallbackNavigation(request, origin) {
    if (!request || request.mode !== 'navigate' || request.method !== 'GET' || request.destination !== 'document') return false;
    var url;
    try { url = new URL(request.url); } catch (e) { return false; }
    if (url.origin !== origin) return false;
    var path = url.pathname;
    if (path === '/api' || path.indexOf('/api/') === 0 || path === '/sandbox' || path.indexOf('/sandbox/') === 0) return false;
    var last = path.slice(path.lastIndexOf('/') + 1);
    return last.indexOf('.') === -1 && path.indexOf('__') === -1;
  }

  /** The Hub counts as down on a network failure, a timeout, or any 5xx (an ingress provider's 502, 503, 504 and 52x pages are 5xx). */
  function statusMeansDown(status) {
    return typeof status !== 'number' || status >= 500;
  }

  /**
   * Asks the public `hello` endpoint (no credential, no owner data) whether the Hub answers. Resolves 'up' or 'down'; never rejects.
   * `deps` is injectable for tests: `fetch`, `setTimeout`, `clearTimeout`, `AbortController`, `timeoutMs`.
   */
  function probeHub(origin, deps) {
    var d = deps || {};
    var doFetch = d.fetch || function (url, init) { return root.fetch(url, init); };
    var setT = d.setTimeout || function (fn, ms) { return root.setTimeout(fn, ms); };
    var clearT = d.clearTimeout || function (id) { root.clearTimeout(id); };
    var Controller = d.AbortController || root.AbortController;
    var timeoutMs = d.timeoutMs || PROBE_TIMEOUT_MS;
    return new Promise(function (resolve) {
      var controller = Controller ? new Controller() : null;
      var timer = setT(function () { if (controller) controller.abort(); resolve('down'); }, timeoutMs);
      try {
        doFetch(origin + PROBE_PATH, { cache: 'no-store', credentials: 'omit', signal: controller ? controller.signal : undefined }).then(
          function (response) { clearT(timer); resolve(statusMeansDown(response && response.status) ? 'down' : 'up'); },
          function () { clearT(timer); resolve('down'); }
        );
      } catch (e) {
        clearT(timer);
        resolve('down');
      }
    });
  }

  /**
   * What to answer a fallback navigation with. `stock` is the promise (or response) the stock Angular worker produced; `probe()` resolves 'up' or
   * 'down'; `offlinePage()` resolves the cached offline Response or undefined. When the Hub is up, or the page is not cached, the stock answer
   * wins, so the fallback can only ever ADD the offline page, never take the app shell away.
   */
  function chooseNavigationResponse(stock, probe, offlinePage) {
    var stockResult = Promise.resolve(stock);
    stockResult.catch(function () { /* surfaced below if it is the answer */ });
    return probe().then(function (state) {
      if (state === 'up') return stockResult;
      return offlinePage().then(function (page) { return page || stockResult; }, function () { return stockResult; });
    }, function () { return stockResult; });
  }

  /** The offline page from the caches the stock worker filled (read only: this never writes to a cache). */
  function findOfflinePage(cacheStorage, origin) {
    return cacheStorage.match(origin + OFFLINE_PAGE, { ignoreVary: true });
  }

  var api = {
    OFFLINE_PAGE: OFFLINE_PAGE, PROBE_PATH: PROBE_PATH, PROBE_TIMEOUT_MS: PROBE_TIMEOUT_MS,
    isFallbackNavigation: isFallbackNavigation, statusMeansDown: statusMeansDown, probeHub: probeHub,
    chooseNavigationResponse: chooseNavigationResponse, findOfflinePage: findOfflinePage
  };
  root.DudeHubOffline = api;
})(typeof self !== 'undefined' ? self : globalThis);
