/**
 * A PDF writer, in about four hundred lines and with nothing installed.
 *
 * WHY THIS EXISTS
 *
 * The price sheet used to be made by asking the browser to print. That works,
 * but the browser signs its own work: Chrome draws the document's title along
 * the top of every page and the page's web address along the foot. On a sheet
 * going to a customer, that read "Catalogue admin | PowerKing Nepal" and
 * "powerkingnepal.com/admin/" — the name of an internal tool and a link to it.
 *
 * None of that can be removed from a stylesheet. Printed with the page margin
 * set to zero, Chrome draws it over the content instead of beside it; the only
 * switch is a tick box in the print dialogue, on a phone often not even that,
 * and renaming the document while the box is open only helps on browsers that
 * fire beforeprint, which Safari and most phones do not.
 *
 * So the file is written here instead. Nothing is printed, nothing is asked of
 * the browser but a canvas, and what comes out has exactly what was put in it.
 *
 * HOW MUCH PDF IS NEEDED
 *
 * Very little, as it turns out. Text uses Helvetica and Helvetica-Bold, two of
 * the fourteen faces every reader is required to have, so no font is embedded
 * and none has to be subset. Photographs go in as JPEG exactly as JPEG, which
 * is what /DCTDecode means — the bytes are copied, not re-encoded, so a page of
 * product shots costs what the shots cost. Line widths come from the browser's
 * own text measurement, which is close enough to Helvetica's metrics to wrap a
 * product name on the right word.
 *
 * Co-ordinates here are PDF's own: points, origin at the bottom-left, y going
 * up. Everything above works top-down, so `at()` is the one place that flips.
 */
