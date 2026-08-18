# Folio — PDF Tools

Local web app for everyday PDF work. Nothing is uploaded. Files stay on this device.

## Tools

1. **Images → PDF** — drop photos or scans, arrange pages, download a PDF  
2. **PDF → Images** — open a PDF, preview pages, download one image, all images, or a ZIP  
3. **ID / Bank Card** — fit phone photos of an NID or bank card (front + back) onto a page

## Run it

Open the folder in a local server. Do not double-click the HTML file if you want install or PDF preview to work.

```bash
py -3 -m http.server 8080
```

Then open:

[http://localhost:8080/pdftools.html](http://localhost:8080/pdftools.html)

## Install as an app

In Chrome (or Edge), click **Install app** in the left menu, or use the install icon in the address bar. After that Folio opens in its own window.

On iPhone: tap **Install app**, then Share → Add to Home Screen.

## Images → PDF

- Add images from the strip or drop them on the desk  
- Page size, orientation, fit, and margin are in the right sidebar  
- In landscape, **Rotate** can turn a portrait photo to match the page  
- Download builds the PDF only when you click **Download PDF**

## PDF → Images

- **Each page as an image** (default) or extract embedded images  
- Click a page in the middle or the strip to select it  
- **This image** — save the selected page only (no ZIP)  
- **All images** — save every page as separate files (Chrome may ask for a folder)  
- **Download ZIP** — one archive of all pages

## ID / Bank Card

- Card type: **NID Card — 85.6 × 54 mm** or **Bank Card — 86 × 54 mm**  
- Front on top, back below, on A4 / Letter / Legal / A5, portrait or landscape  
- Drag to crop, scroll to zoom, rotate to straighten a phone photo  
- Download PDF or PNG at true card size

Settings (tool, page size, rail) are remembered in the browser. ID card photos are stored in IndexedDB on this device only.

## Project files

```
pdftools.html
manifest.webmanifest
sw.js                 ← service worker (stays at root for install)
js/
  boot.js             ← restores UI before first paint
  app.js              ← tools, preview, download
  sw.js               ← cache logic
img/
  icon-192.png
  icon-512.png
  icon-maskable-512.png
  apple-touch-icon.png
```

Libraries load from CDN: jsPDF, pdf.js, JSZip, SortableJS.
