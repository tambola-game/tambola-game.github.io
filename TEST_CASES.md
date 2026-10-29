# Tambola Ticket Generator – Test Cases

Related: [REQUIREMENTS.md](./REQUIREMENTS.md)

**Legend** – Type: `A` = automatable (Node unit test or browser E2E), `M` = manual/visual. Priority: `P0` must pass, `P1` important, `P2` nice to have.
Requirement references (R1–R8, U1–U4, §n) point to REQUIREMENTS.md.

## 0. Test fixtures

| ID | Fixture | Description |
|---|---|---|
| FX-1 | `sample.xlsx` | The 20-row sheet from the screenshot (see REQUIREMENTS §14). Expected: 20 rows → 18 people → 33 tickets |
| FX-2 | `sample.csv` | Same data as CSV (UTF-8 with and without BOM) |
| FX-3 | `empty.xlsx` | Header row only |
| FX-4 | `no-name-col.xlsx` | No `Name` column (only `Full Name`) |
| FX-5 | `no-count-col.xlsx` | No ticket-count column |
| FX-6 | `reordered.xlsx` | Same data as FX-1 with columns in a different order |
| FX-7 | `edge-counts.xlsx` | Counts: `0`, `-1`, `2.5`, `"3 tickets"`, `"two"`, ` 4 `, `1e1`, `60`, text `(8 tickets)`, text `(1 ticket)`, `Rs. 2000`, count + text both present |
| FX-8 | `names.xlsx` | Unicode (`Ananya Iyer`, `अनुराग`, `Zoë`), very long name (120 chars), leading/trailing spaces, double spaces, illegal filename chars (`A/B:C*D?`), emoji, same name with different emails |
| FX-9 | `large.xlsx` | 1,000 rows, 1–5 tickets each (~3,000 tickets) |
| FX-10 | `corrupt.xlsx` / `renamed.txt` | Corrupt file; a .txt renamed to .xlsx; .pdf; password-protected xlsx |
| FX-11 | `multi-sheet.xlsx` | Data on sheet 2, sheet 1 empty |
| FX-12 | `blank-rows.xlsx` | Blank rows in the middle, trailing empty rows, rows with only email |

---

## 1. Ticket generation – rule compliance (R1–R8)

| ID | Scenario | Steps / Input | Expected | Pri | Type |
|---|---|---|---|---|---|
| GEN-001 | Grid shape | Generate 1 ticket | 3 rows × 9 columns | P0 | A |
| GEN-002 | Total numbers | Generate 1 ticket | Exactly 15 numbers, 12 blanks | P0 | A |
| GEN-003 | Row counts | Generate 10,000 tickets | Every row of every ticket has exactly 5 numbers | P0 | A |
| GEN-004 | Column ranges | 10,000 tickets | C1 1–9, C2 10–19, C3 20–29, C4 30–39, C5 40–49, C6 50–59, C7 60–69, C8 70–79, C9 80–90 | P0 | A |
| GEN-005 | Column min/max | 10,000 tickets | Each column has 1–3 numbers, never 0, never > 3 | P0 | A |
| GEN-006 | Column order | 10,000 tickets | Numbers strictly ascending top→bottom in every column | P0 | A |
| GEN-007 | No duplicates in ticket | 10,000 tickets | All 15 numbers distinct | P0 | A |
| GEN-008 | Number domain | 10,000 tickets | All integers, 1 ≤ n ≤ 90, none outside | P0 | A |
| GEN-009 | Column count sum | 10,000 tickets | Sum of column counts = 15 | P0 | A |
| GEN-010 | Column count distribution | 10,000 tickets | Observed column-count patterns include all of {1,2,3} for each column (no pattern is unreachable) | P1 | A |
| GEN-011 | Row pattern variety | 10,000 tickets | Many distinct blank-position layouts appear (> 50 distinct) | P1 | A |
| GEN-012 | Sample ticket conforms | Validate the supplied sample (4,20,34,44,50 / 5,16,53,64,75 / 8,24,58,79,88) | Validator accepts it | P0 | A |
| GEN-013 | Rule R1 violation caught | Validator given 2×9 / 3×8 grid | Rejected | P0 | A |
| GEN-014 | R2 violation caught | Validator given 14 or 16 numbers | Rejected | P0 | A |
| GEN-015 | R3 violation caught | Row with 4 or 6 numbers | Rejected | P0 | A |
| GEN-016 | R4 violation caught | Number 10 in column 1; 90 in column 8; 0; 91 | Rejected | P0 | A |
| GEN-017 | R5 violation caught | Empty column; column with 4 numbers | Rejected | P0 | A |
| GEN-018 | R6 violation caught | Descending or equal values in a column | Rejected | P0 | A |
| GEN-019 | R7 violation caught | Same number twice | Rejected | P0 | A |
| GEN-020 | Column 9 includes 90 | 20,000 tickets | 90 appears at least once; 80–90 range has 11 values reachable | P1 | A |
| GEN-021 | Column 1 excludes 0 | 20,000 tickets | 0 never appears; 1–9 all reachable | P1 | A |
| GEN-022 | Number coverage | 20,000 tickets | Every number 1–90 appears at least once | P1 | A |
| GEN-023 | Uniform number frequency | 20,000 tickets | Frequency of each number within a reasonable tolerance of its column's expected share (chi-square, p > 0.001) | P2 | A |
| GEN-024 | Invalid never emitted | Inject a faulty layout builder | Generator rejects it and retries; invalid ticket never reaches UI | P0 | A |
| GEN-025 | Blank cells render empty | Visual check of any ticket | Blank cells contain no text (no `0`, `null`, `undefined`) | P0 | M |

