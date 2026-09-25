import * as pdfjsLib from "./vendor/pdf.min.mjs";
import { parsePageRange, imageFormatSpec, renameExt, compressPreset, applyTextOp, generateLorem, textStats, rotateImageBlob, fmtBytes, folioDownloadName, defaultAdj, adjCss, applyAdjToCanvas, estimateJpegPdfBytes } from "./folio-extra.js?v=4";
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", import.meta.url).href;

const { jsPDF } = window.jspdf;
const PDFLib = window.PDFLib;
const PAGE_MM = { a4: [210, 297], letter: [215.9, 279.4], legal: [215.9, 355.6], a5: [148, 210] };
const state = {
  tab: "to-pdf",
  images: [], sel: 0, pdfBlob: null,
  extracted: [], extSel: 0, pdfName: "images", lastPdf: null,
  id: { front: null, back: null, sel: "front" },
  mergeDocs: [], mergeSel: 0,
  workPages: [], workSel: 0, workBytes: null, workPdf: null, workName: "document", workKind: "",
  viewZoom: 1,
  adjAll: false
};

const canvas = document.getElementById("canvas");
const idDesk = document.getElementById("idDesk");
const textDesk = document.getElementById("textDesk");
const textInput = document.getElementById("textInput");
const idFiles = document.getElementById("idFiles");
const CARD_TYPES = {
  nid: { label: "NID Card", w: 85.6, h: 53.98, file: "nid-card" },
  bank: { label: "Bank Card", w: 86, h: 54, file: "bank-card" },
  passport: { label: "Passport photo", w: 35, h: 45, file: "passport-photo" },
  licence: { label: "Driving licence", w: 85.6, h: 54, file: "driving-licence" }
};
function cardMm() {
  const key = document.getElementById("idCardType")?.value || "nid";
  return CARD_TYPES[key] || CARD_TYPES.nid;
}
function cardSizeText(c) {
  return `${Number(c.w.toFixed(1))} × ${Number(c.h.toFixed(1))} mm`;
}
function isPassport() {
  return (document.getElementById("idCardType")?.value || "nid") === "passport";
}
const emptyHint = document.getElementById("emptyHint");
const stageStack = document.getElementById("stageStack");
const nameBar = document.getElementById("nameBar");
const nameBarText = document.getElementById("nameBarText");
const strip = document.getElementById("strip");
const addTile = document.getElementById("addTile");
const files = document.getElementById("files");
const pdfFile = document.getElementById("pdfFile");
const busy = document.getElementById("busy");
const downloadBtn = document.getElementById("downloadBtn");
const downloadAllBtn = document.getElementById("downloadAllBtn");
const downloadThisBtn = document.getElementById("downloadThisBtn");
const downloadEachBtn = document.getElementById("downloadEachBtn");
const shell = document.querySelector(".shell");
const railToggle = document.getElementById("railToggle");
const STORE_KEY = "folio-ui";

function readStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); } catch { return {}; }
}
function writeStore(patch) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...readStore(), ...patch })); } catch {}
}
function saveMenu() {
  writeStore({
    tab: state.tab,
    rail: shell.classList.contains("rail-collapsed"),
    pageSize: document.getElementById("pageSize").value,
    orientation: document.getElementById("orientation").value,
    rotateMatch: document.getElementById("rotateMatch").checked,
    fit: document.getElementById("fit").value,
    margin: document.getElementById("margin").value,
    extractMode: document.getElementById("extractMode").value,
    pageScale: document.getElementById("pageScale").value,
    idSel: state.id.sel,
    idCardType: document.getElementById("idCardType").value,
    idPageSize: document.getElementById("idPageSize").value,
    idOrientation: document.getElementById("idOrientation").value,
    idPlace: document.getElementById("idPlace").value,
    imgFormat: document.getElementById("imgFormat")?.value,
    compressQuality: document.getElementById("compressQuality")?.value,
    loremKind: document.getElementById("loremKind")?.value,
    loremCount: document.getElementById("loremCount")?.value,
    loremWords: document.getElementById("loremWords")?.value,
    loremChars: document.getElementById("loremChars")?.value,
    loremClassic: document.getElementById("loremClassic")?.checked,
    viewZoom: state.viewZoom,
    adjAll: !!state.adjAll
  });
}
function restoreSelect(id, value) {
  const el = document.getElementById(id);
  if (!el || value == null) return;
  if ([...el.options].some(o => o.value === String(value))) el.value = String(value);
}
function restoreMenu() {
  const s = readStore();
  restoreSelect("pageSize", s.pageSize);
  restoreSelect("orientation", s.orientation);
  restoreSelect("fit", s.fit);
  restoreSelect("margin", s.margin);
  restoreSelect("extractMode", s.extractMode);
  restoreSelect("pageScale", s.pageScale);
  restoreSelect("idCardType", s.idCardType);
  restoreSelect("idPageSize", s.idPageSize);
  restoreSelect("idOrientation", s.idOrientation);
  restoreSelect("idPlace", s.idPlace);
  restoreSelect("imgFormat", s.imgFormat);
  restoreSelect("compressQuality", s.compressQuality);
  restoreSelect("loremKind", s.loremKind);
  restoreSelect("loremCount", s.loremCount);
  if (s.loremWords != null && document.getElementById("loremWords")) document.getElementById("loremWords").value = s.loremWords;
  if (s.loremChars != null && document.getElementById("loremChars")) document.getElementById("loremChars").value = s.loremChars;
  if (typeof s.loremClassic === "boolean") {
    const lc = document.getElementById("loremClassic");
    if (lc) lc.checked = s.loremClassic;
  }
  syncLoremLabels();
  if (typeof s.rotateMatch === "boolean") document.getElementById("rotateMatch").checked = s.rotateMatch;
  if (s.idSel === "front" || s.idSel === "back") {
    state.id.sel = s.idSel;
    restoreSelect("idSide", s.idSel);
  }
  if (typeof s.viewZoom === "number" && s.viewZoom > 0) state.viewZoom = s.viewZoom;
  if (typeof s.adjAll === "boolean") state.adjAll = s.adjAll;
}

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("folio-idcard", 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("desk")) req.result.createObjectStore("desk");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function packIdSlot(slot) {
  if (!slot) return null;
  return {
    blob: slot.file,
    name: slot.name,
    w: slot.w, h: slot.h,
    rot: slot.rot, tilt: slot.tilt, zoom: slot.zoom, x: slot.x, y: slot.y
  };
}
function unpackIdSlot(pack) {
  if (!pack?.blob) return null;
  const file = pack.blob instanceof File
    ? pack.blob
    : new File([pack.blob], pack.name || "card.jpg", { type: pack.blob.type || "image/jpeg" });
  return {
    file,
    url: URL.createObjectURL(file),
    name: pack.name || file.name,
    w: pack.w, h: pack.h,
    rot: pack.rot || 0, tilt: pack.tilt || 0, zoom: pack.zoom || 1, x: pack.x || 0, y: pack.y || 0
  };
}
async function saveIdCard() {
  try {
    const db = await idbOpen();
    const tx = db.transaction("desk", "readwrite");
    tx.objectStore("desk").put({
      sel: state.id.sel,
      front: packIdSlot(state.id.front),
      back: packIdSlot(state.id.back)
    }, "current");
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    db.close();
  } catch {}
}
let idSaveTimer = 0;
function scheduleIdSave() {
  clearTimeout(idSaveTimer);
  idSaveTimer = setTimeout(() => saveIdCard(), 280);
}
async function loadIdCard() {
  try {
    const db = await idbOpen();
    const tx = db.transaction("desk", "readonly");
    const req = tx.objectStore("desk").get("current");
    const data = await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => rej(req.error);
    });
    db.close();
    if (!data) return;
    if (state.id.front) URL.revokeObjectURL(state.id.front.url);
    if (state.id.back) URL.revokeObjectURL(state.id.back.url);
    let front = data.front, back = data.back;
    if (Array.isArray(data.people) && data.people.length) {
      const i = Math.min(data.person || 0, data.people.length - 1);
      const cur = data.people[i] || data.people[0];
      front = cur.front;
      back = cur.back;
    }
    state.id.front = unpackIdSlot(front);
    state.id.back = unpackIdSlot(back);
    if (data.sel === "front" || data.sel === "back") state.id.sel = data.sel;
  } catch {}
}

function setRailCollapsed(on, persist = true) {
  document.documentElement.classList.toggle("rail-collapsed", on);
  shell.classList.toggle("rail-collapsed", on);
  railToggle.setAttribute("aria-expanded", String(!on));
  railToggle.setAttribute("aria-label", on ? "Expand" : "Collapse");
  railToggle.title = on ? "Expand" : "Collapse";
  if (persist) saveMenu();
}
railToggle.onclick = () => setRailCollapsed(!shell.classList.contains("rail-collapsed"));

