// tests/field-registry.test.js
// Verifies field registry integrity and ASpace alignment.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadSourceFiles } = require('./setup');

const ctx = loadSourceFiles('field-registry.js');
const FIELD_REGISTRY = ctx.FIELD_REGISTRY;
const FIELD_CATEGORIES = ctx.FIELD_CATEGORIES;
const HIDDEN_FORM_FIELDS = ctx.HIDDEN_FORM_FIELDS;

describe('Field Registry', () => {
  it('has fields defined', () => {
    assert.ok(Array.isArray(FIELD_REGISTRY));
    assert.ok(FIELD_REGISTRY.length > 100, `Expected 100+ fields, got ${FIELD_REGISTRY.length}`);
  });

  it('every field has required properties', () => {
    for (const field of FIELD_REGISTRY) {
      assert.ok(field.id, `Field missing id: ${JSON.stringify(field).slice(0, 80)}`);
      assert.ok(field.aspace_code, `${field.id} missing aspace_code`);
      assert.ok(field.label, `${field.id} missing label`);
      assert.ok(field.category, `${field.id} missing category`);
      assert.ok(field.type, `${field.id} missing type`);
      assert.ok(typeof field.required === 'boolean', `${field.id} required should be boolean`);
      assert.ok(typeof field.enabled_by_default === 'boolean', `${field.id} enabled_by_default should be boolean`);
      assert.ok(typeof field.supports_default === 'boolean', `${field.id} supports_default should be boolean`);
    }
  });

  it('has no duplicate field IDs', () => {
    const ids = FIELD_REGISTRY.map(f => f.id);
    const seen = new Set();
    for (const id of ids) {
      assert.ok(!seen.has(id), `Duplicate field ID: ${id}`);
      seen.add(id);
    }
  });

  it('all categories reference valid category keys', () => {
    for (const field of FIELD_REGISTRY) {
      assert.ok(FIELD_CATEGORIES[field.category],
        `${field.id} has unknown category "${field.category}"`);
    }
  });

  it('hierarchy and level are required fields', () => {
    const hierarchy = FIELD_REGISTRY.find(f => f.id === 'hierarchy');
    const level = FIELD_REGISTRY.find(f => f.id === 'level');
    assert.ok(hierarchy, 'hierarchy field exists');
    assert.ok(level, 'level field exists');
    assert.ok(hierarchy.required, 'hierarchy is required');
    assert.ok(level.required, 'level is required');
  });
});