## 2. Uniqueness (U1–U4)

| ID | Scenario | Steps | Expected | Pri | Type |
|---|---|---|---|---|---|
| UNQ-001 | No identical tickets | Generate 5,000 tickets in one registry | All 15-number sets distinct | P0 | A |
| UNQ-002 | No identical rows | Same 5,000 | No two rows (5-number tuples) identical across the registry | P0 | A |
| UNQ-003 | Cross-person uniqueness | FX-1 | No duplicates between different people's tickets | P0 | A |
| UNQ-004 | Excel + walk-in | Generate FX-1, then 50 walk-in tickets | All 83 unique (U1, U2) | P0 | A |
| UNQ-005 | Walk-in first, then Excel | 20 walk-ins, then upload FX-1 | All unique | P0 | A |
| UNQ-006 | Across reload | Generate, reload page, add walk-ins | New tickets unique against pre-reload tickets | P0 | A |
| UNQ-007 | Across imported registry | Export JSON, clear, import on a "second machine", add walk-ins | New tickets unique against imported ones | P0 | A |
| UNQ-008 | Forced collision | Stub RNG to repeat a ticket | Second is rejected and regenerated | P0 | A |
| UNQ-009 | Forced row collision | Stub RNG so candidate shares one row with an issued ticket | Candidate rejected and regenerated (U2) | P0 | A |
| UNQ-010 | Retry exhaustion | Stub RNG to always collide | Bounded retries then a clear error; UI does not hang | P1 | A |
| UNQ-011 | Fingerprint independence | Tickets differing by one number | Treated as different tickets (but row rule still applies) | P1 | A |
| UNQ-012 | Large scale | FX-9 (~3,000 tickets) | All unique; time within NFR | P1 | A |
| UNQ-013 | Same tickets regenerated "Generate" clicked twice on the same file | Click Generate twice | User warned; tickets are not silently double-issued | P0 | A |
| UNQ-014 | Seeded run vs registry | Seeded run with a registry holding the same seed's earlier output | Re-rolls deterministically; no duplicates | P1 | A |

## 3. Randomness and seed toggle

| ID | Scenario | Steps | Expected | Pri | Type |
|---|---|---|---|---|---|
| RND-001 | Default is fresh | Generate FX-1 twice with fresh registries, toggle OFF | Different tickets each time | P0 | A |
| RND-002 | Seed field hidden when OFF | Toggle OFF | Seed input hidden/disabled | P1 | M |
| RND-003 | Seed field shown when ON | Toggle ON | Seed input visible | P1 | M |
| RND-004 | Same seed reproducible | Toggle ON, seed `abc`, empty registry, FX-1, twice | Identical tickets in identical order | P0 | A |
| RND-005 | Different seed differs | Seeds `abc` and `abd` | Different tickets | P0 | A |
| RND-006 | Seeded tickets still valid | Seeded 5,000 tickets | All pass R1–R8 and U1–U2 | P0 | A |
| RND-007 | Empty seed with toggle ON | Toggle ON, blank seed | Validation message, or a random seed is generated and displayed | P1 | A |
| RND-008 | Numeric / Unicode / very long seed | `12345`, `सीड`, 1,000 chars | Accepted and reproducible | P2 | A |
| RND-009 | Different input same seed | Same seed, different file | Deterministic for that input; no crash | P2 | A |
| RND-010 | Default source is crypto RNG | Inspect implementation | Uses `crypto.getRandomValues` when seed OFF | P2 | A |