function setStatus(msg) {
  if (state.tab === "text") {
    const { chars, words, lines } = textStats(textInput?.value || "");
    const el = document.getElementById("textNote");
    if (el) el.textContent = msg
      ? `${words} words · ${chars} characters · ${lines} lines · ${msg}`
      : `${words} word${words === 1 ? "" : "s"} · ${chars} character${chars === 1 ? "" : "s"} · ${lines} line${lines === 1 ? "" : "s"}`;
    return;
  }
  const map = {
    "to-pdf": "status",
    "from-pdf": "extractNote",
    "id-card": "idStatus",
    merge: "mergeNote",
    split: "splitNote",
    organize: "orgNote",
    compress: "compressNote",
    text: "textNote"
  };
  const el = document.getElementById(map[state.tab] || "status");
  if (el && msg) el.textContent = msg;
}
function setBusy(on) { busy.classList.toggle("on", on); }
const ZOOM_MIN = 0.5, ZOOM_MAX = 2.5, ZOOM_STEP = 0.1;
function applyViewZoom() {
  const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(state.viewZoom) || 1));
  state.viewZoom = Math.round(z * 100) / 100;
  document.documentElement.style.setProperty("--view-zoom", String(state.viewZoom));
  const label = document.getElementById("zoomVal");
  if (label) label.textContent = Math.round(state.viewZoom * 100) + "%";
  const zOut = document.getElementById("zoomOut");
  const zIn = document.getElementById("zoomIn");
  if (zOut) zOut.disabled = state.viewZoom <= ZOOM_MIN + 0.001;
  if (zIn) zIn.disabled = state.viewZoom >= ZOOM_MAX - 0.001;
  const bar = document.getElementById("zoomBar");
  if (bar) bar.classList.toggle("lift", nameBar && !nameBar.classList.contains("hidden"));
  if (textInput) textInput.style.fontSize = "";
  if (state.tab === "id-card") {
    syncIdSheet();
    applyIdCard("front");
    applyIdCard("back");
  }
}
function setViewZoom(z, persist = true) {
  state.viewZoom = z;
  applyViewZoom();
  if (persist) saveMenu();
  queueSharp(sel());
}
function bumpViewZoom(delta) {
  setViewZoom(state.viewZoom + delta);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
}
function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
const hist = { stack: [], i: -1, mute: false };
function cloneAdj(a) {
  return { brightness: a.brightness, contrast: a.contrast, saturate: a.saturate, sharpness: a.sharpness, gray: !!a.gray, bw: !!a.bw, bg: a.bg || "#ffffff" };
}
function snapshot() {
  return {
    images: state.images.map(it => ({ ...it, adj: cloneAdj(it.adj || defaultAdj()) })),
    sel: state.sel,
    extracted: state.extracted.slice(),
    extSel: state.extSel,
    mergeDocs: state.mergeDocs.slice(),
    mergeSel: state.mergeSel,
    workPages: state.workPages.map(p => ({ ...p })),
    workSel: state.workSel,
    workBytes: state.workBytes,
    workPdf: state.workPdf,
    workName: state.workName,
    workKind: state.workKind,
    idFront: state.id.front,
    idBack: state.id.back,
    idSel: state.id.sel,
    text: textInput ? textInput.value : "",
    adjAll: !!state.adjAll
  };
}
function restoreSnap(s) {
  hist.mute = true;
  state.images = (s.images || []).map(it => ({ ...it, adj: cloneAdj(it.adj || defaultAdj()) }));
  state.sel = s.sel;
  state.extracted = s.extracted.slice();
  state.extSel = s.extSel;
  state.mergeDocs = s.mergeDocs.slice();
  state.mergeSel = s.mergeSel;
  state.workPages = s.workPages.map(p => ({ ...p }));
  state.workSel = s.workSel;
  state.workBytes = s.workBytes;
  state.workPdf = s.workPdf;
  state.workName = s.workName;
  state.workKind = s.workKind;
  state.id.front = s.idFront;
  state.id.back = s.idBack;
  state.id.sel = s.idSel;
  state.pdfBlob = null;
  state.adjAll = !!s.adjAll;
  if (textInput && s.text != null) textInput.value = s.text;
  const all = document.getElementById("adjAll");
  if (all) all.checked = state.adjAll;
  syncAdjUi();
  applyAdjPreview();
  rebuildStrip();
  renderStage();
  syncSizeMeter();
  hist.mute = false;
  syncHistBtns();
}
function pushHist() {
  if (hist.mute) return;
  hist.stack = hist.stack.slice(0, hist.i + 1);
  hist.stack.push(snapshot());
  if (hist.stack.length > 40) hist.stack.shift();
  hist.i = hist.stack.length - 1;
  syncHistBtns();
}
function undo() {
  if (hist.i <= 0) return;
  hist.i -= 1;
  restoreSnap(hist.stack[hist.i]);
  setStatus("Undone.");
}
function redo() {
  if (hist.i >= hist.stack.length - 1) return;
  hist.i += 1;
  restoreSnap(hist.stack[hist.i]);
  setStatus("Redone.");
}
function syncHistBtns() {
  const u = document.getElementById("undoBtn");
  const r = document.getElementById("redoBtn");
  if (u) u.disabled = hist.i <= 0;
  if (r) r.disabled = hist.i < 0 || hist.i >= hist.stack.length - 1;
  document.getElementById("zoomBar")?.classList.toggle("has-hist", hist.i > 0 || (hist.stack.length > 1 && hist.i < hist.stack.length - 1));
}
function sourceBytes() {
  if (state.tab === "to-pdf") return state.images.reduce((n, i) => n + (i.file?.size || 0), 0);
  if (state.tab === "from-pdf") return state.lastPdf?.size || 0;
  if (state.tab === "merge") return state.mergeDocs.reduce((n, d) => n + (d.bytes?.byteLength || d.file?.size || 0), 0);
  if (state.tab === "split" || state.tab === "compress" || state.tab === "organize") {
    const seen = new Set();
    let n = 0;
    if (state.workBytes) { seen.add(state.workBytes); n += state.workBytes.byteLength; }
    state.workPages.forEach(p => {
      const b = p.bytes;
      if (b && !seen.has(b)) { seen.add(b); n += b.byteLength; }
      else if (!b) n += p.file?.size || p.blob?.size || 0;
    });
    return n;
  }
  if (state.tab === "id-card") return (state.id.front?.file?.size || 0) + (state.id.back?.file?.size || 0);
  if (state.tab === "text") return new Blob([textInput?.value || ""]).size;
  return 0;
}
function estimateOutBytes() {
  if (state.tab === "to-pdf") {
    if (state.pdfBlob) return state.pdfBlob.size;
    const n = state.images.length;
    if (!n) return 0;
    const size = document.getElementById("pageSize").value;
    const dim = PAGE_MM[size] || PAGE_MM.a4;
    const land = document.getElementById("orientation").value === "landscape";
    const margin = Number(document.getElementById("margin").value) || 0;
    const w = (land ? dim[1] : dim[0]) - margin * 2;
    const h = (land ? dim[0] : dim[1]) - margin * 2;
    return estimateJpegPdfBytes(n, w, h, 144, 0.82);
  }
  if (state.tab === "from-pdf") {
    const n = state.extracted.length;
    if (!n) return 0;
    const spec = imageFormatSpec();
    const avg = state.extracted.reduce((s, it) => s + (it.blob?.size || 0), 0) / n;
    const factor = spec.ext === "jpg" ? 0.55 : spec.ext === "webp" ? 0.45 : 1;
    return Math.round(n * avg * factor);
  }
  if (state.tab === "merge") return Math.round(sourceBytes() * 1.02);
  if (state.tab === "split") {
    const nums = typeof splitPageNums === "function" ? splitPageNums() : [];
    const total = state.workPages.length || 1;
    return Math.round(sourceBytes() * (nums.length / total));
  }
  if (state.tab === "organize") return state.workPages.length ? Math.round(sourceBytes() * 1.01) : 0;
  if (state.tab === "compress") {
    const q = document.getElementById("compressQuality")?.value;
    const f = q === "low" ? 0.38 : q === "high" ? 0.78 : 0.55;
    return Math.round(sourceBytes() * f);
  }
  if (state.tab === "id-card") {
    const has = !!(state.id.front || state.id.back);
    return has ? estimateJpegPdfBytes(1, 210, 297, 150, 0.9) : 0;
  }
  if (state.tab === "text") return sourceBytes();
  return 0;
}
function syncSizeMeter() {
  const src = fmtBytes(sourceBytes());
  const out = fmtBytes(estimateOutBytes());
  document.querySelectorAll("[data-size=src]").forEach(el => { el.textContent = src; });
  document.querySelectorAll("[data-size=out]").forEach(el => { el.textContent = out; });
}
function syncAdjUi() {
  const on = state.tab === "to-pdf" && state.images.length > 0;
  document.documentElement.classList.toggle("folio-img-on", on);
  const panel = document.getElementById("imgAdjust");
  if (panel) {
    panel.hidden = !on;
    panel.classList.toggle("hidden", !on);
  }
  if (!on) return;
  const a = currentAdj();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  const lab = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  set("adjBright", a.brightness);
  set("adjContrast", a.contrast);
  set("adjSaturate", a.saturate);
  set("adjSharp", a.sharpness);
  lab("adjBrightVal", a.brightness + "%");
  lab("adjContrastVal", a.contrast + "%");
  lab("adjSaturateVal", a.saturate + "%");
  lab("adjSharpVal", String(a.sharpness));
  const g = document.getElementById("adjGray");
  const bw = document.getElementById("adjBw");
  if (g) g.checked = !!a.gray;
  if (bw) bw.checked = !!a.bw;
  document.querySelectorAll("#adjBg [data-bg]").forEach(btn => {
    btn.classList.toggle("on", btn.getAttribute("data-bg") === a.bg);
  });
  const all = document.getElementById("adjAll");
  if (all) all.checked = !!state.adjAll;
}
function itemAdj(item) {
  return item?.adj ? item.adj : defaultAdj();
}
function currentAdj() {
  return itemAdj(state.images[state.sel]);
}
function adjTargets() {
  if (!state.images.length) return [];
  if (state.adjAll) return state.images;
  const item = state.images[state.sel];
  return item ? [item] : [];
}
function writeAdj(patch) {
  adjTargets().forEach(item => {
    item.adj = { ...defaultAdj(), ...(item.adj || {}), ...patch };
  });
}
function paintAdj(el, item) {
  if (!el) return;
  const a = itemAdj(item);
  el.style.filter = adjCss(a);
  const page = el.closest?.(".stage-page");
  if (page) page.style.background = a.bg || "#ffffff";
}
function applyAdjPreview() {
  if (state.tab !== "to-pdf") return;
  const list = state.images;
  stageStack.querySelectorAll(".stage-sheet").forEach((sheet, i) => {
    const item = list[i];
    const img = sheet.querySelector("img");
    const page = sheet.querySelector(".stage-page");
    if (!item || !img) return;
    img.style.filter = adjCss(itemAdj(item));
    if (page) page.style.background = itemAdj(item).bg || "#ffffff";
  });
  strip.querySelectorAll(".shot img").forEach((img, i) => {
    const item = list[i];
    if (item) img.style.filter = adjCss(itemAdj(item));
  });
}
function commitAdj(push) {
  if (push) pushHist();
  state.pdfBlob = null;
  applyAdjPreview();
  syncSizeMeter();
  saveMenu();
}
function dropCopyFor(tab) {
  if (tab === "to-pdf") return ["Drop images to make a PDF", "PNG · JPG · WEBP"];
  if (tab === "from-pdf") return ["Drop a PDF", "Each page becomes an image"];
  if (tab === "merge") return ["Drop PDFs to merge", "Several files, one PDF out"];
  if (tab === "split") return ["Drop a PDF to split", "Pick pages after it opens"];
  if (tab === "organize") return ["Drop a PDF to organize", "Sort, add, or delete pages"];
  if (tab === "compress") return ["Drop a PDF or photos", "Then pick quality"];
  if (tab === "id-card") return ["Drop card photos", "Front and back on one sheet"];
  if (tab === "text") return ["Drop a text file", "TXT · MD · CSV"];
  return ["Drop files", "They stay on this device"];
}
function showDrop(on) {
  const overlay = document.getElementById("dropOverlay");
  const [title, sub] = dropCopyFor(state.tab);
  const t = document.getElementById("dropTitle");
  const s = document.getElementById("dropSub");
  if (t) t.textContent = title;
  if (s) s.textContent = sub;
  document.body.classList.toggle("folio-drop", on);
  canvas.classList.toggle("drop-on", on);
  if (overlay) overlay.hidden = !on;
}
function imagesPdfName() {
  const n = state.images.length;
  const base = state.images[0]?.name || "images";
  return folioDownloadName("images", base, n > 1 ? n + "p" : "", "pdf");
}
function primaryDownload() {
  const map = {
    "to-pdf": "downloadBtn",
    "from-pdf": "downloadAllBtn",
    merge: "mergeDlBtn",
    split: "splitDlBtn",
    organize: "orgDlBtn",
    compress: "compressDlBtn",
    "id-card": "idPdfBtn",
    text: "textDlBtn"
  };
  document.getElementById(map[state.tab])?.click();
}
function toggleKeys(on) {
  const sheet = document.getElementById("keysSheet");
  if (!sheet) return;
  const show = on == null ? sheet.classList.contains("hidden") : on;
  sheet.classList.toggle("hidden", !show);
  sheet.hidden = !show;
}

function printBlob(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) return reject(new Error("Nothing to print"));
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(url);
        resolve();
      }, 1200);
    };
    iframe.onload = () => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        done();
      } catch (e) { reject(e); }
    };
    document.body.appendChild(iframe);
    iframe.src = url;
    setTimeout(done, 8000);
  });
}
function printHtml(title, inner, after) {
  const w = window.open("", "_blank");
  if (!w) {
    setStatus("Allow pop-ups to print.");
    return;
  }
  w.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title><style>
    html,body{margin:0;background:#fff;color:#111}
    img{display:block;max-width:100%;max-height:100vh;margin:0 auto;page-break-after:always;object-fit:contain}
    img:last-child{page-break-after:auto}
    pre{white-space:pre-wrap;word-wrap:break-word;margin:0;padding:18mm;font:14pt/1.55 "Segoe UI",Georgia,serif}
    @page{margin:10mm}
  </style></head><body>${inner}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); if (after) after(); }, 350);
}

const TAB_META = {
  "to-pdf": { side: "sideToPdf", tab: "tabToPdf", hint: ["Drop images onto the desk", "They become PDF pages. Scroll the middle to read the full document in order.", "Open images"] },
  "from-pdf": { side: "sideFromPdf", tab: "tabFromPdf", hint: ["Drop a PDF onto the desk", "Each page becomes an image. Scroll the middle to see every page in order.", "Open PDF"] },
  merge: { side: "sideMerge", tab: "tabMerge", hint: ["Drop PDFs to merge", "Add several files, then drag the strip to set order.", "Add PDFs"] },
  split: { side: "sideSplit", tab: "tabSplit", hint: ["Drop a PDF to split", "Type a range or click thumbs to pick pages.", "Open PDF"] },
  organize: { side: "sideOrganize", tab: "tabOrganize", hint: ["Drop a PDF to organize", "Drag the strip to sort pages. Add or delete pages, then download.", "Open PDF"] },
  compress: { side: "sideCompress", tab: "tabCompress", hint: ["Drop a PDF or images", "Choose quality, then download a smaller file.", "Open files"] },
  text: { side: "sideText", tab: "tabText", hint: ["Type or paste text", "Generate Lorem Ipsum, change case, copy, or download. Nothing is uploaded.", "Open files"] },
  "id-card": { side: "sideIdCard", tab: "tabIdCard", hint: ["Drop card photos", "Front on top, back below.", "Open photo"] }
};

function setTab(tab) {
  if (!TAB_META[tab]) return;
  state.tab = tab;
  document.documentElement.setAttribute("data-tab", tab);
  Object.entries(TAB_META).forEach(([key, meta]) => {
    document.getElementById(meta.tab)?.classList.toggle("on", key === tab);
    document.getElementById(meta.side)?.classList.toggle("hidden", key !== tab);
  });
  idDesk.classList.toggle("hidden", tab !== "id-card");
  textDesk?.classList.toggle("hidden", tab !== "text");
  if (tab === "text") {
    emptyHint.classList.add("hidden");
    stageStack.classList.add("hidden");
    canvas.classList.add("has-pages");
    canvas.classList.remove("spread");
    stageStack.classList.remove("spread");
    nameBar.classList.add("hidden");
    addTile.style.display = "none";
    rebuildStrip();
    syncTextStats();
    applyViewZoom();
    saveMenu();
    textInput?.focus();
    syncSizeMeter();
    return;
  }
  if (tab === "id-card") {
    emptyHint.classList.add("hidden");
    stageStack.classList.add("hidden");
    canvas.classList.add("has-pages");
    canvas.classList.remove("spread");
    stageStack.classList.remove("spread");
    nameBar.classList.add("hidden");
    addTile.style.display = "none";
    rebuildStrip();
    renderIdDesk();
    applyViewZoom();
    saveMenu();
    syncSizeMeter();
    return;
  }
  const hint = TAB_META[tab]?.hint || TAB_META["to-pdf"].hint;
  document.getElementById("hintTitle").textContent = hint[0];
  document.getElementById("hintText").textContent = hint[1];
  document.getElementById("chooseBtn").textContent = hint[2];
  addTile.style.display = tab === "to-pdf" || tab === "merge" || tab === "organize" ? "" : "none";
  rebuildStrip();
  renderStage();
  saveMenu();
  syncSizeMeter();
}
document.querySelector(".rail-nav").addEventListener("click", e => {
  const btn = e.target.closest("button[data-tab]");
  if (!btn) return;
  e.preventDefault();
  setTab(btn.getAttribute("data-tab"));
});

function syncRotateField() {
  const land = document.getElementById("orientation").value === "landscape";
  document.getElementById("orientRow").classList.toggle("portrait-only", !land);
}
function idPlace() {
  return document.getElementById("idPlace")?.value === "top" ? "top" : "center";
}
function idStackY(pageH, totalH) {
  return idPlace() === "top" ? 10 : (pageH - totalH) / 2;
}
function idPageMm() {
  const size = document.getElementById("idPageSize")?.value || "a4";
  const orientation = document.getElementById("idOrientation")?.value === "landscape" ? "landscape" : "portrait";
  let [w, h] = PAGE_MM[size];
  if (orientation === "landscape") [w, h] = [h, w];
  return { size, orientation, w, h };
}
function syncIdSheet() {
  const page = idPageMm();
  const card = cardMm();
  const sheet = document.getElementById("idSheet");
  const desk = document.getElementById("idDesk");
  if (!sheet) return;
  const deskW = desk?.clientWidth || 520;
  const deskH = desk?.clientHeight || 700;
  const padX = deskW < 420 ? 16 : 40;
  const padY = deskH < 420 ? 16 : 36;
  const maxW = Math.max(120, deskW - padX);
  const maxH = Math.max(160, deskH - padY);
  const pxPerMm = 2.2;
  let wpx = page.w * pxPerMm;
  let hpx = page.h * pxPerMm;
  const fit = Math.min(1, maxW / wpx, maxH / hpx) * (state.viewZoom || 1);
  wpx = Math.round(wpx * fit);
  hpx = Math.round(hpx * fit);
  sheet.style.width = wpx + "px";
  sheet.style.height = hpx + "px";
  sheet.classList.toggle("pos-top", idPlace() === "top");
  sheet.classList.toggle("pos-center", idPlace() !== "top");
  const pct = (card.w / page.w) * 100;
  const ratio = `${card.w} / ${card.h}`;
  sheet.querySelectorAll(".id-card").forEach(el => {
    el.style.width = pct + "%";
    el.style.aspectRatio = ratio;
  });
  const label = document.getElementById("idSheetLabel");
  if (label) {
    const orient = page.orientation === "landscape" ? "Landscape" : "Portrait";
    label.textContent = `${page.size.toUpperCase()} · ${orient} · ${Number(page.w.toFixed(1))} × ${Number(page.h.toFixed(1))} mm`;
  }
  sheet.querySelectorAll(".page-tag").forEach((tag, i) => {
    tag.textContent = `${i ? "Back" : "Front"} · ${cardSizeText(card)}`;
  });
  const backSlot = document.getElementById("idBackCard")?.closest(".id-slot");
  if (backSlot) backSlot.style.display = isPassport() ? "none" : "";
}
function pageLayout(item) {
  const size = document.getElementById("pageSize").value;
  const orientation = (item && item.orient) || document.getElementById("orientation").value;
  const fit = document.getElementById("fit").value;
  const margin = Number(document.getElementById("margin").value);
  let [w, h] = PAGE_MM[size];
  if (orientation === "landscape") [w, h] = [h, w];
  return { size, fit, w, h, padX: (margin / w) * 100, padY: (margin / h) * 100, orientation };
}

