// validation.js
// All validation logic: field-level, row-level, and spreadsheet-level.
// Returns plain-language messages, not technical jargon.

const Validation = {

  // ===== FIELD-LEVEL VALIDATION =====
  // Returns { valid: true } or { valid: false, type: 'error'|'warning', message: '...' }

  validateField(fieldDef, value, entryFields) {
    // Skip validation for empty non-required fields
    if (!value && value !== 0) {
      // Check conditional requirements
      const conditionalResult = Validation.checkConditionalRequired(fieldDef, value, entryFields);
      if (conditionalResult) return conditionalResult;
      return { valid: true };
    }

    const val = String(value).trim();

    // Controlled vocabulary check
    if (fieldDef.validation && fieldDef.validation.controlled_vocabulary) {
      if (!fieldDef.validation.controlled_vocabulary.includes(val)) {
        return {
          valid: false,
          type: 'error',
          message: `"${val}" is not a valid option. Choose from: ${fieldDef.validation.controlled_vocabulary.join(', ')}`
        };
      }
    }

    // Pattern check (dates, URIs, etc.)
    if (fieldDef.validation && fieldDef.validation.pattern && val) {
      const regex = new RegExp(fieldDef.validation.pattern);
      if (!regex.test(val)) {
        if (fieldDef.validation.date_format) {
          return {
            valid: false,
            type: 'error',
            message: `Date must be in format: YYYY, YYYY-MM, or YYYY-MM-DD (e.g., "1975" or "1975-03" or "1975-03-15").`
          };
        }
        return {
          valid: false,
          type: 'error',
          message: `"${val}" doesn't match the expected format for ${fieldDef.label}.`
        };
      }
    }

    // Number min/max
    if (fieldDef.validation && fieldDef.validation.min !== undefined && fieldDef.validation.min !== null) {
      if (Number(val) < fieldDef.validation.min) {
        return {
          valid: false,
          type: 'error',
          message: `${fieldDef.label} must be at least ${fieldDef.validation.min}.`
        };
      }
    }

    // Digital object title: no quotes
    if (fieldDef.validation && fieldDef.validation.custom_rule === 'no_quotes') {
      if (val.includes('"') || val.includes("'")) {
        return {
          valid: false,
          type: 'error',
          message: 'Digital Object Title cannot contain quotation marks (this is a known ASpace limitation).'
        };
      }
    }

    // Date logic: end >= begin
    if (fieldDef.id === 'end' && val && entryFields.begin) {
      if (!Validation.isDateAfterOrEqual(entryFields.begin, val)) {
        return {
          valid: false,
          type: 'error',
          message: 'End date must be the same as or after the start date.'
        };
      }
    }
    if (fieldDef.id === 'end_2' && val && entryFields.begin_2) {
      if (!Validation.isDateAfterOrEqual(entryFields.begin_2, val)) {
        return {
          valid: false,
          type: 'error',
          message: 'End date (2) must be the same as or after the start date (2).'
        };
      }
    }

    return { valid: true };
  },

  // Check if a field is conditionally required based on other fields
  checkConditionalRequired(fieldDef, value, entryFields) {
    const id = fieldDef.id;
    const empty = !value && value !== 0;

    if (!empty) return null;

    // Date group 1: if any date field is filled, label and type are required
    const dateFields1 = ['dates_label', 'begin', 'end', 'date_type', 'expression', 'date_certainty'];
    if (dateFields1.includes(id)) {
      const anyDateFilled = dateFields1.some(f => f !== id && entryFields[f]);
      if (anyDateFilled && (id === 'dates_label' || id === 'date_type')) {
        return {
          valid: false,
          type: 'error',
          message: `${fieldDef.label} is required when any date field is filled.`
        };
      }
    }

    // Date type "inclusive" or "bulk" requires begin AND end
    if (id === 'begin' && (entryFields.date_type === 'inclusive' || entryFields.date_type === 'bulk')) {
      return {
        valid: false,
        type: 'error',
        message: 'Start date is required for date ranges (inclusive or bulk dates).'
      };
    }
    if (id === 'end' && (entryFields.date_type === 'inclusive' || entryFields.date_type === 'bulk')) {
      return {
        valid: false,
        type: 'error',
        message: 'End date is required for date ranges (inclusive or bulk dates).'
      };
    }

    // Date type "single" requires begin
    if (id === 'begin' && entryFields.date_type === 'single') {
      return {
        valid: false,
        type: 'error',
        message: 'Start date is required for single dates.'
      };
    }

    // Container group: if instance_type is filled, top_container fields required
    if (id === 'type_1' && entryFields.cont_instance_type) {
      return {
        valid: false,
        type: 'error',
        message: 'Box Type is required when Instance Type is specified.'
      };
    }
    if (id === 'indicator_1' && entryFields.cont_instance_type) {
      return {
        valid: false,
        type: 'error',
        message: 'Box Number is required when Instance Type is specified.'
      };
    }

    // Child type/indicator must be paired
    if (id === 'indicator_2' && entryFields.type_2) {
      return {
        valid: false,
        type: 'error',
        message: 'Folder Number is required when Folder Type is specified.'
      };
    }
    if (id === 'type_2' && entryFields.indicator_2) {
      return {
        valid: false,
        type: 'error',
        message: 'Folder Type is required when Folder Number is specified.'
      };
    }

    // Extent group: if number is filled, type and portion required
    if (id === 'extent_type' && entryFields.number) {
      return {
        valid: false,
        type: 'error',
        message: 'Extent Type is required when Extent Number is specified.'
      };
    }
    if (id === 'portion' && entryFields.number) {
      return {
        valid: false,
        type: 'error',
        message: 'Extent Portion is required when Extent Number is specified.'
      };
    }

    return null;
  },

  // ===== ROW-LEVEL VALIDATION =====
  // Validates a single entry (archival object)

  validateEntry(entryFields, enabledFields) {
    const issues = [];

    // Title or date required
    const hasTitle = entryFields.title && entryFields.title.trim();
    const hasDate = entryFields.begin || entryFields.expression ||
                    entryFields.begin_2 || entryFields.expression_2;
    if (!hasTitle && !hasDate) {
      issues.push({
        type: 'error',
        field: 'title',
        message: 'Each entry needs either a title or a date (or both).'
      });
    }

    // Level of description required
    if (!entryFields.level) {
      issues.push({
        type: 'error',
        field: 'level',
        message: 'Level of Description is required.'
      });
    }

    // Validate each field that has a value
    for (const fieldDef of FIELD_REGISTRY) {
      if (!enabledFields.includes(fieldDef.id) && !fieldDef.required) continue;
      if (HIDDEN_FORM_FIELDS.includes(fieldDef.id)) continue;

      const result = Validation.validateField(fieldDef, entryFields[fieldDef.id], entryFields);
      if (!result.valid) {
        issues.push({
          type: result.type,
          field: fieldDef.id,
          message: result.message
        });
      }
    }

    return issues;
  },

  // ===== SPREADSHEET-LEVEL VALIDATION =====
  // Validates the entire project before export

  validateSpreadsheet(project, enabledFields) {
    const results = { errors: [], warnings: [] };
    const entries = project.entries || [];

    if (entries.length === 0) {
      results.errors.push({
        entryIndex: -1,
        entryTitle: '(Project)',
        field: null,
        message: 'The project has no entries to export.'
      });
      return results;
    }

    // Resource identifier required
    if (!project.resource_identifier) {
      results.errors.push({
        entryIndex: -1,
        entryTitle: '(Project)',
        field: 'resource_identifier',
        message: 'A Resource URI or EAD ID is required before export. Set this in the project settings.'
      });
    }

    // Build the flattened tree for hierarchy validation
    const flatTree = Tree.flattenTree(entries);

    // Check hierarchy continuity
    let prevHierarchy = 0;
    for (let i = 0; i < flatTree.length; i++) {
      const entry = flatTree[i];
      const hierarchy = entry._hierarchy;

      if (i === 0 && hierarchy !== 1) {
        results.errors.push({
          entryIndex: i,
          entryTitle: entry.fields.title || '(Untitled)',
          field: 'hierarchy',
          message: 'The first entry must be at the top level (hierarchy 1).'
        });
      }

      if (hierarchy > prevHierarchy + 1) {
        results.errors.push({
          entryIndex: i,
          entryTitle: entry.fields.title || '(Untitled)',
          field: 'hierarchy',
          message: `Hierarchy jumps from level ${prevHierarchy} to level ${hierarchy}. You can't skip a level (e.g., series directly to file without a subseries).`
        });
      }

      prevHierarchy = hierarchy;

      // Validate each entry
      const entryIssues = Validation.validateEntry(entry.fields, enabledFields);
      for (const issue of entryIssues) {
        const target = issue.type === 'error' ? results.errors : results.warnings;
        target.push({
          entryIndex: i,
          entryId: entry.id,
          entryTitle: entry.fields.title || '(Untitled)',
          field: issue.field,
          message: issue.message
        });
      }
    }

    // Check for consistent top containers
    const containerMap = {};
    for (let i = 0; i < flatTree.length; i++) {
      const entry = flatTree[i];
      const indicator = entry.fields.indicator_1;
      if (!indicator) continue;

      const barcode = entry.fields.barcode || '';
      if (!containerMap[indicator]) {
        containerMap[indicator] = { barcode, index: i };
      } else if (containerMap[indicator].barcode !== barcode) {
        results.warnings.push({
          entryIndex: i,
          entryTitle: entry.fields.title || '(Untitled)',
          field: 'barcode',
          message: `Box ${indicator} has different barcodes in different rows. Check that all entries for the same box use the same barcode.`
        });
      }
    }

    return results;
  },

  // ===== HELPERS =====

  // Compare two date strings (YYYY, YYYY-MM, or YYYY-MM-DD)
  isDateAfterOrEqual(beginStr, endStr) {
    // Pad to comparable format
    const normalize = (d) => {
      const parts = d.split('-');
      return parts.map((p, i) => p.padStart(i === 0 ? 4 : 2, '0')).join('-');
    };
    return normalize(endStr) >= normalize(beginStr);
  },

  // Sanitize text for export: fix curly quotes, strip problem characters
  sanitizeForExport(value) {
    if (!value) return '';
    let v = String(value);
    // Replace smart/curly quotes with straight quotes
    v = v.replace(/[\u2018\u2019\u201A]/g, "'");
    v = v.replace(/[\u201C\u201D\u201E]/g, '"');
    // Replace em/en dashes with regular hyphens
    v = v.replace(/[\u2013\u2014]/g, '-');
    // Strip other non-printable characters (keep newlines for multiline fields)
    v = v.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    // Trim whitespace
    v = v.trim();
    return v;
  }
};