## 4. Excel / CSV parsing and headers

| ID | Scenario | Input | Expected | Pri | Type |
|---|---|---|---|---|---|
| PRS-001 | Parse sample xlsx | FX-1 | 20 rows read | P0 | A |
| PRS-002 | Parse csv | FX-2 | Same result as FX-1 | P0 | A |
| PRS-003 | CSV with BOM / without BOM | FX-2 variants | Header `Name` recognised in both | P1 | A |
| PRS-004 | Header found by text | FX-6 (reordered) | Same plan as FX-1 | P0 | A |
| PRS-005 | Header case / spacing | `name`, `NAME`, ` Name `, `E-mail`/`Email` | `Name` and `Email` still detected | P1 | A |
| PRS-006 | Uses `Name`, not `Full Name` | Sheet where Name = `VIKRAM SETH`, Full Name = `Vikram Seth` | Ticket shows `VIKRAM SETH` | P0 | A |
| PRS-007 | Missing Name column | FX-4 | Blocking error: "Name column not found"; no tickets generated | P0 | A |
| PRS-008 | Missing count column | FX-5 | Warning; all rows resolved by text/blank rule | P0 | A |
| PRS-009 | Missing Email column | Remove Email | Grouping falls back to Name; no crash | P0 | A |
| PRS-010 | Count header with long text | Full header with `(1 ticket = ₹250 donated. e.g. …)` | Matched via "How many tickets" prefix | P0 | A |
| PRS-011 | Count header matching trailing variation | Header differs after the prefix | Still matched | P1 | A |
| PRS-012 | Empty file | FX-3 | Message "No data rows"; no crash | P0 | A |
| PRS-013 | Corrupt / wrong type | FX-10 | Friendly error; app still usable | P0 | A |
| PRS-014 | Encrypted workbook (sensitivity label / IRM, or password) | Real file: `IDC GIVE 2026 — Online Tambola Event Registration.xlsx` (OLE + `EncryptedPackage`) | Specific message: file is protected; export an unprotected copy or CSV from Excel. App stays usable | P1 | M |
| PRS-015 | Multi-sheet | FX-11 | First sheet with data is used; a picker appears only when 2+ sheets contain data | P1 | A |
| PRS-016 | Blank rows | FX-12 | Fully blank rows ignored silently; rows without a Name warned | P0 | A |
| PRS-017 | Extra unrelated columns | FX-1 | Ignored | P1 | A |
| PRS-018 | Numeric vs text cells | Counts stored as number and as text `"2"` | Both parsed as 2 | P0 | A |
| PRS-019 | Hidden columns/rows | Hidden columns in xlsx | Still read | P2 | A |
| PRS-020 | Formulas | Count cell is `=1+1` | Cached value 2 used | P2 | A |
| PRS-021 | Large file | FX-9 | Parsed < 3 s, UI responsive | P1 | A |
| PRS-022 | Dates in other columns | Date cells | No effect on planning | P2 | A |
| PRS-023 | .xls (legacy) | `.xls` file | Parsed or clearly rejected | P2 | M |
| PRS-024 | Wrong extension | `.txt` renamed `.xlsx` | Friendly error | P1 | A |
| PRS-025 | Duplicate header names | Two columns named `Name` | First is used; warning | P2 | A |

## 5. Ticket count rules (§4)

