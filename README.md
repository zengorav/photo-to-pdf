# photo-to-pdf

Mobile-first, browser-only app for turning phone photos into a PDF.

## Features

- Capture photos directly from mobile camera (`capture="environment"`) or upload from gallery
- Touch-friendly photo list with ordering controls
- Basic image edits before export:
  - Rotate left/right
  - Crop each edge (left/right/top/bottom)
- Compression/resizing controls to keep PDF size manageable
- PDF generation fully in browser (no backend)
- Page size options: **A4** and **Letter**
- Download generated PDF locally

## Tech stack

- React + Vite
- jsPDF for PDF generation
- HTML5 Canvas for crop/rotate/resize processing

## Getting started

```bash
npm install
npm run dev
```

Open the URL shown by Vite (usually `http://localhost:5173`).

## Build

```bash
npm run build
npm run preview
```

## Notes

- Export defaults are tuned for a practical mobile workflow:
  - `A4` page size
  - `12mm` page margin
  - `balanced` JPEG quality
  - `2200px` max image dimension
- All image processing and PDF generation stays in the browser.
