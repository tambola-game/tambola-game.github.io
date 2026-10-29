/* Canvas rendering of a Tambola ticket: a compact paper-ticket strip (heading, name, 3x9 grid, footer). */
(function (root) {
  'use strict';

  const W = 820, H = 392;
  const GRID_X = 23, GRID_Y = 134, CELL_W = 86, CELL_H = 66;
  const HEADER_H = 62, FOOTER_Y = 350;
  const FONT = 'Arial, Helvetica, "Segoe UI", sans-serif';
  const BRAND = '#c2410c', BRAND_DARK = '#9a3412', TINT = '#fff1e0', TINT_LINE = '#f3c79b', BLANK = '#fdf4ea';

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

  // Returns { lines, size } for the person's name: shrink first, then wrap to two lines, then ellipsis.
  function fitName(ctx, name, maxW) {
    for (let size = 32; size >= 22; size -= 2) {
      ctx.font = 'bold ' + size + 'px ' + FONT;
      if (ctx.measureText(name).width <= maxW) return { lines: [name], size: size };
    }
    ctx.font = 'bold 22px ' + FONT;
    const words = name.split(' ');
    let first = '';
    let i = 0;
    while (i < words.length && ctx.measureText((first ? first + ' ' : '') + words[i]).width <= maxW) {
      first = (first ? first + ' ' : '') + words[i]; i++;
    }
    if (!first) return { lines: [truncate(ctx, name, maxW)], size: 22 };
    const rest = words.slice(i).join(' ');
    return { lines: rest ? [first, truncate(ctx, rest, maxW)] : [first], size: 22 };
  }

  /**
   * opts: { heading, name, grid, serialText?, labelText?, footerText? }
   * Draws onto `canvas`, sized W*scale x H*scale.
   */
  function drawTicket(canvas, opts, scale) {
    scale = scale || 1;
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // Tinted header and footer bands, clipped to the rounded frame.
    ctx.save();
    roundedRect(ctx, 2, 2, W - 4, H - 4, 18);
    ctx.clip();
    ctx.fillStyle = TINT;
    ctx.fillRect(0, 0, W, HEADER_H);
    ctx.fillRect(0, FOOTER_Y, W, H - FOOTER_Y);
    ctx.fillStyle = TINT_LINE;
    ctx.fillRect(0, HEADER_H, W, 2);
    ctx.fillRect(0, FOOTER_Y - 2, W, 2);
    ctx.restore();
    ctx.strokeStyle = BRAND;
    ctx.lineWidth = 4;
    roundedRect(ctx, 2, 2, W - 4, H - 4, 18);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (opts.heading) {
      let size = 40;
      ctx.font = 'bold ' + size + 'px ' + FONT;
      while (size > 20 && ctx.measureText(opts.heading).width > W - 80) { size -= 2; ctx.font = 'bold ' + size + 'px ' + FONT; }
      ctx.fillStyle = BRAND_DARK;
      ctx.fillText(truncate(ctx, opts.heading, W - 80), W / 2, HEADER_H / 2 + 2);
    }

    const fit = fitName(ctx, opts.name || '', W - 60);
    ctx.fillStyle = '#1c1917';
    ctx.font = 'bold ' + fit.size + 'px ' + FONT;
    const nameMid = (HEADER_H + GRID_Y) / 2;
    if (fit.lines.length === 1) ctx.fillText(fit.lines[0], W / 2, nameMid + 1);
    else { ctx.fillText(fit.lines[0], W / 2, nameMid - 13); ctx.fillText(fit.lines[1], W / 2, nameMid + 14); }

    // Grid: blank cells get a faint tint, numbers stay black on white.
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.font = '34px ' + FONT;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 9; c++) {
        const x = GRID_X + c * CELL_W, y = GRID_Y + r * CELL_H;
        const v = opts.grid[r][c];
        ctx.fillStyle = v ? '#ffffff' : BLANK;
        ctx.fillRect(x, y, CELL_W, CELL_H);
        ctx.strokeRect(x, y, CELL_W, CELL_H);
        if (v) { ctx.fillStyle = '#000'; ctx.fillText(String(v), x + CELL_W / 2, y + CELL_H / 2 + 2); }
      }
    }

    const footerMid = FOOTER_Y + (H - FOOTER_Y) / 2;
    ctx.font = '17px ' + FONT;
    ctx.fillStyle = '#57534e';
    if (opts.labelText) { ctx.textAlign = 'left'; ctx.fillText(opts.labelText, GRID_X + 6, footerMid); }
    if (opts.serialText) { ctx.textAlign = 'right'; ctx.fillText(opts.serialText, W - GRID_X - 6, footerMid); }
    if (opts.footerText) {
      ctx.textAlign = 'center';
      ctx.font = 'italic bold 20px ' + FONT;
      ctx.fillStyle = BRAND_DARK;
      ctx.fillText(truncate(ctx, opts.footerText, W - 2 * 190), W / 2, footerMid);
    }
  }

  // Print sheets (200 dpi). "landscape" has the shape of A4 landscape (and, within 1%, a 5x7 in photo), so "Fill page" /
  // "Full page" printing barely crops it, and the ticket keeps wide side margins that absorb frames such as 8x10 in.
  // "portrait" is a full A4 portrait page with the ticket in the upper part.
  const SHEETS = {
    landscape: { w: 2339, h: 1654, ticketW: 1965, top: null },
    portrait: { w: 1654, h: 2339, ticketW: 1476, top: 234 }
  };
  const SHEET_DPI = 200, CUT_MARGIN = 14;

  function drawSheet(canvas, opts, kind) {
    const s = SHEETS[kind] || SHEETS.landscape;
    const t = document.createElement('canvas');
    drawTicket(t, opts, s.ticketW / W);
    canvas.width = s.w;
    canvas.height = s.h;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s.w, s.h);
    const x = Math.round((s.w - t.width) / 2);
    const y = s.top === null ? Math.round((s.h - t.height) / 2) : s.top;
    ctx.drawImage(t, x, y);
    // Light dashed cut line around the ticket.
    ctx.strokeStyle = '#b8b8b8';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 10]);
    ctx.strokeRect(x - CUT_MARGIN, y - CUT_MARGIN, t.width + 2 * CUT_MARGIN, t.height + 2 * CUT_MARGIN);
    ctx.setLineDash([]);
  }

  root.TambolaRender = { drawTicket, drawSheet, SHEETS, SHEET_DPI, CUT_MARGIN, W, H, TICKET_DPI: 220 };
})(typeof self !== 'undefined' ? self : this);
