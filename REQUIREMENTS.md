# Tambola Ticket Generator – Requirements

Status: **Finalized (v1.0)**. Implementation not started.
Related: [TEST_CASES.md](./TEST_CASES.md)

## 1. Purpose

A web page that reads an Excel/CSV sheet of ticket registrations and generates **unique, rule-compliant Tambola (Housie) tickets**, personalized with each person's **Name**. Tickets are rendered on screen first, then downloaded as individual PNG files. Walk-in participants (not in the sheet) can be issued tickets on the fly with the same uniqueness guarantees.

## 2. Scope

| In scope | Out of scope |
|---|---|
| Upload .xlsx / .csv, parse in browser | Backend / server / database |
| Ticket planning from rows (count rules, grouping) | Running the game (number calling, winner checking) |
| Tambola ticket generation + validation | 6-ticket strips |
| On-screen gallery, per-ticket PNG download, ZIP of all | Payment / donation verification |
| Walk-in ticket generation | User accounts / authentication |
| Browser-local persistence for uniqueness | Multi-user real-time sync |
| CSV / JSON exports | |

## 3. Input: Excel columns

Columns are located **by header text** (case-insensitive, trimmed), never by position. Header row = first row of the selected sheet (first sheet by default).

| Column (header) | Used for | Required |
|---|---|---|
| `Name` | Personalization on the ticket (**not** `Full Name`) | **Yes** |
| `Email` | Identifying the same person across rows (grouping) | Recommended |
| `How many tickets are you registering for? (1 ticket = ₹250 …)` (match: header starts with "How many tickets") | Ticket count | Recommended |
| `Donated to other cause(s)? List them here …` (match: header starts with "Donated to other cause") | Fallback ticket count via text such as `(8 tickets)` | Optional |
| `I confirm my donation was made voluntarily …` | **Ignored** – every row gets tickets regardless of Yes/No | Optional |
| All other columns (Start time, Team, Location, …) | Ignored | – |

If `Name` is missing, processing stops with a clear error. If the ticket-count column is missing, a warning is shown and the fallback rules in §4 apply.

## 4. Ticket count per row

Each row is a **separate purchase**. For every row, in this order:

1. `count` = number parsed from the ticket-count column (leading number; `"3"`, `3`, `"3 tickets"` → 3).
2. `textCount` = N parsed from the "Donated to other cause(s)" text when it contains `(N tickets)` or `(N ticket)` (case-insensitive, e.g. `Rs. 2000 (8 tickets)` → 8).
3. If `count` or `textCount` is present → **tickets = (count or 0) + (textCount or 0)** (both present ⇒ added).
4. If **neither** is present (blank) → **tickets = 1**.
5. Rows with an empty `Name` are skipped and listed in warnings.

Edge handling:

| Input | Behaviour |
|---|---|
| Explicit `0` in count column (and no text count) | 0 tickets, row listed in warnings |
| Negative number | Row skipped, warning |
| Decimal (e.g. `2.5`) | Rounded down to `2`, warning |
| Non-numeric text with no number (e.g. `"two"`) | Treated as blank → 1 ticket, warning |
| `Rs. 2000` with no `(N tickets)` | Not converted; treated as blank → 1 ticket, warning |
| Count above 50 for a single row | Allowed, sanity-check warning |

Worked examples:
- Person A: row 1 blank count, row 2 count = 2 → **3 tickets** (1 + 2).
- Row 11 (Arjun Nair): blank count, text `(8 tickets)` → **8 tickets**.
- Row 18 (Yash Kapoor, confirmation = "No") → **1 ticket**, shown with an informational note only.

## 5. Grouping and ordering

- **Identity key** = `Email` lower-cased and trimmed; if Email is blank, fall back to `Name` normalized (trim, collapse spaces, case-insensitive).
- All rows with the same identity key are one person; their tickets are **numbered continuously in row order** across rows.
- People are ordered by the **first row in which they appear**; tickets are generated and displayed in that order, so the ticket order mirrors the request order.
- The **display name** is the `Name` value of the person's first row (whitespace collapsed). Original casing is kept by default (e.g. `VIKRAM SETH`); an optional toggle "Normalize name case (Title Case)" is available.
- Different identity keys that have the same name are distinct people (distinct tickets); their files get a disambiguating suffix (§9).