describe('ASpace Controlled Vocabularies', () => {
  // Values verified against archivesspace/archivesspace common/schemas and common/locales/enums/en.yml
  const ASPACE_LEVEL_VALUES = ['class', 'collection', 'file', 'fonds', 'item', 'otherlevel', 'recordgrp', 'series', 'subfonds', 'subgrp', 'subseries'];
  const ASPACE_DATE_TYPE_VALUES = ['bulk', 'expression', 'inclusive', 'single'];
  const ASPACE_DATE_CERTAINTY_VALUES = ['approximate', 'inferred', 'questionable'];
  const ASPACE_EXTENT_PORTION_VALUES = ['part', 'whole'];
  const ASPACE_CONTAINER_TYPE_VALUES = ['box', 'carton', 'case', 'container', 'folder', 'frame', 'object', 'page', 'reel', 'volume'];

  // Helper: compare arrays from VM context (deepStrictEqual fails across contexts)
  function assertSameValues(actual, expected, msg) {
    const a = [...actual].sort().join(',');
    const e = [...expected].sort().join(',');
    assert.equal(a, e, msg || `Expected [${e}] but got [${a}]`);
  }

  it('level vocabulary matches ASpace archival_record_level', () => {
    const level = FIELD_REGISTRY.find(f => f.id === 'level');
    assertSameValues(level.validation.controlled_vocabulary, ASPACE_LEVEL_VALUES);
  });

  it('date_type vocabulary matches ASpace', () => {
    const dateType = FIELD_REGISTRY.find(f => f.id === 'date_type');
    assertSameValues(dateType.validation.controlled_vocabulary, ASPACE_DATE_TYPE_VALUES);
  });

  it('date_certainty vocabulary matches ASpace', () => {
    const dc = FIELD_REGISTRY.find(f => f.id === 'date_certainty');
    assertSameValues(dc.validation.controlled_vocabulary, ASPACE_DATE_CERTAINTY_VALUES);
  });

  it('extent_portion vocabulary matches ASpace', () => {
    const portion = FIELD_REGISTRY.find(f => f.id === 'portion');
    assertSameValues(portion.validation.controlled_vocabulary, ASPACE_EXTENT_PORTION_VALUES);
  });

  it('container type vocabularies match ASpace', () => {
    const containerFields = FIELD_REGISTRY.filter(f =>
      f.id.match(/^type_[123]/) && f.validation?.controlled_vocabulary
    );
    assert.ok(containerFields.length >= 3, 'Should have at least 3 container type fields');
    for (const field of containerFields) {
      assertSameValues(field.validation.controlled_vocabulary, ASPACE_CONTAINER_TYPE_VALUES,
        `${field.id} container vocabulary mismatch`);
    }
  });

  it('date_label includes "usage" from ASpace enumerations', () => {
    const dl = FIELD_REGISTRY.find(f => f.id === 'dates_label');
    assert.ok(dl.validation.controlled_vocabulary.includes('usage'),
      'dates_label should include "usage"');
  });

  it('date_label includes "acquisition" from ASpace enumerations', () => {
    const dl = FIELD_REGISTRY.find(f => f.id === 'dates_label');
    assert.ok(dl.validation.controlled_vocabulary.includes('acquisition'),
      'dates_label should include "acquisition"');
  });

  it('date_type includes "expression" from ASpace enumerations', () => {
    const dt = FIELD_REGISTRY.find(f => f.id === 'date_type');
    assert.ok(dt.validation.controlled_vocabulary.includes('expression'),
      'date_type should include "expression"');
  });

  it('subject_source does not include non-ASpace values', () => {
    const ss = FIELD_REGISTRY.find(f => f.id === 'subject_1_source');
    const invalid = ['gsafd', 'lcnaf', 'tgm'];
    for (const v of invalid) {
      assert.ok(!ss.validation.controlled_vocabulary.includes(v),
        `subject_source should not include "${v}"`);
    }
  });

  it('subject_source includes key ASpace values', () => {
    const ss = FIELD_REGISTRY.find(f => f.id === 'subject_1_source');
    const required = ['aat', 'lcsh', 'local', 'tgn', 'lcgft', 'mesh'];
    for (const v of required) {
      assert.ok(ss.validation.controlled_vocabulary.includes(v),
        `subject_source should include "${v}"`);
    }
  });
});

describe('Field Validation Rules', () => {
  it('ref_id has pattern and max_length', () => {
    const refId = FIELD_REGISTRY.find(f => f.id === 'ref_id');
    assert.ok(refId.validation.pattern, 'ref_id should have pattern');
    assert.equal(refId.validation.max_length, 255);
  });

  it('title has max_length of 8192', () => {
    const title = FIELD_REGISTRY.find(f => f.id === 'title');
    assert.equal(title.validation.max_length, 8192);
  });

  it('processing_note has max_length of 65000', () => {
    const pn = FIELD_REGISTRY.find(f => f.id === 'processing_note');
    assert.equal(pn.validation.max_length, 65000);
  });

  it('date begin/end fields have ISO 8601 pattern', () => {
    const dateFields = FIELD_REGISTRY.filter(f => ['begin', 'end', 'begin_2', 'end_2'].includes(f.id));
    assert.equal(dateFields.length, 4);
    for (const field of dateFields) {
      assert.ok(field.validation.pattern, `${field.id} should have date pattern`);
      // Should match YYYY, YYYY-MM, YYYY-MM-DD
      const regex = new RegExp(field.validation.pattern);
      assert.ok(regex.test('2024'), `${field.id} pattern should match YYYY`);
      assert.ok(regex.test('2024-03'), `${field.id} pattern should match YYYY-MM`);
      assert.ok(regex.test('2024-03-15'), `${field.id} pattern should match YYYY-MM-DD`);
      assert.ok(!regex.test('03-15-2024'), `${field.id} pattern should reject MM-DD-YYYY`);
      assert.ok(!regex.test('March 2024'), `${field.id} pattern should reject text dates`);
    }
  });
});
