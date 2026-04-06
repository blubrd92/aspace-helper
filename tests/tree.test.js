// tests/tree.test.js
// Tests for Tree.flattenTree() — pure hierarchy logic, no DOM needed.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadSourceFiles } = require('./setup');

const ctx = loadSourceFiles('tree.js');
const Tree = ctx.Tree;

// ===== flattenTree =====

describe('Tree.flattenTree', () => {
  it('returns empty array for empty input', () => {
    const result = Tree.flattenTree([]);
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0);
  });

  it('returns empty array for null/undefined input', () => {
    const r1 = Tree.flattenTree(null);
    assert.ok(Array.isArray(r1));
    assert.equal(r1.length, 0);
    const r2 = Tree.flattenTree(undefined);
    assert.ok(Array.isArray(r2));
    assert.equal(r2.length, 0);
  });

  it('handles a single root entry', () => {
    const entries = [{ id: 'a', parent_id: null, order: 0, fields: {} }];
    const result = Tree.flattenTree(entries);

    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'a');
    assert.equal(result[0]._depth, 0);
    assert.equal(result[0]._hierarchy, 1);
  });

  it('handles a parent-child relationship', () => {
    const entries = [
      { id: 'a', parent_id: null, order: 0, fields: {} },
      { id: 'b', parent_id: 'a', order: 0, fields: {} }
    ];
    const result = Tree.flattenTree(entries);

    assert.equal(result.length, 2);
    assert.equal(result[0].id, 'a');
    assert.equal(result[0]._depth, 0);
    assert.equal(result[0]._hierarchy, 1);
    assert.equal(result[1].id, 'b');
    assert.equal(result[1]._depth, 1);
    assert.equal(result[1]._hierarchy, 2);
  });

  it('orders siblings by their order value', () => {
    const entries = [
      { id: 'a', parent_id: null, order: 0, fields: {} },
      { id: 'c', parent_id: 'a', order: 2, fields: {} },
      { id: 'b', parent_id: 'a', order: 1, fields: {} }
    ];
    const result = Tree.flattenTree(entries);

    assert.equal(result.length, 3);
    assert.equal(result[0].id, 'a');
    assert.equal(result[1].id, 'b');
    assert.equal(result[2].id, 'c');
  });

  it('handles deep nesting (3 levels)', () => {
    const entries = [
      { id: 'series', parent_id: null, order: 0, fields: {} },
      { id: 'subseries', parent_id: 'series', order: 0, fields: {} },
      { id: 'file', parent_id: 'subseries', order: 0, fields: {} }
    ];
    const result = Tree.flattenTree(entries);

    assert.equal(result.length, 3);
    assert.equal(result[0]._depth, 0);
    assert.equal(result[0]._hierarchy, 1);
    assert.equal(result[1]._depth, 1);
    assert.equal(result[1]._hierarchy, 2);
    assert.equal(result[2]._depth, 2);
    assert.equal(result[2]._hierarchy, 3);
  });

  it('handles multiple roots sorted by order', () => {
    const entries = [
      { id: 'b', parent_id: null, order: 1, fields: {} },
      { id: 'a', parent_id: null, order: 0, fields: {} }
    ];
    const result = Tree.flattenTree(entries);

    assert.equal(result.length, 2);
    assert.equal(result[0].id, 'a');
    assert.equal(result[1].id, 'b');
    assert.equal(result[0]._depth, 0);
    assert.equal(result[1]._depth, 0);
  });

  it('treats orphaned entries (parent_id references non-existent id) as roots', () => {
    const entries = [
      { id: 'a', parent_id: null, order: 0, fields: {} },
      { id: 'b', parent_id: 'nonexistent', order: 1, fields: {} }
    ];
    const result = Tree.flattenTree(entries);

    assert.equal(result.length, 2);
    // Both should be at root level
    assert.equal(result[0]._depth, 0);
    assert.equal(result[1]._depth, 0);
  });

  it('handles order values with gaps', () => {
    const entries = [
      { id: 'c', parent_id: null, order: 10, fields: {} },
      { id: 'a', parent_id: null, order: 0, fields: {} },
      { id: 'b', parent_id: null, order: 5, fields: {} }
    ];
    const result = Tree.flattenTree(entries);

    assert.equal(result.length, 3);
    assert.equal(result[0].id, 'a');
    assert.equal(result[1].id, 'b');
    assert.equal(result[2].id, 'c');
  });

  it('produces depth-first order for complex trees', () => {
    // Tree:
    //  root1
    //    child1a
    //    child1b
    //  root2
    //    child2a
    const entries = [
      { id: 'root1', parent_id: null, order: 0, fields: {} },
      { id: 'root2', parent_id: null, order: 1, fields: {} },
      { id: 'child1a', parent_id: 'root1', order: 0, fields: {} },
      { id: 'child1b', parent_id: 'root1', order: 1, fields: {} },
      { id: 'child2a', parent_id: 'root2', order: 0, fields: {} }
    ];
    const result = Tree.flattenTree(entries);

    assert.equal(result.length, 5);
    const ids = result.map(e => e.id);
    assert.equal(ids[0], 'root1');
    assert.equal(ids[1], 'child1a');
    assert.equal(ids[2], 'child1b');
    assert.equal(ids[3], 'root2');
    assert.equal(ids[4], 'child2a');
  });

  it('assigns correct hierarchy values in a complex tree', () => {
    const entries = [
      { id: 'root', parent_id: null, order: 0, fields: {} },
      { id: 'child', parent_id: 'root', order: 0, fields: {} },
      { id: 'grandchild', parent_id: 'child', order: 0, fields: {} }
    ];
    const result = Tree.flattenTree(entries);

    assert.equal(result[0].id, 'root');
    assert.equal(result[0]._hierarchy, 1);
    assert.equal(result[1].id, 'child');
    assert.equal(result[1]._hierarchy, 2);
    assert.equal(result[2].id, 'grandchild');
    assert.equal(result[2]._hierarchy, 3);
  });

  it('handles entries with missing order values (defaults to 0)', () => {
    const entries = [
      { id: 'a', parent_id: null, fields: {} },
      { id: 'b', parent_id: null, order: 1, fields: {} }
    ];
    const result = Tree.flattenTree(entries);

    assert.equal(result.length, 2);
    assert.equal(result[0].id, 'a');
    assert.equal(result[1].id, 'b');
  });
});