(function () {
  'use strict';

  var PAGE = { w: 595.28, h: 841.89 };          // A4 in points
  var MARGIN = { top: 38, right: 36, bottom: 48, left: 36 };
  var CONTENT_W = PAGE.w - MARGIN.left - MARGIN.right;

  var GREY = 0.42;
  var FAINT = 0.55;

  /* ------------------------------------------------------------- bytes -- */

  function latin1(str) {
    var out = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
    return out;
  }

  function concat(chunks) {
    var n = 0;
    chunks.forEach(function (c) { n += c.length; });
    var out = new Uint8Array(n);
    var at = 0;
    chunks.forEach(function (c) { out.set(c, at); at += c.length; });
    return out;
  }

  /**
   * Unicode to WinAnsi, which is the encoding the standard faces are asked for
   * below. The range 0x80–0x9F is where CP1252 differs from Latin-1, and it is
   * where the typography lives: the dot between two facts, the dash in a
   * range, the curly quotes a phone keyboard produces. Anything with no place
   * in the encoding becomes a hyphen rather than a black box.
   */
  var WIN = {
    0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
    0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
    0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
    0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
    0x017e: 0x9e, 0x0178: 0x9f,
  };

  function pdfString(text) {
    var out = '';
    var s = String(text == null ? '' : text);
    for (var i = 0; i < s.length; i++) {
      var cp = s.charCodeAt(i);
      var b = cp < 0x80 ? cp : (WIN[cp] || (cp >= 0xa0 && cp <= 0xff ? cp : 0x2d));
      var ch = String.fromCharCode(b);
      if (ch === '(' || ch === ')' || ch === '\\') out += '\\';
      out += ch;
    }
    return out;
  }

  /* --------------------------------------------------------- measuring -- */

  var gauge = null;
  function measure(text, size, bold) {
    if (!gauge) gauge = document.createElement('canvas').getContext('2d');
    gauge.font = (bold ? 'bold ' : '') + size + 'px Helvetica, Arial, sans-serif';
    return gauge.measureText(String(text == null ? '' : text)).width;
  }

  /** Break a string onto lines no wider than `width`, at most `max` of them. */
  function wrap(text, width, size, bold, max) {
    var words = String(text == null ? '' : text).split(/\s+/).filter(Boolean);
    var lines = [];
    var line = '';
    for (var i = 0; i < words.length; i++) {
      var next = line ? line + ' ' + words[i] : words[i];
      if (line && measure(next, size, bold) > width) {
        lines.push(line);
        line = words[i];
        if (max && lines.length === max) { line = ''; break; }
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    if (max && lines.length > max) lines = lines.slice(0, max);
    return lines.length ? lines : [''];
  }

  /* ------------------------------------------------------------- pages -- */

  function Page() {
    this.ops = [];
    this.uses = {};
  }

  /** Top-down y to PDF's bottom-up y. */
  function at(y) { return PAGE.h - y; }

  function fmt(n) { return (Math.round(n * 100) / 100).toString(); }

  Page.prototype.text = function (str, x, y, o) {
    var opt = o || {};
    var size = opt.size || 8;
    var body = pdfString(str);
    if (!body) return;
    this.ops.push(fmt(opt.grey === undefined ? 0 : opt.grey) + ' g');
    if (opt.track) this.ops.push(fmt(opt.track) + ' Tc');
    this.ops.push('BT /' + (opt.bold ? 'FB' : 'FR') + ' ' + fmt(size) + ' Tf '
      + fmt(x) + ' ' + fmt(at(y) - size) + ' Td (' + body + ') Tj ET');
    if (opt.track) this.ops.push('0 Tc');
  };

  Page.prototype.rule = function (x, y, w, o) {
    var opt = o || {};
    this.ops.push(fmt(opt.grey === undefined ? 0.78 : opt.grey) + ' G '
      + fmt(opt.weight || 0.5) + ' w '
      + fmt(x) + ' ' + fmt(at(y)) + ' m ' + fmt(x + w) + ' ' + fmt(at(y)) + ' l S');
  };

  Page.prototype.box = function (x, y, w, h, grey) {
    this.ops.push(fmt(grey) + ' G 0.5 w ' + fmt(x) + ' ' + fmt(at(y + h)) + ' '
      + fmt(w) + ' ' + fmt(h) + ' re S');
  };

  Page.prototype.image = function (name, x, y, w, h) {
    this.uses[name] = true;
    this.ops.push('q ' + fmt(w) + ' 0 0 ' + fmt(h) + ' ' + fmt(x) + ' '
      + fmt(at(y + h)) + ' cm /' + name + ' Do Q');
  };

  /**
   * A line made of pieces that change weight partway — "Rs. 850" in bold and
   * " a piece" after it. Returns the number of lines drawn, because a rate
   * that will not fit the column wraps and the block below has to know.
   */
  Page.prototype.runs = function (pieces, x, y, width, size, leading) {
    var cursor = x;
    var line = 0;
    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i];
      var w = measure(p.text, p.size || size, p.bold);
      if (cursor > x && cursor + w > x + width) { line++; cursor = x; }
      this.text(p.text, cursor, y + line * leading,
        { size: p.size || size, bold: p.bold, grey: p.grey });
      cursor += w;
    }
    return line + 1;
  };

  /* ------------------------------------------------------------ photos -- */

  /**
   * Fetch a photograph and hand back JPEG bytes at the size the page uses it.
   *
   * Re-encoding rather than embedding the original is the difference between a
   * sheet somebody can send over WhatsApp and one they cannot: a catalogue
   * photograph is six hundred pixels square and is printed here at about the
   * size of a thumbnail, so all but a fraction of those bytes would be paid
   * for and never seen.
   */
  function photo(url, px) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          var canvas = document.createElement('canvas');
          canvas.width = px;
          canvas.height = px;
          var ctx = canvas.getContext('2d');
          // White behind, because a PDF page is white and a transparent PNG
          // flattened onto nothing comes out black.
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, px, px);
          var scale = Math.min(px / img.naturalWidth, px / img.naturalHeight);
          var w = img.naturalWidth * scale;
          var h = img.naturalHeight * scale;
          ctx.drawImage(img, (px - w) / 2, (px - h) / 2, w, h);
          var data = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
          var bin = atob(data);
          var bytes = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          resolve({ bytes: bytes, w: px, h: px });
        } catch (e) {
          resolve(null);          // tainted canvas, or no canvas at all
        }
      };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  /* ------------------------------------------------------------- write -- */

  function serialise(pages, images, meta) {
    var objects = [];
    function add(body) { objects.push(body); return objects.length; }

    var fontR = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    var fontB = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    var imageIds = {};
    Object.keys(images).forEach(function (name) {
      var im = images[name];
      imageIds[name] = add({
        head: '<< /Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h
          + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '
          + im.bytes.length + ' >>',
        stream: im.bytes,
      });
    });

    var pagesId = objects.length + 1 + pages.length * 2;
    var kids = [];
    pages.forEach(function (page) {
      var body = latin1(page.ops.join('\n'));
      var contentId = add({ head: '<< /Length ' + body.length + ' >>', stream: body });
      var xobjects = Object.keys(page.uses).map(function (name) {
        return '/' + name + ' ' + imageIds[name] + ' 0 R';
      }).join(' ');
      kids.push(add('<< /Type /Page /Parent ' + pagesId + ' 0 R'
        + ' /MediaBox [0 0 ' + fmt(PAGE.w) + ' ' + fmt(PAGE.h) + ']'
        + ' /Resources << /Font << /FR ' + fontR + ' 0 R /FB ' + fontB + ' 0 R >>'
        + (xobjects ? ' /XObject << ' + xobjects + ' >>' : '') + ' >>'
        + ' /Contents ' + contentId + ' 0 R >>'));
    });

    var realPagesId = add('<< /Type /Pages /Count ' + kids.length + ' /Kids ['
      + kids.map(function (k) { return k + ' 0 R'; }).join(' ') + '] >>');
    // The page objects were written naming their parent before it existed, so
    // the two have to agree; they do, because the count above is fixed.
    if (realPagesId !== pagesId) {
      throw new Error('page tree numbering is out of step');
    }

    // Nothing here says where the file was made. That is the entire point.
    var info = add('<< /Title (' + pdfString(meta.title) + ')'
      + ' /Author (' + pdfString(meta.author) + ')'
      + ' /Creator (' + pdfString(meta.author) + ')'
      + ' /Producer (' + pdfString(meta.author) + ') >>');
    var catalog = add('<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>');

    var chunks = [latin1('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
    var offset = chunks[0].length;
    var offsets = [];
    objects.forEach(function (body, i) {
      offsets.push(offset);
      var head = latin1((i + 1) + ' 0 obj\n');
      chunks.push(head);
      offset += head.length;
      if (typeof body === 'string') {
        var b = latin1(body + '\nendobj\n');
        chunks.push(b);
        offset += b.length;
      } else {
        var open = latin1(body.head + '\nstream\n');
        var close = latin1('\nendstream\nendobj\n');
        chunks.push(open, body.stream, close);
        offset += open.length + body.stream.length + close.length;
      }
    });

    var xref = 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
    offsets.forEach(function (o) {
      xref += ('0000000000' + o).slice(-10) + ' 00000 n \n';
    });
    xref += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root ' + catalog
      + ' 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + offset + '\n%%EOF\n';
    chunks.push(latin1(xref));

    return concat(chunks);
  }

  /* ------------------------------------------------------------ layout -- */

  function priceSheet(doc, onProgress) {
    var withPhotos = !!doc.withPhotos;
    var columns = withPhotos ? 2 : 3;
    var gutter = withPhotos ? 18 : 16;
    var colW = (CONTENT_W - gutter * (columns - 1)) / columns;
    var SHOT = 46;
    var textW = withPhotos ? colW - SHOT - 8 : colW;

    // Every distinct photograph, once, however many products share one.
    var images = {};
    var byUrl = {};
    var urls = [];
    if (withPhotos) {
      doc.bands.forEach(function (band) {
        band.items.forEach(function (item) {
          if (item.image && urls.indexOf(item.image) === -1) urls.push(item.image);
        });
      });
    }

    return urls.reduce(function (chain, url, i) {
      return chain.then(function () {
        if (onProgress) onProgress(i, urls.length);
        return photo(url, 132).then(function (im) {
          if (!im) return;
          var name = 'Im' + (Object.keys(images).length + 1);
          images[name] = im;
          byUrl[url] = name;
        });
      });
    }, Promise.resolve()).then(function () {
      if (onProgress) onProgress(urls.length, urls.length);

      var pages = [];
      var page = new Page();
      pages.push(page);
      var y = MARGIN.top;

      /* --- the letterhead, on the first page only --- */
      var right = MARGIN.left + CONTENT_W;
      var half = CONTENT_W / 2 - 10;

      var titleY = y;
      page.text(doc.title, right - measure(doc.title, 17, true), titleY, { size: 17, bold: true });
      var ry = titleY + 22;
      if (doc.preparedFor) {
        page.text(doc.preparedFor, right - measure(doc.preparedFor, 10, true), ry,
          { size: 10, bold: true });
        ry += 14;
      }
      wrap(doc.stamp, half, 7.5, false).forEach(function (line) {
        page.text(line, right - measure(line, 7.5, false), ry, { size: 7.5, grey: GREY });
        ry += 10;
      });

      var ly = y;
      if (doc.logo) {
        var logoH = 34;
        var logoW = logoH * (doc.logo.ratio || 3);
        images.Logo = doc.logo;
        page.image('Logo', MARGIN.left, ly, logoW, logoH);
        ly += logoH + 8;
      }
      page.text(doc.business.name, MARGIN.left, ly, { size: 8.5, bold: true });
      ly += 11;
      doc.business.lines.forEach(function (line) {
        page.text(line, MARGIN.left, ly, { size: 7, grey: GREY });
        ly += 9.5;
      });

      y = Math.max(ly, ry) + 10;
      if (doc.note) {
        wrap(doc.note, CONTENT_W * 0.7, 8.5, false).forEach(function (line) {
          page.text(line, MARGIN.left, y, { size: 8.5 });
          y += 11;
        });
        y += 2;
      }
      wrap(doc.terms, CONTENT_W * 0.7, 6.8, false).forEach(function (line) {
        page.text(line, MARGIN.left, y, { size: 6.8, grey: FAINT });
        y += 9;
      });
      y += 8;
      page.rule(MARGIN.left, y, CONTENT_W, { grey: 0.1, weight: 1.2 });
      y += 14;

      var floor = PAGE.h - MARGIN.bottom;

      function newPage() {
        page = new Page();
        pages.push(page);
        y = MARGIN.top;
      }

      /** How tall one product sits, so a row can be measured before it is drawn. */
      function itemHeight(item) {
        var h = 0;
        h += wrap(item.name, textW, 8, true).length * 9.5;
        if (item.spec) h += wrap(item.spec, textW, 6.5, false).length * 8;
        item.rates.forEach(function (rate) {
          var w = measure(rate.money, 8.2, true) + measure(rate.rest, 7.5, false);
          h += (w > textW ? 2 : 1) * 9.5;
        });
        return Math.max(h + 4, withPhotos ? SHOT + 4 : 0);
      }

      function drawItem(item, x, top) {
        var tx = x;
        if (withPhotos) {
          if (byUrl[item.image]) page.image(byUrl[item.image], x, top, SHOT, SHOT);
          page.box(x, top, SHOT, SHOT, 0.84);
          tx = x + SHOT + 8;
        }
        var ty = top;
        wrap(item.name, textW, 8, true).forEach(function (line) {
          page.text(line, tx, ty, { size: 8, bold: true });
          ty += 9.5;
        });
        if (item.spec) {
          wrap(item.spec, textW, 6.5, false).forEach(function (line) {
            page.text(line, tx, ty, { size: 6.5, grey: GREY });
            ty += 8;
          });
        }
        item.rates.forEach(function (rate) {
          var lines = page.runs([
            { text: rate.money, size: 8.2, bold: true },
            { text: rate.rest, size: 7.5, grey: rate.quiet ? GREY : 0 },
          ], tx, ty, textW, 7.5, 9.5);
          ty += lines * 9.5;
        });
      }

      doc.bands.forEach(function (band) {
        // A category heading alone at the foot of a page is not a heading.
        if (y + 40 > floor) newPage();
        page.text(band.name.toUpperCase(), MARGIN.left, y,
          { size: 7, grey: GREY, track: 1.1 });
        y += 10;
        page.rule(MARGIN.left, y, CONTENT_W);
        y += 8;

        for (var i = 0; i < band.items.length; i += columns) {
          var row = band.items.slice(i, i + columns);
          var tall = 0;
          row.forEach(function (item) { tall = Math.max(tall, itemHeight(item)); });
          if (y + tall > floor) newPage();
          row.forEach(function (item, c) {
            drawItem(item, MARGIN.left + c * (colW + gutter), y);
          });
          y += tall + 8;
        }
        y += 8;
      });

      /* --- the same foot on every page, once the count is known --- */
      pages.forEach(function (p, i) {
        var fy = PAGE.h - MARGIN.bottom + 12;
        p.rule(MARGIN.left, fy - 8, CONTENT_W, { grey: 0.85 });
        p.text(doc.runningFoot, MARGIN.left, fy, { size: 6.2, grey: FAINT });
        var num = 'Page ' + (i + 1) + ' of ' + pages.length;
        p.text(num, MARGIN.left + CONTENT_W - measure(num, 6.2, false), fy,
          { size: 6.2, grey: FAINT });
      });

      return serialise(pages, images, {
        title: doc.fileTitle || doc.title,
        author: doc.business.name,
      });
    });
  }

  window.pkPdf = {
    build: priceSheet,
    /** The letterhead, fetched once and handed to build() as doc.logo. */
    logo: function (url, px) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          try {
            var ratio = img.naturalWidth / img.naturalHeight;
            var canvas = document.createElement('canvas');
            canvas.width = Math.round(px * ratio);
            canvas.height = px;
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            var data = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
            var bin = atob(data);
            var bytes = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            resolve({ bytes: bytes, w: canvas.width, h: canvas.height, ratio: ratio });
          } catch (e) { resolve(null); }
        };
        img.onerror = function () { resolve(null); };
        img.src = url;
      });
    },
  };
}());
