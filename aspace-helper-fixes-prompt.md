# ASpace Helper: Bug Fixes & Improvements Prompt

## Context

ASpace Helper is a browser-based tool (vanilla JS, Firebase, GitHub Pages) that helps archivists prepare bulk import spreadsheets for ArchivesSpace. The codebase has been reviewed and the following issues need to be addressed. Read CLAUDE.md for project conventions before starting.

## Important Conventions

- No frameworks, no bundler. Vanilla JS with `const` objects as modules.
- No em dashes anywhere in output (use hyphens or commas instead).
- Only implement what is explicitly requested below. If you identify additional issues or optimizations, propose them and explain your reasoning, but wait for approval before making changes.
- Explain technical decisions in comments. The developer reads code but doesn't architect systems.

---

## 1. Smoke Test: Fix Method and Element References

**File:** `js/smoke-test.js`

The `checkModules()` method references methods that were renamed during implementation. Fix these:

- `Form.renderForm` does not exist. The actual method is `Form.renderEntry`. Update the check.
- `Export.exportCSV` does not exist. The actual method is `Export.downloadCSV`. Update the check.

The `checkDOM()` method checks for `btn-leave-institution`, which does not exist in the HTML. The leave-institution functionality is triggered from `btn-leave-from-profile` inside the My Profile modal, which opens a separate leave confirmation modal. Update the check to reference `btn-leave-from-profile` instead.

**Verification:** Run `ASpaceTest.runAll()` in the browser console after changes. All module and DOM checks should pass (assuming the user is signed in and has data). No false failures.

---

## 2. ARIA Tree Attributes: Fix or Remove

**File:** `js/tree.js`, `index.html`

The hierarchy tree container has `role="tree"` (in index.html) and tree items are created with `role="treeitem"` (in tree.js). However, the implementation is missing the required ARIA attributes for the tree pattern: `aria-expanded`, `aria-level`, `aria-setsize`, `aria-posinset`, and keyboard event handlers for arrow key navigation.

Incomplete ARIA roles are worse than no roles, because screen readers announce tree semantics but the expected behavior doesn't work.

**Option A (recommended for now):** Remove the ARIA tree roles and use a simpler, honest structure. Change the container in `index.html` from `role="tree"` to `role="list"`. In `tree.js`, change `role="treeitem"` to `role="listitem"`. Add `aria-level` set to `depth + 1` on each item (this attribute works on listitems too and communicates the nesting depth to screen readers). This is semantically accurate and doesn't promise behavior we don't deliver.

**Option B (fuller implementation, more work):** Keep the tree roles and add the full ARIA tree pattern. This includes `aria-expanded` on items with children, `aria-level`, `aria-setsize`, `aria-posinset`, `tabindex` management, and keyboard handlers for ArrowUp, ArrowDown, ArrowLeft (collapse/parent), ArrowRight (expand/child), Home, End. Only do this if explicitly asked.

Go with Option A.

**Verification:** Inspect tree items in the DOM. Each should have `role="listitem"` and `aria-level` matching its depth (1-based). The container should have `role="list"`.

---

## 3. Auto-Save Race Condition on Navigation

**File:** `js/app.js`

When the user clicks "Back to projects" (`btn-back-projects`) or "Switch Project" (`btn-back-to-projects`), the handler calls `App.autoSave()` but does not await it before navigating:

```javascript
document.getElementById('btn-back-projects').addEventListener('click', () => {
  if (App.isDirty) {
    App.autoSave(); // <-- not awaited
  }
  App._unwatchProject();
  App.currentProject = null;
  App.loadAndShowProjects();
});
```

If the Firestore write takes longer than a beat (flaky library Wi-Fi is a real scenario), the save could fail silently after navigation.

**Fix:** Make both handlers `async` and `await App.autoSave()` before proceeding. If the save fails, show a toast warning the user that their changes may not have been saved, but still allow navigation (don't trap them in a broken editor).

Apply the same fix to `btn-back-to-projects`.

**Verification:** Add a `console.log` in `autoSave` after the Firestore write completes. Confirm it fires before `loadAndShowProjects` runs by checking console output order.

---

## 4. Add "ready_for_review" Project Status

**Files:** `js/db.js`, `js/app.js`, `index.html`, `css/styles.css`

The current project status options are `in_progress | ready_for_export | exported`. Add `ready_for_review` between `in_progress` and `ready_for_export` to match the supervisor review workflow used by the target institution.

Changes needed:

**a) In `app.js`, `_renderFilteredProjects()`:** The status badge currently displays the raw status string. Add a display name mapping:

```javascript
const STATUS_LABELS = {
  'in_progress': 'In Progress',
  'ready_for_review': 'Ready for Review',
  'ready_for_export': 'Ready for Export',
  'exported': 'Exported'
};
```

