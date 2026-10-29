/* Canvas renderer for a tambola sheet page (A4 portrait, up to 12 tickets in two sets of 6). Used for the on-screen
   preview, the PNG download and the page images embedded in the PDF, so all three always look the same. */
(function (root) {
  'use strict';

  const Pdf = root.TambolaPdf;
  const Reg = root.TambolaRegistry;
  const FONT = 'Arial, Helvetica, "Segoe UI", sans-serif';
  const MONO = '"Courier New", Courier, monospace';
  const BRAND = '#c2410c', BRAND_DARK = '#9a3412', TINT = '#fff1e0', TINT_LINE = '#f3c79b', BLANK = '#fdf4ea';
  const INK = '#1c1917', GREY = '#78716c';

  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function truncate(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    const chars = Array.from(text);
    while (chars.length > 1 && ctx.measureText(chars.join('') + '…').width > maxW) chars.pop();
    return chars.join('') + '…';
  }

  // Sets ctx.font to the largest bold size (px) between min and max that fits maxW, truncating if even min does not fit.
  function fitBold(ctx, text, maxW, maxPx, minPx) {
    let size = maxPx;
    ctx.font = 'bold ' + size + 'px ' + FONT;
    while (size > minPx && ctx.measureText(text).width > maxW) { size -= Math.max(0.5, size * 0.04); ctx.font = 'bold ' + size + 'px ' + FONT; }
    return truncate(ctx, text, maxW);
  }

  function drawTicketBox(ctx, s, x, y, w, h, item, opts) {
    const X = x * s, Y = y * s, W = w * s, H = h * s, strip = 5.6 * s;

    // body + header strip
    ctx.save();
    roundedRect(ctx, X, Y, W, H, 1.4 * s);
    ctx.clip();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(X, Y, W, H);
    ctx.fillStyle = TINT;
    ctx.fillRect(X, Y, W, strip);
    ctx.fillStyle = TINT_LINE;
    ctx.fillRect(X, Y + strip - 0.3 * s, W, 0.3 * s);
    ctx.restore();

    ctx.textBaseline = 'middle';

    // ID badge (serial, or the person's ticket number when serials are hidden)
    const pillText = opts.showSerial ? Reg.formatSerial(item.ticket.serial) : 'T' + item.index;
    ctx.font = 'bold ' + 2.7 * s + 'px ' + MONO;
    const pillW = ctx.measureText(pillText).width + 2.6 * s, pillH = 3.8 * s;
    const pillX = X + 1.6 * s, pillY = Y + (strip - pillH) / 2;
    roundedRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = BRAND;
    ctx.lineWidth = 0.25 * s;
    ctx.stroke();
    ctx.fillStyle = BRAND_DARK;
    ctx.textAlign = 'center';
    ctx.fillText(pillText, pillX + pillW / 2, pillY + pillH / 2 + 0.1 * s);

    // "n of N" on the right
    let rightEdge = X + W - 2 * s;
    if (opts.showLabel && item.total > 1) {
      const label = item.index + ' of ' + item.total;
      ctx.font = 2.7 * s + 'px ' + FONT;
      ctx.fillStyle = '#57534e';
      ctx.textAlign = 'right';
      ctx.fillText(label, rightEdge, Y + strip / 2 + 0.1 * s);
      rightEdge -= ctx.measureText(label).width + 2 * s;
    }

    // holder's name in the middle, so a cut-out ticket still shows who it belongs to
    const left = pillX + pillW + 2 * s, avail = rightEdge - left;
    if (avail > 8 * s) {
      const name = fitBold(ctx, item.name || '', avail, 3.1 * s, 2.2 * s);
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.fillText(name, left + avail / 2, Y + strip / 2 + 0.1 * s);
    }

    // grid
    const gx = X + 1.5 * s, gy = Y + strip, cw = (W - 3 * s) / 9, ch = (H - strip - 1.5 * s) / 3;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.22 * s;
    ctx.font = 'bold ' + 5.6 * s + 'px ' + FONT;
    ctx.textAlign = 'center';
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 9; c++) {
        const cx = gx + c * cw, cy = gy + r * ch, v = item.ticket.grid[r][c];
        ctx.fillStyle = v ? '#ffffff' : BLANK;
        ctx.fillRect(cx, cy, cw, ch);
        ctx.strokeRect(cx, cy, cw, ch);
        if (v) { ctx.fillStyle = '#000'; ctx.fillText(String(v), cx + cw / 2, cy + ch / 2 + 0.2 * s); }
      }
    }
    ctx.lineWidth = 0.5 * s;
    ctx.strokeRect(gx, gy, 9 * cw, 3 * ch);

    // outer frame
    ctx.strokeStyle = BRAND;
    ctx.lineWidth = 0.5 * s;
    roundedRect(ctx, X, Y, W, H, 1.4 * s);
    ctx.stroke();
  }

  /**
   * page: { title, subtitle?, pageNo, pageCount, setOffset (0-based index of this page's first set),
   *         items: [{ ticket, name, index, total }] (at most Pdf.PER_PAGE) }
   * opts: { showSerial, showLabel, footerText }
   * Draws onto `canvas`, sized A4 at `dpi`.
   */
  function drawSheetPage(canvas, page, opts, dpi) {
    const s = dpi / 25.4;
    canvas.width = Math.round(Pdf.PAGE_W * s);
    canvas.height = Math.round(Pdf.PAGE_H * s);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const left = Pdf.MARGIN_X * s, right = (Pdf.PAGE_W - Pdf.MARGIN_X) * s;

    // title block
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.fillText(fitBold(ctx, page.title || '', (Pdf.PAGE_W - 2 * Pdf.MARGIN_X) * s, 7.5 * s, 4.5 * s), Pdf.PAGE_W / 2 * s, Pdf.TITLE_Y * s);
    if (page.subtitle) {
      ctx.font = 3.3 * s + 'px ' + FONT;
      ctx.fillStyle = GREY;
      ctx.fillText(truncate(ctx, page.subtitle, (Pdf.PAGE_W - 2 * Pdf.MARGIN_X) * s), Pdf.PAGE_W / 2 * s, Pdf.SUBTITLE_Y * s);
    }
    ctx.strokeStyle = BRAND;
    ctx.lineWidth = 0.45 * s;
    ctx.beginPath(); ctx.moveTo(left, Pdf.RULE_Y * s); ctx.lineTo(right, Pdf.RULE_Y * s); ctx.stroke();

    // set labels, dashed separator and tickets
    const sets = Math.ceil(page.items.length / Pdf.SET_SIZE);
    for (let set = 0; set < sets; set++) {
      const inSet = page.items.slice(set * Pdf.SET_SIZE, (set + 1) * Pdf.SET_SIZE);
      const serials = inSet.map(function (it) { return it.ticket.serial; });
      const lo = Math.min.apply(null, serials), hi = Math.max.apply(null, serials);
      ctx.font = 'bold ' + 2.8 * s + 'px ' + FONT;
      ctx.fillStyle = '#57534e';
      ctx.textAlign = 'left';
      ctx.fillText('Set ' + (page.setOffset + set + 1) + ' · ' + Reg.formatSerial(lo) + (hi !== lo ? ' – ' + Reg.formatSerial(hi) : ''), left, (Pdf.setLabelY(set) + Pdf.SET_LABEL_H / 2) * s);
      if (set > 0) {
        ctx.strokeStyle = '#8a8a8a';
        ctx.lineWidth = 0.3 * s;
        ctx.setLineDash([2 * s, 1.5 * s]);
        ctx.beginPath(); ctx.moveTo(left, Pdf.setSeparatorY(set) * s); ctx.lineTo(right, Pdf.setSeparatorY(set) * s); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    page.items.forEach(function (item, i) {
      const p = Pdf.slotPosition(i);
      drawTicketBox(ctx, s, p.x, p.y, p.w, p.h, item, opts);
    });

    // footer
    ctx.textBaseline = 'middle';
    if (opts.footerText) {
      ctx.font = 'italic bold ' + 3.4 * s + 'px ' + FONT;
      ctx.fillStyle = BRAND_DARK;
      ctx.textAlign = 'center';
      ctx.fillText(truncate(ctx, opts.footerText, 140 * s), Pdf.PAGE_W / 2 * s, Pdf.FOOTER_Y * s);
    }
    if (page.pageCount > 1) {
      ctx.font = 3 * s + 'px ' + FONT;
      ctx.fillStyle = GREY;
      ctx.textAlign = 'right';
      ctx.fillText(page.pageNo + ' / ' + page.pageCount, right, Pdf.FOOTER_Y * s);
    }
  }

  root.TambolaSheet = { drawSheetPage };
})(typeof self !== 'undefined' ? self : this);
