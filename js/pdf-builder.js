/* PDF/PNG sheet edition: page geometry, pagination, file names, CSV and PDF assembly. No DOM access, so it runs in Node for tests.
   A sheet is an A4 portrait page with 12 tickets (2 columns x 6 rows) in two sets of 6, like a printed tambola sheet. */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(
    isNode ? require('./exporter.js') : root.TambolaExport,
    isNode ? require('./ticket.js') : root.TambolaTicket,
    isNode ? require('./registry.js') : root.TambolaRegistry
  );
  if (isNode) module.exports = api;
  else root.TambolaPdf = api;
})(typeof self !== 'undefined' ? self : this, function (Exporter, Ticket, RegistryMod) {
  'use strict';

  // ---- geometry (millimetres, A4 portrait) ----
  const PAGE_W = 210, PAGE_H = 297;
  const MARGIN_X = 12;
  const COLS = 2, GUTTER = 6;
  const TICKET_W = (PAGE_W - 2 * MARGIN_X - GUTTER) / COLS;   // 90
  const TICKET_H = 36;
  const ROW_GAP = 3.5;
  const ROWS_PER_SET = 3;
  const SET_SIZE = COLS * ROWS_PER_SET;                        // 6
  const SETS_PER_PAGE = 2;
  const PER_PAGE = SET_SIZE * SETS_PER_PAGE;                   // 12
  const SET_H = ROWS_PER_SET * TICKET_H + (ROWS_PER_SET - 1) * ROW_GAP;
  const SET_LABEL_H = 5;
  const SET_GAP = 11;                                          // space between sets (holds the dashed cut line)
  const TITLE_Y = 12, SUBTITLE_Y = 18.6, RULE_Y = 22;
  const FIRST_TICKETS_TOP = 29;
  const FOOTER_Y = 288;
  const IMAGE_FORMAT = 'JPEG';

  function ticketsTop(set) { return FIRST_TICKETS_TOP + set * (SET_H + SET_GAP + SET_LABEL_H); }
  function setLabelY(set) { return ticketsTop(set) - SET_LABEL_H; }
  // y of the dashed cut line that separates set `set` (>= 1) from the previous one
  function setSeparatorY(set) { return setLabelY(set) - SET_GAP / 2; }

  // Position (mm) of slot `i` (0..PER_PAGE-1) on a page.
  function slotPosition(i) {
    const set = Math.floor(i / SET_SIZE), within = i % SET_SIZE;
    const row = Math.floor(within / COLS), col = within % COLS;
    return { x: MARGIN_X + col * (TICKET_W + GUTTER), y: ticketsTop(set) + row * (TICKET_H + ROW_GAP), w: TICKET_W, h: TICKET_H, set: set };
  }

  function pageCount(ticketCount) { return Math.max(1, Math.ceil(ticketCount / PER_PAGE)); }

  // Splits a list into pages of PER_PAGE and each page into sets of SET_SIZE.
  function paginate(items) {
    const pages = [];
    for (let i = 0; i < items.length; i += PER_PAGE) {
      const chunk = items.slice(i, i + PER_PAGE);
      const sets = [];
      for (let j = 0; j < chunk.length; j += SET_SIZE) sets.push(chunk.slice(j, j + SET_SIZE));
      pages.push({ items: chunk, sets: sets });
    }
    if (!pages.length) pages.push({ items: [], sets: [] });
    return pages;
  }

  /**
   * Builds a jsPDF document from full-page images. `pageImages` is an array of
   * { data: dataURL, format?: 'JPEG'|'PNG', orientation?: 'portrait'|'landscape' } (A4, default portrait).
   */
  function buildPdf(JsPDF, pageImages, options) {
    options = options || {};
    const isLand = function (img) { return img && img.orientation === 'landscape'; };
    const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: isLand(pageImages[0]) ? 'landscape' : 'portrait', compress: options.compress !== false });
    if (options.title) doc.setProperties({ title: options.title, creator: 'Tambola Ticket Generator' });
    pageImages.forEach(function (img, p) {
      const land = isLand(img);
      if (p > 0) doc.addPage('a4', land ? 'landscape' : 'portrait');
      doc.addImage(img.data, img.format || IMAGE_FORMAT, 0, 0, land ? PAGE_H : PAGE_W, land ? PAGE_W : PAGE_H, undefined, 'FAST');
    });
    return doc;
  }

  // ---- file names ----
  function uniqueName(used, base, ext) {
    let name = base + ext, n = 2;
    while (used.has(name.toLowerCase())) name = base + ' (' + (n++) + ')' + ext;
    used.add(name.toLowerCase());
    return name;
  }

  /**
   * One entry per person (from Registry.display()):
   * { person, tickets, pageCount, stem, fileName ("Name.pdf"), pngNames (one per page, "Name.png" or "Name_1.png" ...) }.
   * PDF names are unique ignoring case; PNG names are unique ignoring case across all people.
   */
  function buildPersonFiles(display) {
    const usedPdf = new Set(), usedPng = new Set();
    return display.map(function (g) {
      let stem = Exporter.sanitizeName(g.person.name);
      if (!stem) stem = 'Ticket_' + g.tickets[0].serial;
      const pages = pageCount(g.tickets.length);
      const fileName = uniqueName(usedPdf, stem, '.pdf');
      const pdfStem = fileName.replace(/\.pdf$/, '');
      const pngNames = [];
      for (let p = 0; p < pages; p++) pngNames.push(uniqueName(usedPng, pages === 1 ? pdfStem : pdfStem + '_' + (p + 1), '.png'));
      return { person: g.person, tickets: g.tickets, pageCount: pages, stem: pdfStem, fileName: fileName, pngNames: pngNames };
    });
  }

  // layout 'ticket' (one ticket per image, the original look): Page = ticket number, Set empty, PNG file = per-ticket name.
  // layout 'sheet' (12 per page): Page/Set locate the ticket on its sheet, PNG file = the sheet page's name.
  function buildCsv(display, layout) {
    const single = layout === 'ticket';
    const header = ['Ticket ID', 'Name', 'Ticket No.', 'Tickets For Person', 'Page', 'Set', 'PDF file', 'PNG file', 'Source', 'Row 1', 'Row 2', 'Row 3', 'All numbers'];
    const lines = [header.join(',')];
    const singleNames = single ? new Map(Exporter.buildFileList(display).map(function (f) { return [f.serial, f.fileName]; })) : null;
    buildPersonFiles(display).forEach(function (pf) {
      pf.tickets.forEach(function (t, i) {
        const page = single ? i : Math.floor(i / PER_PAGE), set = Math.floor((i % PER_PAGE) / SET_SIZE);
        const rows = t.grid.map(function (r) { return r.filter(Boolean).join(' '); });
        lines.push([
          RegistryMod.formatSerial(t.serial), pf.person.name, i + 1, pf.tickets.length, page + 1, single ? '' : set + 1, pf.fileName,
          single ? singleNames.get(t.serial) : pf.pngNames[page], t.source,
          rows[0], rows[1], rows[2], Ticket.allNumbers(t.grid).join(' ')
        ].map(Exporter.csvCell).join(','));
      });
    });
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }

  return {
    PAGE_W, PAGE_H, MARGIN_X, COLS, GUTTER, TICKET_W, TICKET_H, ROW_GAP, ROWS_PER_SET, SET_SIZE, SETS_PER_PAGE, PER_PAGE, SET_H,
    SET_LABEL_H, SET_GAP, TITLE_Y, SUBTITLE_Y, RULE_Y, FIRST_TICKETS_TOP, FOOTER_Y, IMAGE_FORMAT,
    ticketsTop, setLabelY, setSeparatorY, slotPosition, pageCount, paginate, buildPdf, buildPersonFiles, buildCsv
  };
});
