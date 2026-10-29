# Tambola Toolkit

A client-side Tambola (Housie) toolkit for running an online charity game. It has no backend: everything runs in the browser and nothing is uploaded.

| Page | What it does |
|---|---|
| `index.html` | Reads an Excel sheet (`Name` column plus ticket counts) and generates unique, personalised tickets. Download each as a PNG, or all as a ZIP. |
| `index-pdf.html` | Same tickets as PNG or PDF (one ticket per page, or a 12-per-page sheet). |
| `host.html` | Host console: random number calling, a called-numbers board, claim checking and a prize tracker for nine prizes. |

Tickets follow the standard Tambola rules: 3 rows × 9 columns, 5 numbers per row, 15 per ticket, with numbers 1–90 split by column. Every ticket is unique across the whole registry.

## Run locally

Open `index.html` (or `host.html`) in a browser. Pages share the ticket registry through the browser's local storage.

## Tests

```
npm test
```

Requirements and test-case documents: `REQUIREMENTS*.md`, `TEST_CASES*.md`. A host script is in `HOST_CHEATSHEET.md`.

The sample data in `tests/fixtures` uses made-up names and emails.

Bundled libraries: SheetJS (`xlsx`), JSZip, jsPDF.
