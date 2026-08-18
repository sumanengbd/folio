import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.54/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.54/pdf.worker.min.mjs";

const { jsPDF } = window.jspdf;
const PAGE_MM = { a4: [210, 297], letter: [215.9, 279.4], legal: [215.9, 355.6], a5: [148, 210] };
const state = {
  tab: "to-pdf",
  images: [], sel: 0, pdfBlob: null,
  extracted: [], extSel: 0, pdfName: "images", lastPdf: null,
  id: { front: null, back: null, sel: "front" }
};

const canvas = document.getElementById("canvas");
const idDesk = document.getElementById("idDesk");
const idFiles = document.getElementById("idFiles");
const CARD_TYPES = {
  nid: { label: "NID Card", w: 85.6, h: 53.98, file: "nid-card" },
  bank: { label: "Bank Card", w: 86, h: 54, file: "bank-card" }
};
function cardMm() {
  const key = document.getElementById("idCardType")?.value || "nid";
  return CARD_TYPES[key] || CARD_TYPES.nid;
}
function cardSizeText(c) {
  return `${Number(c.w.toFixed(1))} × ${Number(c.h.toFixed(1))} mm`;
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
    idPlace: document.getElementById("idPlace").value
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
  if (typeof s.rotateMatch === "boolean") document.getElementById("rotateMatch").checked = s.rotateMatch;
  if (s.idSel === "front" || s.idSel === "back") {
    state.id.sel = s.idSel;
    restoreSelect("idSide", s.idSel);
  }
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
    state.id.front = unpackIdSlot(data.front);
    state.id.back = unpackIdSlot(data.back);
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
  const el = state.tab === "to-pdf"
    ? document.getElementById("status")
    : state.tab === "id-card"
      ? document.getElementById("idStatus")
      : document.getElementById("extractNote");
  if (msg) el.textContent = msg;
}
function setBusy(on) { busy.classList.toggle("on", on); }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
}
function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

function setTab(tab) {
  state.tab = tab;
  document.documentElement.setAttribute("data-tab", tab);
  document.getElementById("tabToPdf").classList.toggle("on", tab === "to-pdf");
  document.getElementById("tabFromPdf").classList.toggle("on", tab === "from-pdf");
  document.getElementById("tabIdCard").classList.toggle("on", tab === "id-card");
  document.getElementById("sideToPdf").classList.toggle("hidden", tab !== "to-pdf");
  document.getElementById("sideFromPdf").classList.toggle("hidden", tab !== "from-pdf");
  document.getElementById("sideIdCard").classList.toggle("hidden", tab !== "id-card");
  idDesk.classList.toggle("hidden", tab !== "id-card");
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
    saveMenu();
    return;
  }
  document.getElementById("hintTitle").textContent = tab === "to-pdf" ? "Drop images onto the desk" : "Drop a PDF onto the desk";
  document.getElementById("hintText").textContent = tab === "to-pdf"
    ? "They become PDF pages. Scroll the middle to read the full document in order."
    : "Each page becomes an image. Scroll the middle to see every page in order.";
  document.getElementById("chooseBtn").textContent = tab === "to-pdf" ? "Open images" : "Open PDF";
  addTile.style.display = tab === "to-pdf" ? "" : "none";
  rebuildStrip();
  renderStage();
  saveMenu();
}
document.getElementById("tabToPdf").onclick = () => setTab("to-pdf");
document.getElementById("tabFromPdf").onclick = () => setTab("from-pdf");
document.getElementById("tabIdCard").onclick = () => setTab("id-card");

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
  const maxW = Math.max(180, (desk?.clientWidth || 520) - 40);
  const maxH = Math.max(240, (desk?.clientHeight || 700) - 36);
  const pxPerMm = 2.2;
  let wpx = page.w * pxPerMm;
  let hpx = page.h * pxPerMm;
  const fit = Math.min(1, maxW / wpx, maxH / hpx);
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
}
function pageLayout() {
  const size = document.getElementById("pageSize").value;
  const orientation = document.getElementById("orientation").value;
  const fit = document.getElementById("fit").value;
  const margin = Number(document.getElementById("margin").value);
  let [w, h] = PAGE_MM[size];
  if (orientation === "landscape") [w, h] = [h, w];
  return { size, fit, w, h, padX: (margin / w) * 100, padY: (margin / h) * 100 };
}