## 6. Tambola ticket rules

Standard Indian 90-number format:

| # | Rule |
|---|---|
| R1 | Grid is **3 rows × 9 columns** (27 cells) |
| R2 | Exactly **15 numbers** and **12 blanks** |
| R3 | Every row has exactly **5 numbers** and 4 blanks |
| R4 | Column ranges: C1 = 1–9, C2 = 10–19, C3 = 20–29, C4 = 30–39, C5 = 40–49, C6 = 50–59, C7 = 60–69, C8 = 70–79, C9 = 80–90 |
| R5 | Every column has **at least 1 and at most 3** numbers |
| R6 | Numbers in a column are **strictly ascending** from top to bottom |
| R7 | No number appears twice on one ticket |
| R8 | All numbers are integers within 1–90 |

Every generated ticket is **validated against R1–R8 before it is accepted**; an invalid ticket is never shown.

## 7. Uniqueness and fairness

- **U1** – No two tickets in the registry have the same set of 15 numbers.
- **U2** – No two tickets in the registry share an identical *row* (same 5 numbers in a row), so two players cannot complete an identical line on the same call.
- **U3** – Uniqueness is enforced across **all** tickets: Excel-based, walk-in, earlier sessions (persisted registry), and imported registries.
- **U4** – If a candidate collides, it is silently regenerated (bounded retries, then a clear error).
- **Fairness** – Column counts, row placement and numbers are drawn with unbiased randomness (`crypto.getRandomValues` by default). All valid layouts are reachable.
- **Seed toggle** – Default **OFF** = fresh random tickets each run. When ON, a seed field appears and a seeded PRNG is used, so the same file + seed + empty registry produces the same tickets. Uniqueness checks still apply (seeded generation re-rolls deterministically on collision).

## 8. Ticket appearance

The ticket is designed to look like a paper ticket bought in a shop: a compact wide strip with a heading, the person's name and the 3×9 grid. It uses a light branded finish that stays printer-friendly (pale tints on white, black grid lines and numbers). Participants receive the PNG by email, so the image is the ticket itself (no surrounding page).

- Frame: rounded orange border. Slim header band (pale orange) with the heading in dark orange; person name below it in bold dark text.
- Grid: black lines, large black numbers on white; cells are wider than tall like a paper ticket; blank cells carry a very faint tint so numbers stand out.
- Footer strip (pale orange): `Ticket n of N` on the left, footer text centred, serial `#0042` on the right.
- Heading: editable text field, default **`Give 2026`**. Footer text: editable, default **`Good luck!`** (empty = no footer text). Both defaults are restored on every page load (custom values are not remembered between sessions).
- Person name (from the `Name` column) is auto-shrunk to fit, then wrapped to two lines, then truncated with an ellipsis.
- Optional (toggles, default ON): serial **`#0042`** and label **`Ticket 2 of 4`** (the label only appears when a person has more than one ticket).
- Preview on screen is the ticket alone (820 × 392 logical px). Downloaded PNGs are opaque, carry their print resolution (pHYs chunk), and come in three layouts, chosen by the **Download layout** setting (remembered between sessions):
  - **Ticket on an A4 landscape sheet** (default): a 2339 × 1654 px sheet (200 dpi, the shape of A4 landscape and within 1.1% of a 5 × 7 in photo) with the ticket (about 249 mm wide) centred, wide side margins and a light dashed cut line. Photo-print dialogs set to "Fill page" / "Full page" (for example the Windows photo print dialog, which picks Landscape for a wide image) scale the image to cover the frame and crop the overflow; because the sheet has the shape of the common frames and has margins, the ticket is never cut. Verified for A4/Letter landscape, 3.5 × 5, 4 × 6, 5 × 7, 8 × 10 and 11 × 14 in frames.
  - **Ticket on an A4 portrait page**: the ticket (about 187 mm wide) centred in the upper part of a 1654 × 2339 px page (200 dpi), for people who print in portrait with "Full page".
  - **Ticket only**: just the ticket at 2× (1640 × 784 px, 220 dpi stored). Tightest crop, best for chat apps. A "Fill page" print on a 5 × 7 in frame crops the sides (about 17% from each end), so it is not recommended when the recipient will print.