// ===== _escapeHTML =====

describe('Tree._escapeHTML', () => {
  it('escapes HTML special characters', () => {
    assert.equal(Tree._escapeHTML('<script>'), '&lt;script&gt;');
    assert.equal(Tree._escapeHTML('"hello"'), '&quot;hello&quot;');
    assert.equal(Tree._escapeHTML("it's"), "it&#039;s");
    assert.equal(Tree._escapeHTML('a & b'), 'a &amp; b');
  });

  it('returns empty string for falsy input', () => {
    assert.equal(Tree._escapeHTML(null), '');
    assert.equal(Tree._escapeHTML(undefined), '');
    assert.equal(Tree._escapeHTML(''), '');
  });
});

// ===== getLevelClass =====

describe('Tree.getLevelClass', () => {
  it('returns correct class for known levels', () => {
    assert.equal(Tree.getLevelClass('series'), 'level-series');
    assert.equal(Tree.getLevelClass('subseries'), 'level-subseries');
    assert.equal(Tree.getLevelClass('file'), 'level-file');
    assert.equal(Tree.getLevelClass('item'), 'level-item');
  });

  it('returns level-other for unknown levels', () => {
    assert.equal(Tree.getLevelClass('collection'), 'level-other');
    assert.equal(Tree.getLevelClass(''), 'level-other');
    assert.equal(Tree.getLevelClass(undefined), 'level-other');
  });
});