function items() { return state.tab === "to-pdf" ? state.images : state.extracted; }
function sel() { return state.tab === "to-pdf" ? state.sel : state.extSel; }
function setSel(i) {
  if (state.tab === "to-pdf") state.sel = i;
  else state.extSel = i;
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
  const prev = state.id[side];
  if (prev) URL.revokeObjectURL(prev.url);
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
  idFiles.value = "";
  if (imgs.length >= 2) {
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
  const totalH = pxH * 2 + gap;
  const y0 = Math.round(idPlace() === "top" ? 10 / 25.4 * dpi : (out.height - totalH) / 2);
  const sides = ["front", "back"];
  for (let i = 0; i < 2; i++) {
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
async function downloadIdPdf() {
  if (!state.id.front && !state.id.back) return;
  setBusy(true);
  try {
    const dpi = 220;
    const page = idPageMm();
    const doc = new jsPDF({ orientation: page.orientation, unit: "mm", format: page.size, compress: true });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const mm = cardMm();
    const gap = 8;
    const x = (pageW - mm.w) / 2;
    const totalH = mm.h * 2 + gap;
    const y0 = idStackY(pageH, totalH);
    const pxW = Math.round(mm.w / 25.4 * dpi);
    const pxH = Math.round(mm.h / 25.4 * dpi);
    const sides = ["front", "back"];
    for (let i = 0; i < 2; i++) {
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
    downloadBlob(doc.output("blob"), mm.file + ".pdf");
    setStatus(`PDF downloaded · ${page.size.toUpperCase()} ${page.orientation} · ${mm.label} ${cardSizeText(mm)}.`);
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
    downloadBlob(blob, mm.file + ".png");
    setStatus(`PNG downloaded · ${mm.label} ${cardSizeText(mm)}.`);
  } catch (e) {
    setStatus("Could not create PNG: " + e.message);
  } finally { setBusy(false); }
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

function placeImg(img, L, rot) {
  if (!img) return;
  img.style.position = "absolute";
  img.style.left = "50%";
  img.style.top = "50%";
  img.style.objectFit = L.fit === "cover" ? "cover" : "contain";
  if (rot) {
    img.style.width = `${(L.h / L.w) * 100}%`;
    img.style.height = `${(L.w / L.h) * 100}%`;
    img.style.transform = "translate(-50%, -50%) rotate(-90deg)";
  } else {
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.transform = "translate(-50%, -50%)";
  }
}

function applyPageFrame(page, L, item) {
  if (state.tab !== "to-pdf") {
    const img = page.querySelector("img");
    const w = item?.w || img?.naturalWidth;
    const h = item?.h || img?.naturalHeight;
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
  if (state.tab !== "to-pdf") {
    const run = () => {
      applyPageFrame(page, L, {
        w: item?.w || img?.naturalWidth,
        h: item?.h || img?.naturalHeight
      });
      placeImg(img, { fit: "contain", w: 1, h: 1 }, false);
    };
    if (img && (item?.w || img.naturalWidth)) run();
    else if (img) img.onload = run;
    else applyPageFrame(page, L, item);
    return;
  }
  applyPageFrame(page, L);
  const run = () => {
    const rot = needsRotate(img.naturalWidth, img.naturalHeight, L.w, L.h);
    placeImg(img, L, rot);
  };
  if (img && img.naturalWidth) run();
  else if (img) img.onload = run;
}

let rotateTimers = [];
function staggerRotate() {
  rotateTimers.forEach(clearTimeout);
  rotateTimers = [];
  syncSpread();
  const L = pageLayout();
  const pages = [...stageStack.querySelectorAll(".stage-page")];
  if (!pages.length) return;
  stageStack.classList.add("anim-rotate");
  pages.forEach((page, i) => applyPageFrame(page, L));
  pages.forEach((page, i) => {
    const t = setTimeout(() => {
      const img = page.querySelector("img");
      if (!img) return;
      const rot = needsRotate(img.naturalWidth, img.naturalHeight, L.w, L.h);
      placeImg(img, L, rot);
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
    if (!vis) return;
    const i = +vis.target.dataset.index;
    if (i !== sel()) {
      setSel(i);
      markStrip();
    }
  }, { root: stageStack, threshold: 0.45 });
  stageStack.querySelectorAll(".stage-sheet").forEach(s => pageWatcher.observe(s));
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
  applyPageBox(page, L, item);
  const tag = document.createElement("div");
  tag.className = "page-tag";
  tag.textContent = `Page ${i + 1} of ${n}`;
  sheet.append(page, tag);
  sheet.onclick = () => {
    const idx = +sheet.dataset.index;
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
    return;
  }
  const list = items();
  downloadBtn.disabled = state.images.length === 0;
  const none = state.extracted.length === 0;
  downloadAllBtn.disabled = none;
  downloadThisBtn.disabled = none;
  downloadEachBtn.disabled = none;
  if (!list.length) {
    emptyHint.classList.remove("hidden");
    stageStack.classList.add("hidden");
    stageStack.innerHTML = "";
    canvas.classList.remove("has-pages");
    canvas.classList.remove("spread");
    stageStack.classList.remove("spread");
    nameBar.classList.add("hidden");
    nameBarText.textContent = "";
    pageWatcher?.disconnect();
    return;
  }
  emptyHint.classList.add("hidden");
  stageStack.classList.remove("hidden");
  canvas.classList.add("has-pages");
  syncSpread();
  const L = pageLayout();
  const n = list.length;
  const sheets = [...stageStack.querySelectorAll(".stage-sheet")];
  const prefixMatch = sheets.length && sheets.every((s, i) => i >= n || s.querySelector("img")?.getAttribute("src") === list[i].url || s.querySelector("img")?.src === list[i].url);
  if (sheets.length && sheets.length < n && prefixMatch) {
    for (let i = sheets.length; i < n; i++) stageStack.appendChild(makeSheet(list[i], i, n, L));
    relabelSheets();
    watchPages();
    markStrip();
    return;
  }
  const same = sheets.length === n && sheets.every((s, i) => s.querySelector("img")?.src === list[i].url);
  if (same) {
    sheets.forEach((sheet, i) => applyPageBox(sheet.querySelector(".stage-page"), L, list[i]));
    relabelSheets();
    markStrip();
    return;
  }
  stageStack.innerHTML = "";
  list.forEach((item, i) => stageStack.appendChild(makeSheet(item, i, n, L)));
  watchPages();
  markStrip();
}

function makeShot(item, i, selected) {
  const el = document.createElement("div");
  el.className = "shot" + (selected ? " on" : "");
  el.dataset.index = i;
  const nm = escapeHtml(item.name || `Page ${i + 1}`);
  el.innerHTML = `<span class="n">${i + 1}</span><button class="x" type="button" title="Remove">×</button><img src="${item.url}" alt="" decoding="async"><span class="nm">${nm}</span>`;
  el.onclick = () => { setSel(i); markStrip(); scrollToPage(i); };
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
  } else {
    nameBar.classList.add("hidden");
    nameBarText.textContent = "";
  }
}

function rebuildStrip() {
  [...strip.querySelectorAll(".shot")].forEach(s => s.remove());
  if (state.tab === "id-card") {
    [["front", "Front"], ["back", "Back"]].forEach(([side, label]) => {
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
  list.forEach((item, i) => strip.insertBefore(makeShot(item, i, i === sel()), addTile));
  if (state.tab === "to-pdf") strip.appendChild(addTile);
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
  files.value = "";
  state.pdfBlob = null;
  const isFirst = state.images.length === 0;
  let auto = null;
  if (isFirst) {
    try { auto = await applyBestFromFile(added[0]); }
    catch (e) { console.error(e); }
  }
  added.forEach(file => state.images.push({ file, url: URL.createObjectURL(file), name: file.name }));
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
  canvas.scrollTop = 0;
  canvas.scrollLeft = 0;
  stageStack.scrollTop = 0;
  stageStack.scrollLeft = 0;
}

function removeAt(i) {
  if (state.tab === "to-pdf") {
    const item = state.images[i];
    if (!item) return;
    URL.revokeObjectURL(item.url);
    state.images.splice(i, 1);
    state.pdfBlob = null;
    state.sel = Math.max(0, Math.min(state.sel, state.images.length - 1));
    setStatus(state.images.length ? `${state.images.length} pages.` : "No pages yet.");
  } else {
    const item = state.extracted[i];
    if (!item) return;
    URL.revokeObjectURL(item.url);
    state.extracted.splice(i, 1);
    state.extSel = Math.max(0, Math.min(state.extSel, state.extracted.length - 1));
    setStatus(state.extracted.length ? `${state.extracted.length} images.` : "No images yet.");
  }
  rebuildStrip();
  renderStage();
}

new Sortable(strip, {
  animation: 150,
  draggable: ".shot",
  filter: ".add-tile, .nodrag",
  onEnd: () => {
    if (state.tab !== "to-pdf") return;
    const order = [...strip.querySelectorAll(".shot")].map(s => +s.dataset.index);
    const current = state.images[state.sel];
    state.images = order.map(i => state.images[i]);
    state.sel = Math.max(0, state.images.indexOf(current));
    state.pdfBlob = null;
    rebuildStrip();
    renderStage();
  }
});

document.getElementById("chooseBtn").onclick = () => {
  if (state.tab === "to-pdf") files.click();
  else if (state.tab === "id-card") idFiles.click();
  else pdfFile.click();
};
addTile.onclick = () => files.click();
files.addEventListener("change", e => addFiles(e.target.files));
idFiles.addEventListener("change", e => addIdFiles(e.target.files));
document.getElementById("idOpenBtn").onclick = () => idFiles.click();
document.getElementById("idCardType").addEventListener("change", onIdPageLayout);
document.getElementById("idPageSize").addEventListener("change", onIdPageLayout);
document.getElementById("idOrientation").addEventListener("change", onIdPageLayout);
document.getElementById("idPlace").addEventListener("change", onIdPageLayout);
function onIdPageLayout() {
  syncIdSheet();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      applyIdCard("front");
      applyIdCard("back");
    });
  });
  saveMenu();
}
document.getElementById("idSide").onchange = e => {
  state.id.sel = e.target.value;
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
document.getElementById("idPngBtn").onclick = () => downloadIdPng();
document.getElementById("idClearBtn").onclick = () => {
  clearIdSide("front");
  clearIdSide("back");
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
document.getElementById("choosePdfBtn").onclick = () => pdfFile.click();
pdfFile.addEventListener("change", e => { if (e.target.files[0]) handlePdf(e.target.files[0]); });

["pageSize", "orientation", "fit", "margin", "rotateMatch"].forEach(id =>
  document.getElementById(id).addEventListener("change", async e => {
    state.pdfBlob = null;
    if (e.target.id === "orientation") syncRotateField();
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
      return;
    }
    renderStage();
  })
);

canvas.addEventListener("dragover", e => { e.preventDefault(); canvas.classList.add("drop-on"); });
canvas.addEventListener("dragleave", () => canvas.classList.remove("drop-on"));
canvas.addEventListener("drop", e => {
  e.preventDefault(); e.stopPropagation();
  canvas.classList.remove("drop-on");
  if (state.tab === "to-pdf") addFiles(e.dataTransfer.files);
  else if (state.tab === "id-card") addIdFiles(e.dataTransfer.files);
  else {
    const file = [...e.dataTransfer.files].find(f => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (file) handlePdf(file);
  }
});
stageStack.addEventListener("wheel", e => {
  if (!stageStack.classList.contains("spread")) return;
  if (e.deltaY === 0 && e.deltaX === 0) return;
  e.preventDefault();
  stageStack.scrollLeft += e.deltaY + e.deltaX;
}, { passive: false });
window.addEventListener("dragover", e => e.preventDefault());
window.addEventListener("drop", e => {
  e.preventDefault();
  if (state.tab === "to-pdf") addFiles(e.dataTransfer.files);
  else if (state.tab === "id-card") addIdFiles(e.dataTransfer.files);
  else {
    const file = [...e.dataTransfer.files].find(f => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (file) handlePdf(file);
  }
});
window.addEventListener("keydown", e => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  if (state.tab === "id-card") {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      state.id.sel = "back"; markIdSel();
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      state.id.sel = "front"; markIdSel();
    }
    if (e.key === "Delete") clearIdSide(state.id.sel);
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
  if (e.key === "Delete") removeAt(sel());
});

function drawFitted(ctx, bmp, dw, dh, fit) {
  const scale = fit === "cover"
    ? Math.max(dw / bmp.width, dh / bmp.height)
    : Math.min(dw / bmp.width, dh / bmp.height);
  const w = bmp.width * scale;
  const h = bmp.height * scale;
  ctx.drawImage(bmp, (dw - w) / 2, (dh - h) / 2, w, h);
}

async function rasterPage(file, pxW, pxH, fit) {
  const bmp = await createImageBitmap(file);
  const canvasEl = document.createElement("canvas");
  canvasEl.width = pxW;
  canvasEl.height = pxH;
  const ctx = canvasEl.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "medium";
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, pxW, pxH);
  if (needsRotate(bmp.width, bmp.height, pxW, pxH)) {
    ctx.save();
    ctx.translate(pxW / 2, pxH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.translate(-pxH / 2, -pxW / 2);
    drawFitted(ctx, bmp, pxH, pxW, fit);
    ctx.restore();
  } else {
    drawFitted(ctx, bmp, pxW, pxH, fit);
  }
  bmp.close();
  return { canvas: canvasEl, w: pxW, h: pxH };
}
async function makePdf() {
  if (!state.images.length) return null;
  const size = document.getElementById("pageSize").value;
  const orientation = document.getElementById("orientation").value;
  const fit = document.getElementById("fit").value;
  const margin = Number(document.getElementById("margin").value);
  const doc = new jsPDF({ orientation, unit: "mm", format: size, compress: true });
  const dpi = 144;
  for (let i = 0; i < state.images.length; i++) {
    if (i) doc.addPage(size, orientation);
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const maxW = Math.max(1, pageW - margin * 2);
    const maxH = Math.max(1, pageH - margin * 2);
    const pxW = Math.max(1, Math.round(maxW / 25.4 * dpi));
    const pxH = Math.max(1, Math.round(maxH / 25.4 * dpi));
    setStatus(`Building PDF… ${i + 1}/${state.images.length}`);
    const { canvas: cnv } = await rasterPage(state.images[i].file, pxW, pxH, fit);
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
    downloadBlob(state.pdfBlob, "images.pdf");
    setStatus("Download started.");
  } catch (e) {
    setStatus("Could not create PDF: " + e.message);
  } finally { setBusy(false); }
};
document.getElementById("clearBtn").onclick = () => {
  state.images.forEach(x => URL.revokeObjectURL(x.url));
  state.images = []; state.sel = 0; state.pdfBlob = null; files.value = "";
  rebuildStrip(); renderStage(); setStatus("No pages yet.");
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
async function extractPages(pdf, scale) {
  const items = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    setStatus(`Rendering ${p}/${pdf.numPages}…`);
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale });
    const c = document.createElement("canvas"); c.width = viewport.width; c.height = viewport.height;
    await page.render({ canvasContext: c.getContext("2d", { alpha: false }), viewport }).promise;
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    items.push({ url: URL.createObjectURL(blob), blob, name: `page-${String(p).padStart(2, "0")}.png`, w: c.width, h: c.height, page: p });
  }
  return items;
}
async function handlePdf(file) {
  if (!file) return;
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
    let items = mode === "pages" ? await extractPages(pdf, scale) : await extractEmbedded(pdf);
    if (mode === "embedded" && !items.length) {
      setStatus("No embedded images. Rendering pages instead.");
      items = await extractPages(pdf, scale);
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
  clearExtracted(); state.lastPdf = null; rebuildStrip(); renderStage(); setStatus("Open a PDF.");
};
document.getElementById("downloadThisBtn").onclick = () => {
  const item = state.extracted[state.extSel] || state.extracted[0];
  if (!item) return;
  downloadBlob(item.blob, item.name);
  setStatus(`Downloaded ${item.name}.`);
};
document.getElementById("downloadEachBtn").onclick = async () => {
  const list = state.extracted;
  if (!list.length) return;
  if (window.showDirectoryPicker) {
    try {
      const dir = await window.showDirectoryPicker({ mode: "readwrite" });
      setBusy(true);
      for (const item of list) {
        const handle = await dir.getFileHandle(item.name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(item.blob);
        await writable.close();
      }
      setStatus(`${list.length} images saved to folder.`);
      setBusy(false);
      return;
    } catch (e) {
      setBusy(false);
      if (e.name === "AbortError") return;
    }
  }
  for (let i = 0; i < list.length; i++) {
    downloadBlob(list[i].blob, list[i].name);
    await new Promise(r => setTimeout(r, 160));
  }
  setStatus(`${list.length} images downloading.`);
};
document.getElementById("downloadAllBtn").onclick = async () => {
  if (!state.extracted.length) return;
  const zip = new JSZip();
  state.extracted.forEach(item => zip.file(item.name, item.blob));
  downloadBlob(await zip.generateAsync({ type: "blob" }), state.pdfName + "-images.zip");
  setStatus("ZIP download started.");
};
window.addEventListener("keydown", e => {
  if (e.key === "s" && (e.ctrlKey || e.metaKey) && state.tab === "from-pdf" && state.extracted[state.extSel]) {
    e.preventDefault();
    const item = state.extracted[state.extSel];
    downloadBlob(item.blob, item.name);
  }
});

restoreMenu();
syncRotateField();
syncIdSheet();
(function bootTab() {
  const s = readStore();
  const tab = (s.tab === "from-pdf" || s.tab === "id-card") ? s.tab : "to-pdf";
  state.tab = tab;
  if (s.rail === true || localStorage.getItem("folio-rail") === "1") setRailCollapsed(true, false);
  document.documentElement.setAttribute("data-tab", tab);
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
  if (standalone) {
    document.documentElement.classList.add("standalone");
    if (badge) badge.textContent = "APP";
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
    if (badge) badge.textContent = "APP";
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