## 9. Output and file naming

- Preview: a gallery shows every ticket (name, label, grid) **before** any download.
- Each ticket has its own **Download PNG** button. **Download all (ZIP)** bundles every PNG.
- File name = person display name, sanitized (characters `\ / : * ? " < > |` and control characters removed, trimmed, length-limited):
  - Person has **1 ticket** → `Name.png`
  - Person has **N > 1 tickets** → `Name_1.png`, `Name_2.png`, … `Name_N.png`
  - Different people with the same display name → suffix by person, e.g. `Name (2)_1.png`; no file may overwrite another in the ZIP.
- File names are computed from the person's **current** ticket total at download time (a walk-in adding a second ticket to a name changes `Name.png` to `Name_1.png`, `Name_2.png`).
- Extra exports: **CSV** (columns: Ticket ID, Name, Ticket No., Tickets For Person, File name, Source, Row 1, Row 2, Row 3, All numbers) for winner verification; **JSON registry** export/import.

## 10. Walk-in tickets

- A "Walk-in" panel: Name (required) + number of tickets (1–20).
- Generates immediately and appends to the gallery, in the same style and with the same uniqueness checks against the entire registry.
- If the name matches an existing person (normalized, case-insensitive), numbering continues (`Name_3`, …); otherwise a new person.
- Works before or after an Excel upload, and without any upload at all.

## 11. Persistence

- The registry of issued tickets (people, tickets, serial counter) is saved in browser `localStorage` automatically so a refresh or reopen cannot create duplicates.
- On load, if a saved registry exists the user is offered **Continue** or **Start fresh**.
- Uploading a new Excel file asks whether to **add to** the existing registry or **replace** it. Re-uploading the same file must not silently double-issue tickets (the user is warned).
- **Reset** clears the registry after confirmation. **Export / Import JSON** lets another machine continue without duplicates.
- If `localStorage` is unavailable or full, a warning is shown and the in-memory registry continues to work for the session.

## 12. Page behaviour (flow)

1. Upload .xlsx/.csv (drag-and-drop or file picker). Parsed locally; nothing leaves the machine.
2. Summary: rows read, people, total tickets, plus warnings (skipped rows, parse issues, merged duplicates, informational notes).
3. Click **Generate** → gallery renders in request order.
4. Download single PNG / all as ZIP / CSV / registry JSON.
5. Walk-in panel available at any time.
6. Settings: heading text, show serial, show "n of N", normalize name case, seed toggle + seed.
7. **Tambola rules panel** (collapsible, also reachable from a link in the header): lists rules R1–R8 with an example ticket and the column ranges, the extra uniqueness guarantees, and a live self-check that re-validates every issued ticket and reports how many pass, how many tickets are distinct and how many rows are distinct.

## 12a. Non-functional requirements

| Area | Requirement |
|---|---|
| Hosting | Static HTML/JS/CSS, no backend; opens via file or any static host |
| Offline | SheetJS and JSZip bundled locally (no CDN at runtime) |
| Privacy | No data transmitted anywhere |
| Browsers | Current Chrome and Edge (primary); Firefox and Safari (best effort) |
| Performance | 500 tickets generated < 3 s; gallery stays responsive (lazy/virtualized rendering for large sets) |
| Robustness | Malformed file → friendly error, no crash; special characters / Unicode names render correctly |
| Accessibility | Keyboard operable controls, labelled inputs, sufficient contrast |
| Code structure | Pure logic (planner, generator, validator, registry) separated from UI so it is unit-testable in Node |

## 13. Decisions log

