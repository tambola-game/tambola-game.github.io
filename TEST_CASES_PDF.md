# Tambola Ticket Generator – PDF/PNG Sheet Edition: Test Cases

Related: [REQUIREMENTS_PDF.md](./REQUIREMENTS_PDF.md), [TEST_CASES.md](./TEST_CASES.md) (PNG edition; generation, uniqueness, planning, parsing and walk-in cases there also apply because the same modules are used).

**Legend** – Type: `A` automated (Node unit test or browser run), `M` manual. Priority `P0` must pass, `P1` important, `P2` nice to have. Status: ✔ done in this build, ☐ still to do.

## 1. Sheet geometry and PDF structure

| ID | Scenario | Expected | Pri | Type | Status |
|---|---|---|---|---|---|
| SHT-001 | Grid | 12 tickets per page, 2 columns × 3 rows per set, 2 sets of 6 | P0 | A | ✔ |
| SHT-002 | Margins and overlap | All 12 slots inside the page (≥ 10 mm side margins), below the title rule, above the footer, none overlapping | P0 | A | ✔ |
| SHT-003 | Cell size | Cells ≈ square, ≥ 9 mm | P1 | A | ✔ |
| SHT-004 | Separator / labels | Dashed separator sits between the two sets; set labels below the title rule; second set ends ≥ 15 mm above the page bottom | P1 | A | ✔ |
| SHT-005 | Pagination | 1/6/7/12/13/24/25/28 tickets → 1/1/1/1/2/2/3/3 pages; sets of 6; partial last set/page; order preserved | P0 | A | ✔ |
| SHT-006 | PDF validity | 1, 2, 3, 5 pages → that many A4 pages (595.28 × 841.89 pt), one image per page, `%PDF-`…`%%EOF` | P0 | A | ✔ |
| SHT-007 | Full-page image | The page image fills the A4 page from (0,0) with no margins | P0 | A | ✔ |
| SHT-008 | Real PDF opens | Downloaded PDF opens in Chromium's PDF viewer as one A4 page showing the sheet | P0 | M | ✔ |

## 2. Rendered sheet (visual)

| ID | Scenario | Expected | Pri | Type | Status |
|---|---|---|---|---|---|
| SHT-020 | Matches the reference | 8-ticket sheet (Arjun Nair): title, subtitle, orange rule, `Set 1 · #0012 – #0017`, 6 framed tickets, dashed line, `Set 2 · #0018 – #0019`, 2 tickets, footer | P0 | M | ✔ |
| SHT-021 | Ticket strip | Serial pill on the left, holder's name centred, `n of N` on the right | P0 | M | ✔ |
| SHT-022 | Numbers | Bold, centred, legible; blank cells lightly tinted; 3×9 with heavier outer border | P0 | M | ✔ |
| SHT-023 | Emoji / Unicode name | `Muskaan Hooda 🐾` shows the emoji in the title and in every ticket strip | P0 | M | ✔ |
| SHT-024 | Multi-page | 28 tickets → 3 pages; page 3 has 4 tickets, `3 / 3`, set label continues (`Set 5`), `25 of 28` … `28 of 28` | P0 | M | ✔ |
| SHT-025 | Long name | Title shrinks then truncates with an ellipsis; ticket strip name truncates, never overlaps the pill or `n of N` | P1 | M | ☐ |
| SHT-026 | Serial off | Badge shows `T1`, `T2`… | P2 | M | ☐ |
| SHT-027 | Single-ticket person | No `n of N` text; one ticket on the page | P1 | M | ☐ |
| SHT-028 | Print | Print on A4 ("fit"/"full page") on a laser printer and in greyscale: nothing cropped, numbers crisp, tints readable | P0 | M | ☐ |

## 3. Downloads (PDF and PNG)

### 3a. Default layout: one ticket per image / page (original look)

| ID | Scenario | Expected | Pri | Type | Status |
|---|---|---|---|---|---|
| ORG-001 | Default | Layout selector defaults to "One ticket per image / page"; gallery shows 33 large tickets (not sheet pages) for the sample | P0 | A | ✔ |
| ORG-002 | Single-ticket PNG | Divya Kulkarni → `Divya Kulkarni.png`, 2339 × 1654 px, 200 dpi, ≈ 0.18 MB; same output as the PNG page | P0 | A | ✔ |
| ORG-003 | Prints whole | Simulated "Fill page" at 5 × 7 in landscape keeps the whole ticket (only margin trimmed) | P0 | A | ✔ |
| ORG-004 | Multi-ticket PNG | Arjun Nair (8) → button "Download PNG (ZIP)"; ZIP holds `Arjun Nair_1.png … _8.png` | P0 | A | ✔ |
| ORG-005 | Multi-ticket PDF | `Arjun Nair.pdf` = 8 landscape A4 pages, 8 images (≈ 1.6 MB) | P0 | A | ✔ |
| ORG-006 | Landscape PDF geometry | Unit test: landscape pages are 841.89 × 595.28 pt and the image fills them; mixed orientations allowed | P0 | A | ✔ |
| ORG-007 | CSV | Ticket layout: `Page` = ticket number, `Set` empty, `PNG file` = per-ticket name | P1 | A | ✔ |
| ORG-008 | Bulk ZIPs (ticket layout) | PDF → one PDF per person; PNG → every ticket's PNG | P0 | A | ☐ |
| ORG-009 | Layout remembered | The layout choice persists after reload; switching it redraws the gallery | P1 | A | ✔ |

