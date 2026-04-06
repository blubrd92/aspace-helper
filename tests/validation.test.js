// tests/validation.test.js
// Tests for validation logic: field-level, conditional, and row-level.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadSourceFiles } = require('./setup');

const ctx = loadSourceFiles('field-registry.js', 'validation.js');
const Validation = ctx.Validation;
const FIELD_REGISTRY = ctx.FIELD_REGISTRY;

function getField(id) {
  return FIELD_REGISTRY.find(f => f.id === id);
}

// ===== FIELD-LEVEL VALIDATION =====

describe('Validation.validateField', () => {
  describe('controlled vocabulary', () => {
    it('accepts valid level values', () => {
      const field = getField('level');
      assert.ok(Validation.validateField(field, 'file', {}).valid);
      assert.ok(Validation.validateField(field, 'series', {}).valid);
      assert.ok(Validation.validateField(field, 'otherlevel', {}).valid);
    });

    it('rejects invalid level values', () => {
      const field = getField('level');
      const result = Validation.validateField(field, 'folder', {});
      assert.equal(result.valid, false);
      assert.equal(result.type, 'error');
    });

    it('accepts valid date_type values', () => {
      const field = getField('date_type');
      assert.ok(Validation.validateField(field, 'single', {}).valid);
      assert.ok(Validation.validateField(field, 'inclusive', {}).valid);
      assert.ok(Validation.validateField(field, 'bulk', {}).valid);
      assert.ok(Validation.validateField(field, 'expression', {}).valid);
    });

    it('rejects invalid date_type values', () => {
      const field = getField('date_type');
      assert.equal(Validation.validateField(field, 'range', {}).valid, false);
    });
  });

  describe('date format pattern', () => {
    const field = getField('begin');

    it('accepts YYYY', () => {
      assert.ok(Validation.validateField(field, '1975', {}).valid);
    });

    it('accepts YYYY-MM', () => {
      assert.ok(Validation.validateField(field, '1975-03', {}).valid);
    });

    it('accepts YYYY-MM-DD', () => {
      assert.ok(Validation.validateField(field, '1975-03-15', {}).valid);
    });

    it('rejects MM-DD-YYYY', () => {
      assert.equal(Validation.validateField(field, '03-15-1975', {}).valid, false);
    });

    it('rejects freeform text', () => {
      assert.equal(Validation.validateField(field, 'March 1975', {}).valid, false);
    });

    it('rejects partial dates like YYYY-M', () => {
      assert.equal(Validation.validateField(field, '1975-3', {}).valid, false);
    });
  });

  describe('max length', () => {
    it('accepts title within 8192 chars', () => {
      const field = getField('title');
      assert.ok(Validation.validateField(field, 'A'.repeat(8192), {}).valid);
    });

    it('rejects title exceeding 8192 chars', () => {
      const field = getField('title');
      const result = Validation.validateField(field, 'A'.repeat(8193), {});
      assert.equal(result.valid, false);
      assert.equal(result.type, 'error');
    });

    it('accepts ref_id within 255 chars', () => {
      const field = getField('ref_id');
      assert.ok(Validation.validateField(field, 'a'.repeat(255), {}).valid);
    });

    it('rejects ref_id exceeding 255 chars', () => {
      const field = getField('ref_id');
      assert.equal(Validation.validateField(field, 'a'.repeat(256), {}).valid, false);
    });
  });

  describe('ref_id pattern', () => {
    const field = getField('ref_id');

    it('accepts alphanumeric with hyphens and underscores', () => {
      assert.ok(Validation.validateField(field, 'ref-id_123', {}).valid);
    });

    it('accepts colons and dots', () => {
      assert.ok(Validation.validateField(field, 'aspace:ref.1', {}).valid);
    });

    it('rejects spaces', () => {
      assert.equal(Validation.validateField(field, 'ref id', {}).valid, false);
    });

    it('rejects special characters', () => {
      assert.equal(Validation.validateField(field, 'ref@id', {}).valid, false);
    });
  });

  describe('date end >= begin', () => {
    const field = getField('end');

    it('accepts end date after begin', () => {
      assert.ok(Validation.validateField(field, '1980', { begin: '1975' }).valid);
    });

    it('accepts same date', () => {
      assert.ok(Validation.validateField(field, '1975', { begin: '1975' }).valid);
    });

    it('rejects end before begin', () => {
      assert.equal(Validation.validateField(field, '1970', { begin: '1975' }).valid, false);
    });

    it('handles mixed precision dates', () => {
      assert.ok(Validation.validateField(field, '1975-06', { begin: '1975-03' }).valid);
      assert.equal(Validation.validateField(field, '1975-01', { begin: '1975-06' }).valid, false);
    });
  });

  describe('digital object no quotes', () => {
    const field = getField('digital_object_title');

    it('accepts title without quotes', () => {
      assert.ok(Validation.validateField(field, 'Photo of building', {}).valid);
    });

    it('rejects double quotes', () => {
      assert.equal(Validation.validateField(field, 'The "photo"', {}).valid, false);
    });

    it('rejects single quotes', () => {
      assert.equal(Validation.validateField(field, "John's photo", {}).valid, false);
    });
  });

  describe('empty values', () => {
    it('skips validation for empty non-required fields', () => {
      const field = getField('expression');
      assert.ok(Validation.validateField(field, '', {}).valid);
      assert.ok(Validation.validateField(field, null, {}).valid);
      assert.ok(Validation.validateField(field, undefined, {}).valid);
    });
  });
});