| ID | Input row | Expected tickets | Warning? | Pri | Type |
|---|---|---|---|---|---|
| CNT-001 | count = 1 | 1 | no | P0 | A |
| CNT-002 | count = 2 | 2 | no | P0 | A |
| CNT-003 | count = 4 | 4 | no | P0 | A |
| CNT-004 | count blank, text blank | 1 | no | P0 | A |
| CNT-005 | count blank, text `Save the Children, Bal Raksha Bharat Rs. 2000 (8 tickets)` | 8 | no | P0 | A |
| CNT-006 | count blank, text `(1 ticket)` | 1 | no | P1 | A |
| CNT-007 | count blank, text `( 8 TICKETS )` (spacing/case) | 8 | no | P1 | A |
| CNT-008 | count = 2, text `(3 tickets)` | 5 (added) | info | P0 | A |
| CNT-009 | count blank, text with no N, e.g. `Supporting Education for Children` | 1 | no | P0 | A |
| CNT-010 | count blank, text `Rs. 2000` only | 1 | yes (amount not converted) | P1 | A |
| CNT-011 | count = `0`, text blank | 0 – row not ticketed | yes | P0 | A |
| CNT-012 | count = `-1` | skipped | yes | P0 | A |
| CNT-013 | count = `2.5` | 2 | yes | P1 | A |
| CNT-014 | count = `"3 tickets"` | 3 | no | P1 | A |
| CNT-015 | count = `"two"` | 1 (treated as blank) | yes | P1 | A |
| CNT-016 | count = ` 4 ` (spaces) | 4 | no | P1 | A |
| CNT-017 | count = `1e1` | 10 (numeric) | no | P2 | A |
| CNT-018 | count = 60 | 60 | sanity warning (> 50) | P1 | A |
| CNT-019 | count = 1,000,000 | Rejected by sanity cap | yes | P1 | A |
| CNT-020 | Name blank, count = 2 | skipped | yes, row number shown | P0 | A |
| CNT-021 | Name = whitespace only | skipped | yes | P0 | A |
| CNT-022 | Confirmation = `No` (row 18) | 1 | informational note only | P0 | A |
| CNT-023 | Confirmation column absent | no effect | no | P1 | A |
| CNT-024 | Person A: row 1 blank + row 2 count 2 | A has 3 tickets in total | no | P0 | A |
| CNT-025 | Total for FX-1 | 33 | – | P0 | A |
| CNT-026 | Two `(N tickets)` fragments in one text | First match used; warning | yes | P2 | A |
| CNT-027 | Fullwidth / Devanagari digits | Parsed or flagged, never crash | – | P2 | A |

## 6. Grouping, ordering and numbering (§5)

| ID | Scenario | Expected | Pri | Type |
|---|---|---|---|---|
| GRP-001 | Same email, 2 rows (Ananya 7 + 19) | One person, 2 tickets (labels 1 of 2, 2 of 2) | P0 | A |
| GRP-002 | Vikram rows 14 (1) + 15 (2) | One person, 3 tickets, numbered 1–3 in row order | P0 | A |
| GRP-003 | Email differs only by case/spaces | Grouped as the same person | P0 | A |
| GRP-004 | Email blank, same Name | Grouped by Name | P1 | A |
| GRP-005 | Email blank, Name differs only by case/spaces | Grouped | P1 | A |
| GRP-006 | Same Name, different emails | Two people, separate tickets | P0 | A |
| GRP-007 | Same email, different Name text | One person; display name = first row's Name | P0 | A |
| GRP-008 | Order of people | By first appearance in sheet | P0 | A |
| GRP-009 | Order of tickets | Person's tickets contiguous, in row order, numbered continuously | P0 | A |
| GRP-010 | Non-contiguous rows of one person (rows 7 and 19) | Tickets are placed with the person at the first position (7) | P0 | A |
| GRP-011 | Gallery order matches order of requests | Gallery sequence = plan sequence | P0 | A |
| GRP-012 | Serial numbers | Increasing, no gaps, no repeats across the registry | P0 | A |
| GRP-013 | Normalize name case OFF | `VIKRAM SETH` kept as is | P0 | A |
| GRP-014 | Normalize name case ON | `Vikram Seth` | P1 | A |
| GRP-015 | Whitespace in names | `  John   Doe ` → `John Doe` | P1 | A |
| GRP-016 | Person with a skipped row and a valid row | Valid row issued; skipped row warned | P1 | A |
| GRP-017 | Person total 1 via 2 rows of 0 and 1 | Total 1 → `Name.png` | P2 | A |

## 7. File naming and download (§9)

