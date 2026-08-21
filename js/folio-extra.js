export function parsePageRange(text, max) {
  if (!text || !String(text).trim()) return Array.from({ length: max }, (_, i) => i + 1);
  const out = new Set();
  for (const raw of String(text).split(/[,;\s]+/)) {
    if (!raw) continue;
    const m = raw.match(/^(\d+)\s*[-–—to]+\s*(\d+)$/i);
    if (m) {
      let a = Number(m[1]), b = Number(m[2]);
      if (a > b) [a, b] = [b, a];
      for (let n = a; n <= b; n++) if (n >= 1 && n <= max) out.add(n);
    } else {
      const n = Number(raw);
      if (n >= 1 && n <= max) out.add(n);
    }
  }
  return [...out].sort((a, b) => a - b);
}

export function imageFormatSpec() {
  const fmt = document.getElementById("imgFormat")?.value || "png";
  if (fmt === "jpg") return { mime: "image/jpeg", ext: "jpg", quality: 0.92 };
  if (fmt === "webp") return { mime: "image/webp", ext: "webp", quality: 0.92 };
  return { mime: "image/png", ext: "png", quality: undefined };
}

export function renameExt(name, ext) {
  return String(name || "image").replace(/\.[a-z0-9]+$/i, "") + "." + ext;
}

export async function blobToFormat(blob, spec, w, h) {
  if (blob && blob.type === spec.mime) return blob;
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = w || bmp.width;
  c.height = h || bmp.height;
  const ctx = c.getContext("2d", { alpha: spec.mime === "image/png" });
  if (spec.mime !== "image/png") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return await new Promise(res => c.toBlob(res, spec.mime, spec.quality));
}

export async function pdfThumb(pdfjsLib, bytes, pageNum = 1, scale = 0.35) {
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const c = document.createElement("canvas");
  c.width = viewport.width;
  c.height = viewport.height;
  await page.render({ canvasContext: c.getContext("2d", { alpha: false }), viewport }).promise;
  const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.72));
  return { url: URL.createObjectURL(blob), blob, w: c.width, h: c.height, pages: pdf.numPages };
}

export function compressPreset(level) {
  if (level === "low") return { scale: 1, quality: 0.48 };
  if (level === "high") return { scale: 1.7, quality: 0.86 };
  return { scale: 1.25, quality: 0.68 };
}

export function drawCropMarks(doc, x, y, w, h, bleed) {
  const len = 3.2;
  const gap = 1.2;
  const ox = x - bleed;
  const oy = y - bleed;
  const ow = w + bleed * 2;
  const oh = h + bleed * 2;
  doc.setDrawColor(17);
  doc.setLineWidth(0.18);
  const corners = [
    [ox, oy, -1, -1],
    [ox + ow, oy, 1, -1],
    [ox, oy + oh, -1, 1],
    [ox + ow, oy + oh, 1, 1]
  ];
  corners.forEach(([cx, cy, dx, dy]) => {
    doc.line(cx + dx * gap, cy, cx + dx * (gap + len), cy);
    doc.line(cx, cy + dy * gap, cx, cy + dy * (gap + len));
  });
}

export function textStats(s) {
  const t = String(s || "");
  const chars = t.length;
  const words = t.trim() ? t.trim().split(/\s+/).length : 0;
  const lines = t ? t.split(/\n/).length : 0;
  return { chars, words, lines };
}