Use this mapping when rendering the status badge text.

**b) In the editor view:** Add a way to change the project status. Add a `<select>` element near the project name in the editor top bar (or in a small dropdown) that lets the user change the status. When changed, update `App.currentProject.status` and call `App.markDirty()`.

The select should have all four status options. No role restrictions on who can change status (both admins and members can mark something as ready for review or ready for export).

**c) In `css/styles.css`:** Add color coding for the status badge:

- `in_progress`: default (gray background, muted text, already exists)
- `ready_for_review`: light amber/yellow background
- `ready_for_export`: light green background
- `exported`: light blue background

Use CSS classes like `.status-ready_for_review`, etc., applied to the `.project-card-status` span.

**d) In the project filters:** Add a filter button for "Ready for Review" alongside "All" and "My Projects", so supervisors can quickly find projects awaiting their review. This is a third filter dimension (status filter), separate from the ownership filter. Consider adding a small dropdown or button group for status filtering.

**Verification:** Create a project, change its status through each option, return to the project list. Confirm the status badge shows the correct label and color. Confirm the status persists after page reload.

---

## 5. Auto-Increment Folder Numbers

**Files:** `js/tree.js`, `js/form.js`

When a user adds sibling entries (the most common operation during file-level data entry), the child container indicator (folder number) should auto-increment if the previous sibling has a numeric folder number.

**Implementation:**

In `Tree.addEntry()`, after resolving defaults, check if the new entry is being added as a sibling (not as a child). If so, find the previous sibling in order. If that sibling has a numeric value in `fields.indicator_2` (folder number), set the new entry's `indicator_2` to that number + 1.

```javascript
// Auto-increment folder number from previous sibling
if (!asChild && parentId !== undefined) {
  const siblings = entries
    .filter(e => e.parent_id === (parentId || null))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  if (siblings.length > 0) {
    const lastSibling = siblings[siblings.length - 1];
    const lastFolder = lastSibling.fields && lastSibling.fields.indicator_2;
    if (lastFolder && /^\d+$/.test(lastFolder.trim())) {
      newEntry.fields.indicator_2 = String(parseInt(lastFolder, 10) + 1);
    }
  }
}
```

This should happen AFTER defaults are applied but BEFORE the entry is pushed to the array, so the auto-incremented value overrides any default.

Only auto-increment when the previous sibling's folder number is a plain integer (not "1-3" or "A" or "OS-1"). If it's not numeric, don't attempt to increment; just use whatever the default provides.

**Also:** When adding via the "+S" (add sibling) button on a tree item, the new entry should be inserted directly after the clicked entry's position among its siblings, not at the end. Currently `addEntry` with `asChild=false` always appends. The `afterIndex` parameter exists in the signature but is never used. Thread it through so the new sibling's `order` places it right after the triggering entry.

**Verification:** Create a series, then add a file under it with Folder 1. Click "+S" (add sibling). The new entry should have Folder 2 auto-filled. Click "+S" again. Folder 3. Change one to "A" and add a sibling after it. The new sibling should NOT attempt to increment "A"; it should just use the default (or be empty).

---

## 6. Smarter Date Expression Auto-Population

**File:** `js/form.js`

The current auto-formatter in `form.js` only handles bare 4-digit years in the Date Expression field. Expand it to handle two additional common patterns:

**a) Year ranges:** If the expression matches `YYYY-YYYY` (e.g., "1957-1965"), auto-populate:
- `begin` = first year
- `end` = second year  
- `date_type` = "inclusive" (if not already set)

**b) "circa" dates:** If the expression matches `circa YYYY` or `ca. YYYY` (case-insensitive), auto-populate:
- `begin` = the year
- `date_certainty` = "approximate" (if not already set)

**c) "undated":** If the expression is "undated" (case-insensitive), do not auto-populate begin/end. Just leave them empty. But do set `date_type` to "expression" if it's not already set, since "expression" is the ASpace date type for dates that are just a text label with no normalized values.

Keep the existing single-year behavior. Only auto-populate fields that are currently empty (never overwrite user-entered values). Update the corresponding input elements in the DOM and run inline validation on the auto-filled fields.

**Verification:** Type "1957-1965" in Date Expression and tab out. Begin should fill with "1957", End with "1965", Date Type with "inclusive". Type "circa 1945" and tab out. Begin should fill with "1945", Date Certainty with "approximate". Type "undated" and tab out. Begin and End should stay empty, Date Type should be "expression". In all cases, if the target field already has a value, it should not be overwritten.

---

## 7. Container Summary Parentheses Validation Warning

**File:** `js/validation.js`

Add a validation warning (not error) for the `container_summary` field: if the field has a value and it does not start with "(" and end with ")", show a warning: "Container summary is typically wrapped in parentheses, e.g., '(7 document boxes)'. Check your institution's guidelines."