// ===== CONDITIONAL REQUIRED =====

describe('Validation.checkConditionalRequired', () => {
  describe('other_level when level is otherlevel', () => {
    const field = getField('other_level');

    it('requires other_level when level is otherlevel', () => {
      const result = Validation.checkConditionalRequired(field, '', { level: 'otherlevel' });
      assert.ok(result);
      assert.equal(result.valid, false);
    });

    it('does not require other_level for other levels', () => {
      const result = Validation.checkConditionalRequired(field, '', { level: 'file' });
      assert.equal(result, null);
    });
  });

  describe('date group 1: label and type required', () => {
    it('requires dates_label when begin is filled', () => {
      const field = getField('dates_label');
      const result = Validation.checkConditionalRequired(field, '', { begin: '1975' });
      assert.ok(result);
      assert.equal(result.valid, false);
    });

    it('requires date_type when begin is filled', () => {
      const field = getField('date_type');
      const result = Validation.checkConditionalRequired(field, '', { begin: '1975' });
      assert.ok(result);
      assert.equal(result.valid, false);
    });

    it('does not flag expression as required when only begin is filled', () => {
      const field = getField('expression');
      const result = Validation.checkConditionalRequired(field, '', { begin: '1975' });
      assert.equal(result, null);
    });
  });

  describe('date type-specific requirements', () => {
    it('requires begin for single dates', () => {
      const field = getField('begin');
      const result = Validation.checkConditionalRequired(field, '', { date_type: 'single' });
      assert.ok(result);
      assert.equal(result.valid, false);
    });

    it('requires begin for inclusive dates', () => {
      const field = getField('begin');
      const result = Validation.checkConditionalRequired(field, '', { date_type: 'inclusive' });
      assert.ok(result);
      assert.equal(result.valid, false);
    });

    it('requires end for inclusive dates', () => {
      const field = getField('end');
      const result = Validation.checkConditionalRequired(field, '', { date_type: 'inclusive' });
      assert.ok(result);
      assert.equal(result.valid, false);
    });

    it('requires begin and end for bulk dates', () => {
      const beginField = getField('begin');
      const endField = getField('end');
      assert.equal(Validation.checkConditionalRequired(beginField, '', { date_type: 'bulk' }).valid, false);
      assert.equal(Validation.checkConditionalRequired(endField, '', { date_type: 'bulk' }).valid, false);
    });
  });

  describe('date group 2: same rules apply', () => {
    it('requires dates_label_2 when begin_2 is filled', () => {
      const field = getField('dates_label_2');
      const result = Validation.checkConditionalRequired(field, '', { begin_2: '1975' });
      assert.ok(result);
      assert.equal(result.valid, false);
    });

    it('requires begin_2 for single date_type_2', () => {
      const field = getField('begin_2');
      const result = Validation.checkConditionalRequired(field, '', { date_type_2: 'single' });
      assert.ok(result);
      assert.equal(result.valid, false);
    });

    it('requires end_2 for inclusive date_type_2', () => {
      const field = getField('end_2');
      const result = Validation.checkConditionalRequired(field, '', { date_type_2: 'inclusive' });
      assert.ok(result);
      assert.equal(result.valid, false);
    });
  });

  describe('container group', () => {
    it('requires type_1 when cont_instance_type is set', () => {
      const field = getField('type_1');
      const result = Validation.checkConditionalRequired(field, '', { cont_instance_type: 'mixed_materials' });
      assert.ok(result);
      assert.equal(result.valid, false);
    });

    it('requires indicator_1 when cont_instance_type is set', () => {
      const field = getField('indicator_1');
      const result = Validation.checkConditionalRequired(field, '', { cont_instance_type: 'mixed_materials' });
      assert.ok(result);
      assert.equal(result.valid, false);
    });

    it('requires type_2 when indicator_2 is set', () => {
      const field = getField('type_2');
      const result = Validation.checkConditionalRequired(field, '', { indicator_2: '1' });
      assert.ok(result);
      assert.equal(result.valid, false);
    });
  });

  describe('extent group', () => {
    it('requires extent_type when number is set', () => {
      const field = getField('extent_type');
      const result = Validation.checkConditionalRequired(field, '', { number: '3' });
      assert.ok(result);
      assert.equal(result.valid, false);
    });

    it('requires portion when number is set', () => {
      const field = getField('portion');
      const result = Validation.checkConditionalRequired(field, '', { number: '3' });
      assert.ok(result);
      assert.equal(result.valid, false);
    });
  });
});