function items() {
  if (state.tab === "to-pdf") return state.images;
  if (state.tab === "from-pdf") return state.extracted;
  if (state.tab === "merge") return state.mergeDocs;
  if (state.tab === "split" || state.tab === "compress" || state.tab === "organize") return state.workPages;
  return [];
}
function sel() {
  if (state.tab === "to-pdf") return state.sel;
  if (state.tab === "from-pdf") return state.extSel;
  if (state.tab === "merge") return state.mergeSel;
  return state.workSel;
}
function setSel(i) {
  if (state.tab === "to-pdf") state.sel = i;
  else if (state.tab === "from-pdf") state.extSel = i;
  else if (state.tab === "merge") state.mergeSel = i;
  else state.workSel = i;
}

function idCardEl(side) {
  return document.getElementById(side === "back" ? "idBackCard" : "idFrontCard");
}
function idSlot() { return state.id[state.id.sel]; }
function idCover(slot, cw, ch) {
  const r = ((slot.rot % 360) + 360) % 360;
  const swap = r === 90 || r === 270;
  const tw = swap ? slot.h : slot.w;
  const th = swap ? slot.w : slot.h;
  return Math.max(cw / tw, ch / th);
}
function applyIdCard(side) {
  const card = idCardEl(side);
  const slot = state.id[side];
  const img = card.querySelector("img");
  const xBtn = card.querySelector(".page-x");
  card.classList.toggle("empty", !slot);
  card.classList.toggle("on", state.id.sel === side && !!slot);
  if (xBtn) xBtn.style.display = slot ? "" : "none";
  if (!slot) {
    img.removeAttribute("src");
    img.style.display = "none";
    return;
  }
  img.style.display = "block";
  if (img.getAttribute("src") !== slot.url) img.src = slot.url;
  const layout = () => {
    const cw = card.clientWidth, ch = card.clientHeight;
    if (!cw || !ch) return;
    const s = idCover(slot, cw, ch) * slot.zoom;
    const ang = slot.rot + slot.tilt;
    img.style.width = slot.w + "px";
    img.style.height = slot.h + "px";
    img.style.left = "0";
    img.style.top = "0";
    img.style.transformOrigin = "0 0";
    img.style.transform = `translate(${cw / 2 + slot.x}px, ${ch / 2 + slot.y}px) rotate(${ang}deg) scale(${s}) translate(${-slot.w / 2}px, ${-slot.h / 2}px)`;
  };
  if (img.naturalWidth) layout();
  else img.onload = layout;
}
function renderIdDesk() {
  emptyHint.classList.add("hidden");
  stageStack.classList.add("hidden");
  canvas.classList.add("has-pages");
  syncIdSheet();
  applyIdCard("front");
  applyIdCard("back");
  const ready = !!(state.id.front || state.id.back);
  document.getElementById("idPdfBtn").disabled = !ready;
  const idPrint = document.getElementById("idPrintBtn");
  if (idPrint) idPrint.disabled = !ready;
  document.getElementById("idPngBtn").disabled = !ready;
  syncIdControls();
  requestAnimationFrame(() => {
    applyIdCard("front");
    applyIdCard("back");
  });
}
function syncIdControls() {
  document.getElementById("idSide").value = state.id.sel;
  const slot = idSlot();
  const tilt = document.getElementById("idTilt");
  const zoom = document.getElementById("idZoom");
  tilt.disabled = zoom.disabled = !slot;
  tilt.value = slot ? slot.tilt : 0;
  zoom.value = slot ? Math.round(slot.zoom * 100) : 100;
  document.getElementById("idTiltVal").textContent = `${tilt.value}°`;
  document.getElementById("idZoomVal").textContent = `${zoom.value}%`;
  nameBar.classList.add("hidden");
}
function markIdSel() {
  applyIdCard("front");
  applyIdCard("back");
  syncIdControls();
  [...strip.querySelectorAll(".shot")].forEach((s, i) => s.classList.toggle("on", (i === 0 ? "front" : "back") === state.id.sel));
}
async function setIdSlot(side, file) {
  const url = URL.createObjectURL(file);
  const bmp = await createImageBitmap(file);
  const w = bmp.width, h = bmp.height;
  bmp.close();
  state.id[side] = { file, url, name: file.name, w, h, rot: w < h ? 90 : 0, tilt: 0, zoom: 1, x: 0, y: 0 };
  state.id.sel = side;
}
async function addIdFiles(list) {
  const imgs = [...list].filter(f => f.type.startsWith("image/"));
  if (!imgs.length) return;
  pushHist();
  idFiles.value = "";
  if (isPassport()) {
    await setIdSlot("front", imgs[0]);
  } else if (imgs.length >= 2) {
    await setIdSlot("front", imgs[0]);
    await setIdSlot("back", imgs[1]);
  } else {
    const side = !state.id.front ? "front" : (!state.id.back ? "back" : state.id.sel);
    await setIdSlot(side, imgs[0]);
  }
  rebuildStrip();
  renderIdDesk();
  setStatus("Drag to crop. Scroll to zoom. Rotate if the phone photo is sideways.");
  scheduleIdSave();
}
function clearIdSide(side) {
  const prev = state.id[side];
  if (prev) URL.revokeObjectURL(prev.url);
  state.id[side] = null;
  if (!state.id.front && !state.id.back) state.id.sel = "front";
  else if (!state.id[state.id.sel]) state.id.sel = state.id.front ? "front" : "back";
  rebuildStrip();
  renderIdDesk();
  setStatus(state.id.front || state.id.back ? "Fit the remaining side, then download." : "Open front and back photos.");
  scheduleIdSave();
}
function bumpId(side, patch) {
  const slot = state.id[side];
  if (!slot) return;
  Object.assign(slot, patch);
  applyIdCard(side);
  syncIdControls();
}

async function rasterIdSlot(slot, pxW, pxH) {
  const bmp = await createImageBitmap(slot.file);
  const cnv = document.createElement("canvas");
  cnv.width = pxW;
  cnv.height = pxH;
  const ctx = cnv.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, pxW, pxH);
  const card = idCardEl(slot === state.id.back ? "back" : "front");
  const mm = cardMm();
  const cw = Math.max(1, card.clientWidth || 460);
  const ch = Math.max(1, card.clientHeight || Math.round(460 * mm.h / mm.w));
  const k = pxW / cw;
  const s = idCover(slot, cw, ch) * slot.zoom * k;
  ctx.save();
  ctx.translate(pxW / 2 + slot.x * k, pxH / 2 + slot.y * k);
  ctx.rotate((slot.rot + slot.tilt) * Math.PI / 180);
  ctx.scale(s, s);
  ctx.drawImage(bmp, -slot.w / 2, -slot.h / 2);
  ctx.restore();
  bmp.close();
  return cnv;
}
async function makeIdPairCanvas(dpi) {
  const page = idPageMm();
  const mm = cardMm();
  const passport = isPassport();
  const gap = Math.round(8 / 25.4 * dpi);
  const pxW = Math.round(mm.w / 25.4 * dpi);
  const pxH = Math.round(mm.h / 25.4 * dpi);
  const out = document.createElement("canvas");
  out.width = Math.round(page.w / 25.4 * dpi);
  out.height = Math.round(page.h / 25.4 * dpi);
  const ctx = out.getContext("2d", { alpha: false });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.width, out.height);
  const x = Math.round((out.width - pxW) / 2);
  const sides = passport ? ["front"] : ["front", "back"];
  const totalH = pxH * sides.length + gap * (sides.length - 1);
  const y0 = Math.round(idPlace() === "top" ? 10 / 25.4 * dpi : (out.height - totalH) / 2);
  for (let i = 0; i < sides.length; i++) {
    const slot = state.id[sides[i]];
    const y = y0 + i * (pxH + gap);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = Math.max(1, Math.round(pxW / 400));
    if (slot) {
      const cnv = await rasterIdSlot(slot, pxW, pxH);
      ctx.drawImage(cnv, x, y);
    } else {
      ctx.fillStyle = "#f4f4f2";
      ctx.fillRect(x, y, pxW, pxH);
    }
    ctx.strokeRect(x + 0.5, y + 0.5, pxW - 1, pxH - 1);
  }
  return out;
}
async function makeIdPdfBlob() {
  if (!state.id.front && !state.id.back) return null;
  const dpi = 220;
  const page = idPageMm();
  const doc = new jsPDF({ orientation: page.orientation, unit: "mm", format: page.size, compress: true });
  const mm = cardMm();
  const gap = 8;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const x = (pageW - mm.w) / 2;
  const passport = mm.file === "passport-photo";
  const sides = passport ? ["front"] : ["front", "back"];
  const totalH = mm.h * sides.length + gap * (sides.length - 1);
  const y0 = idStackY(pageH, totalH);
  const pxW = Math.round(mm.w / 25.4 * dpi);
  const pxH = Math.round(mm.h / 25.4 * dpi);
  for (let i = 0; i < sides.length; i++) {
    const slot = state.id[sides[i]];
    const y = y0 + i * (mm.h + gap);
    if (slot) {
      const cnv = await rasterIdSlot(slot, pxW, pxH);
      doc.addImage(cnv.toDataURL("image/jpeg", 0.9), "JPEG", x, y, mm.w, mm.h, undefined, "FAST");
    }
    doc.setDrawColor(17);
    doc.setLineWidth(0.2);
    doc.rect(x, y, mm.w, mm.h);
  }
  return {
    blob: doc.output("blob"),
    name: folioDownloadName(mm.file, mm.file, "", "pdf"),
    label: mm.label
  };
}
async function downloadIdPdf() {
  setBusy(true);
  try {
    const out = await makeIdPdfBlob();
    if (!out) return;
    downloadBlob(out.blob, out.name);
    setStatus(`PDF downloaded · ${out.label}.`);
  } catch (e) {
    setStatus("Could not create PDF: " + e.message);
  } finally { setBusy(false); }
}
async function downloadIdPng() {
  if (!state.id.front && !state.id.back) return;
  setBusy(true);
  try {
    const mm = cardMm();
    const out = await makeIdPairCanvas(220);
    const blob = await new Promise(res => out.toBlob(res, "image/png"));
    downloadBlob(blob, folioDownloadName(mm.file, mm.file, "", "png"));
    setStatus(`PNG downloaded · ${mm.label} ${cardSizeText(mm)}.`);
  } catch (e) {
    setStatus("Could not create PNG: " + e.message);
  } finally { setBusy(false); }
}

function extraTurn(item) {
  return (((Number(item?.turn) || 0) % 360) + 360) % 360;
}
function visDeg(autoRot, turn) {
  return (autoRot ? -90 : 0) + (turn || 0);
}
function visSwap(deg) {
  return Math.abs(((deg % 180) + 180) % 180 - 90) < 1;
}
function visOrient(item) {
  if (state.tab === "to-pdf") {
    return item?.orient || document.getElementById("orientation").value || "portrait";
  }
  const t = extraTurn(item);
  let w = item?.w, h = item?.h;
  if ((t === 90 || t === 270) && w && h) [w, h] = [h, w];
  if (w && h) return w >= h ? "landscape" : "portrait";
  return (t === 90 || t === 270) ? "landscape" : "portrait";
}
function setVisOrient(item, orient) {
  if (state.tab === "to-pdf") {
    item.orient = orient;
    return;
  }
  const nativeLand = (item.w || 0) >= (item.h || 1);
  item.turn = nativeLand === (orient === "landscape") ? 0 : 90;
}
function syncOrientChip(page, item) {
  const btn = page?.querySelector(".page-orient");
  if (!btn) return;
  const o = visOrient(item);
  const label = o === "landscape" ? "Landscape" : "Portrait";
  btn.dataset.orient = o;
  btn.title = `${label} — click to change this page`;
  btn.setAttribute("aria-label", `Page orientation ${label}`);
  const span = btn.querySelector("span");
  if (span) span.textContent = label;
}
function applyShotTurn(img, item) {
  if (!img) return;
  const t = extraTurn(item);
  img.style.transform = t ? `rotate(${t}deg)` : "";
}
function flipOrientAt(i) {
  const item = items()[i];
  if (!item) return;
  pushHist();
  setVisOrient(item, visOrient(item) === "landscape" ? "portrait" : "landscape");
  state.pdfBlob = null;
  const page = stageStack.querySelectorAll(".stage-page")[i];
  if (page) applyPageBox(page, pageLayout(item), item);
  applyShotTurn(strip.querySelectorAll(".shot img")[i], item);
}
function addPdfTurn(page, turn) {
  const t = extraTurn({ turn });
  if (!t || !page?.setRotation) return;
  const cur = page.getRotation?.()?.angle || 0;
  page.setRotation(PDFLib.degrees((((cur + t) % 360) + 360) % 360));
}

function needsRotate(imgW, imgH, pageW, pageH) {
  if (!document.getElementById("rotateMatch")?.checked) return false;
  if (!imgW || !imgH || !pageW || !pageH) return false;
  return (imgW >= imgH) !== (pageW >= pageH);
}

function bestFitFor(imgW, imgH, pageW, pageH) {
  const rot = needsRotate(imgW, imgH, pageW, pageH);
  const iw = rot ? imgH : imgW;
  const ih = rot ? imgW : imgH;
  const gap = Math.abs((iw / Math.max(ih, 1)) / (pageW / pageH) - 1);
  return gap < 0.12 ? "cover" : "contain";
}

function placeImg(img, L, autoRot, turn = 0) {
  if (!img) return;
  const deg = visDeg(autoRot, turn);
  const swap = visSwap(deg);
  img.style.position = "absolute";
  img.style.left = "50%";
  img.style.top = "50%";
  img.style.objectFit = L.fit === "cover" ? "cover" : "contain";
  if (swap) {
    img.style.width = `${(L.h / L.w) * 100}%`;
    img.style.height = `${(L.w / L.h) * 100}%`;
  } else {
    img.style.width = "100%";
    img.style.height = "100%";
  }
  img.style.transform = deg ? `translate(-50%, -50%) rotate(${deg}deg)` : "translate(-50%, -50%)";
}

function applyPageFrame(page, L, item) {
  if (state.tab !== "to-pdf") {
    const img = page.querySelector("img");
    let w = item?.w || img?.naturalWidth;
    let h = item?.h || img?.naturalHeight;
    const turn = extraTurn(item);
    if ((turn === 90 || turn === 270) && w && h) [w, h] = [h, w];
    page.style.padding = "0";
    page.style.border = "1px solid #111";
    page.style.aspectRatio = w && h ? `${w} / ${h}` : "210 / 297";
    return;
  }
  page.style.aspectRatio = `${L.w} / ${L.h}`;
  page.style.padding = `${L.padY}% ${L.padX}%`;
  page.style.border = "1px solid #111";
}