### 3b. Sheet layout (12 per page)

| ID | Scenario | Expected | Pri | Type | Status |
|---|---|---|---|---|---|
| DL-001 | Person PDF | Arjun Nair (8) → `Arjun Nair.pdf`, 1 page (≈ 0.7 MB) | P0 | A | ✔ |
| DL-002 | Person PNG, one page | `image/png`, 2480 × 3508 px, pHYs 300 dpi (≈ 0.6 MB) | P0 | A | ✔ |
| DL-003 | Person PNG, several pages | 28 tickets → button reads "Download PNG (ZIP)"; ZIP holds `Muskaan Hooda 🐾_1.png`, `_2.png`, `_3.png` | P0 | A | ✔ |
| DL-004 | Person PDF, several pages | 28 tickets → 3-page PDF (≈ 2.3 MB) | P0 | A | ✔ |
| DL-005 | Bulk PDF ZIP | Bulk format PDF → ZIP with one PDF per person (19 files) | P0 | A | ✔ |
| DL-006 | Bulk PNG ZIP | Bulk format PNG → ZIP with every page as PNG (21 files for 19 people / 61 tickets) | P0 | A | ✔ |
| DL-007 | Combined PDF | One PDF, 61 tickets flowing across 6 pages (≈ 5 MB) | P0 | A | ✔ |
| DL-008 | Combined PNG | ZIP with `Tambola_All_Tickets_p01.png` … `_p06.png` | P0 | A | ✔ |
| DL-009 | Format remembered | Bulk format persists after reload; heading/footer do not | P1 | A | ✔ |
| DL-010 | CSV | Header with `Page`, `Set`, `PDF file`, `PNG file`; one row per ticket (61); ticket 7 → page 1 set 2; ticket 13 → page 2 set 1 | P0 | A | ✔ |
| DL-011 | File names | `A/B:C*D?` → `ABCD`; `///` → `Ticket_<serial>`; same name different people → `AMIT (2)`; PNG names never collide (`Raj_1` vs `Raj` page 1) | P0 | A | ✔ |
| DL-012 | Large combined download | > 600 tickets asks for confirmation | P2 | A | ☐ |
| DL-013 | Email delivery | A 1-page PNG/PDF attaches to an email and opens on a phone and in Outlook | P0 | M | ☐ |
| DL-014 | PNG print | Open the PNG in Windows Photos, choose A4 and "Fill page": the whole sheet prints, nothing cropped | P0 | M | ☐ |

## 4. Page behaviour and shared registry

| ID | Scenario | Expected | Pri | Type | Status |
|---|---|---|---|---|---|
| PG-001 | Load | No console errors; heading `Give 2026`, footer `Good luck!` | P0 | A | ✔ |
| PG-002 | Sample upload | 20 rows → 18 people → 33 tickets | P0 | A | ✔ |
| PG-003 | Gallery | 18 person groups, 18 sheet previews, `— 33 tickets · 18 people · 18 pages`, self-check passes | P0 | A | ✔ |
| PG-004 | Walk-in to an existing person | 20 + 8 walk-in tickets for `Muskaan Hooda 🐾` → one group, 28 tickets · 3 pages | P0 | A | ✔ |
| PG-005 | Walk-in validation / filter / settings redraw | Empty name, 0, 21, 1.5 rejected; filter hides other people; heading change repaints previews | P1 | A | ✔ |
| PG-006 | Shared registry | A walk-in on the PNG page appears on the sheet page and vice versa; 40 tickets, 40 distinct ticket sets, 120 distinct rows, 40 distinct serials | P0 | A | ✔ |
| PG-007 | PNG page unchanged | `index.html`, `js/app.js`, `js/render.js`, `css/style.css` untouched by this work; all earlier tests pass (95 total) | P0 | A | ✔ |
| PG-008 | Reset | Clears the shared registry; confirmation mentions the PNG page | P1 | A | ✔ |
| PG-009 | Preview needs a visible tab | Previews are drawn lazily when scrolled into view (nothing is drawn in a hidden tab); downloads do not depend on previews | P2 | A | ✔ |
| PG-011 | Sheet preview crop | Sheet layout: a one-ticket sheet's preview is cropped to the used area (aspect ratio 210 / 75) instead of a tiny ticket on a blank page | P1 | A | ✔ |
| PG-012 | Gallery captions | Serial and file name on separate lines under each ticket | P2 | M | ✔ |
| PG-010 | Corrupt / encrypted upload, registry import/export | Same behaviour as the PNG page | P1 | A | ☐ |