| ID | Scenario | Expected | Pri | Type |
|---|---|---|---|---|
| FIL-001 | Single-ticket person (Asha Rao) | `Asha Rao.png` | P0 | A |
| FIL-002 | Multi-ticket person (Rohit Bansal, 4) | `Rohit Bansal_1.png` … `_4.png` | P0 | A |
| FIL-003 | Merged person (Ananya Shah, 2) | `Ananya Shah_1.png`, `_2.png` | P0 | A |
| FIL-004 | Arjun Nair (8) | `_1` … `_8` | P0 | A |
| FIL-005 | Illegal characters `A/B:C*D?` | Characters stripped; file valid on Windows | P0 | A |
| FIL-006 | Reserved Windows names (`CON`, `NUL`) | Safe alternative used | P2 | A |
| FIL-007 | Trailing dot/space in name | Trimmed | P1 | A |
| FIL-008 | Very long name (120 chars) | Name truncated safely, extension kept | P1 | A |
| FIL-009 | Unicode name | Preserved in file name | P1 | A |
| FIL-010 | Name that sanitizes to empty (`///`) | Fallback such as `Ticket_<serial>` | P1 | A |
| FIL-011 | Two different people, same name | No overwrite; second gets a disambiguating suffix | P0 | A |
| FIL-012 | Case-insensitive collisions (`Amit`, `AMIT`, different emails) | Distinct file names (Windows is case-insensitive) | P0 | A |
| FIL-013 | Person whose name ends with `_1` (`Raj_1`) and a person `Raj` with 2 tickets | No collision in ZIP | P1 | A |
| FIL-014 | Single ticket download | Browser downloads one PNG with the correct name | P0 | A |
| FIL-015 | Download all (ZIP) | ZIP contains exactly one PNG per ticket, correct names, no duplicates | P0 | A |
| FIL-016 | ZIP with FX-1 | 33 files | P0 | A |
| FIL-017 | ZIP with large set (3,000) | Completes without freezing UI; progress indicator | P1 | A |
| FIL-018 | PNG validity | Opens in image viewer; PNG signature; default "A4 landscape sheet" = 2339 × 1654 px; "A4 portrait page" = 1654 × 2339 px; "Ticket only" = 1640 × 784 px (2× of 820 × 392) | P0 | A |
| FIL-018a | Print size metadata | Every PNG has a pHYs chunk: 200 dpi (7874 px/m) for the two A4 layouts, 220 dpi (8661 px/m) for ticket-only; Windows reports the same dpi | P0 | A |
| FIL-018b | Download layout setting | Default "A4 landscape sheet"; the other two options change single-PNG and ZIP output; the choice persists after reload; a stale choice saved by an older version does not override the default | P0 | A |
| FIL-018c | Print the emailed ticket | Email a ticket PNG to another person; they open it in Windows Photos, choose Landscape, A4 or 5 × 7 in with "Fill page": the whole ticket appears, nothing cut off; repeat from Edge and a phone | P0 | M |
| FIL-018d | Fill-page geometry | Unit test `tests/print-layout.test.js`: simulates "Fill page" cropping for A4/Letter landscape, 3.5 × 5, 4 × 6, 5 × 7, 8 × 10, 11 × 14 in frames (landscape sheet) and A4/Letter/4 × 6/5 × 7/8 × 10 portrait frames (portrait page); the ticket and cut line always stay inside | P0 | A |
| FIL-018e | Ticket-only print | Printing a ticket-only PNG with "Fill page" at 5 × 7 in crops the sides (known; regression guard in the unit test) | P2 | M |
| FIL-019 | Walk-in adds to existing person | Names recomputed (`Name.png` → `Name_1.png`, `Name_2.png`) | P0 | A |
| FIL-020 | CSV export | Columns: Ticket ID, Name, Ticket No., Tickets For Person, File name, Source, Row 1–3, All numbers; one row per ticket; CSV-escaped | P0 | A |
| FIL-021 | CSV with commas/quotes in name | Correctly quoted | P1 | A |
| FIL-022 | CSV opens in Excel with Unicode | UTF-8 BOM present | P2 | M |
| FIL-023 | Registry JSON export | Valid JSON, round-trips via import | P0 | A |
| FIL-024 | Download without generating | Buttons disabled | P1 | A |

## 8. Ticket rendering (§8)

