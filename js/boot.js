(function () {
  var KEY = "folio-ui";
  var TABS = {
    "to-pdf": 1,
    "from-pdf": 1,
    "id-card": 1,
    merge: 1,
    split: 1,
    compress: 1,
    text: 1
  };
  var HINT = {
    "to-pdf": ["Drop images onto the desk", "They become PDF pages. Scroll the middle to read the full document in order.", "Open images"],
    "from-pdf": ["Drop a PDF onto the desk", "Each page becomes an image. Scroll the middle to see every page in order.", "Open PDF"],
    merge: ["Drop PDFs to merge", "Add several files, then drag the strip to set order.", "Add PDFs"],
    split: ["Drop a PDF to split", "Type a range or click thumbs to pick pages.", "Open PDF"],
    compress: ["Drop a PDF or images", "Choose quality, then download a smaller file.", "Open files"],
    text: ["Type or paste text", "Change case, copy, download, or print. Nothing is uploaded.", "Open files"],
    "id-card": ["Drop card photos", "Front on top, back below.", "Open photo"]
  };
  function readStore() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; }
  }
  window.folioReadStore = readStore;
  window.folioBoot = function () {
    var s = readStore();
    var html = document.documentElement;
    var railOn = s.rail === true || localStorage.getItem("folio-rail") === "1";
    html.classList.toggle("rail-collapsed", railOn);
    var tab = TABS[s.tab] ? s.tab : "to-pdf";
    html.setAttribute("data-tab", tab);
    if (typeof s.viewZoom === "number" && s.viewZoom > 0) {
      html.style.setProperty("--view-zoom", String(s.viewZoom));
    }
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
    sel("imgFormat", s.imgFormat);
    sel("compressQuality", s.compressQuality);
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
    vis("sideMerge", tab === "merge");
    vis("sideSplit", tab === "split");
    vis("sideCompress", tab === "compress");
    vis("sideText", tab === "text");
    vis("idDesk", tab === "id-card");
    vis("textDesk", tab === "text");
    var tabIds = {
      "to-pdf": "tabToPdf",
      "from-pdf": "tabFromPdf",
      "id-card": "tabIdCard",
      merge: "tabMerge",
      split: "tabSplit",
      compress: "tabCompress",
      text: "tabText"
    };
    Object.keys(tabIds).forEach(function (key) {
      var btn = document.getElementById(tabIds[key]);
      if (btn) btn.classList.toggle("on", key === tab);
    });
    var canvas = document.getElementById("canvas");
    var add = document.getElementById("addTile");
    var hint = HINT[tab] || HINT["to-pdf"];
    var ht = document.getElementById("hintTitle");
    var hx = document.getElementById("hintText");
    var cb = document.getElementById("chooseBtn");
    if (ht) ht.textContent = hint[0];
    if (hx) hx.textContent = hint[1];
    if (cb) cb.textContent = hint[2];
    if (tab === "id-card" || tab === "text") {
      vis("emptyHint", false);
      vis("stageStack", false);
      vis("nameBar", false);
      if (canvas) canvas.classList.add("has-pages");
      if (add) add.style.display = "none";
    } else if (add) {
      add.style.display = tab === "to-pdf" || tab === "merge" ? "" : "none";
    }
    function reveal() {
      var sheet = document.getElementById("idSheet");
      var desk = document.getElementById("idDesk");
      if (sheet && desk && tab === "id-card") {
        var PAGE = { a4: [210, 297], letter: [215.9, 279.4], legal: [215.9, 355.6], a5: [148, 210] };
        var CARD = { nid: [85.6, 53.98], bank: [86, 54], passport: [35, 45], licence: [85.6, 54] };
        var size = (document.getElementById("idPageSize") || {}).value || "a4";
        var land = (document.getElementById("idOrientation") || {}).value === "landscape";
        var dim = PAGE[size] || PAGE.a4;
        var pw = land ? dim[1] : dim[0];
        var ph = land ? dim[0] : dim[1];
        var maxW = Math.max(120, (desk.clientWidth || 520) - (desk.clientWidth < 420 ? 16 : 40));
        var maxH = Math.max(160, (desk.clientHeight || 700) - (desk.clientHeight < 420 ? 16 : 36));
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
        var back = document.getElementById("idBackCard");
        var backSlot = back && back.closest(".id-slot");
        if (backSlot) backSlot.style.display = type === "passport" ? "none" : "";
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
