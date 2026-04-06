// tests/export.test.js
// Tests for CSV export helpers and sanitization logic.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadSourceFiles } = require('./setup');

// Load field-registry and validation first, then inject stubs for
// modules that export.js references at parse time, and finally
// load export.js into the same VM context.
const ctx = loadSourceFiles('field-registry.js', 'validation.js');

// Stubs for modules that export.js references
ctx.App = { currentProject: null };
ctx.Config = { getEnabledFields: () => [] };
ctx.Tree = { flattenTree: (entries) => entries };

// Load export.js into the existing context
const exportCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'export.js'), 'utf-8');
const wrappedExport = `
  (function() {
    ${exportCode}
    if (typeof Export !== 'undefined') globalThis.Export = Export;
  })();
`;
vm.runInContext(wrappedExport, ctx, { filename: 'export.js' });

const Export = ctx.Export;
const Validation = ctx.Validation;

// ===== Export.escapeCSV =====

describe('Export.escapeCSV', () => {
  it('returns empty string for empty input', () => {
    assert.equal(Export.escapeCSV(''), '');
  });

  it('returns empty string for null/undefined', () => {
    assert.equal(Export.escapeCSV(null), '');
    assert.equal(Export.escapeCSV(undefined), '');
  });

  it('passes through a simple string unchanged', () => {
    assert.equal(Export.escapeCSV('hello world'), 'hello world');
  });

  it('quotes a string containing a comma', () => {
    assert.equal(Export.escapeCSV('one, two'), '"one, two"');
  });

  it('quotes and doubles internal double quotes', () => {
    assert.equal(Export.escapeCSV('say "hello"'), '"say ""hello"""');
  });

  it('quotes a string containing a newline', () => {
    assert.equal(Export.escapeCSV('line1\nline2'), '"line1\nline2"');
  });

  it('quotes a string containing a carriage return', () => {
    assert.equal(Export.escapeCSV('line1\rline2'), '"line1\rline2"');
  });

  it('quotes a string with leading space', () => {
    assert.equal(Export.escapeCSV(' leading'), '" leading"');
  });

  it('quotes a string with trailing space', () => {
    assert.equal(Export.escapeCSV('trailing '), '"trailing "');
  });

  it('handles a string with commas and quotes together', () => {
    assert.equal(Export.escapeCSV('a "b", c'), '"a ""b"", c"');
  });
});

// ===== Export.dateStamp =====

describe('Export.dateStamp', () => {
  it('returns a string in YYYY-MM-DD format', () => {
    const stamp = Export.dateStamp();
    assert.match(stamp, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('reflects the current date', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    assert.equal(Export.dateStamp(), expected);
  });
});

// ===== Validation.sanitizeForExport =====

describe('Validation.sanitizeForExport', () => {
  it('returns empty string for empty input', () => {
    assert.equal(Validation.sanitizeForExport(''), '');
  });

  it('returns empty string for null', () => {
    assert.equal(Validation.sanitizeForExport(null), '');
  });

  it('returns empty string for undefined', () => {
    assert.equal(Validation.sanitizeForExport(undefined), '');
  });

  it('passes through a plain string unchanged', () => {
    assert.equal(Validation.sanitizeForExport('hello world'), 'hello world');
  });

  it('replaces curly single quotes with straight single quotes', () => {
    // \u2018 = left single, \u2019 = right single, \u201A = single low-9
    assert.equal(Validation.sanitizeForExport('\u2018test\u2019'), "'test'");
    assert.equal(Validation.sanitizeForExport('\u201Atest'), "'test");
  });

  it('replaces curly double quotes with straight double quotes', () => {
    // \u201C = left double, \u201D = right double, \u201E = double low-9
    assert.equal(Validation.sanitizeForExport('\u201Ctest\u201D'), '"test"');
    assert.equal(Validation.sanitizeForExport('\u201Etest'), '"test');
  });

  it('replaces em dash with hyphen', () => {
    assert.equal(Validation.sanitizeForExport('one\u2014two'), 'one-two');
  });

  it('replaces en dash with hyphen', () => {
    assert.equal(Validation.sanitizeForExport('1975\u20131980'), '1975-1980');
  });

  it('strips control characters', () => {
    assert.equal(Validation.sanitizeForExport('hello\x00world'), 'helloworld');
    assert.equal(Validation.sanitizeForExport('a\x07b\x1Fc'), 'abc');
  });

  it('preserves newlines', () => {
    assert.equal(Validation.sanitizeForExport('line1\nline2'), 'line1\nline2');
    assert.equal(Validation.sanitizeForExport('line1\r\nline2'), 'line1\r\nline2');
  });

  it('trims leading and trailing whitespace', () => {
    assert.equal(Validation.sanitizeForExport('  hello  '), 'hello');
  });

  it('handles a combination of replacements', () => {
    const input = '  \u201CHello\u201D \u2014 world\x00  ';
    assert.equal(Validation.sanitizeForExport(input), '"Hello" - world');
  });
});