| # | Decision |
|---|---|
| D1 | Title configurable, default "Give 2026" |
| D2 | Independent unique tickets (no 6-ticket strips) |
| D3 | Serial ID and "n of N" label included, toggleable |
| D4 | Every row is a separate purchase; totals per person are summed |
| D5 | Blank count ⇒ 1 ticket; `(N tickets)` text is used when count is blank; both present ⇒ added |
| D6 | Confirmation column ignored – "No" still gets a ticket |
| D7 | PNG per ticket, named `Name` or `Name_k` |
| D8 | Static client-side app; no backend |
| D9 | Fresh random each time by default; seed toggle optional |
| D10 | Gallery first, download after; walk-in generation supported |
| D11 | `localStorage` persistence with Continue / Start fresh / Reset / Export / Import |

## 14. Reference data (sample sheet, per screenshot – verify against the real file)

| Person (email) | Rows | Tickets |
|---|---|---|
| Arjun Nair | 11 | 8 (from text) |
| Rohit Bansal | 16 | 4 |
| Vikram Seth | 14 (blank → 1) + 15 (2) | 3 |
| Ananya Shah | 7 (blank → 1) + 19 (1) | 2 |
| Karan Joshi | 17 | 2 |
| Ritu Sharma | 20 | 2 |
| Yash Kapoor | 18 (confirmation = No) | 1 |
| Other 11 people (rows 1–6, 8–10, 12, 13) | one row each, blank | 1 each |

Expected: **20 rows → 18 people → 33 tickets**.

## 15. Implementation notes

**Status: implemented (v1.0).** Unit tests: `npm test` (77 tests, Node ≥ 18, no dependencies), including `tests/independent-rules.test.js` (re-derives every Tambola rule separately from the generator's own validator), `tests/png.test.js` (print-size writer) and `tests/print-layout.test.js` (simulated "Fill page" cropping of the download layouts). Browser flows were verified manually against the fixtures in `tests/fixtures/out`.

**Run it:** open `index.html` (double-click or any static server). No build step, no network needed.

| Path | Purpose |
|---|---|
| `index.html`, `css/style.css` | UI |
| `js/rng.js` | Crypto-backed and seeded random sources |
| `js/ticket.js` | Ticket generation and rule validation (R1–R8) |
| `js/registry.js` | Issued tickets, uniqueness (U1–U4), JSON import/export, merge |
| `js/planner.js` | Excel rows → people and ticket counts (§3–§5) |
| `js/exporter.js` | File names and CSV |
| `js/render.js` | Canvas ticket drawing and the A4 print-page layout |
| `js/png.js` | Writes the print size (pHYs chunk) into PNG files |
| `js/app.js` | UI wiring, persistence, downloads |
| `lib/` | SheetJS and JSZip (bundled) |
| `tests/` | Unit tests; `tests/fixtures/make-fixtures.js` regenerates sample inputs |

Behaviours settled during implementation:
- A person with exactly one ticket has no "Ticket n of N" label (it would be redundant); the serial still shows.
- Walk-in tickets always use the crypto random source, even when the seed toggle is on. The seed only drives Excel-based generation.
- If the seed toggle is on and the seed field is empty, a random seed is created and shown so the run can be repeated.
- Row numbers in warnings are the real Excel row numbers (header = row 1).
- With several sheets that contain data, a sheet picker appears and the first sheet with data is used by default; a single data sheet shows no picker.
- Uploading while tickets exist asks **Add to existing / Replace / Cancel**, with an extra warning if the same file was issued before. Importing a registry asks **Merge / Replace / Cancel**.
- Reset keeps a revision counter, so other open tabs adopt the cleared state rather than resurrecting old tickets. Tickets saved by another tab are adopted automatically before any new tickets are issued, so tabs cannot create duplicates.
- Workbooks protected by a Microsoft sensitivity label (IRM) or a password cannot be read by any web page. The page detects them and shows what to do in Excel (remove the label/password, or Save As CSV UTF-8) instead of a generic "corrupt file" error.
- The ZIP is built in memory, so it is practical up to a few thousand tickets (browser memory is the limit).