function applyPageBox(page, L, item) {
  const img = page.querySelector("img");
  const turn = extraTurn(item);
  if (state.tab === "to-pdf") L = pageLayout(item);
  if (state.tab !== "to-pdf") {
    const run = () => {
      const w = item?.w || img?.naturalWidth || 1;
      const h = item?.h || img?.naturalHeight || 1;
      applyPageFrame(page, L, { ...item, w, h, turn });
      const swap = turn === 90 || turn === 270;
      placeImg(img, { fit: "contain", w: swap ? h : w, h: swap ? w : h }, false, turn);
      syncOrientChip(page, item);
    };
    if (img && (item?.w || img.naturalWidth)) run();
    else if (img) img.onload = run;
    else {
      applyPageFrame(page, L, item);
      syncOrientChip(page, item);
    }
    return;
  }
  applyPageFrame(page, L, item);
  const run = () => {
    const autoRot = needsRotate(img.naturalWidth, img.naturalHeight, L.w, L.h);
    placeImg(img, L, autoRot, turn);
    syncOrientChip(page, item);
  };
  if (img && img.naturalWidth) run();
  else if (img) img.onload = run;
  else syncOrientChip(page, item);
}

let rotateTimers = [];
function staggerRotate() {
  rotateTimers.forEach(clearTimeout);
  rotateTimers = [];
  syncSpread();
  const pages = [...stageStack.querySelectorAll(".stage-page")];
  if (!pages.length) return;
  stageStack.classList.add("anim-rotate");
  const list = items();
  pages.forEach((page, i) => {
    const item = list[i];
    applyPageFrame(page, pageLayout(item), item);
  });
  pages.forEach((page, i) => {
    const t = setTimeout(() => {
      const img = page.querySelector("img");
      if (!img) return;
      const item = list[i];
      const L = pageLayout(item);
      const autoRot = needsRotate(img.naturalWidth, img.naturalHeight, L.w, L.h);
      placeImg(img, L, autoRot, extraTurn(item));
      syncOrientChip(page, item);
    }, i * 95);
    rotateTimers.push(t);
  });
  const done = setTimeout(() => stageStack.classList.remove("anim-rotate"), pages.length * 95 + 480);
  rotateTimers.push(done);
}

let pageWatcher = null;
function watchPages() {
  pageWatcher?.disconnect();
  pageWatcher = new IntersectionObserver(entries => {
    const vis = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (vis) {
      const i = +vis.target.dataset.index;
      if (i !== sel()) {
        setSel(i);
        markStrip();
      }
    }
    entries.forEach(e => {
      if (e.isIntersecting) queueSharp(+e.target.dataset.index);
    });
  }, { root: stageStack, threshold: [0.12, 0.45] });
  stageStack.querySelectorAll(".stage-sheet").forEach(s => pageWatcher.observe(s));
  const i = sel();
  queueSharp(i);
  queueSharp(i - 1);
  queueSharp(i + 1);
}

function isSpread() {
  return state.tab === "to-pdf" && document.getElementById("orientation").value === "landscape";
}

function syncSpread() {
  const on = isSpread() && items().length > 0;
  canvas.classList.toggle("spread", on);
  stageStack.classList.toggle("spread", on);
  if (on) stageStack.scrollTop = 0;
  else stageStack.scrollLeft = 0;
}

function scrollToPage(i) {
  const sheet = stageStack.querySelectorAll(".stage-sheet")[i];
  sheet?.scrollIntoView({
    behavior: "smooth",
    block: isSpread() ? "nearest" : "start",
    inline: isSpread() ? "center" : "nearest"
  });
}

