(function () {
  var KEY = "folio-ui";
  function readStore() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; }
  }
  window.folioReadStore = readStore;
  window.folioBoot = function () {
    var s = readStore();
    var html = document.documentElement;
    var railOn = s.rail === true || localStorage.getItem("folio-rail") === "1";
    html.classList.toggle("rail-collapsed", railOn);
    var tab = (s.tab === "from-pdf" || s.tab === "id-card") ? s.tab : "to-pdf";
    html.setAttribute("data-tab", tab);
    function sel(id, v) {
      var el = document.getElementById(id);
      if (!el || v == null) return;
      for (var i = 0; i < el.options.length; i++) {
        if (el.options[i].value === String(v)) { el.value = String(v); return; }
      }
    }
    sel("pageSize", s.pageSize);
    sel("orientation", s.orientation);
    sel("fit", s.fit);
    sel("margin", s.margin);
    sel("extractMode", s.extractMode);
    sel("pageScale", s.pageScale);
    sel("idCardType", s.idCardType);
    sel("idPageSize", s.idPageSize);
    sel("idOrientation", s.idOrientation);
    sel("idPlace", s.idPlace);
    sel("idSide", s.idSel);
    var rot = document.getElementById("rotateMatch");
    if (rot && typeof s.rotateMatch === "boolean") rot.checked = s.rotateMatch;
    var shell = document.querySelector(".shell");
    if (shell) shell.classList.toggle("rail-collapsed", railOn);
    var row = document.getElementById("orientRow");
    var orient = document.getElementById("orientation");
    if (row && orient) row.classList.toggle("portrait-only", orient.value !== "landscape");
    var toggle = document.getElementById("railToggle");
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(!railOn));
      toggle.setAttribute("aria-label", railOn ? "Expand" : "Collapse");
      toggle.title = railOn ? "Expand" : "Collapse";
    }
    function vis(id, show) {
      var el = document.getElementById(id);
      if (el) el.classList.toggle("hidden", !show);
    }
    vis("sideToPdf", tab === "to-pdf");
    vis("sideFromPdf", tab === "from-pdf");
    vis("sideIdCard", tab === "id-card");
    vis("idDesk", tab === "id-card");
    var tPdf = document.getElementById("tabToPdf");
    var tFrom = document.getElementById("tabFromPdf");
    var tId = document.getElementById("tabIdCard");
    if (tPdf) tPdf.classList.toggle("on", tab === "to-pdf");
    if (tFrom) tFrom.classList.toggle("on", tab === "from-pdf");
    if (tId) tId.classList.toggle("on", tab === "id-card");
    var canvas = document.getElementById("canvas");
    var add = document.getElementById("addTile");
    if (tab === "id-card") {
      vis("emptyHint", false);
      vis("stageStack", false);
      vis("nameBar", false);
      if (canvas) canvas.classList.add("has-pages");
      if (add) add.style.display = "none";
    } else if (add) {
      add.style.display = tab === "to-pdf" ? "" : "none";
    }
    if (tab === "from-pdf") {
      var ht = document.getElementById("hintTitle");
      var hx = document.getElementById("hintText");
      var cb = document.getElementById("chooseBtn");
      if (ht) ht.textContent = "Drop a PDF onto the desk";
      if (hx) hx.textContent = "Each page becomes an image. Scroll the middle to see every page in order.";
      if (cb) cb.textContent = "Open PDF";
    }
    function reveal() {
      var sheet = document.getElementById("idSheet");
      var desk = document.getElementById("idDesk");
      if (sheet && desk && tab === "id-card") {
        var PAGE = { a4: [210, 297], letter: [215.9, 279.4], legal: [215.9, 355.6], a5: [148, 210] };
        var CARD = { nid: [85.6, 53.98], bank: [86, 54] };
        var size = (document.getElementById("idPageSize") || {}).value || "a4";
        var land = (document.getElementById("idOrientation") || {}).value === "landscape";
        var dim = PAGE[size] || PAGE.a4;
        var pw = land ? dim[1] : dim[0];
        var ph = land ? dim[0] : dim[1];
        var maxW = Math.max(180, (desk.clientWidth || 520) - 40);
        var maxH = Math.max(240, (desk.clientHeight || 700) - 36);
        var wpx = pw * 2.2, hpx = ph * 2.2;
        var fit = Math.min(1, maxW / wpx, maxH / hpx);
        sheet.style.width = Math.round(wpx * fit) + "px";
        sheet.style.height = Math.round(hpx * fit) + "px";
        var type = (document.getElementById("idCardType") || {}).value || "nid";
        var card = CARD[type] || CARD.nid;
        var pct = (card[0] / pw) * 100;
        var cards = sheet.querySelectorAll(".id-card");
        for (var i = 0; i < cards.length; i++) {
          cards[i].style.width = pct + "%";
          cards[i].style.aspectRatio = card[0] + " / " + card[1];
        }
        var place = (document.getElementById("idPlace") || {}).value;
        sheet.classList.toggle("pos-top", place === "top");
        sheet.classList.toggle("pos-center", place !== "top");
      }
      if (document.getElementById("canvas")) html.classList.add("folio-ready");
    }
    if (document.getElementById("canvas")) {
      requestAnimationFrame(function () { requestAnimationFrame(reveal); });
    }
  };
  window.folioBoot();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", window.folioBoot);
  }
})();
