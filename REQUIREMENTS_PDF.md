# Tambola Ticket Generator – PDF/PNG Sheet Edition: Requirements

Status: **Implemented (v1.1)**. Related: [REQUIREMENTS.md](./REQUIREMENTS.md) (PNG-per-ticket edition), [TEST_CASES_PDF.md](./TEST_CASES_PDF.md)

## 1. Purpose

A second page, `index-pdf.html`, that lets you download tickets as **PNG or PDF** in one of two layouts, chosen with the **Download layout** setting:

- **One ticket per image / page (default, the original look)** — each ticket is the large branded ticket on an A4 landscape image, exactly what the PNG page downloads. PNG: one image per ticket; PDF: one file per person with one ticket per landscape A4 page. A single ticket prints large and whole.
- **Sheet: 12 tickets per A4 page** — a compact, printed-tambola-sheet style page (two sets of 6), described in §3.

It is a **separate implementation**: the PNG-per-ticket page (`index.html`, `js/app.js`, `js/render.js`, `css/style.css`) is not modified. This page reuses the logic modules unchanged (`rng.js`, `ticket.js`, `registry.js`, `planner.js`, `exporter.js`, `png.js`, `render.js`) and adds new files only.

## 2. Same as the PNG edition

Everything about **who gets which tickets**: upload (.xlsx/.xlsm/.xls/.csv), `Name` column, ticket counts ("(N tickets)" text, blank = 1, confirmation "No" still gets a ticket), grouping by email, request order, warnings, Tambola rules R1–R8, uniqueness U1–U4, seed toggle, walk-ins (1–20), rules panel with live self-check, encrypted-workbook message (REQUIREMENTS.md §3–§7, §10). Defaults: heading `Give 2026`, footer `Good luck!` (restored on every load).

## 3. Sheet layout (option "Sheet: 12 tickets per A4 page"; modelled on the supplied reference sheet, orange branding kept)

A4 portrait, 210 × 297 mm:

- **Title** (bold, centred): the person's name (shrinks to fit, then truncates). Under it a small grey line: `Give 2026 · 8 tickets`. An orange rule separates the title from the tickets. For the combined sheets the title is `Give 2026 — All tickets` with `N tickets · M people`.
- **12 tickets per page**: 2 columns × 6 rows, each 90 × 36 mm, grouped into **two sets of 6** (3 rows × 2 columns). Each set has a small label `Set n · #0012 – #0017` (serial range) above it; a **dashed line** separates the sets. Set numbers continue across pages.
- **Each ticket**: orange rounded frame; a header strip with the **ID badge** (the unique serial, e.g. `#0042`, as a pill, like `A01` in the reference), the **holder's name** in the middle (so a ticket cut from the sheet still shows whose it is) and `3 of 8` on the right; below it the 3×9 grid with thin black lines, a heavier outer border, **bold black numbers** and a very light tint on blank cells.
- **Footer**: footer text centred (default `Good luck!`), `n / m` bottom right when there is more than one page.
- Settings that affect the sheet: heading, footer, "Show serial number" (when off the badge shows `T1`, `T2`… the person's ticket number), "Show `n of N`" (only when a person has more than one ticket), Title Case names.
- A person with ≤ 12 tickets gets one page; a partial last set/page just has fewer tickets. The sheet is always a full A4 page, so nothing is cropped when it is printed ("fit"/"full page").

## 4. Downloads: PDF or PNG, per layout

**Layout "One ticket per image / page" (default, the original look).** Each ticket is drawn exactly like the PNG page's default download: the branded ticket centred on an A4 landscape image (2339 × 1654 px, 200 dpi stored in the file), with wide margins and a light dashed cut line. This shape fits "Fill page" photo-print dialogs (A4/Letter landscape, 5 × 7, 4 × 6, 8 × 10 …) without cropping, and a single ticket prints large.

| Where | PDF | PNG |
|---|---|---|
| **Per person** (buttons in each person's group) | `Name.pdf` — one landscape A4 page per ticket | one ticket → `Name.png`; several → a ZIP `Name_png.zip` holding `Name_1.png`, `Name_2.png`, … (same names as the PNG page) |
| **Download all (ZIP)** (format chosen in the *Bulk format* selector) | ZIP of one PDF per person | ZIP of every ticket's PNG |
| **Combined sheets (12 per page)** (same selector; always the sheet layout) | `Tambola_All_Tickets.pdf` | ZIP `Tambola_All_Tickets_PNG.zip` with `Tambola_All_Tickets_p01.png`, … |

**Layout "Sheet: 12 tickets per A4 page".**

| Where | PDF | PNG |
|---|---|---|
| **Per person** | `Name.pdf` (all sheet pages, portrait A4) | one page → `Name.png`; several pages → ZIP `Name_png.zip` with `Name_1.png`, `Name_2.png`, … |
| **Download all (ZIP)** | ZIP of one PDF per person | ZIP of every person's PNG pages |
| **Combined sheets** | as above | as above |

- PDF and PNG come from **the same renderer** as the on-screen preview, so they always look identical.
- Sheet PNG: 2480 × 3508 px (A4 at 300 dpi), pHYs 300 dpi, about 0.3–0.6 MB per page. PDF pages embed the page as a JPEG (quality 0.92), about 0.2 MB per ticket page and 0.6–0.8 MB per sheet page.
- File names: person display name sanitised; PDF names unique ignoring case (`Name.pdf`, `Name (2).pdf`); PNG names unique ignoring case across everyone (a person called `Raj_1` cannot collide with `Raj` page/ticket 1).
- The *Bulk format* (PDF/PNG) and the *Download layout* choices are remembered between sessions; heading and footer are not.
- Above 600 tickets the combined download asks for confirmation (memory).
- CSV: `Ticket ID, Name, Ticket No., Tickets For Person, Page, Set, PDF file, PNG file, Source, Row 1–3, All numbers`. In the ticket layout `Page` is the ticket number, `Set` is empty and `PNG file` is the per-ticket file; in the sheet layout `Page`/`Set` locate the ticket on its sheet.

## 5. Page behaviour

1. Upload → summary → **Generate tickets**. The gallery is grouped by person with `N tickets · file.pdf`. In the default layout it shows **the tickets themselves** (large branded tickets, with serial and file name). In the sheet layout it shows **the sheet pages**, cropped to the used part of the page so a short sheet does not look like a tiny ticket on a blank page.
2. **Walk-ins** add to the person's group if the name exists (e.g. Ananya 2 → 4 tickets), otherwise a new group.
3. Switching the layout redraws the gallery and changes what the downloads produce.
4. Filter by name, CSV, registry export/import (merge/replace), reset and start-fresh work as in the PNG page.
5. Changing heading, footer or the serial/label toggles redraws the previews and applies to the next downloads.

## 6. Registry shared with the PNG page

Both pages read and write the same `localStorage` registry (`tambola.registry.v1`), so **every ticket stays unique across both pages**. A revision counter makes a page adopt a newer registry saved by another tab or by the other page, and before issuing any new ticket. Reset / Start fresh clears the shared registry (the confirmation says so). Sheet-page settings use their own key (`tambola.pdf.settings.v1`). Open both pages from the same browser.

## 7. Non-functional

| Area | Requirement |
|---|---|
| Offline | jsPDF 2.5.2, SheetJS and JSZip bundled locally |
| Privacy | nothing leaves the browser |
| Performance | one person's PDF/PNG in about 1–2 s; 19 people → bulk ZIP in a few seconds; UI stays responsive (yields between pages) |
| Testability | geometry, pagination, PDF assembly, file names and CSV live in `js/pdf-builder.js` (no DOM) and are unit-tested in Node |

## 8. Files

| Path | Purpose |
|---|---|
| `index-pdf.html`, `css/pdf.css` | sheet page and its extra styles (reuses `css/style.css`) |
| `js/pdf-builder.js` | sheet geometry, pagination, PDF assembly (jsPDF), file names, CSV |
| `js/pdf-sheet.js` | canvas renderer of one sheet page (preview, PNG, PDF page image) |
| `js/pdf-app.js` | page logic (upload, generate, walk-in, grouped gallery, downloads) |
| `lib/jspdf.umd.min.js` | jsPDF |
| `tests/pdf-builder.test.js` | unit tests |

## 9. Decisions log

| # | Decision |
|---|---|
| P1 | Separate page; existing PNG-per-ticket files are not changed |
| P2 | Sheet layout like the supplied reference: 12 per A4 page (2 × 6), sets of 6, dashed set separator, ID badge per ticket, title on top; orange branding kept |
| P3 | Registry shared with the PNG page for cross-page uniqueness |
| P4 | Both PDF and PNG downloads, per person and in bulk; PNG is the same sheet page rendered as an image |
| P5 | ID badge = unique serial (usable to verify a winner); the holder's name is also on every ticket |
| P6 | Combined sheets flow continuously across people (printing on the day) instead of one page per person |
| P7 | Pages are embedded as images (identical look, any Unicode name such as emoji works) rather than vector text |
| P8 | **Default layout = the original single ticket** (one large branded ticket per A4 landscape image; PDF = one ticket per page). The 12-per-page sheet stays an option. Reason: a single ticket on a mostly blank sheet printed poorly |
| P9 | The sheet-layout preview is cropped to its used area; the single-ticket gallery shows the tickets themselves |
| P10 | Combined sheets always use the 12-per-page layout (printing everything on the day) |

## 10. Known limits / possible later work

- Image-based pages make files larger than a vector PDF (about 0.7 MB per page). A vector version would need an embedded Unicode font for names such as "Muskaan Hooda 🐾".
- ZIPs and the combined output are built in memory (practical up to a few hundred tickets for the combined file).
- Tickets are about 90 × 36 mm (like the reference sheet); cut along the dashed line between sets and around each framed ticket.