This is a warning, not an error, because it's an institutional convention (common but not universal), not an ASpace requirement.

**Implementation:** Add a check in `Validation.validateField()` for the `container_summary` field ID (and `container_summary_2`). After the standard checks pass, if the value is non-empty and doesn't match `/^\(.*\)$/`, return a warning.

**Verification:** Enter "7 document boxes" in Container Summary. A yellow warning should appear. Enter "(7 document boxes)". No warning. Enter empty string. No warning.

---

## 8. Add Comment to Export Identifier Logic

**File:** `js/export.js`

In `Export.generateCSV()` and `Export.determineColumns()`, add a comment block explaining the tight coupling between three values:

1. The radio button value in the New Project modal (`value="res_uri"` or `value="ead"`)
2. The `identifier_type` field stored on the project document in Firestore
3. The field IDs in the field registry (`'res_uri'` and `'ead'`)

These three must always use the same string values. If any one changes independently, the export will silently break (the identifier column won't appear, or will appear empty). Document this coupling so future changes don't create a subtle bug.

No code changes needed beyond the comments.

---

## 9. Custom Vocabulary Restriction (Admin Settings)

**Files:** `js/config.js`, `js/form.js`, `js/field-registry.js`, `index.html`

Add the ability for admins to restrict which values appear in controlled vocabulary dropdowns. This is critical because the target institution uses only a subset of ASpace's full vocabularies.

**Data model:** On the institution's Firestore document, under `config`, add a `vocabulary_restrictions` object:

```json
{
  "config": {
    "enabled_fields": [...],
    "vocabulary_restrictions": {
      "level": ["collection", "series", "subseries", "file", "item"],
      "cont_instance_type": ["audio", "computer_disks", "graphic_materials", "microform", "mixed_materials", "moving_images", "realia", "text"]
    }
  }
}
```

If a field has a restriction defined, the form dropdown should only show those values (plus an empty "-- Select --" option). If no restriction is defined, the full vocabulary from the field registry is used.

**Admin UI:** In the Settings modal, Fields tab, for each field that has a `controlled_vocabulary` in its validation, add a "Customize values" link or button next to the toggle. Clicking it opens an inline panel (or a small sub-modal) showing all vocabulary values as checkboxes. Unchecked values are hidden from the data entry dropdown. This panel should only be available for fields that have a `controlled_vocabulary`.

Keep the full vocabulary in the field registry (it's the source of truth for what ASpace accepts). The restriction is a UI filter only. Validation should still accept any value in the full ASpace vocabulary, since data entered before a restriction was added should remain valid. The restriction only affects what appears in the dropdown going forward.

**In `form.js`:** When rendering a select field, check `Config.institutionConfig.vocabulary_restrictions[fieldDef.id]`. If it exists, filter the options to only include values in that array. If it doesn't exist, use the full `controlled_vocabulary`.

**Saving:** When the admin saves settings, collect the checked vocabulary values for each restricted field and save them under `config.vocabulary_restrictions` on the institution document.

**Verification:** As admin, open Settings > Fields tab. Find "Level of Description". Click "Customize values". Uncheck "class", "fonds", "subfonds", "subgrp", "recordgrp", "otherlevel". Save. Open a project, add an entry. The Level of Description dropdown should only show: collection, series, subseries, file, item. Validation should still accept "fonds" if it appears in existing data (no error), but the dropdown shouldn't offer it for new entries.

---

## 10. CRITICAL: Fix CSV Export Format to Match ASpace's Expected Structure

**File:** `js/export.js`

This is the most important fix in this prompt. The tool's CSV export currently produces a file that ASpace's importer may not be able to read correctly.

**The problem:** ASpace's bulk importer identifies the field code row by scanning for a row whose first cell contains "ArchivesSpace field code". The tool's current export puts raw field codes starting in column A with no marker. Without that marker, the importer may not recognize the header row, which would cause the entire import to fail.

The official template format (from the ASpace GitHub repo and documentation) is:

```
Row 1: "ArchivesSpace field code (please don't edit this row)" | collection_id | ead | res_uri | ...
Row 2: "Field name" | "Resource Identifier" | "EAD ID" | "Resource URI" | ...
Row 3+: data rows
```

Key rules from ASpace's documentation:
- The first cell of the header row MUST contain "ArchivesSpace field code (please don't edit this row)" so the importer can identify it
- The row immediately after the field code row contains human-readable column names. The importer ignores this row, but the template includes it
- Rows before the field code row are also ignored (institutions sometimes put collection info there)
- Columns can be rearranged, hidden, or deleted (the importer maps by field code, not by position)
- Data rows follow after both header rows

**Fix `Export.generateCSV()`:**

```javascript
// Row 1: ASpace field code row (with marker in first cell)
const headerRow = [
  'ArchivesSpace field code (please don\'t edit this row)',
  ...columnsToExport.map(f => f.aspace_code)
];

// Row 2: Human-readable labels (ignored by importer, helpful for humans reviewing the CSV)
const labelRow = [
  'Field name',
  ...columnsToExport.map(f => f.label)
];

// Data rows: empty first cell (the marker column has no data)
const dataRows = flatTree.map((entry, index) => {
  const cells = columnsToExport.map(field => {
    // ... existing field value logic ...
  });
  return ['', ...cells]; // empty first cell for the marker column
});

const rows = [headerRow, labelRow, ...dataRows];
```

**Also update `Export.determineColumns()`** to account for the marker column offset. The marker column is not a data column; it's structural. The field columns start from position 2.

**Controlled vocabulary values:** ASpace accepts both the controlled vocabulary "Value" (e.g., `cubic_feet`) and the "Translation" (e.g., `Cubic Feet`), but NOT freeform variants (e.g., `cubic feet` would fail). The tool currently exports Values (lowercase with underscores), which is correct. But add a comment in the export code documenting this: the export must use the Value form, not the Translation, for reliability.

**Additional export requirement - controlled vocabulary matching:** ASpace's importer compares input first against the Translation, then against the Value. The input must be an EXACT match (case-sensitive). The tool's validation currently enforces this via dropdowns, which is correct for the Value form. But if a user ever types a value manually (pasting from an existing spreadsheet, for instance), the validation should accept both forms. In `Validation.validateField()`, when checking controlled vocabulary, also check the value with underscores replaced by spaces and title-cased (the Translation form). This is a robustness improvement, not a strict requirement, since the dropdowns prevent invalid values in normal use.

**Date cell format warning for future Excel export:** When Excel export is implemented (Phase 2), date cells (begin, end, begin_2, end_2) MUST be formatted as Text cells, not Date format. Excel will "helpfully" convert `1969-07-20` to `1969-07-20T00:00:00+00:00` if the cell format is Date. Add a TODO comment in `export.js` noting this requirement for the future Excel implementation.

**Verification:** Export a project as CSV. Open the CSV in a text editor (not Excel). Confirm:
1. Row 1 starts with `"ArchivesSpace field code (please don't edit this row)"`
2. Row 2 starts with `"Field name"` and contains human-readable labels
3. Data rows start from Row 3
4. The first cell of each data row is empty
5. Field codes in Row 1 match the field registry's `aspace_code` values exactly

Then (if possible) test an actual import into ASpace with the exported CSV. If no ASpace instance is available, visually compare the CSV structure against the template at `docs/templates/bulk_import_template.csv` to confirm the format matches.

---

## 11. Export: Include EAD ID or Resource URI on Every Row

**File:** `js/export.js`

The official ASpace documentation states that the EAD ID is **required** and is "used to confirm that you are trying to add your spreadsheet information to the correct resource." Currently the tool only puts the resource identifier on the first data row.

While the importer may technically inherit the EAD from the first row, some institutions and some ASpace versions expect it on every row. More importantly, if a staff member opens the exported CSV and sorts or reorders rows (a common mistake), having the identifier only on row 1 means it gets separated from its data and the import fails silently or applies rows to the wrong resource.

**Fix:** In `Export.generateCSV()`, populate the `ead` or `res_uri` column on EVERY data row, not just the first. This is defensive and costs nothing in file size. The current code already has the conditional logic; just remove the `index === 0` check:

```javascript
// Current (fragile):
if (field.id === 'res_uri' && project.identifier_type === 'res_uri') {
  value = index === 0 ? project.resource_identifier : '';
}

// Fixed (defensive):
if (field.id === 'res_uri' && project.identifier_type === 'res_uri') {
  value = project.resource_identifier || '';
}
```

Same for `ead`.

**Verification:** Export a project. Open the CSV. Confirm the EAD/res_uri column has the identifier value on every data row, not just the first.

---

## Order of Operations

Work through these in order. Each is independently testable:

1. **CSV export format fix** (item 10, CRITICAL - without this the exported file may not import into ASpace at all)
2. **EAD/res_uri on every row** (item 11, important for import reliability)
3. Smoke test fixes (item 1, quick win, builds confidence in diagnostics)
4. ARIA fixes (item 2, quick win, correctness)
5. Auto-save race condition (item 3, bug fix)
6. Export identifier comments (item 8, documentation only)
7. Project status (item 4, small feature)
8. Container summary validation (item 7, small validation rule)
9. Auto-increment folder numbers (item 5, productivity feature)
10. Date expression parsing (item 6, productivity feature)
11. Vocabulary restrictions (item 9, larger feature, save for last)

After completing all items, run:
```bash
npm run check
```
Lint and tests should pass with zero errors. Then run `ASpaceTest.runAll()` in the browser and confirm no FAILs.