| ID | Scenario | Expected | Pri | Type |
|---|---|---|---|---|
| RDR-001 | Looks like a paper ticket | Compact wide strip: slim heading band, name, bordered 3×9 grid with wider-than-tall cells, footer strip; branded finish (orange frame, tinted blank cells); no empty space around it | P0 | M |
| RDR-001a | Printer-friendly | Printed in black and white / greyscale, numbers and grid lines remain crisp; tints do not reduce legibility | P1 | M |
| RDR-001b | Footer strip | Shows `Ticket n of N` (left), footer text (centre) and serial (right); with empty footer text the centre stays blank | P1 | M |
| RDR-001c | Footer text setting | Default `Good luck!`; editing it redraws all tickets; not remembered after reload | P1 | A |
| RDR-002 | Heading default | `Give 2026` | P0 | A |
| RDR-003 | Heading change | Edit heading → tickets re-render with the new heading | P0 | A |
| RDR-004 | Empty heading | Heading omitted or default restored; no layout break | P1 | A |
| RDR-005 | Long heading | Shrinks to fit | P2 | M |
| RDR-006 | Name displayed exactly | Matches the plan's display name | P0 | A |
| RDR-007 | Long name (120 chars) | Shrinks / wraps; never clipped outside the canvas | P0 | M |
| RDR-008 | Unicode / Devanagari / accented | Renders correctly | P1 | M |
| RDR-009 | Emoji in name | Renders or falls back gracefully | P2 | M |
| RDR-010 | Serial toggle | `#0042` shown/hidden | P1 | A |
| RDR-011 | "Ticket 2 of 4" toggle | Shown/hidden | P1 | A |
| RDR-012 | Single ticket person | "Ticket n of N" label omitted (serial still shown) | P2 | A |
| RDR-013 | Cell content | Numbers centred, legible, 1–2 digits | P0 | M |
| RDR-014 | PNG matches on-screen preview | Same content | P0 | A |
| RDR-015 | Print legibility | PNG sharp when printed on A4 (200 dpi page / 220 dpi ticket-only); tinted cells and orange bands remain readable on a laser printer and in greyscale | P1 | M |
| RDR-016 | Background | Opaque white (not transparent) | P1 | A |
| RDR-017 | Numbers in the PNG equal the registry/CSV | Decode check (OCR or canvas data) for a sample | P1 | M |
| RDR-018 | Font fallback | Renders when the preferred font is not installed | P2 | M |

## 9. Walk-in (§10)

| ID | Scenario | Expected | Pri | Type |
|---|---|---|---|---|
| WLK-001 | New name, 1 ticket | 1 ticket appended, appears in gallery, downloadable as `Name.png` | P0 | A |
| WLK-002 | New name, 3 tickets | `Name_1..3.png`, all unique | P0 | A |
| WLK-003 | Empty name | Validation error; nothing generated | P0 | A |
| WLK-004 | Whitespace-only name | Rejected | P0 | A |
| WLK-005 | Count 0 / negative / blank | Rejected with message | P0 | A |
| WLK-006 | Count non-integer (`1.5`) | Rejected or floored with message | P1 | A |
| WLK-007 | Count above max (21) | Rejected; max is 20 | P1 | A |
| WLK-008 | Existing person's name (case-insensitive) | Numbering continues (`Name_3`) | P0 | A |
| WLK-009 | Before any upload | Works with an empty registry | P0 | A |
| WLK-010 | After upload | Unique against all Excel tickets | P0 | A |
| WLK-011 | Rapid repeat clicks | Each click issues distinct tickets; no double submit from one click | P1 | A |
| WLK-012 | Enter key submits | Works | P2 | A |
| WLK-013 | Walk-in persisted | Present after reload | P0 | A |
| WLK-014 | Walk-in with special characters | Safe name in PNG and file | P1 | A |
| WLK-015 | 20 walk-in tickets | Generated quickly, all valid and unique | P1 | A |
| WLK-016 | Serial continues | Next serial follows the highest issued | P0 | A |
| WLK-017 | Walk-in name same as Excel person with different email | Matched by name; documented behaviour | P1 | A |
| WLK-018 | Walk-in included in CSV and ZIP | Yes | P0 | A |

## 10. Persistence and registry (§11)

| ID | Scenario | Expected | Pri | Type |
|---|---|---|---|---|
| PER-001 | Auto-save | Registry saved after every generation | P0 | A |
| PER-002 | Reload with saved registry | Offer Continue / Start fresh | P0 | A |
| PER-003 | Continue | Gallery restored identically (same numbers, serials) | P0 | A |
| PER-004 | Start fresh | Registry cleared after confirmation | P0 | A |
| PER-005 | Upload with existing registry | Prompt: Add to / Replace | P0 | A |
| PER-006 | Re-upload same file (Add) | Duplicate-upload warning; no silent double-issuing | P0 | A |
| PER-007 | Replace | Old tickets removed, serial reset, new tickets unique | P1 | A |
| PER-008 | Reset button | Confirmation, then everything cleared including storage | P0 | A |
| PER-009 | Cancel on reset confirmation | Nothing cleared | P1 | A |
| PER-010 | Export JSON then Import into clean browser | Same tickets and serials; uniqueness preserved for later tickets | P0 | A |
| PER-011 | Import invalid JSON | Friendly error; current registry untouched | P0 | A |
| PER-012 | Import JSON with tickets violating rules | Rejected or flagged | P1 | A |
| PER-013 | Import JSON with internal duplicates | Flagged | P1 | A |
| PER-014 | Import merges with existing | Add vs replace prompt; duplicates across the two are flagged | P1 | A |
| PER-015 | `localStorage` disabled / quota exceeded | Warning; in-session registry works | P1 | A |
| PER-016 | Two tabs open | Last-writer behaviour documented; a warning or storage-event sync prevents duplicates | P1 | A |
| PER-017 | Private/incognito window | Works; shows non-persistence note if storage fails | P2 | M |
| PER-018 | Storage schema version | Older/unknown version handled safely | P2 | A |
| PER-019 | Large registry (3,000 tickets) | Saves and loads < 1 s | P1 | A |
| PER-020 | Corrupted stored data | Detected; offer to reset; no crash | P1 | A |

