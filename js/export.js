// export.js
// CSV and Excel export functionality.
// Produces properly formatted files ready for ASpace's bulk import.

const Export = {

  // Escape HTML to prevent XSS in validation report rendering
  _escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  // Generate CSV string from project data.
  //
  // Output format follows ASpace's bulk importer expectations:
  //   Row 1: Field code row, first cell = marker string so the importer can find it
  //   Row 2: Human-readable labels (importer ignores this row)
  //   Row 3+: Data rows (first cell empty -- it belongs to the marker column)
  //
  // The export uses the controlled vocabulary Value form (e.g. "cubic_feet"),
  // not the Translation form (e.g. "Cubic Feet"). ASpace accepts both, but
  // the Value form is safer because it's an exact match without depending on
  // locale-specific translations.
  //
  // TODO (Phase 2 - Excel export): Date cells (begin, end, begin_2, end_2)
  // MUST be formatted as Text, not Date. Excel auto-converts "1969-07-20" to
  // an ISO datetime string if the cell format is Date, which breaks ASpace import.
  generateCSV(project) {
    const enabledFields = Config.getEnabledFields();
    const entries = project.entries || [];
    const flatTree = Tree.flattenTree(entries);

    if (flatTree.length === 0) return null;

    // Determine which columns to include:
    // 1. Always include required structural fields
    // 2. Include enabled fields that have data in at least one entry
    const columnsToExport = Export.determineColumns(flatTree, enabledFields);

    // Row 1: ASpace field code row (marker in first cell so the importer finds it)
    const headerRow = [
      'ArchivesSpace field code (please don\'t edit this row)',
      ...columnsToExport.map(f => f.aspace_code)
    ];

    // Row 2: Human-readable labels (ignored by importer, helpful for humans)
    const labelRow = [
      'Field name',
      ...columnsToExport.map(f => f.label)
    ];

    // Build data rows -- empty first cell for the marker column
    const dataRows = flatTree.map((entry) => {
      const cells = columnsToExport.map(field => {
        let value = '';

        // Special handling for auto-calculated / project-level fields
        if (field.id === 'hierarchy') {
          value = String(entry._hierarchy);
        } else if (field.id === 'res_uri' && project.identifier_type === 'res_uri') {
          // Populate on every row so sorting/reordering the CSV won't lose the identifier
          value = project.resource_identifier || '';
        } else if (field.id === 'ead' && project.identifier_type === 'ead') {
          // Populate on every row for the same reason
          value = project.resource_identifier || '';
        } else {
          value = (entry.fields && entry.fields[field.id]) || '';
        }

        // Sanitize for export
        value = Validation.sanitizeForExport(value);
        return value;
      });
      return ['', ...cells]; // empty first cell for the marker column
    });

    // Build CSV with UTF-8 BOM for Excel compatibility
    const BOM = '\uFEFF';
    const rows = [headerRow, labelRow, ...dataRows];
    const csvContent = rows.map(row =>
      row.map(cell => Export.escapeCSV(cell)).join(',')
    ).join('\r\n');

    return BOM + csvContent;
  },

  // Determine which columns should appear in the export.
  //
  // IMPORTANT - Identifier coupling:
  // Three values must use the same string ("res_uri" or "ead"):
  //   1. The radio button value in the New Project modal (value="res_uri" / value="ead")
  //   2. The identifier_type field stored on the project document in Firestore
  //   3. The field IDs in FIELD_REGISTRY ('res_uri' and 'ead')
  // If any of these three diverge, the identifier column will silently disappear
  // from the export or appear empty. Keep them in sync.
  determineColumns(flatTree, enabledFields) {
    // Always-include fields (structural)
    const alwaysInclude = ['hierarchy', 'level'];

    // Add the resource identifier field based on project type
    // (see coupling note above -- identifier_type must match a field ID)
    const project = App.currentProject;
    if (project) {
      if (project.identifier_type === 'res_uri') alwaysInclude.push('res_uri');
      else if (project.identifier_type === 'ead') alwaysInclude.push('ead');
    }

    // Check which fields have data in any entry
    const fieldsWithData = new Set();
    for (const entry of flatTree) {
      if (!entry.fields) continue;
      for (const [key, val] of Object.entries(entry.fields)) {
        if (val && String(val).trim()) {
          fieldsWithData.add(key);
        }
      }
    }

    // Build final column list: enabled fields that have data or are required
    const columns = [];
    for (const field of FIELD_REGISTRY) {
      if (alwaysInclude.includes(field.id) ||
          (enabledFields.includes(field.id) && fieldsWithData.has(field.id))) {
        columns.push(field);
      }
    }

    return columns;
  },

  // Escape a CSV cell value (quote if needed)
  escapeCSV(value) {
    if (!value) return '';
    const str = String(value);
    // Quote if contains comma, quote, newline, or leading/trailing space
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r') ||
        str !== str.trim()) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  },

  // Trigger CSV download
  downloadCSV(project) {
    const csv = Export.generateCSV(project);
    if (!csv) {
      App.showToast('No entries to export.', 'warning');
      return;
    }

    // Sanitize project name for use as filename (remove chars invalid on common filesystems)
    const safeName = (project.name || 'aspace-import').replace(/[<>:"/\\|?*]/g, '_');
    const filename = `${safeName}_${Export.dateStamp()}.csv`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    Export.downloadBlob(blob, filename);

    App.showToast(`Exported ${(project.entries || []).length} entries to ${filename}`, 'success');
  },

  // Trigger file download from Blob
  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // Get a date stamp for filenames
  dateStamp() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  // Run validation then export (or show report if errors)
  async exportWithValidation(project) {
    const enabledFields = Config.getEnabledFields();
    const results = Validation.validateSpreadsheet(project, enabledFields);

    if (results.errors.length > 0) {
      // Show validation report with errors
      Export.showValidationReport(results, false);
      return;
    }

    if (results.warnings.length > 0) {
      // Show validation report with warnings, allow "Export Anyway"
      Export.showValidationReport(results, true);
      return;
    }

    // No issues — export directly
    Export.downloadCSV(project);
  },

  // Show the validation report modal
  showValidationReport(results, allowExport) {
    const modal = document.getElementById('modal-validation');
    const report = document.getElementById('validation-report');
    const exportBtn = document.getElementById('btn-export-anyway');

    if (!modal || !report) return;

    // Summary
    const errorCount = results.errors.length;
    const warningCount = results.warnings.length;

    let html = `<div class="validation-summary">`;
    if (errorCount > 0) {
      html += `<span class="validation-summary-item errors">${errorCount} error${errorCount !== 1 ? 's' : ''}</span>`;
    }
    if (warningCount > 0) {
      html += `<span class="validation-summary-item warnings">${warningCount} warning${warningCount !== 1 ? 's' : ''}</span>`;
    }
    if (errorCount === 0 && warningCount === 0) {
      html += `<span class="validation-summary-item success">No issues found!</span>`;
    }
    html += `</div>`;

    // Group issues by entry
    const allIssues = [
      ...results.errors.map(e => ({ ...e, severity: 'error' })),
      ...results.warnings.map(w => ({ ...w, severity: 'warning' }))
    ];

    const byEntry = {};
    for (const issue of allIssues) {
      const key = issue.entryIndex;
      if (!byEntry[key]) {
        byEntry[key] = { title: issue.entryTitle, entryId: issue.entryId, issues: [] };
      }
      byEntry[key].issues.push(issue);
    }

    for (const [index, group] of Object.entries(byEntry)) {
      html += `<div class="validation-entry">`;
      html += `<div class="validation-entry-header">Row ${Number(index) + 1}: ${Export._escapeHTML(group.title)}</div>`;

      for (const issue of group.issues) {
        const icon = issue.severity === 'error' ? '&#10006;' : '&#9888;';
        html += `<div class="validation-issue" data-entry-id="${Export._escapeHTML(group.entryId || '')}" data-field="${Export._escapeHTML(issue.field || '')}">
          <span class="validation-issue-icon ${issue.severity}">${icon}</span>
          <span>${Export._escapeHTML(issue.message)}</span>
        </div>`;
      }

      html += `</div>`;
    }

    report.innerHTML = html;

    // Click to navigate to entry
    report.querySelectorAll('.validation-issue[data-entry-id]').forEach(el => {
      el.addEventListener('click', () => {
        const entryId = el.getAttribute('data-entry-id');
        if (entryId) {
          modal.classList.add('hidden');
          Tree.selectEntry(entryId);
        }
      });
    });

    // Export Anyway button
    if (exportBtn) {
      if (allowExport) {
        exportBtn.classList.remove('hidden');
        exportBtn.onclick = () => {
          modal.classList.add('hidden');
          Export.downloadCSV(App.currentProject);
        };
      } else {
        exportBtn.classList.add('hidden');
      }
    }

    modal.classList.remove('hidden');
  }
};