// ===== ROW-LEVEL VALIDATION =====

describe('Validation.validateEntry', () => {
  // Stub: get default enabled field IDs
  const enabledFields = FIELD_REGISTRY.filter(f => f.enabled_by_default).map(f => f.id);

  it('passes for a valid minimal entry (title + level)', () => {
    const issues = Validation.validateEntry({ title: 'Test', level: 'file' }, enabledFields);
    assert.equal(issues.length, 0);
  });

  it('passes with date instead of title', () => {
    const issues = Validation.validateEntry({ level: 'file', begin: '1975', dates_label: 'creation', date_type: 'single' }, enabledFields);
    assert.equal(issues.length, 0);
  });

  it('fails without title or date', () => {
    const issues = Validation.validateEntry({ level: 'file' }, enabledFields);
    assert.ok(issues.some(i => i.field === 'title' && i.type === 'error'));
  });

  it('fails without level', () => {
    const issues = Validation.validateEntry({ title: 'Test' }, enabledFields);
    assert.ok(issues.some(i => i.field === 'level' && i.type === 'error'));
  });

  it('flags invalid controlled vocabulary value', () => {
    const issues = Validation.validateEntry({ title: 'Test', level: 'bogus' }, enabledFields);
    assert.ok(issues.some(i => i.field === 'level' && i.type === 'error'));
  });

  it('flags invalid date format', () => {
    const issues = Validation.validateEntry({
      title: 'Test', level: 'file',
      begin: 'March 1975', dates_label: 'creation', date_type: 'single'
    }, enabledFields);
    assert.ok(issues.some(i => i.field === 'begin' && i.type === 'error'));
  });
});

// ===== HELPER: isDateAfterOrEqual =====

describe('Validation.isDateAfterOrEqual', () => {
  it('returns true for same date', () => {
    assert.ok(Validation.isDateAfterOrEqual('1975', '1975'));
  });

  it('returns true when end is after begin', () => {
    assert.ok(Validation.isDateAfterOrEqual('1975', '1980'));
  });

  it('returns false when end is before begin', () => {
    assert.equal(Validation.isDateAfterOrEqual('1980', '1975'), false);
  });

  it('handles YYYY-MM comparison', () => {
    assert.ok(Validation.isDateAfterOrEqual('1975-01', '1975-12'));
    assert.equal(Validation.isDateAfterOrEqual('1975-12', '1975-01'), false);
  });

  it('handles YYYY-MM-DD comparison', () => {
    assert.ok(Validation.isDateAfterOrEqual('1975-03-01', '1975-03-31'));
  });

  it('handles mixed precision', () => {
    assert.ok(Validation.isDateAfterOrEqual('1975', '1975-06'));
    assert.ok(Validation.isDateAfterOrEqual('1975-06', '1976'));
  });
});