## 11. UI / UX flow (§12)

| ID | Scenario | Expected | Pri | Type |
|---|---|---|---|---|
| UI-001 | Page loads with no console errors | Clean console | P0 | A |
| UI-002 | Works offline | Page + libs load with network disabled | P0 | A |
| UI-003 | No outbound requests | Network log has no external calls | P0 | A |
| UI-004 | File picker upload | Works | P0 | A |
| UI-005 | Drag-and-drop upload | Works | P0 | A |
| UI-006 | Drop invalid type | Rejected with message | P1 | A |
| UI-007 | Drop multiple files | Handled (first used, or message) | P2 | A |
| UI-008 | Summary panel | Rows, people, tickets match plan | P0 | A |
| UI-009 | Warnings panel | Lists row numbers and reasons | P0 | A |
| UI-010 | Generate disabled before upload | Disabled | P1 | A |
| UI-011 | Generate renders gallery | One card per ticket, in order | P0 | A |
| UI-012 | Gallery card content | Name, label, grid, download button | P0 | A |
| UI-013 | Download button on each card | Present and functional | P0 | A |
| UI-014 | Download all | Visible after generation; progress shown | P0 | A |
| UI-015 | Settings changes before Generate | Applied to tickets | P0 | A |
| UI-016 | Settings changes after Generate | Heading/labels update without changing numbers | P0 | A |
| UI-017 | Responsive layout | Usable at 1920, 1366, 768, 390 px | P1 | M |
| UI-018 | Keyboard navigation | All controls reachable and operable | P1 | M |
| UI-019 | Labels / ARIA | Inputs labelled; buttons have names | P1 | A |
| UI-020 | Contrast | WCAG AA | P2 | M |
| UI-021 | Gallery with 3,000 tickets | Remains responsive (lazy rendering) | P1 | A |
| UI-022 | Error states are dismissible and non-blocking | Yes | P2 | M |
| UI-023 | Loading indicator during parse/generate | Shown for operations > 300 ms | P2 | M |
| UI-024 | Search/filter gallery by name | Optional feature, if present: filters correctly | P2 | A |
| UI-025 | Re-upload a different file while a gallery is shown | Prompt per PER-005; no stale cards | P0 | A |
| UI-026 | Rules panel | Collapsed by default; opens from its heading and from the header link "View Tambola rules" | P1 | A |
| UI-027 | Rules panel content | Lists the 7 rules, the 9 column ranges, an example ticket (15 numbers, 3 rows × 9) and the uniqueness guarantees | P1 | A |
| UI-028 | Rules self-check | With no tickets: explanatory text. After generating the sample: "33 of 33 … follow every rule … 99 of 99 rows distinct", styled as success; updates after walk-ins, import and reset | P0 | A |
| UI-029 | Self-check failure | If a stored ticket broke a rule or was duplicated, the self-check shows a ✖ in the error style | P1 | A |

## 12. Browser and environment

| ID | Scenario | Expected | Pri | Type |
|---|---|---|---|---|
| ENV-001 | Chrome (latest) | All P0 pass | P0 | A |
| ENV-002 | Edge (latest) | All P0 pass | P0 | A |
| ENV-003 | Firefox (latest) | PNG/ZIP downloads work | P1 | M |
| ENV-004 | Safari | Best effort | P2 | M |
| ENV-005 | Opened via `file://` | Works (no module/CORS failures) | P0 | A |
| ENV-006 | Served via `http://localhost` | Works | P1 | A |
| ENV-007 | Windows file name handling | ZIP extracts cleanly on Windows | P0 | M |
| ENV-008 | Locale / non-English OS | No effect | P2 | M |
| ENV-009 | Browser zoom 50–200 % | Layout intact | P2 | M |
| ENV-010 | Multiple individual downloads blocked | ZIP remains the reliable route; message shown if the browser blocks multiple downloads | P1 | M |

## 13. Performance and robustness

