(function () {
  var NS = "sumanengbd-folio";
  var HOSTS = ["https://abacus.jasoncameron.dev", "https://abacus.jsn.cam"];
  var UV_KEY = "folio-stats-uv";
  var PV_KEY = "folio-stats-pv";
  var CACHE_KEY = "folio-stats-cache";
  var host = HOSTS[0];
  var lastLiveMin = "";
  var timer = 0;

  function $(id) {
    return document.getElementById(id);
  }

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function minuteKey(offset) {
    var d = new Date(Date.now() + offset * 60000);
    return "live-" + d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + pad(d.getUTCHours()) + pad(d.getUTCMinutes());
  }

  function fmt(n) {
    n = Math.max(0, Math.floor(Number(n) || 0));
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "k";
    return n.toLocaleString("en-US");
  }

  function show(live, total) {
    var liveEl = $("statLive");
    var totalEl = $("statTotal");
    if (liveEl) liveEl.textContent = live == null ? "–" : fmt(live);
    if (totalEl) totalEl.textContent = total == null ? "–" : fmt(total);
    var box = $("railStats");
    if (box && live != null && total != null) {
      box.title = fmt(live) + " on the site now · " + fmt(total) + " unique visitors. Files stay on this device.";
    }
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ live: live, total: total, t: Date.now() }));
    } catch (e) {}
  }

  function cached() {
    try {
      var s = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (s && typeof s.total === "number") return s;
    } catch (e) {}
    return null;
  }

  async function call(path) {
    var i, res, data, err;
    var order = host === HOSTS[0] ? HOSTS : [host, HOSTS[0]];
    for (i = 0; i < order.length; i++) {
      try {
        res = await fetch(order[i] + path, { cache: "no-store", referrerPolicy: "no-referrer" });
        if (res.status === 404) return 0;
        data = await res.json();
        if (!res.ok || data.error) continue;
        host = order[i];
        return Number(data.value) || 0;
      } catch (e) {
        err = e;
      }
    }
    if (err) throw err;
    return null;
  }

  function hit(key) {
    return call("/hit/" + NS + "/" + key);
  }

  function get(key) {
    return call("/get/" + NS + "/" + key);
  }

  async function tally() {
    var total = null;
    var live = 1;
    var cur, prev, sec;
    try {
      if (!localStorage.getItem(UV_KEY)) {
        total = await hit("visitors");
        if (total != null) localStorage.setItem(UV_KEY, "1");
      } else {
        total = await get("visitors");
      }
      if (!sessionStorage.getItem(PV_KEY)) {
        await hit("visits");
        sessionStorage.setItem(PV_KEY, "1");
      }
      if (!document.hidden) {
        cur = minuteKey(0);
        if (cur !== lastLiveMin) {
          live = await hit(cur);
          lastLiveMin = cur;
        } else {
          live = await get(cur);
        }
      } else {
        live = await get(minuteKey(0));
      }
      prev = await get(minuteKey(-1));
      sec = new Date().getUTCSeconds();
      live = Math.max(1, sec < 30 ? Math.max(live || 0, prev || 0) : live || 0);
      show(live, total);
    } catch (e) {
      var old = cached();
      show(old ? Math.max(1, old.live || 1) : 1, old ? old.total : null);
    }
  }

  function start() {
    var old = cached();
    if (old) show(old.live, old.total);
    tally();
    clearInterval(timer);
    timer = setInterval(tally, 25000);
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      clearInterval(timer);
      timer = 0;
    } else {
      start();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