function makeSheet(item, i, n, L) {
  const sheet = document.createElement("div");
  sheet.className = "stage-sheet";
  sheet.dataset.index = i;
  const page = document.createElement("div");
  page.className = "stage-page";
  const img = document.createElement("img");
  img.src = item.url;
  img.alt = item.name || "";
  img.decoding = "async";
  const inner = document.createElement("div");
  inner.className = "page-inner";
  inner.appendChild(img);
  page.appendChild(inner);
  const x = document.createElement("button");
  x.className = "page-x";
  x.type = "button";
  x.title = "Remove";
  x.setAttribute("aria-label", "Remove");
  x.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
  x.onclick = e => { e.stopPropagation(); removeAt(+sheet.dataset.index); };
  page.appendChild(x);
  const rot = document.createElement("button");
  rot.className = "page-orient";
  rot.type = "button";
  rot.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/></svg><span>Portrait</span>`;
  rot.onclick = e => { e.stopPropagation(); flipOrientAt(+sheet.dataset.index); };
  page.appendChild(rot);
  applyPageBox(page, L, item);
  paintAdj(img, item);
  const tag = document.createElement("div");
  tag.className = "page-tag";
  tag.textContent = `Page ${i + 1} of ${n}`;
  sheet.append(page, tag);
  sheet.onclick = e => {
    if (e.target.closest(".page-x, .page-orient")) return;
    const idx = +sheet.dataset.index;
    if (state.tab === "split") {
      const it = items()[idx];
      if (it) {
        it.picked = it.picked === false;
        strip.querySelectorAll(".shot")[idx]?.classList.toggle("picked", it.picked !== false);
        syncWorkButtons();
      }
    }
    setSel(idx);
    markStrip();
  };
  return sheet;
}

function relabelSheets() {
  const list = items();
  const n = list.length;
  stageStack.querySelectorAll(".stage-sheet").forEach((sheet, i) => {
    sheet.dataset.index = i;
    const tag = sheet.querySelector(".page-tag");
    if (tag) tag.textContent = `Page ${i + 1} of ${n}`;
  });
}

function renderStage() {
  if (state.tab === "id-card") {
    renderIdDesk();
    syncSizeMeter();
    return;
  }
  if (state.tab === "text") {
    emptyHint.classList.add("hidden");
    stageStack.classList.add("hidden");
    canvas.classList.add("has-pages");
    nameBar.classList.add("hidden");
    syncTextStats();
    syncSizeMeter();
    return;
  }
  const list = items();
  downloadBtn.disabled = state.images.length === 0;
  const printBtn = document.getElementById("printBtn");
  if (printBtn) printBtn.disabled = state.images.length === 0;
  const none = state.extracted.length === 0;
  downloadAllBtn.disabled = none;
  downloadThisBtn.disabled = none;
  downloadEachBtn.disabled = none;
  const printExtract = document.getElementById("printExtractBtn");
  if (printExtract) printExtract.disabled = none;
  syncWorkButtons();
  if (!list.length) {
    emptyHint.classList.remove("hidden");
    stageStack.classList.add("hidden");
    stageStack.innerHTML = "";
    canvas.classList.remove("has-pages");
    canvas.classList.remove("spread");
    stageStack.classList.remove("spread");
    nameBar.classList.add("hidden");
    nameBarText.textContent = "";
    document.getElementById("zoomBar")?.classList.remove("lift");
    pageWatcher?.disconnect();
    syncSizeMeter();
    syncAdjUi();
    return;
  }
  emptyHint.classList.add("hidden");
  stageStack.classList.remove("hidden");
  canvas.classList.add("has-pages");
  syncSpread();
  const n = list.length;
  const sheets = [...stageStack.querySelectorAll(".stage-sheet")];
  const prefixMatch = sheets.length && sheets.every((s, i) => i >= n || s.querySelector("img")?.getAttribute("src") === list[i].url || s.querySelector("img")?.src === list[i].url);
  if (sheets.length && sheets.length < n && prefixMatch) {
    for (let i = sheets.length; i < n; i++) stageStack.appendChild(makeSheet(list[i], i, n, pageLayout(list[i])));
    relabelSheets();
    watchPages();
    markStrip();
    applyAdjPreview();
    return;
  }
  const same = sheets.length === n && sheets.every((s, i) => s.querySelector("img")?.src === list[i].url);
  if (same) {
    sheets.forEach((sheet, i) => applyPageBox(sheet.querySelector(".stage-page"), pageLayout(list[i]), list[i]));
    relabelSheets();
    markStrip();
    applyAdjPreview();
    return;
  }
  stageStack.innerHTML = "";
  list.forEach((item, i) => stageStack.appendChild(makeSheet(item, i, n, pageLayout(item))));
  watchPages();
  markStrip();
  applyAdjPreview();
}

function makeShot(item, i, selected) {
  const el = document.createElement("div");
  el.className = "shot" + (selected ? " on" : "") + (state.tab === "split" && item.picked !== false ? " picked" : "");
  el.dataset.index = i;
  const nm = escapeHtml(item.name || `Page ${i + 1}`);
  el.innerHTML = `<span class="n">${i + 1}</span><button class="x" type="button" title="Remove">×</button><img src="${item.thumbUrl || item.url}" alt="" decoding="async"><span class="nm">${nm}</span>`;
  applyShotTurn(el.querySelector("img"), item);
  paintAdj(el.querySelector("img"), item);
  el.onclick = () => {
    if (state.tab === "split") {
      item.picked = item.picked === false;
      el.classList.toggle("picked", item.picked !== false);
      syncWorkButtons();
    }
    setSel(i); markStrip(); scrollToPage(i);
  };
  el.querySelector(".x").onclick = e => { e.stopPropagation(); removeAt(i); };
  return el;
}

function markStrip() {
  const i = sel();
  [...strip.querySelectorAll(".shot")].forEach((s, j) => s.classList.toggle("on", j === i));
  stageStack.querySelectorAll(".stage-sheet").forEach((s, j) => s.classList.toggle("on", j === i));
  const item = items()[i];
  if (item) {
    nameBar.classList.remove("hidden");
    nameBarText.textContent = item.name || `Page ${i + 1}`;
    document.getElementById("zoomBar")?.classList.add("lift");
    if (state.tab === "to-pdf") syncAdjUi();
  } else {
    nameBar.classList.add("hidden");
    nameBarText.textContent = "";
    document.getElementById("zoomBar")?.classList.remove("lift");
  }
}

function rebuildStrip() {
  [...strip.querySelectorAll(".shot")].forEach(s => s.remove());
  if (state.tab === "text") return;
  if (state.tab === "id-card") {
    const sides = isPassport() ? [["front", "Front"]] : [["front", "Front"], ["back", "Back"]];
    sides.forEach(([side, label]) => {
      const item = state.id[side];
      const el = document.createElement("div");
      el.className = "shot nodrag" + (state.id.sel === side ? " on" : "") + (item ? "" : " empty-shot");
      el.innerHTML = item
        ? `<span class="n">${label[0]}</span><button class="x" type="button" title="Remove">×</button><img src="${item.url}" alt="" decoding="async"><span class="nm">${escapeHtml(item.name)}</span>`
        : `<span class="n">${label[0]}</span>`;
      if (!item) {
        const cap = document.createElement("span");
        cap.className = "nm";
        cap.style.display = "block";
        cap.style.position = "static";
        cap.style.background = "none";
        cap.style.color = "#6b6b6b";
        cap.textContent = label;
        el.appendChild(cap);
      }
      el.onclick = () => {
        state.id.sel = side;
        if (!item) idFiles.click();
        else markIdSel();
      };
      const x = el.querySelector(".x");
      if (x) x.onclick = e => { e.stopPropagation(); clearIdSide(side); };
      strip.appendChild(el);
    });
    return;
  }
  [...strip.querySelectorAll(".shot")].forEach(s => s.remove());
  const list = items();
  list.forEach((item, i) => strip.appendChild(makeShot(item, i, i === sel())));
  if (state.tab === "to-pdf" || state.tab === "merge" || state.tab === "organize") strip.appendChild(addTile);
}

function chooseLayout(w, h) {
  const imgRatio = w / Math.max(h, 1);
  const formats = [
    ["a4", 210, 297],
    ["letter", 215.9, 279.4],
    ["legal", 215.9, 355.6],
    ["a5", 148, 210]
  ];
  const long = Math.max(w, h);
  let best = { size: "a4", orientation: "portrait", err: Infinity, pageRatio: 210 / 297 };
  for (const [name, pw, ph] of formats) {
    for (const orientation of ["portrait", "landscape"]) {
      const rw = orientation === "portrait" ? pw : ph;
      const rh = orientation === "portrait" ? ph : pw;
      let err = Math.abs(Math.log(imgRatio / (rw / rh)));
      if (name === "a5") err += long >= 1400 ? 0.05 : -0.02;
      if (err < best.err) best = { size: name, orientation, err, pageRatio: rw / rh };
    }
  }
  best.fit = bestFitFor(w, h, best.pageRatio, 1);
  return best;
}

async function applyBestFromFile(file) {
  const bmp = await createImageBitmap(file);
  const best = chooseLayout(bmp.width, bmp.height);
  bmp.close();
  document.getElementById("pageSize").value = best.size;
  document.getElementById("orientation").value = best.orientation;
  document.getElementById("fit").value = best.fit;
  syncRotateField();
  saveMenu();
  return best;
}

async function addFiles(list) {
  const added = [...list].filter(f => f.type.startsWith("image/"));
  if (!added.length) return;
  pushHist();
  files.value = "";
  state.pdfBlob = null;
  const isFirst = state.images.length === 0;
  let auto = null;
  if (isFirst) {
    try { auto = await applyBestFromFile(added[0]); }
    catch (e) { console.error(e); }
  }
  added.forEach(file => state.images.push({ file, url: URL.createObjectURL(file), name: file.name, adj: defaultAdj() }));
  state.sel = 0;
  rebuildStrip();
  renderStage();
  const n = state.images.length;
  if (auto) {
    const fitLabel = auto.fit === "cover" ? "fill page" : "fit inside";
    setStatus(`First image set ${auto.size.toUpperCase()} ${auto.orientation}, ${fitLabel}. ${n} page${n === 1 ? "" : "s"}.`);
  } else {
    setStatus(`${n} page${n === 1 ? "" : "s"} on the desk.`);
  }
  strip.scrollLeft = 0;
  stageStack.scrollTop = 0;
  stageStack.scrollLeft = 0;
  syncSizeMeter();
}

function removeAt(i) {
  const list = items();
  const item = list[i];
  if (!item) return;
  pushHist();
  list.splice(i, 1);
  setSel(Math.max(0, Math.min(sel(), list.length - 1)));
  if (!list.length && (state.tab === "split" || state.tab === "compress" || state.tab === "organize")) {
    state.workBytes = null;
    state.workPdf = null;
    state.workKind = "";
  }
  setStatus(list.length ? `${list.length} item${list.length === 1 ? "" : "s"}.` : "Nothing on the desk.");
  rebuildStrip();
  renderStage();
  syncWorkButtons();
  syncSizeMeter();
}

new Sortable(strip, {
  animation: 150,
  draggable: ".shot",
  filter: ".add-tile, .nodrag",
  onEnd: () => {
    if (!["to-pdf", "merge", "organize"].includes(state.tab)) return;
    pushHist();
    const order = [...strip.querySelectorAll(".shot")].map(s => +s.dataset.index);
    const list = items();
    const current = list[sel()];
    const next = order.map(i => list[i]);
    if (state.tab === "to-pdf") { state.images = next; state.sel = Math.max(0, state.images.indexOf(current)); state.pdfBlob = null; }
    else if (state.tab === "merge") { state.mergeDocs = next; state.mergeSel = Math.max(0, state.mergeDocs.indexOf(current)); }
    else if (state.tab === "organize") { state.workPages = next; state.workSel = Math.max(0, state.workPages.indexOf(current)); }
    rebuildStrip();
    renderStage();
  }
});

document.getElementById("chooseBtn").onclick = () => {
  if (state.tab === "to-pdf") files.click();
  else if (state.tab === "id-card") idFiles.click();
  else if (state.tab === "merge") document.getElementById("mergeFiles").click();
  else if (state.tab === "compress") document.getElementById("compressFiles").click();
  else if (state.tab === "split" || state.tab === "organize") document.getElementById("workPdfFile").click();
  else pdfFile.click();
};
emptyHint?.addEventListener("click", e => {
  if (e.target.closest("#chooseBtn")) return;
  document.getElementById("chooseBtn")?.click();
});
addTile.onclick = () => {
  if (state.tab === "merge") document.getElementById("mergeFiles").click();
  else if (state.tab === "organize") document.getElementById("orgAddFiles").click();
  else files.click();
};
files.addEventListener("change", e => addFiles(e.target.files));
idFiles.addEventListener("change", e => addIdFiles(e.target.files));
document.getElementById("idOpenBtn").onclick = () => idFiles.click();
document.getElementById("idCardType").addEventListener("change", onIdPageLayout);
document.getElementById("idPageSize").addEventListener("change", onIdPageLayout);
document.getElementById("idOrientation").addEventListener("change", onIdPageLayout);
document.getElementById("idPlace").addEventListener("change", onIdPageLayout);
function onIdPageLayout() {
  if (isPassport() && state.id.sel === "back") {
    state.id.sel = "front";
    restoreSelect("idSide", "front");
  }
  syncIdSheet();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      applyIdCard("front");
      applyIdCard("back");
    });
  });
  rebuildStrip();
  saveMenu();
}
document.getElementById("idSide").onchange = e => {
  state.id.sel = isPassport() ? "front" : e.target.value;
  if (isPassport()) e.target.value = "front";
  markIdSel();
  saveMenu();
  scheduleIdSave();
};
document.getElementById("idRotL").onclick = () => {
  const slot = idSlot();
  if (!slot) return;
  slot.rot = (slot.rot + 270) % 360;
  slot.x = 0; slot.y = 0;
  applyIdCard(state.id.sel);
  scheduleIdSave();
};
document.getElementById("idRotR").onclick = () => {
  const slot = idSlot();
  if (!slot) return;
  slot.rot = (slot.rot + 90) % 360;
  slot.x = 0; slot.y = 0;
  applyIdCard(state.id.sel);
  scheduleIdSave();
};
document.getElementById("idTilt").oninput = e => {
  const slot = idSlot();
  if (!slot) return;
  slot.tilt = Number(e.target.value);
  document.getElementById("idTiltVal").textContent = `${slot.tilt}°`;
  applyIdCard(state.id.sel);
};
document.getElementById("idTilt").onchange = () => scheduleIdSave();
document.getElementById("idZoom").oninput = e => {
  const slot = idSlot();
  if (!slot) return;
  slot.zoom = Number(e.target.value) / 100;
  document.getElementById("idZoomVal").textContent = `${e.target.value}%`;
  applyIdCard(state.id.sel);
};
document.getElementById("idZoom").onchange = () => scheduleIdSave();
document.getElementById("idResetBtn").onclick = () => {
  const slot = idSlot();
  if (!slot) return;
  slot.tilt = 0; slot.zoom = 1; slot.x = 0; slot.y = 0;
  applyIdCard(state.id.sel);
  syncIdControls();
  scheduleIdSave();
};
document.getElementById("idPdfBtn").onclick = () => downloadIdPdf();
document.getElementById("idPrintBtn").onclick = async () => {
  setBusy(true);
  try {
    const out = await makeIdPdfBlob();
    if (!out) return;
    await printBlob(out.blob);
    setStatus("Print dialog opened.");
  } catch (e) {
    setStatus("Could not print: " + e.message);
  } finally { setBusy(false); }
};
document.getElementById("idPngBtn").onclick = () => downloadIdPng();
document.getElementById("idClearBtn").onclick = () => {
  pushHist();
  clearIdSide("front");
  clearIdSide("back");
  syncSizeMeter();
};
idDesk.querySelectorAll(".id-card").forEach(card => {
  card.addEventListener("click", () => {
    const side = card.dataset.side;
    state.id.sel = side;
    if (!state.id[side]) idFiles.click();
    else markIdSel();
  });
  card.querySelector(".page-x").onclick = e => {
    e.stopPropagation();
    clearIdSide(card.dataset.side);
  };
});
let idDrag = null;
idDesk.addEventListener("pointerdown", e => {
  const card = e.target.closest(".id-card");
  if (!card || e.target.closest(".page-x")) return;
  const side = card.dataset.side;
  const slot = state.id[side];
  if (!slot) return;
  state.id.sel = side;
  markIdSel();
  idDrag = { side, x: e.clientX, y: e.clientY, ox: slot.x, oy: slot.y };
  card.setPointerCapture(e.pointerId);
});
idDesk.addEventListener("pointermove", e => {
  if (!idDrag) return;
  const slot = state.id[idDrag.side];
  if (!slot) return;
  slot.x = idDrag.ox + (e.clientX - idDrag.x);
  slot.y = idDrag.oy + (e.clientY - idDrag.y);
  applyIdCard(idDrag.side);
});
idDesk.addEventListener("pointerup", () => { idDrag = null; scheduleIdSave(); });
idDesk.addEventListener("pointercancel", () => { idDrag = null; });
idDesk.addEventListener("wheel", e => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    return;
  }
  const card = e.target.closest(".id-card");
  if (!card) return;
  const side = card.dataset.side;
  const slot = state.id[side];
  if (!slot) return;
  e.preventDefault();
  state.id.sel = side;
  const next = Math.min(2.8, Math.max(1, slot.zoom + (e.deltaY < 0 ? 0.08 : -0.08)));
  slot.zoom = Math.round(next * 100) / 100;
  applyIdCard(side);
  syncIdControls();
  scheduleIdSave();
}, { passive: false });
window.addEventListener("resize", () => {
  if (state.tab === "id-card") {
    syncIdSheet();
    applyIdCard("front");
    applyIdCard("back");
  }
});
window.visualViewport?.addEventListener("resize", () => {
  if (state.tab === "id-card") {
    syncIdSheet();
    applyIdCard("front");
    applyIdCard("back");
  }
});
document.getElementById("choosePdfBtn").onclick = () => pdfFile.click();
pdfFile.addEventListener("change", e => { if (e.target.files[0]) handlePdf(e.target.files[0]); });

["pageSize", "orientation", "fit", "margin", "rotateMatch"].forEach(id =>
  document.getElementById(id).addEventListener("change", async e => {
    state.pdfBlob = null;
    if (e.target.id === "orientation") {
      state.images.forEach(it => { delete it.orient; });
      syncRotateField();
    }
    saveMenu();
    if ((e.target.id === "orientation" || e.target.id === "pageSize" || e.target.id === "rotateMatch") && state.images[0]) {
      try {
        const bmp = await createImageBitmap(state.images[0].file);
        const L = pageLayout();
        document.getElementById("fit").value = bestFitFor(bmp.width, bmp.height, L.w, L.h);
        bmp.close();
      } catch {}
    }
    if (e.target.id === "orientation" || e.target.id === "rotateMatch") {
      if (stageStack.querySelector(".stage-page")) staggerRotate();
      else renderStage();
      syncSizeMeter();
      return;
    }
    renderStage();
    syncSizeMeter();
  })
);

canvas.addEventListener("wheel", e => {
  if (state.tab === "text") return;
  if (!(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();
  bumpViewZoom(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
}, { passive: false });
canvas.addEventListener("dragover", e => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
});
canvas.addEventListener("dragleave", () => {});
let dragDepth = 0;
function hasFiles(e) {
  return e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
}
window.addEventListener("dragenter", e => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth += 1;
  showDrop(true);
});
window.addEventListener("dragleave", e => {
  if (!hasFiles(e) && dragDepth === 0) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) showDrop(false);
});
canvas.addEventListener("drop", e => {
  e.preventDefault(); e.stopPropagation();
  dragDepth = 0;
  showDrop(false);
  takeDrop(e.dataTransfer.files);
});
function takeDrop(list) {
  if (state.tab === "text") {
    const file = [...list].find(f => (f.type && f.type.startsWith("text/")) || /\.(txt|md|csv|json)$/i.test(f.name));
    if (file && textInput) {
      file.text().then(t => {
        pushHist();
        textInput.value = t;
        syncTextStats();
        saveTextDesk();
        setStatus(`Loaded “${file.name}”.`);
      }).catch(() => setStatus("Could not read that file."));
    }
    return;
  }
  if (state.tab === "to-pdf") addFiles(list);
  else if (state.tab === "id-card") addIdFiles(list);
  else if (state.tab === "merge") addMergeFiles(list);
  else if (state.tab === "compress") addCompressFiles(list);
  else if (state.tab === "split") {
    const file = [...list].find(f => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (file) loadWorkPdf(file, state.tab);
  } else if (state.tab === "organize") {
    addOrganizePdfs(list);
  } else {
    const file = [...list].find(f => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (file) handlePdf(file);
  }
}
stageStack.addEventListener("wheel", e => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    return;
  }
  if (!stageStack.classList.contains("spread")) return;
  if (e.deltaY === 0 && e.deltaX === 0) return;
  e.preventDefault();
  stageStack.scrollLeft += e.deltaY + e.deltaX;
}, { passive: false });
window.addEventListener("dragover", e => {
  if (hasFiles(e)) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }
});
window.addEventListener("drop", e => {
  e.preventDefault();
  dragDepth = 0;
  showDrop(false);
  takeDrop(e.dataTransfer.files);
});
window.addEventListener("keydown", e => {
  const ctrl = e.ctrlKey || e.metaKey;
  const inField = ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName);
  if (ctrl && (e.key === "z" || e.key === "Z")) {
    if (inField && state.tab === "text" && !e.shiftKey) return;
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if (ctrl && (e.key === "y" || e.key === "Y")) {
    e.preventDefault();
    redo();
    return;
  }
  if (ctrl && (e.key === "s" || e.key === "S")) {
    e.preventDefault();
    primaryDownload();
    return;
  }
  if (ctrl && (e.key === "o" || e.key === "O")) {
    e.preventDefault();
    document.getElementById("chooseBtn")?.click();
    return;
  }
  if ((e.key === "?" || (e.shiftKey && e.key === "/")) && !inField) {
    e.preventDefault();
    toggleKeys(true);
    return;
  }
  if (e.key === "Escape") {
    toggleKeys(false);
    showDrop(false);
    return;
  }
  if (ctrl && (e.key === "=" || e.key === "+" || e.key === "-")) {
    if (state.tab === "text") return;
    e.preventDefault();
    bumpViewZoom(e.key === "-" ? -ZOOM_STEP : ZOOM_STEP);
    return;
  }
  if (ctrl && e.key === "0") {
    if (state.tab === "text") return;
    e.preventDefault();
    setViewZoom(1);
    return;
  }
  if (inField) return;
  if (state.tab === "id-card") {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      state.id.sel = "back"; markIdSel();
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      state.id.sel = "front"; markIdSel();
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      pushHist();
      clearIdSide(state.id.sel);
    }
    return;
  }
  const list = items();
  if (!list.length) return;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
    setSel(Math.min(list.length - 1, sel() + 1));
    markStrip();
    scrollToPage(sel());
  }
  if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
    setSel(Math.max(0, sel() - 1));
    markStrip();
    scrollToPage(sel());
  }
  if (e.key === "Delete" || e.key === "Backspace") removeAt(sel());
  if (e.key === "r" || e.key === "R") {
    e.preventDefault();
    flipOrientAt(sel());
  }
});

function drawFitted(ctx, bmp, dw, dh, fit) {
  const scale = fit === "cover"
    ? Math.max(dw / bmp.width, dh / bmp.height)
    : Math.min(dw / bmp.width, dh / bmp.height);
  const w = bmp.width * scale;
  const h = bmp.height * scale;
  ctx.drawImage(bmp, (dw - w) / 2, (dh - h) / 2, w, h);
}

async function rasterPage(file, pxW, pxH, fit, turn = 0, adj) {
  const bmp = await createImageBitmap(file);
  const canvasEl = document.createElement("canvas");
  canvasEl.width = pxW;
  canvasEl.height = pxH;
  const ctx = canvasEl.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "medium";
  ctx.fillStyle = adj?.bg || "#fff";
  ctx.fillRect(0, 0, pxW, pxH);
  const deg = visDeg(needsRotate(bmp.width, bmp.height, pxW, pxH), extraTurn({ turn }));
  const swap = visSwap(deg);
  ctx.save();
  ctx.translate(pxW / 2, pxH / 2);
  if (deg) ctx.rotate(deg * Math.PI / 180);
  if (swap) {
    ctx.translate(-pxH / 2, -pxW / 2);
    drawFitted(ctx, bmp, pxH, pxW, fit);
  } else {
    ctx.translate(-pxW / 2, -pxH / 2);
    drawFitted(ctx, bmp, pxW, pxH, fit);
  }
  ctx.restore();
  applyAdjToCanvas(ctx, pxW, pxH, adj);
  bmp.close();
  return { canvas: canvasEl, w: pxW, h: pxH };
}
async function makePdf() {
  if (!state.images.length) return null;
  const size = document.getElementById("pageSize").value;
  const fit = document.getElementById("fit").value;
  const margin = Number(document.getElementById("margin").value);
  const first = visOrient(state.images[0]);
  const doc = new jsPDF({ orientation: first, unit: "mm", format: size, compress: true });
  const dpi = 144;
  for (let i = 0; i < state.images.length; i++) {
    const item = state.images[i];
    const o = visOrient(item);
    if (i) doc.addPage(size, o);
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const maxW = Math.max(1, pageW - margin * 2);
    const maxH = Math.max(1, pageH - margin * 2);
    const pxW = Math.max(1, Math.round(maxW / 25.4 * dpi));
    const pxH = Math.max(1, Math.round(maxH / 25.4 * dpi));
    setStatus(`Building PDF… ${i + 1}/${state.images.length}`);
    const { canvas: cnv } = await rasterPage(item.file, pxW, pxH, fit, extraTurn(item), item.adj);
    const jpeg = cnv.toDataURL("image/jpeg", 0.82);
    doc.addImage(jpeg, "JPEG", margin, margin, maxW, maxH, undefined, "FAST");
    if (i % 2 === 1) await new Promise(r => requestAnimationFrame(r));
  }
  return doc.output("blob");
}
document.getElementById("downloadBtn").onclick = async () => {
  if (!state.images.length) return;
  setBusy(true);
  try {
    if (!state.pdfBlob) state.pdfBlob = await makePdf();
    downloadBlob(state.pdfBlob, imagesPdfName());
    setStatus("Download started · " + fmtBytes(state.pdfBlob.size));
    syncSizeMeter();
  } catch (e) {
    setStatus("Could not create PDF: " + e.message);
  } finally { setBusy(false); }
};
document.getElementById("printBtn").onclick = async () => {
  if (!state.images.length) return;
  setBusy(true);
  try {
    if (!state.pdfBlob) state.pdfBlob = await makePdf();
    await printBlob(state.pdfBlob);
    setStatus("Print dialog opened.");
  } catch (e) {
    setStatus("Could not print: " + e.message);
  } finally { setBusy(false); }
};
document.getElementById("clearBtn").onclick = () => {
  pushHist();
  state.images = []; state.sel = 0; state.pdfBlob = null; files.value = "";
  rebuildStrip(); renderStage(); setStatus("No pages yet.");
  syncSizeMeter();
};

function clearExtracted() {
  state.extracted.forEach(x => URL.revokeObjectURL(x.url));
  state.extracted = []; state.extSel = 0;
}
function getPdfObj(store, name) {
  return new Promise(resolve => { try { store.get(name, obj => resolve(obj || null)); } catch { resolve(null); } });
}
async function resolveImageObj(page, name) {
  if (name && typeof name === "object") return name;
  return (await getPdfObj(page.objs, name)) || getPdfObj(page.commonObjs, name);
}
function imageObjToCanvas(img) {
  if (!img || !img.width || !img.height) return null;
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const ctx = c.getContext("2d");
  if (img.bitmap) { ctx.drawImage(img.bitmap, 0, 0); return c; }
  const data = img.data; if (!data) return null;
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8) return null;
  const imageData = ctx.createImageData(img.width, img.height); const out = imageData.data; const kind = img.kind;
  if (kind === 3 || data.length === img.width * img.height * 4) out.set(data.length === out.length ? data : data.subarray(0, out.length));
  else if (kind === 2 || data.length === img.width * img.height * 3) {
    let j = 0; for (let i = 0; i < data.length; i += 3) { out[j++] = data[i]; out[j++] = data[i + 1]; out[j++] = data[i + 2]; out[j++] = 255; }
  } else if (kind === 1) {
    const rowBytes = (img.width + 7) >> 3;
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      const bit = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
      const v = bit ? 0 : 255; const i = (y * img.width + x) * 4;
      out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255;
    }
  } else return null;
  ctx.putImageData(imageData, 0, 0); return c;
}
async function imageObjToItem(img, name) {
  if (!img) return null;
  if (img.data && img.data[0] === 0xff && img.data[1] === 0xd8) {
    const blob = new Blob([img.data], { type: "image/jpeg" });
    return { url: URL.createObjectURL(blob), blob, name: name + ".jpg", w: img.width, h: img.height };
  }
  const c = imageObjToCanvas(img);
  if (!c || c.width < 8 || c.height < 8) return null;
  const blob = await new Promise(r => c.toBlob(r, "image/png"));
  if (!blob) return null;
  return { url: URL.createObjectURL(blob), blob, name: name + ".png", w: c.width, h: c.height };
}
async function extractEmbedded(pdf) {
  const opsPaint = new Set([pdfjsLib.OPS.paintImageXObject, pdfjsLib.OPS.paintImageXObjectRepeat, pdfjsLib.OPS.paintInlineImageXObject, pdfjsLib.OPS.paintInlineImageXObjectGroup]);
  if (pdfjsLib.OPS.paintJpegXObject) opsPaint.add(pdfjsLib.OPS.paintJpegXObject);
  const seen = new Set(); const items = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p); const ops = await page.getOperatorList();
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (!opsPaint.has(ops.fnArray[i])) continue;
      const key = ops.argsArray[i]?.[0];
      const id = typeof key === "string" ? key : `inline-p${p}-${i}`;
      if (seen.has(id)) continue; seen.add(id);
      const item = await imageObjToItem(await resolveImageObj(page, key), `page-${String(p).padStart(2, "0")}-${items.length + 1}`);
      if (item) { item.page = p; items.push(item); }
    }
  }
  return items;
}
async function extractPages(pdf, scale, pageNums) {
  const spec = imageFormatSpec();
  const pages = pageNums && pageNums.length ? pageNums : Array.from({ length: pdf.numPages }, (_, i) => i + 1);
  const items = [];
  for (const p of pages) {
    if (p < 1 || p > pdf.numPages) continue;
    setStatus(`Rendering ${p}/${pdf.numPages}…`);
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale });
    const c = document.createElement("canvas"); c.width = viewport.width; c.height = viewport.height;
    await page.render({ canvasContext: c.getContext("2d", { alpha: false }), viewport }).promise;
    const blob = await new Promise(r => c.toBlob(r, spec.mime, spec.quality));
    items.push({ url: URL.createObjectURL(blob), blob, name: `page-${String(p).padStart(2, "0")}.${spec.ext}`, w: c.width, h: c.height, page: p });
  }
  return items;
}
async function handlePdf(file) {
  if (!file) return;
  pushHist();
  state.lastPdf = file;
  clearExtracted();
  state.pdfName = (file.name || "document").replace(/\.pdf$/i, "") || "document";
  setTab("from-pdf");
  setBusy(true);
  setStatus("Reading PDF…");
  try {
    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const mode = document.getElementById("extractMode").value;
    const scale = Number(document.getElementById("pageScale").value);
    const range = parsePageRange(document.getElementById("pageRange")?.value || "", pdf.numPages);
    let items = mode === "pages" ? await extractPages(pdf, scale, range) : await extractEmbedded(pdf);
    if (mode === "embedded" && !items.length) {
      setStatus("No embedded images. Rendering pages instead.");
      items = await extractPages(pdf, scale, range);
    } else if (mode === "embedded" && range.length !== pdf.numPages) {
      items = items.filter(it => range.includes(it.page));
    }
    state.extracted = items; state.extSel = 0;
    rebuildStrip(); renderStage();
    setStatus(items.length ? `${items.length} images from “${file.name}”.` : "No images found.");
  } catch (e) {
    setStatus("Could not extract images: " + e.message);
  }
  setBusy(false); pdfFile.value = "";
}
document.getElementById("extractMode").onchange = () => {
  saveMenu();
  if (state.lastPdf) handlePdf(state.lastPdf);
};
document.getElementById("pageScale").onchange = () => {
  saveMenu();
  if (state.lastPdf && document.getElementById("extractMode").value === "pages") handlePdf(state.lastPdf);
};
document.getElementById("extractClearBtn").onclick = () => {
  pushHist();
  clearExtracted(); state.lastPdf = null; rebuildStrip(); renderStage(); setStatus("Open a PDF.");
  syncSizeMeter();
};
async function formattedExtracted(item) {
  const spec = imageFormatSpec();
  const blob = await rotateImageBlob(item.blob, extraTurn(item), spec, item.w, item.h);
  return { blob, name: folioDownloadName("page", item.name, "", spec.ext) };
}
document.getElementById("downloadThisBtn").onclick = async () => {
  const item = state.extracted[state.extSel] || state.extracted[0];
  if (!item) return;
  const out = await formattedExtracted(item);
  downloadBlob(out.blob, out.name);
  setStatus(`Downloaded ${out.name}.`);
};
document.getElementById("downloadEachBtn").onclick = async () => {
  const list = state.extracted;
  if (!list.length) return;
  const files = [];
  for (const item of list) files.push(await formattedExtracted(item));
  if (window.showDirectoryPicker) {
    try {
      const dir = await window.showDirectoryPicker({ mode: "readwrite" });
      setBusy(true);
      for (const item of files) {
        const handle = await dir.getFileHandle(item.name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(item.blob);
        await writable.close();
      }
      setStatus(`${files.length} images saved to folder.`);
      setBusy(false);
      return;
    } catch (e) {
      setBusy(false);
      if (e.name === "AbortError") return;
    }
  }
  for (let i = 0; i < files.length; i++) {
    downloadBlob(files[i].blob, files[i].name);
    await new Promise(r => setTimeout(r, 160));
  }
  setStatus(`${files.length} images downloading.`);
};
document.getElementById("downloadAllBtn").onclick = async () => {
  if (!state.extracted.length) return;
  const zip = new JSZip();
  for (const item of state.extracted) {
    const out = await formattedExtracted(item);
    zip.file(out.name, out.blob);
  }
  downloadBlob(await zip.generateAsync({ type: "blob" }), folioDownloadName("pages", state.pdfName, "images", "zip"));
  setStatus("ZIP download started.");
};
document.getElementById("printExtractBtn").onclick = async () => {
  if (!state.extracted.length) return;
  const urls = [];
  try {
    for (const item of state.extracted) {
      const out = await formattedExtracted(item);
      urls.push(URL.createObjectURL(out.blob));
    }
    printHtml("Print images", urls.map(u => `<img src="${u}" alt="">`).join(""), () => {
      urls.forEach(u => URL.revokeObjectURL(u));
    });
    setStatus("Print dialog opened.");
  } catch (e) {
    urls.forEach(u => URL.revokeObjectURL(u));
    setStatus("Could not print: " + e.message);
  }
};
document.getElementById("pageRange")?.addEventListener("change", () => {
  if (state.lastPdf) handlePdf(state.lastPdf);
});
document.getElementById("imgFormat")?.addEventListener("change", () => { saveMenu(); syncSizeMeter(); });

function needPdfLib() {
  if (PDFLib?.PDFDocument) return true;
  setStatus("PDF library failed to load. Refresh the page.");
  return false;
}
function syncWorkButtons() {
  const mergeN = state.mergeDocs.length;
  const workN = state.workPages.length;
  const splitN = splitPageNums().length;
  const setDis = (id, on) => { const el = document.getElementById(id); if (el) el.disabled = on; };
  setDis("mergeDlBtn", mergeN === 0);
  setDis("mergePrintBtn", mergeN === 0);
  setDis("splitDlBtn", splitN === 0 || !state.workBytes);
  setDis("splitEachBtn", splitN === 0 || !state.workBytes);
  setDis("splitPrintBtn", splitN === 0 || !state.workBytes);
  const orgN = state.tab === "organize" ? workN : state.workPages.length;
  const orgReady = orgN === 0;
  setDis("orgDlBtn", orgReady);
  setDis("orgPrintBtn", orgReady);
  setDis("orgDelBtn", orgReady);
  setDis("orgAddBtn", false);
  setDis("compressDlBtn", workN === 0);
  setDis("compressPrintBtn", workN === 0);
  syncSizeMeter();
}
function clearMerge() {
  state.mergeDocs = [];
  state.mergeSel = 0;
}
function clearWork() {
  state.workPages = [];
  state.workSel = 0;
  state.workBytes = null;
  state.workPdf = null;
  state.workName = "document";
  state.workKind = "";
}
function dropItemUrls(item) {
  if (!item) return;
  if (item.url) URL.revokeObjectURL(item.url);
  if (item.thumbUrl && item.thumbUrl !== item.url) URL.revokeObjectURL(item.thumbUrl);
  item.url = "";
  item.thumbUrl = "";
}
function previewMaxEdge() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const zoom = state.viewZoom || 1;
  return Math.round(Math.min(1800, Math.max(1100, 480 * zoom * dpr * 1.2)));
}
async function renderPdfPage(pdf, pageNum, maxEdge, quality = 0.92, intent = "display") {
  const page = await pdf.getPage(pageNum);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(maxEdge / Math.max(base.width, base.height, 1), 2.6);
  const viewport = page.getViewport({ scale: Math.max(scale, 0.7) });
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(viewport.width));
  c.height = Math.max(1, Math.round(viewport.height));
  const ctx = c.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  await page.render({ canvasContext: ctx, viewport, intent }).promise;
  const blob = await new Promise(r => c.toBlob(r, "image/jpeg", quality));
  return { url: URL.createObjectURL(blob), w: c.width, h: c.height };
}
async function pdfDocFor(item) {
  if (state.tab === "merge") {
    if (!item?.bytes) return null;
    if (!item.pdfPromise) item.pdfPromise = pdfjsLib.getDocument({ data: item.bytes.slice(0) }).promise;
    return item.pdfPromise;
  }
  if (item?.bytes && item.bytes !== state.workBytes) {
    if (!item.pdfPromise) item.pdfPromise = pdfjsLib.getDocument({ data: item.bytes.slice(0) }).promise;
    return item.pdfPromise;
  }
  if (state.workPdf) return state.workPdf;
  if (state.workBytes) {
    state.workPdf = await pdfjsLib.getDocument({ data: state.workBytes.slice(0) }).promise;
    return state.workPdf;
  }
  return null;
}
const sharpQueue = [];
let sharpBusy = false;
function needsSharpPreview(item) {
  if (!item) return false;
  if (state.tab === "merge") return !!item.bytes;
  if (state.tab === "split" || state.tab === "compress" || state.tab === "organize") return !!(item.bytes || state.workBytes) && !!item.page;
  return false;
}
function queueSharp(i) {
  if (!Number.isInteger(i) || i < 0) return;
  if (!["merge", "split", "compress", "organize"].includes(state.tab)) return;
  if (!sharpQueue.includes(i)) sharpQueue.unshift(i);
  pumpSharp();
}
async function pumpSharp() {
  if (sharpBusy) return;
  sharpBusy = true;
  while (sharpQueue.length) {
    const i = sharpQueue.shift();
    try { await sharpenOne(i); } catch {}
  }
  sharpBusy = false;
}
async function sharpenOne(i) {
  const item = items()[i];
  if (!needsSharpPreview(item)) return;
  const want = previewMaxEdge();
  if (item.sharp && item.w >= want * 0.82) return;
  const pdf = await pdfDocFor(item);
  if (!pdf || items()[i] !== item) return;
  let hi;
  try {
    hi = await renderPdfPage(pdf, item.page || 1, want, 0.93, "print");
  } catch {
    hi = await renderPdfPage(pdf, item.page || 1, want, 0.93, "display");
  }
  if (items()[i] !== item) {
    URL.revokeObjectURL(hi.url);
    return;
  }
  const prev = item.url;
  if (!item.thumbUrl) item.thumbUrl = prev;
  item.url = hi.url;
  item.w = hi.w;
  item.h = hi.h;
  item.sharp = true;
  if (prev && prev !== item.thumbUrl && prev !== hi.url) URL.revokeObjectURL(prev);
  const page = stageStack.querySelectorAll(".stage-page")[i];
  const img = page?.querySelector("img");
  if (img) {
    img.onload = () => applyPageBox(page, pageLayout(item), item);
    img.src = hi.url;
  }
}
async function addMergeFiles(list) {
  const pdfs = [...list].filter(f => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
  if (!pdfs.length) return;
  pushHist();
  document.getElementById("mergeFiles").value = "";
  setBusy(true);
  try {
    for (const file of pdfs) {
      const bytes = new Uint8Array((await file.arrayBuffer()).slice(0));
      const pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      const thumb = await renderPdfPage(pdf, 1, 240, 0.82);
      state.mergeDocs.push({
        bytes,
        pdfPromise: Promise.resolve(pdf),
        url: thumb.url,
        thumbUrl: thumb.url,
        w: thumb.w,
        h: thumb.h,
        name: file.name,
        pages: pdf.numPages,
        page: 1,
        sharp: false
      });
    }
    state.mergeSel = 0;
    rebuildStrip();
    renderStage();
    setStatus(`${state.mergeDocs.length} PDF${state.mergeDocs.length === 1 ? "" : "s"} to merge. Drag the strip to set order.`);
    strip.scrollLeft = 0;
    stageStack.scrollTop = 0;
    stageStack.scrollLeft = 0;
    syncSizeMeter();
  } catch (e) {
    setStatus("Could not add PDF: " + e.message);
  }
  setBusy(false);
}
async function loadWorkPdf(file, kind) {
  if (!file) return;
  pushHist();
  document.getElementById("workPdfFile").value = "";
  document.getElementById("compressFiles").value = "";
  setBusy(true);
  setStatus("Reading PDF…");
  try {
    const bytes = new Uint8Array((await file.arrayBuffer()).slice(0));
    const pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    clearWork();
    state.workBytes = bytes;
    state.workPdf = pdf;
    state.workName = (file.name || "document").replace(/\.pdf$/i, "") || "document";
    state.workKind = kind || "pdf";
    for (let p = 1; p <= pdf.numPages; p++) {
      setStatus(`Preview ${p}/${pdf.numPages}…`);
      const thumb = await renderPdfPage(pdf, p, 240, 0.82);
      state.workPages.push({
        url: thumb.url,
        thumbUrl: thumb.url,
        w: thumb.w,
        h: thumb.h,
        name: `Page ${p}`,
        page: p,
        picked: true,
        sharp: false,
        bytes,
        srcName: file.name
      });
    }
    state.workSel = 0;
    rebuildStrip();
    renderStage();
    setStatus(`${pdf.numPages} pages from “${file.name}”.`);
  } catch (e) {
    setStatus("Could not open PDF: " + e.message);
  }
  setBusy(false);
}
async function addCompressFiles(list) {
  const files = [...list];
  const pdfs = files.filter(f => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
  const images = files.filter(f => f.type.startsWith("image/"));
  document.getElementById("compressFiles").value = "";
  if (pdfs[0]) {
    await loadWorkPdf(pdfs[0], "compress");
    return;
  }
  if (!images.length) return;
  pushHist();
  setBusy(true);
  try {
    clearWork();
    state.workKind = "images";
    state.workName = "images";
    for (const file of images) {
      const bmp = await createImageBitmap(file);
      state.workPages.push({
        url: URL.createObjectURL(file),
        blob: file,
        file,
        name: file.name,
        w: bmp.width,
        h: bmp.height,
        rot: 0,
        picked: true
      });
      bmp.close();
    }
    state.workSel = 0;
    rebuildStrip();
    renderStage();
    setStatus(`${state.workPages.length} image${state.workPages.length === 1 ? "" : "s"} ready to compress.`);
    strip.scrollLeft = 0;
    stageStack.scrollTop = 0;
    stageStack.scrollLeft = 0;
  } catch (e) {
    setStatus("Could not open images: " + e.message);
  }
  setBusy(false);
}
function splitPageNums() {
  if (!state.workPages.length) return [];
  const text = document.getElementById("splitRange")?.value.trim();
  if (text) {
    const max = state.workPages.reduce((m, p) => Math.max(m, p.page || 0), state.workPages.length);
    const wanted = new Set(parsePageRange(text, max));
    return state.workPages.filter(p => wanted.has(p.page)).map(p => p.page);
  }
  return state.workPages.filter(p => p.picked !== false).map(p => p.page).filter(Boolean);
}
function applySplitRange() {
  if (state.tab !== "split" || !state.workPages.length) return;
  const text = document.getElementById("splitRange")?.value.trim();
  if (!text) state.workPages.forEach(p => { p.picked = true; });
  else {
    const max = state.workPages.reduce((m, p) => Math.max(m, p.page || 0), state.workPages.length);
    const set = new Set(parsePageRange(text, max));
    state.workPages.forEach(p => { p.picked = set.has(p.page); });
  }
  rebuildStrip();
  syncWorkButtons();
}
async function buildMergedBlob() {
  if (!state.mergeDocs.length || !needPdfLib()) return null;
  const dest = await PDFLib.PDFDocument.create();
  for (const doc of state.mergeDocs) {
    const src = await PDFLib.PDFDocument.load(doc.bytes, { ignoreEncryption: true });
    const copied = await dest.copyPages(src, src.getPageIndices());
    copied.forEach(p => {
      addPdfTurn(p, extraTurn(doc));
      dest.addPage(p);
    });
  }
  return new Blob([await dest.save()], { type: "application/pdf" });
}
async function downloadMerged() {
  setBusy(true);
  try {
    const blob = await buildMergedBlob();
    if (!blob) return;
    downloadBlob(blob, folioDownloadName("merged", state.mergeDocs[0]?.name || "merged", state.mergeDocs.length + "files", "pdf"));
    setStatus("Merged PDF downloaded.");
  } catch (e) {
    setStatus("Could not merge: " + e.message);
  }
  setBusy(false);
}
async function printMerged() {
  setBusy(true);
  try {
    const blob = await buildMergedBlob();
    if (!blob) return;
    await printBlob(blob);
    setStatus("Print dialog opened.");
  } catch (e) {
    setStatus("Could not print: " + e.message);
  }
  setBusy(false);
}
async function buildSplitBlob() {
  const nums = splitPageNums();
  if (!nums.length || !state.workBytes || !needPdfLib()) return null;
  const src = await PDFLib.PDFDocument.load(state.workBytes, { ignoreEncryption: true });
  const dest = await PDFLib.PDFDocument.create();
  const copied = await dest.copyPages(src, nums.map(n => n - 1));
  copied.forEach((p, i) => {
    const item = state.workPages.find(x => x.page === nums[i]);
    addPdfTurn(p, extraTurn(item));
    dest.addPage(p);
  });
  return { blob: new Blob([await dest.save()], { type: "application/pdf" }), nums };
}
async function downloadSplitPdf() {
  setBusy(true);
  try {
    const out = await buildSplitBlob();
    if (!out) return;
    downloadBlob(out.blob, folioDownloadName("split", state.workName, "p" + out.nums[0] + (out.nums.length > 1 ? "-" + out.nums[out.nums.length - 1] : ""), "pdf"));
    setStatus(`Split PDF downloaded · ${out.nums.length} page${out.nums.length === 1 ? "" : "s"}.`);
  } catch (e) {
    setStatus("Could not split: " + e.message);
  }
  setBusy(false);
}
async function printSplitPdf() {
  setBusy(true);
  try {
    const out = await buildSplitBlob();
    if (!out) return;
    await printBlob(out.blob);
    setStatus("Print dialog opened.");
  } catch (e) {
    setStatus("Could not print: " + e.message);
  }
  setBusy(false);
}
async function addOrganizePdfs(list) {
  const pdfs = [...list].filter(f => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
  if (!pdfs.length) return;
  const addEl = document.getElementById("orgAddFiles");
  if (addEl) addEl.value = "";
  if (!state.workPages.length) {
    await loadWorkPdf(pdfs[0], "organize");
    if (pdfs.length > 1) await appendOrganizePdfs(pdfs.slice(1));
    return;
  }
  await appendOrganizePdfs(pdfs);
}
async function appendOrganizePdfs(pdfs) {
  pushHist();
  setBusy(true);
  try {
    for (const file of pdfs) {
      const bytes = new Uint8Array((await file.arrayBuffer()).slice(0));
      const pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      const base = (file.name || "document").replace(/\.pdf$/i, "") || "document";
      for (let p = 1; p <= pdf.numPages; p++) {
        setStatus(`Adding ${base} ${p}/${pdf.numPages}…`);
        const thumb = await renderPdfPage(pdf, p, 240, 0.82);
        state.workPages.push({
          url: thumb.url,
          thumbUrl: thumb.url,
          w: thumb.w,
          h: thumb.h,
          name: `${base} · ${p}`,
          page: p,
          picked: true,
          sharp: false,
          bytes,
          pdfPromise: Promise.resolve(pdf),
          srcName: file.name
        });
      }
    }
    state.workKind = "organize";
    rebuildStrip();
    renderStage();
    setStatus(`${state.workPages.length} pages. Drag the strip to sort.`);
    syncSizeMeter();
  } catch (e) {
    setStatus("Could not add PDF: " + e.message);
  }
  setBusy(false);
}
async function buildOrganizeBlob() {
  if (!state.workPages.length || !needPdfLib()) return null;
  const dest = await PDFLib.PDFDocument.create();
  const cache = new Map();
  for (const item of state.workPages) {
    const bytes = item.bytes || state.workBytes;
    if (!bytes || !item.page) continue;
    let src = cache.get(bytes);
    if (!src) {
      src = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
      cache.set(bytes, src);
    }
    const [copied] = await dest.copyPages(src, [item.page - 1]);
    addPdfTurn(copied, extraTurn(item));
    dest.addPage(copied);
  }
  if (!dest.getPageCount()) return null;
  return new Blob([await dest.save()], { type: "application/pdf" });
}
async function downloadOrganizePdf() {
  setBusy(true);
  try {
    const blob = await buildOrganizeBlob();
    if (!blob) return;
    downloadBlob(blob, folioDownloadName("organized", state.workName, state.workPages.length + "p", "pdf"));
    setStatus(`Organized PDF downloaded · ${state.workPages.length} page${state.workPages.length === 1 ? "" : "s"}.`);
  } catch (e) {
    setStatus("Could not organize: " + e.message);
  }
  setBusy(false);
}
async function printOrganizePdf() {
  setBusy(true);
  try {
    const blob = await buildOrganizeBlob();
    if (!blob) return;
    await printBlob(blob);
    setStatus("Print dialog opened.");
  } catch (e) {
    setStatus("Could not print: " + e.message);
  }
  setBusy(false);
}
async function downloadSplitZip() {
  const nums = splitPageNums();
  if (!nums.length || !state.workBytes || !needPdfLib()) return;
  setBusy(true);
  try {
    const src = await PDFLib.PDFDocument.load(state.workBytes, { ignoreEncryption: true });
    const zip = new JSZip();
    for (const n of nums) {
      const dest = await PDFLib.PDFDocument.create();
      const [page] = await dest.copyPages(src, [n - 1]);
      addPdfTurn(page, extraTurn(state.workPages.find(x => x.page === n)));
      dest.addPage(page);
      zip.file(`${state.workName}-p${String(n).padStart(2, "0")}.pdf`, await dest.save());
    }
    downloadBlob(await zip.generateAsync({ type: "blob" }), folioDownloadName("pages", state.workName, "pages", "zip"));
    setStatus("Each-page ZIP downloaded.");
  } catch (e) {
    setStatus("Could not split: " + e.message);
  }
  setBusy(false);
}
function imageCompressSpec(level) {
  if (level === "low") return { scale: 0.62, quality: 0.5 };
  if (level === "high") return { scale: 0.92, quality: 0.86 };
  return { scale: 0.78, quality: 0.68 };
}
async function shrinkBlob(blob, scale, quality, turn = 0) {
  const t = extraTurn({ turn });
  const bmp = await createImageBitmap(blob);
  const swap = t === 90 || t === 270;
  const dw = Math.max(1, Math.round(bmp.width * scale));
  const dh = Math.max(1, Math.round(bmp.height * scale));
  const w = swap ? dh : dw;
  const h = swap ? dw : dh;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { alpha: false });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  if (t) {
    ctx.translate(w / 2, h / 2);
    ctx.rotate(t * Math.PI / 180);
    ctx.drawImage(bmp, -dw / 2, -dh / 2, dw, dh);
  } else {
    ctx.drawImage(bmp, 0, 0, w, h);
  }
  bmp.close();
  return await new Promise(r => c.toBlob(r, "image/jpeg", quality));
}
async function compressPdfPages() {
  const preset = compressPreset(document.getElementById("compressQuality")?.value || "medium");
  const pdf = await pdfjsLib.getDocument({ data: state.workBytes.slice(0) }).promise;
  const dest = await PDFLib.PDFDocument.create();
  const pages = state.workPages.length ? state.workPages : Array.from({ length: pdf.numPages }, (_, i) => ({ page: i + 1, rot: 0 }));
  for (let i = 0; i < pages.length; i++) {
    const item = pages[i];
    const n = item.page || (i + 1);
    setStatus(`Compressing ${i + 1}/${pages.length}…`);
    const page = await pdf.getPage(n);
    const rot = extraTurn(item);
    const viewport = page.getViewport({ scale: preset.scale });
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(viewport.width));
    c.height = Math.max(1, Math.round(viewport.height));
    await page.render({ canvasContext: c.getContext("2d", { alpha: false }), viewport }).promise;
    const jpeg = await new Promise(r => c.toBlob(r, "image/jpeg", preset.quality));
    const img = await dest.embedJpg(await jpeg.arrayBuffer());
    const pt = page.getViewport({ scale: 1 });
    const np = dest.addPage([pt.width, pt.height]);
    np.drawImage(img, { x: 0, y: 0, width: pt.width, height: pt.height });
    if (rot) np.setRotation(PDFLib.degrees(rot));
  }
  return new Blob([await dest.save()], { type: "application/pdf" });
}
async function downloadCompressed() {
  if (!state.workPages.length) return;
  setBusy(true);
  try {
    if (state.workBytes) {
      if (needPdfLib()) {
        const blob = await compressPdfPages();
        downloadBlob(blob, folioDownloadName("compress", state.workName, "small", "pdf"));
        setStatus("Compressed PDF downloaded.");
      }
    } else {
      const spec = imageCompressSpec(document.getElementById("compressQuality")?.value || "medium");
      const files = [];
      for (const item of state.workPages) {
        const src = item.blob || item.file;
        if (!src) continue;
        const blob = await shrinkBlob(src, spec.scale, spec.quality, extraTurn(item));
        files.push({ blob, name: renameExt(item.name, "jpg"), url: URL.createObjectURL(blob) });
      }
      if (!files.length) {
        setStatus("Nothing to compress.");
      } else if (files.length === 1) {
        downloadBlob(files[0].blob, files[0].name);
        setStatus("Compressed image downloaded.");
      } else {
        const zip = new JSZip();
        files.forEach(f => zip.file(f.name, f.blob));
        downloadBlob(await zip.generateAsync({ type: "blob" }), folioDownloadName("images", "images", "small", "zip"));
        setStatus("Compressed images ZIP downloaded.");
      }
      files.forEach(f => URL.revokeObjectURL(f.url));
    }
  } catch (e) {
    setStatus("Could not compress: " + e.message);
  }
  setBusy(false);
}
async function printCompressed() {
  if (!state.workPages.length) return;
  setBusy(true);
  try {
    if (state.workBytes) {
      if (!needPdfLib()) return;
      const blob = await compressPdfPages();
      await printBlob(blob);
      setStatus("Print dialog opened.");
    } else {
      const spec = imageCompressSpec(document.getElementById("compressQuality")?.value || "medium");
      const files = [];
      for (const item of state.workPages) {
        const src = item.blob || item.file;
        if (!src) continue;
        const blob = await shrinkBlob(src, spec.scale, spec.quality, extraTurn(item));
        files.push({ url: URL.createObjectURL(blob) });
      }
      if (!files.length) setStatus("Nothing to print.");
      else {
        printHtml("Print images", files.map(f => `<img src="${f.url}" alt="">`).join(""), () => {
          files.forEach(f => URL.revokeObjectURL(f.url));
        });
        setStatus("Print dialog opened.");
      }
    }
  } catch (e) {
    setStatus("Could not print: " + e.message);
  }
  setBusy(false);
}

document.getElementById("mergeFiles").addEventListener("change", e => addMergeFiles(e.target.files));
document.getElementById("workPdfFile").addEventListener("change", e => {
  if (e.target.files[0]) loadWorkPdf(e.target.files[0], state.tab);
});
document.getElementById("compressFiles").addEventListener("change", e => addCompressFiles(e.target.files));
document.getElementById("mergeOpenBtn").onclick = () => document.getElementById("mergeFiles").click();
document.getElementById("mergeDlBtn").onclick = () => downloadMerged();
document.getElementById("mergePrintBtn").onclick = () => printMerged();
document.getElementById("mergeClearBtn").onclick = () => {
  pushHist();
  clearMerge(); rebuildStrip(); renderStage(); setStatus("Drop several PDFs to merge.");
  syncSizeMeter();
};
document.getElementById("splitOpenBtn").onclick = () => document.getElementById("workPdfFile").click();
document.getElementById("splitDlBtn").onclick = () => downloadSplitPdf();
document.getElementById("splitPrintBtn").onclick = () => printSplitPdf();
document.getElementById("splitEachBtn").onclick = () => downloadSplitZip();
document.getElementById("splitClearBtn").onclick = () => {
  pushHist();
  clearWork(); rebuildStrip(); renderStage(); setStatus("Open a PDF to split.");
  syncSizeMeter();
};
document.getElementById("splitRange")?.addEventListener("change", applySplitRange);
document.getElementById("orgAddFiles")?.addEventListener("change", e => addOrganizePdfs(e.target.files));
document.getElementById("orgOpenBtn")?.addEventListener("click", () => document.getElementById("workPdfFile").click());
document.getElementById("orgAddBtn")?.addEventListener("click", () => document.getElementById("orgAddFiles").click());
document.getElementById("orgDlBtn")?.addEventListener("click", () => downloadOrganizePdf());
document.getElementById("orgPrintBtn")?.addEventListener("click", () => printOrganizePdf());
document.getElementById("orgDelBtn")?.addEventListener("click", () => {
  if (state.workPages.length) removeAt(sel());
});
document.getElementById("orgClearBtn")?.addEventListener("click", () => {
  pushHist();
  clearWork(); rebuildStrip(); renderStage(); setStatus("Open a PDF to organize.");
  syncSizeMeter();
});
document.getElementById("compressOpenBtn").onclick = () => document.getElementById("compressFiles").click();
document.getElementById("compressDlBtn").onclick = () => downloadCompressed();
document.getElementById("compressPrintBtn").onclick = () => printCompressed();
document.getElementById("compressClearBtn").onclick = () => {
  pushHist();
  clearWork(); rebuildStrip(); renderStage(); setStatus("Open a PDF or photos.");
  syncSizeMeter();
};
document.getElementById("compressQuality")?.addEventListener("change", () => { saveMenu(); syncSizeMeter(); });

function syncTextStats() {
  if (!textInput) return;
  const { chars, words, lines } = textStats(textInput.value);
  const note = document.getElementById("textNote");
  if (note) note.textContent = `${words} word${words === 1 ? "" : "s"} · ${chars} character${chars === 1 ? "" : "s"} · ${lines} line${lines === 1 ? "" : "s"}`;
}
function saveTextDesk() {
  try { localStorage.setItem("folio-text", (textInput?.value || "").slice(0, 200000)); } catch {}
}
function loadTextDesk() {
  try {
    const t = localStorage.getItem("folio-text");
    if (t && textInput && !textInput.value) textInput.value = t;
  } catch {}
  syncTextStats();
}
document.getElementById("sideText")?.addEventListener("click", e => {
  const btn = e.target.closest("[data-text-op]");
  if (!btn || !textInput) return;
  pushHist();
  const start = textInput.selectionStart;
  const end = textInput.selectionEnd;
  const hasSel = start !== end;
  const src = hasSel ? textInput.value.slice(start, end) : textInput.value;
  const next = applyTextOp(btn.getAttribute("data-text-op"), src);
  if (hasSel) {
    textInput.setRangeText(next, start, end, "select");
  } else {
    textInput.value = next;
  }
  textInput.focus();
  syncTextStats();
  saveTextDesk();
});
textInput?.addEventListener("input", () => { syncTextStats(); saveTextDesk(); syncSizeMeter(); });
document.getElementById("textCopyBtn")?.addEventListener("click", async () => {
  const t = textInput?.value || "";
  try {
    await navigator.clipboard.writeText(t);
    setStatus("Copied.");
  } catch {
    textInput?.select();
    document.execCommand("copy");
    setStatus("Copied.");
  }
});
document.getElementById("textDlBtn")?.addEventListener("click", () => {
  const t = textInput?.value || "";
  downloadBlob(new Blob([t], { type: "text/plain;charset=utf-8" }), folioDownloadName("text", t.trim().split(/\s+/).slice(0, 4).join(" ") || "notes", "", "txt"));
  setStatus("Text downloaded.");
});
document.getElementById("textPrintBtn")?.addEventListener("click", () => {
  const t = textInput?.value || "";
  if (!t.trim()) { setStatus("Type some text first."); return; }
  printHtml("Print text", `<pre>${escapeHtml(t)}</pre>`);
  setStatus("Print dialog opened.");
});
document.getElementById("textClearBtn")?.addEventListener("click", () => {
  pushHist();
  if (textInput) textInput.value = "";
  syncTextStats();
  saveTextDesk();
  setStatus("Text cleared.");
  syncSizeMeter();
});
function syncLoremLabels() {
  const kind = document.getElementById("loremKind")?.value || "paragraphs";
  const unit = kind === "sentences" ? "sentence" : kind === "list" ? "item" : kind === "words" ? "block" : "paragraph";
  const w = document.getElementById("loremWordsLbl");
  const c = document.getElementById("loremCharsLbl");
  if (w) w.textContent = `Words per ${unit}`;
  if (c) c.textContent = `Characters per ${unit}`;
}
document.getElementById("loremBtn")?.addEventListener("click", () => {
  if (!textInput) return;
  pushHist();
  const kind = document.getElementById("loremKind")?.value || "paragraphs";
  const count = Number(document.getElementById("loremCount")?.value) || 3;
  const classic = !!document.getElementById("loremClassic")?.checked;
  const words = Number(document.getElementById("loremWords")?.value) || 0;
  const chars = Number(document.getElementById("loremChars")?.value) || 0;
  textInput.value = generateLorem(kind, count, classic, { words, chars });
  textInput.focus();
  textInput.setSelectionRange(0, 0);
  syncTextStats();
  saveTextDesk();
  syncSizeMeter();
  const label = kind === "list" ? "list items" : kind;
  const size = [words ? words + " words" : "", chars ? chars + " characters" : ""].filter(Boolean).join(" · ");
  setStatus(`Generated ${count} ${label}${size ? " · " + size + " each" : ""}.`);
});
document.getElementById("loremKind")?.addEventListener("change", () => { syncLoremLabels(); saveMenu(); });
document.getElementById("loremCount")?.addEventListener("change", saveMenu);
document.getElementById("loremWords")?.addEventListener("change", saveMenu);
document.getElementById("loremChars")?.addEventListener("change", saveMenu);
document.getElementById("loremClassic")?.addEventListener("change", saveMenu);
loadTextDesk();

document.getElementById("zoomOut").onclick = () => bumpViewZoom(-ZOOM_STEP);
document.getElementById("zoomIn").onclick = () => bumpViewZoom(ZOOM_STEP);
document.getElementById("zoomVal").onclick = () => setViewZoom(1);
document.getElementById("undoBtn")?.addEventListener("click", undo);
document.getElementById("redoBtn")?.addEventListener("click", redo);

(function setupAdj() {
  const bind = (id, key, fmt) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("pointerdown", () => pushHist());
    el.addEventListener("input", () => {
      writeAdj({ [key]: Number(el.value) });
      const lab = document.getElementById(id + "Val");
      if (lab) lab.textContent = fmt(Number(el.value));
      state.pdfBlob = null;
      applyAdjPreview();
      syncSizeMeter();
    });
    el.addEventListener("change", () => saveMenu());
  };
  bind("adjBright", "brightness", v => v + "%");
  bind("adjContrast", "contrast", v => v + "%");
  bind("adjSaturate", "saturate", v => v + "%");
  bind("adjSharp", "sharpness", v => String(v));
  document.getElementById("adjGray")?.addEventListener("change", e => {
    pushHist();
    writeAdj({ gray: e.target.checked, bw: e.target.checked ? false : currentAdj().bw });
    syncAdjUi();
    commitAdj(false);
  });
  document.getElementById("adjBw")?.addEventListener("change", e => {
    pushHist();
    writeAdj({ bw: e.target.checked, gray: e.target.checked ? false : currentAdj().gray });
    syncAdjUi();
    commitAdj(false);
  });
  document.getElementById("adjBg")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-bg]");
    if (!btn) return;
    pushHist();
    writeAdj({ bg: btn.getAttribute("data-bg") });
    syncAdjUi();
    commitAdj(false);
  });
  document.getElementById("adjReset")?.addEventListener("click", () => {
    pushHist();
    writeAdj(defaultAdj());
    syncAdjUi();
    commitAdj(false);
  });
  document.getElementById("adjAll")?.addEventListener("change", e => {
    pushHist();
    state.adjAll = e.target.checked;
    if (state.adjAll && state.images[state.sel]) {
      const look = cloneAdj(itemAdj(state.images[state.sel]));
      state.images.forEach(it => { it.adj = cloneAdj(look); });
      state.pdfBlob = null;
      applyAdjPreview();
    }
    saveMenu();
    syncAdjUi();
  });
})();

document.getElementById("keysSheet")?.addEventListener("click", e => {
  if (e.target.id === "keysSheet" || e.target.closest("[data-close]")) toggleKeys(false);
});

restoreMenu();
syncAdjUi();
applyAdjPreview();
applyViewZoom();
syncRotateField();
syncIdSheet();
syncSizeMeter();
pushHist();
(function bootTab() {
  const s = readStore();
  const ok = ["to-pdf", "from-pdf", "id-card", "merge", "split", "organize", "compress", "text"];
  const tab = ok.includes(s.tab) ? s.tab : "to-pdf";
  if (s.rail === true || localStorage.getItem("folio-rail") === "1") setRailCollapsed(true, false);
  setTab(tab);
  document.documentElement.classList.add("folio-ready");
})();
(async () => {
  await loadIdCard();
  if (state.tab === "id-card") renderIdDesk();
  else if (state.id.front || state.id.back) saveMenu();
})();

(function setupInstall() {
  const btn = document.getElementById("installBtn");
  const sheet = document.getElementById("installSheet");
  const badge = document.getElementById("railBadge");
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
  if (badge) badge.textContent = "Local";
  if (standalone) {
    document.documentElement.classList.add("standalone");
    return;
  }
  let deferred = null;
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferred = e;
    if (btn) btn.classList.add("ready");
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    if (btn) btn.hidden = true;
  });
  if (btn) {
    btn.onclick = async () => {
      if (deferred) {
        deferred.prompt();
        await deferred.userChoice.catch(() => {});
        deferred = null;
        return;
      }
      if (!sheet) return;
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const iosNote = sheet.querySelector("[data-ios]");
      const chromeNote = sheet.querySelector("[data-chrome]");
      if (iosNote) iosNote.hidden = !ios;
      if (chromeNote) chromeNote.hidden = ios;
      sheet.hidden = false;
      sheet.classList.remove("hidden");
    };
  }
  if (sheet) {
    sheet.addEventListener("click", e => {
      if (e.target === sheet || e.target.closest("[data-close]")) {
        sheet.hidden = true;
        sheet.classList.add("hidden");
      }
    });
  }
})();

(function setupRailMore() {
  const wrap = document.getElementById("railScroll");
  const nav = wrap?.querySelector(".rail-nav");
  const more = document.getElementById("railMore");
  if (!wrap || !nav) return;
  const mq = window.matchMedia("(max-width: 699px)");
  const sync = () => {
    if (!mq.matches) {
      wrap.classList.remove("has-more-end", "has-more-start");
      return;
    }
    const max = nav.scrollWidth - nav.clientWidth;
    wrap.classList.toggle("has-more-end", max > 8 && nav.scrollLeft < max - 8);
    wrap.classList.toggle("has-more-start", nav.scrollLeft > 8);
  };
  nav.addEventListener("scroll", sync, { passive: true });
  window.addEventListener("resize", sync);
  if (mq.addEventListener) mq.addEventListener("change", sync);
  else if (mq.addListener) mq.addListener(sync);
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(sync).observe(nav);
  more?.addEventListener("click", () => {
    nav.scrollBy({ left: Math.max(140, Math.round(nav.clientWidth * .65)), behavior: "smooth" });
  });
  sync();
})();