| ID | Scenario | Expected | Pri | Type |
|---|---|---|---|---|
| PRF-001 | Generate 500 tickets | < 3 s | P0 | A |
| PRF-002 | Generate 3,000 tickets | < 15 s; UI not frozen (chunked/worker) | P1 | A |
| PRF-003 | Render 500 PNGs for ZIP | Completes; memory stable | P1 | A |
| PRF-004 | Repeated generate/reset 50 times | No memory growth leading to a crash | P2 | A |
| PRF-005 | Max capacity sanity | Requesting more tickets than a safe cap (e.g. 100,000) is rejected with a message | P2 | A |
| ROB-001 | Throw inside generator | Caught; error toast; app remains usable | P1 | A |
| ROB-002 | XSS in name (`<img src=x onerror=alert(1)>`) | Rendered as text everywhere (gallery, labels, CSV); nothing executes | P0 | A |
| ROB-003 | CSV injection (`=cmd|...`, `@SUM(…)`) in name | Exported CSV neutralises leading `= + - @` | P1 | A |
| ROB-004 | Prototype pollution keys (`__proto__`, `constructor` as a Name) | Handled as ordinary names | P1 | A |
| ROB-005 | Name consisting of only emoji / RTL text | No crash; file name fallback | P2 | A |
| ROB-006 | HTML-in-heading | Rendered as text on canvas | P1 | A |

## 14. End-to-end scenarios

| ID | Scenario | Steps | Expected | Pri | Type |
|---|---|---|---|---|---|
| E2E-001 | Happy path (FX-1) | Upload → review summary → Generate → Download all | 20 rows, 18 people, 33 tickets; ZIP has 33 correctly named PNGs; every ticket valid and unique | P0 | A |
| E2E-002 | Walk-in day | Continue saved registry → add walk-in "Asha" ×2 → download | `Asha_1.png`, `Asha_2.png`; unique vs all 33 | P0 | A |
| E2E-003 | Order check | Compare the CSV order with the sheet's first-appearance order | Identical | P0 | A |
| E2E-004 | Duplicate donor | Sheet with Person A rows (blank) + (2) | 3 tickets labelled 1–3 of 3 | P0 | A |
| E2E-005 | Seeded rerun | Seed ON, same seed, fresh registry, twice | Identical outputs | P0 | A |
| E2E-006 | Machine hand-off | Export registry on browser 1 → import on browser 2 → walk-ins | No duplicates across both machines' tickets | P0 | A |
| E2E-007 | Bad file recovery | Upload FX-10 corrupt, then FX-1 | Error first, then success | P1 | A |
| E2E-008 | Settings change | Set heading `Give 2027`, hide serial → Generate | Reflected in PNGs | P1 | A |
| E2E-009 | Full-lifecycle reset | Generate → Reset → Generate | Serial restarts at 1; no old tickets remain | P1 | A |
| E2E-010 | Edge-heavy file (FX-7 + FX-8) | Upload and Generate | Every row follows §4; every filename valid; warnings listed | P0 | A |

## 15. Expected results for FX-1 (golden data)

Per the screenshot (verify against the real file).

| Person | Tickets | Files |
|---|---|---|
| Asha Rao, Divya Kulkarni, Isha Menon, Nisha V P, Kabir Malhotra, Meera Raghavan Iyer, Rohan Desai, Lakshmi Pillai, Tara Bhatt, Aman Chauhan, Sneha Reddy | 1 each | `<Name>.png` |
| Ananya Shah | 2 | `Ananya Shah_1.png`, `_2.png` |
| Arjun Nair | 8 | `_1` … `_8` |
| VIKRAM SETH | 3 | `VIKRAM SETH_1` … `_3` |
| Rohit Bansal | 4 | `_1` … `_4` |
| Karan Joshi | 2 | `_1`, `_2` |
| Yash Kapoor | 1 | `Yash Kapoor.png` |
| Ritu Sharma | 2 | `_1`, `_2` |
| **Total** | **33** | 18 people |

## 16. Automation approach (to be applied during implementation)

- **Unit tests (Node built-in `node:test`, no dependencies)**: sections 1, 2, 3, 5, 6, parts of 4, 7 (naming), 9 and 10 (registry logic against a fake storage).
- **Browser E2E (Playwright)**: sections 4, 7 (downloads), 9–11, 14 and ROB-002.
- **Manual/visual checklist**: all rows marked `M`.
- **Exit criteria**: 100 % of P0 pass, ≥ 95 % of P1 pass, no open defects in generation rules or uniqueness.
