(function () {
  var MSG = "Developer tools are not allowed on this page.";
  var locked = false;
  var timer = 0;

  function stop(e) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }

  document.addEventListener("contextmenu", stop, true);

  document.addEventListener("selectstart", function (e) {
    var el = e.target;
    if (el && el.closest && el.closest("input, textarea, select")) return;
    stop(e);
  }, true);

  document.addEventListener("dragstart", function (e) {
    if (e.target && e.target.closest && e.target.closest("img")) stop(e);
  }, true);

  document.addEventListener("copy", function (e) {
    var el = e.target;
    if (el && el.closest && el.closest("input, textarea")) return;
    stop(e);
  }, true);

  function isInspectKey(e) {
    var k = (e.key || "").toLowerCase();
    var code = e.code || "";
    var ctrl = e.ctrlKey || e.metaKey;
    if (e.key === "F12" || code === "F12" || e.keyCode === 123) return true;
    if (ctrl && e.shiftKey && (k === "i" || k === "j" || k === "c" || k === "k" || k === "e")) return true;
    if (ctrl && e.shiftKey && (code === "KeyI" || code === "KeyJ" || code === "KeyC" || code === "KeyK" || code === "KeyE")) return true;
    if (e.metaKey && e.altKey && (k === "i" || k === "j" || k === "c")) return true;
    if (ctrl && (k === "u" || k === "s" || code === "KeyU" || code === "KeyS")) return true;
    return false;
  }

  window.addEventListener("keydown", function (e) {
    if (isInspectKey(e)) return stop(e);
  }, true);

  window.addEventListener("keyup", function (e) {
    if (isInspectKey(e)) return stop(e);
  }, true);

  window.addEventListener("keypress", function (e) {
    if (isInspectKey(e)) return stop(e);
  }, true);

  function sizeOpen() {
    var wide = window.outerWidth - window.innerWidth > 160;
    var tall = window.outerHeight - window.innerHeight > 160;
    return wide || tall;
  }

  function consoleOpen() {
    var hit = false;
    var err = new Error();
    try {
      Object.defineProperty(err, "stack", {
        configurable: false,
        get: function () {
          hit = true;
          return "";
        }
      });
      console.log(err);
      console.clear();
    } catch (e) {}
    return hit;
  }

  function debugOpen() {
    var t = performance.now();
    try {
      Function("debugger")();
    } catch (e) {}
    return performance.now() - t > 120;
  }

  function freezeConsole() {
    var n = ["log", "debug", "info", "warn", "error", "dir", "table", "trace", "group", "groupEnd", "clear"];
    var i;
    for (i = 0; i < n.length; i++) {
      try { console[n[i]] = function () {}; } catch (e) {}
    }
  }

  function lock() {
    if (locked) return;
    locked = true;
    document.documentElement.classList.add("no-inspect");
    freezeConsole();
    try {
      document.documentElement.innerHTML =
        "<head><meta charset=\"UTF-8\"><title></title><meta name=\"robots\" content=\"noindex\"></head>" +
        "<body style=\"margin:0;background:#14121c;color:#fff;display:grid;place-items:center;min-height:100vh;" +
        "font:700 18px/1.45 system-ui,sans-serif;letter-spacing:.02em;text-align:center;padding:24px\">" +
        MSG +
        "</body>";
    } catch (e) {}
    if (!timer) timer = setInterval(function () {
      try { Function("debugger")(); } catch (err) {}
    }, 80);
  }

  function check() {
    var open = false;
    try { open = sizeOpen() || debugOpen() || (!locked && consoleOpen()); } catch (e) {}
    if (open) {
      lock();
      return;
    }
    if (locked) location.reload();
  }

  setInterval(check, 400);
  window.addEventListener("resize", check);
  window.addEventListener("focus", check);
  check();
})();
