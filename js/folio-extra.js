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


