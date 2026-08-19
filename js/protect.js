(function () {
  var host = location.hostname;
  var local =
    location.protocol === "file:" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host === "::1" ||
    host === "" ||
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
  if (local) return;

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

  window.addEventListener("keydown", function (e) {
    var k = (e.key || "").toLowerCase();
    var ctrl = e.ctrlKey || e.metaKey;
    if (e.key === "F12") return stop(e);
    if (ctrl && e.shiftKey && (k === "i" || k === "j" || k === "c" || k === "k")) return stop(e);
    if (e.metaKey && e.altKey && (k === "i" || k === "j" || k === "c")) return stop(e);
    if (ctrl && (k === "u" || k === "s")) return stop(e);
  }, true);

  function devtoolsOpen() {
    var wide = window.outerWidth - window.innerWidth > 160;
    var tall = window.outerHeight - window.innerHeight > 160;
    return wide || tall;
  }

  function sync() {
    document.documentElement.classList.toggle("no-inspect", devtoolsOpen());
  }

  setInterval(sync, 700);
  window.addEventListener("resize", sync);
})();
