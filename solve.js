// Fast drop-in for make.fun's csv-reader 1.0.0 (csv-reader-speed-01-run-20261121).
//
// Returns exactly csv-reader 1.0.0's answer {columns, rows, errors} for every
// {text, header} input, but scans with native indexOf/slice/split instead of
// walking the text one character at a time. Semantics mirror the reference
// (vendor/csv-reader/index.js) rule for rule:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled,
//     "" inside it one quote, each CRLF or lone CR inside it read as LF; what
//     follows its closing quote, up to the next comma or line break, is appended
//     as it stands (quote_junk, when the field ends); a quote that never closes
//     is a literal character, and the text after it is read again as unquoted
//     (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds the
//     records after it, each padded with "" (short_row, with fields: its field
//     count) or cut (long_row, with extra: the cut fields) to the first record's
//     width;
//   - each error is {code, line, row}, in the order met, a field's quote_junk
//     when the field ends and a record's short_row or long_row when the record
//     ends; line is the 1-based line its record starts on (every LF, CRLF and
//     lone CR inside a quoted field counted), row its record's index in rows
//     (null for the header).
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to the
// next. Node 22, ES module, no dependencies.

/** How a field ended: 0 at a comma, 1 at a line break, 2 at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0; // a U+FEFF at the very start is dropped
  let line = 1; // the line the character at pos is on

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // How the last field read ended, and how many characters its reader kept (for quote_junk).
  let fieldEnd = END;
  let fieldAdded = 0;

  const error = (code) => {
    errors.push({ code, line: recordLine, row: recordRow });
  };

  // Reads unquoted characters onto `value` up to the next comma or line break: a CR not followed by LF is dropped
  // (stray_cr). Returns the field; sets fieldEnd and fieldAdded (the characters kept by this call). A stray CR never
  // ends the field, so one slice to the next comma or line break holds the whole field, CRs and all.
  function readUnquoted(value) {
    let comma = text.indexOf(',', pos);
    let nl = text.indexOf('\n', pos);
    if (comma === -1) comma = n;
    if (nl === -1) nl = n;
    let end;
    if (comma < nl) {
      end = comma;
      fieldEnd = comma >= n ? END : COMMA;
    } else {
      end = nl;
      fieldEnd = nl >= n ? END : LINE_BREAK;
    }
    let seg = text.slice(pos, end);
    if (fieldEnd === LINE_BREAK && seg.charCodeAt(seg.length - 1) === 13) {
      // CRLF: the CR is the line break, not part of the field.
      seg = seg.slice(0, -1);
    }
    const crAt = seg.indexOf('\r');
    if (crAt === -1) {
      fieldAdded = seg.length;
      value += seg;
    } else {
      const parts = seg.split('\r');
      for (let i = 1; i < parts.length; i++) error('stray_cr');
      const kept = parts.join('');
      fieldAdded = kept.length;
      value += kept;
    }
    if (fieldEnd === COMMA) pos = end + 1;
    else if (fieldEnd === LINE_BREAK) {
      pos = end + 1;
      line += 1;
    } else pos = n;
    return value;
  }

  // Reads a quoted field whose opening quote is at pos. Returns the field; sets fieldEnd.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let doubled = false;
    let close = -1;
    let q = pos;
    for (;;) {
      q = text.indexOf('"', q);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        error('unterminated_quote');
        return readUnquoted('"');
      }
      if (text.charCodeAt(q + 1) === 34) {
        doubled = true;
        q += 2;
        continue;
      }
      close = q;
      break;
    }
    // The quoted content, [open + 1, close): "" is one quote, each CRLF or lone CR inside it is one LF.
    let value = text.slice(open + 1, close);
    let k = value.indexOf('\n');
    let breaks = 0;
    while (k !== -1) {
      breaks += 1;
      k = value.indexOf('\n', k + 1);
    }
    k = value.indexOf('\r');
    let hasCr = false;
    while (k !== -1) {
      hasCr = true;
      // A CRLF's LF is already counted above; a lone CR counts on its own.
      if (value.charCodeAt(k + 1) !== 10) breaks += 1;
      k = value.indexOf('\r', k + 1);
    }
    line += breaks;
    if (doubled) value = value.replaceAll('""', '"');
    if (hasCr) value = value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    pos = close + 1;
    if (pos >= n) {
      fieldEnd = END;
      return value;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fieldEnd = COMMA;
      return value;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fieldEnd = LINE_BREAK;
      return value;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fieldEnd = LINE_BREAK;
      return value;
    }
    // What follows the closing quote is appended as it stands, up to the next comma or line break.
    const junk = readUnquoted(value);
    if (fieldAdded > 0) error('quote_junk');
    return junk;
  }

  // Finishes one record's fields: a line that held only stray CRs is left with no characters and is no record.
  function finishRecord(fields, quoted) {
    if (fields.length === 1 && fields[0] === '' && !quoted) return;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  // The next quote / CR at or after pos, cached across lines so the searches below stay linear in total:
  // -2 unknown, -1 none left in the text, otherwise the cached position.
  let nextQuote = -2;
  let nextCr = -2;

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: the record's line holds no quote and no stray CR, so every field is plain text to the next
    // comma or line break and the whole line splits at once. (A quoted field may span lines, so any quote
    // in the line falls back to the field-by-field reader.) A CR at lineEnd itself is the line's own CRLF,
    // not a stray CR, so only one strictly inside the line blocks the fast path.
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? n : text.charCodeAt(nl - 1) === 13 ? nl - 1 : nl;
    if (nextQuote === -2 || (nextQuote !== -1 && nextQuote < pos)) nextQuote = text.indexOf('"', pos);
    if (nextCr === -2 || (nextCr !== -1 && nextCr < pos)) nextCr = text.indexOf('\r', pos);
    if ((nextQuote === -1 || nextQuote >= lineEnd) && (nextCr === -1 || nextCr >= lineEnd)) {
      finishRecord(text.slice(pos, lineEnd).split(','), false);
      if (nl === -1) {
        pos = n;
      } else {
        pos = nl + 1;
        line += 1;
      }
      continue;
    }

    const fields = [];
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      fields.push(quoted ? readQuoted() : readUnquoted(''));
    } while (fieldEnd === COMMA);
    finishRecord(fields, quoted);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