export function applyTextOp(op, s) {
  const t = String(s || "");
  if (op === "upper") return t.toLocaleUpperCase();
  if (op === "lower") return t.toLocaleLowerCase();
  if (op === "sentence") {
    return t.toLocaleLowerCase().replace(/(^|[.!?।\n]+\s*)(\S)/g, (m, a, b) => a + b.toLocaleUpperCase());
  }
  if (op === "title") {
    return t.toLocaleLowerCase().replace(/(^|[^\p{L}\p{N}'])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase());
  }
  if (op === "invert") {
    return [...t].map(c => {
      const up = c.toLocaleUpperCase();
      const low = c.toLocaleLowerCase();
      if (up === low) return c;
      return c === up ? low : up;
    }).join("");
  }
  if (op === "alt") {
    let n = 0;
    return [...t].map(c => {
      if (!/\p{L}/u.test(c)) return c;
      const out = n % 2 ? c.toLocaleLowerCase() : c.toLocaleUpperCase();
      n += 1;
      return out;
    }).join("");
  }
  if (op === "trim") return t.replace(/[ \t]+/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (op === "lines") return t.replace(/\s*\n+\s*/g, " ").replace(/[ \t]{2,}/g, " ").trim();
  if (op === "reverse") return [...t].reverse().join("");
  return t;
}

export function fmtBytes(n) {
  n = Number(n) || 0;
  if (n <= 0) return "—";
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB";
  return (n / 1048576).toFixed(n < 10485760 ? 2 : 1) + " MB";
}

export function fileStamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function safeFilePart(s, fallback = "folio") {
  const t = String(s || "")
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return t || fallback;
}

export function folioDownloadName(kind, base, extra, ext) {
  const name = safeFilePart(base, kind || "folio");
  const bit = extra ? "-" + safeFilePart(extra, "file") : "";
  return `${name}${bit}-${fileStamp()}.${ext || "pdf"}`;
}

export function defaultAdj() {
  return { brightness: 100, contrast: 100, saturate: 100, sharpness: 0, gray: false, bw: false, bg: "#ffffff" };
}

export function adjCss(adj) {
  const a = adj || defaultAdj();
  const gray = a.gray || a.bw;
  const parts = [
    `brightness(${(Number(a.brightness) || 100) / 100})`,
    `contrast(${((Number(a.contrast) || 100) / 100) * (a.bw ? 1.8 : 1) * (1 + (Number(a.sharpness) || 0) / 280)})`,
    `saturate(${gray ? 0 : (Number(a.saturate) || 100) / 100})`,
    gray ? "grayscale(1)" : ""
  ].filter(Boolean);
  return parts.join(" ");
}

function clampByte(n) {
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

export function adjustPixels(data, adj) {
  const a = adj || defaultAdj();
  const bAdd = ((Number(a.brightness) || 100) - 100) * 2.55;
  const c = (Number(a.contrast) || 100) / 100;
  const s = a.gray || a.bw ? 0 : (Number(a.saturate) || 100) / 100;
  const intercept = 128 * (1 - c);
  const bw = !!a.bw;
  const gray = !!a.gray || bw;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] + bAdd;
    let g = data[i + 1] + bAdd;
    let b = data[i + 2] + bAdd;
    r = r * c + intercept;
    g = g * c + intercept;
    b = b * c + intercept;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = l + (r - l) * s;
    g = l + (g - l) * s;
    b = l + (b - l) * s;
    if (gray) r = g = b = l;
    if (bw) r = g = b = l > 140 ? 255 : 0;
    data[i] = clampByte(r);
    data[i + 1] = clampByte(g);
    data[i + 2] = clampByte(b);
  }
}

export function sharpenImageData(imageData, amount) {
  const mix = Math.min(1, Math.max(0, Number(amount) || 0) / 100) * 0.7;
  if (mix < 0.02) return;
  const w = imageData.width;
  const h = imageData.height;
  const src = imageData.data;
  const copy = new Uint8ClampedArray(src);
  const k = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let v = 0;
        let i = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            v += copy[((y + ky) * w + (x + kx)) * 4 + c] * k[i++];
          }
        }
        const idx = (y * w + x) * 4 + c;
        src[idx] = clampByte(src[idx] * (1 - mix) + v * mix);
      }
    }
  }
}

export function applyAdjToCanvas(ctx, w, h, adj) {
  const a = adj || defaultAdj();
  const changed = a.brightness !== 100 || a.contrast !== 100 || a.saturate !== 100 || a.sharpness > 0 || a.gray || a.bw;
  if (!changed) return;
  const img = ctx.getImageData(0, 0, w, h);
  adjustPixels(img.data, a);
  sharpenImageData(img, a.sharpness);
  ctx.putImageData(img, 0, 0);
}

export function estimateJpegPdfBytes(pages, mmW, mmH, dpi, quality) {
  const n = Math.max(0, pages | 0);
  if (!n) return 0;
  const px = Math.max(1, (mmW / 25.4) * dpi) * Math.max(1, (mmH / 25.4) * dpi);
  const q = quality == null ? 0.82 : quality;
  return Math.round(n * px * (0.055 + q * 0.09) + 2800 + n * 900);
}

export async function rotateImageBlob(blob, turn, spec, w, h) {
  const t = (((turn || 0) % 360) + 360) % 360;
  if (!t) return blobToFormat(blob, spec, w, h);
  const bmp = await createImageBitmap(blob);
  const swap = t === 90 || t === 270;
  const c = document.createElement("canvas");
  c.width = swap ? bmp.height : bmp.width;
  c.height = swap ? bmp.width : bmp.height;
  const ctx = c.getContext("2d", { alpha: spec.mime === "image/png" });
  if (spec.mime !== "image/png") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(t * Math.PI / 180);
  ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  bmp.close();
  return await new Promise((r) => c.toBlob(r, spec.mime, spec.quality));
}


