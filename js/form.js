// form.js
// Entry form rendering and interaction.
// Renders fields grouped by category, handles input, validation feedback.

const Form = {
  currentEntry: null,

  // Render the form for a given entry
  renderEntry(entry) {
    Form.currentEntry = entry;
    const form = document.getElementById('entry-form');
    if (!form) return;

    form.innerHTML = '';

    const enabledFields = Config.getEnabledFields();
    const categories = Object.keys(FIELD_CATEGORIES).sort(
      (a, b) => FIELD_CATEGORIES[a].order - FIELD_CATEGORIES[b].order
    );

    // Update form header
    const titleEl = document.getElementById('form-entry-title');
    if (titleEl) {
      titleEl.textContent = entry.fields.title || 'Untitled Entry';
    }

    for (const category of categories) {
      const fields = getFieldsByCategory(category).filter(f =>
        enabledFields.includes(f.id) && !HIDDEN_FORM_FIELDS.includes(f.id)
      );

      if (fields.length === 0) continue;

      const section = Form.createSection(category, fields, entry);
      form.appendChild(section);
    }
  },

  // Create a collapsible form section for a category
  createSection(category, fields, entry) {
    const section = document.createElement('div');
    section.className = 'form-section';
    section.setAttribute('data-category', category);

    const catInfo = FIELD_CATEGORIES[category];
    const header = document.createElement('div');
    header.className = 'form-section-header';
    header.innerHTML = `
      <h4>${catInfo.label}</h4>
      <span class="form-section-toggle">&#9660;</span>
    `;

    header.addEventListener('click', () => {
      section.classList.toggle('collapsed');
    });

    const body = document.createElement('div');
    body.className = 'form-section-body';

    for (const field of fields) {
      const fieldEl = Form.createField(field, entry);
      body.appendChild(fieldEl);
    }

    section.appendChild(header);
    section.appendChild(body);
    return section;
  },

  // Create a single form field
  createField(fieldDef, entry) {
    const wrapper = document.createElement('div');
    wrapper.className = 'form-field';
    wrapper.setAttribute('data-field-id', fieldDef.id);

    const value = (entry.fields && entry.fields[fieldDef.id]) || '';

    // Label
    const label = document.createElement('label');
    label.setAttribute('for', `field-${fieldDef.id}`);
    label.innerHTML = `${fieldDef.label}${fieldDef.required ? ' <span class="field-required">*</span>' : ''}`;
    wrapper.appendChild(label);

    // Help text
    const customHelp = Config.institutionConfig &&
      Config.institutionConfig.custom_help_text &&
      Config.institutionConfig.custom_help_text[fieldDef.id];
    const helpText = customHelp || fieldDef.help_text;

    if (helpText) {
      const help = document.createElement('div');
      help.className = 'field-help';
      help.textContent = helpText;
      wrapper.appendChild(help);
    }

    // Input element
    let input;
    if (fieldDef.type === 'select' && fieldDef.validation && fieldDef.validation.controlled_vocabulary) {
      input = document.createElement('select');
      input.innerHTML = `<option value="">— Select —</option>`;

      // Use institution vocabulary restrictions if configured, otherwise full vocabulary.
      // Restrictions are a UI filter only -- validation still accepts the full ASpace vocabulary.
      const restrictions = Config.institutionConfig &&
        Config.institutionConfig.vocabulary_restrictions &&
        Config.institutionConfig.vocabulary_restrictions[fieldDef.id];
      const options = restrictions || fieldDef.validation.controlled_vocabulary;

      for (const opt of options) {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        if (opt === value) option.selected = true;
        input.appendChild(option);
      }

      // If the current value isn't in the restricted list but is in the full vocabulary,
      // still show it so existing data isn't hidden
      if (value && restrictions && !restrictions.includes(value) &&
          fieldDef.validation.controlled_vocabulary.includes(value)) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        option.selected = true;
        input.appendChild(option);
      }
    } else if (fieldDef.type === 'multiline') {
      input = document.createElement('textarea');
      input.rows = 4;
      input.value = value;
    } else {
      input = document.createElement('input');
      input.type = fieldDef.type === 'number' ? 'number' : 'text';
      input.value = value;
    }

    input.id = `field-${fieldDef.id}`;
    input.name = fieldDef.id;
    input.setAttribute('data-field-id', fieldDef.id);

    // Inline validation on blur
    input.addEventListener('blur', () => {
      Form.validateFieldInline(fieldDef, input, entry);
    });

    // Update entry data on input (but don't save yet)
    input.addEventListener('input', () => {
      if (!entry.fields) entry.fields = {};
      entry.fields[fieldDef.id] = input.value;

      // Update tree title in real time for title field
      if (fieldDef.id === 'title') {
        const titleEl = document.getElementById('form-entry-title');
        if (titleEl) titleEl.textContent = input.value || 'Untitled Entry';
      }
    });

    // For select elements, also validate and update on change
    if (input.tagName === 'SELECT') {
      input.addEventListener('change', () => {
        if (!entry.fields) entry.fields = {};
        entry.fields[fieldDef.id] = input.value;
        Form.validateFieldInline(fieldDef, input, entry);
      });
    }

    // Date auto-formatter: auto-populate related date fields from common
    // expression patterns. Only fills empty fields (never overwrites user values).
    if (fieldDef.id === 'expression') {
      input.addEventListener('blur', () => {
        const val = input.value.trim();
        if (!entry.fields) entry.fields = {};

        // Helper: set a field value only if currently empty, update the DOM input,
        // and run inline validation on it.
        const autoFill = (fieldId, value) => {
          if (entry.fields[fieldId]) return; // don't overwrite existing values
          entry.fields[fieldId] = value;
          const el = document.getElementById('field-' + fieldId);
          if (el) {
            el.value = value;
            const def = getFieldById(fieldId);
            if (def) Form.validateFieldInline(def, el, entry);
          }
        };

        // Single year: "1957"
        if (/^\d{4}$/.test(val)) {
          autoFill('begin', val);
          autoFill('end', val);
        }
        // Year range: "1957-1965" (also handles spaces around the dash)
        else if (/^\d{4}\s*-\s*\d{4}$/.test(val)) {
          const [startYear, endYear] = val.split(/\s*-\s*/);
          autoFill('begin', startYear);
          autoFill('end', endYear);
          autoFill('date_type', 'inclusive');
        }
        // Circa dates: "circa 1945" or "ca. 1945" (case-insensitive)
        else if (/^(?:circa|ca\.?)\s+\d{4}$/i.test(val)) {
          const year = val.match(/\d{4}/)[0];
          autoFill('begin', year);
          autoFill('date_certainty', 'approximate');
        }
        // "undated" (case-insensitive): no begin/end, just set date_type
        else if (/^undated$/i.test(val)) {
          autoFill('date_type', 'expression');
        }
      });
    }

    // Task 2: "Apply to Children" button for box number field
    if (fieldDef.id === 'indicator_1') {
      const inputRow = document.createElement('div');
      inputRow.className = 'field-input-row';
      inputRow.appendChild(input);

      const applyBtn = document.createElement('button');
      applyBtn.type = 'button';
      applyBtn.className = 'btn btn-text btn-small';
      applyBtn.textContent = 'Apply to Children';
      applyBtn.title = 'Set this box number on all entries nested under this one';
      applyBtn.addEventListener('click', () => {
        Tree.applyToDescendants(Tree.selectedEntryId, 'indicator_1', input.value);
      });
      inputRow.appendChild(applyBtn);

      wrapper.appendChild(inputRow);
    } else {
      wrapper.appendChild(input);
    }

    // Error message container
    const errorEl = document.createElement('div');
    errorEl.className = 'field-error-message hidden';
    errorEl.setAttribute('data-error-for', fieldDef.id);
    wrapper.appendChild(errorEl);

    return wrapper;
  },

  // Run inline validation on a single field and show/hide error
  validateFieldInline(fieldDef, input, entry) {
    const result = Validation.validateField(fieldDef, input.value, entry.fields || {});
    const errorEl = input.closest('.form-field').querySelector(`[data-error-for="${fieldDef.id}"]`);

    if (!result.valid) {
      input.classList.add('field-error');
      if (errorEl) {
        errorEl.textContent = result.message;
        errorEl.className = result.type === 'warning'
          ? 'field-warning-message'
          : 'field-error-message';
        errorEl.classList.remove('hidden');
      }
    } else {
      input.classList.remove('field-error');
      if (errorEl) {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
      }
    }

    return result;
  },

  // Collect current form values into the entry
  collectFormValues() {
    if (!Form.currentEntry) return null;

    const form = document.getElementById('entry-form');
    if (!form) return null;

    const fields = {};
    form.querySelectorAll('[data-field-id]').forEach(input => {
      if (input.tagName === 'DIV') return; // skip error containers
      const fieldId = input.getAttribute('data-field-id');
      fields[fieldId] = input.value;
    });

    return fields;
  },

  // Save the current entry
  saveCurrentEntry() {
    if (!Form.currentEntry) return;

    const fields = Form.collectFormValues();
    if (!fields) return;

    Form.currentEntry.fields = { ...Form.currentEntry.fields, ...fields };

    // Re-render tree to reflect changes
    const project = App.currentProject;
    if (project) {
      Tree.render(project.entries);
      App.markDirty();
    }
  },

  // Reset current entry to defaults
  resetToDefaults() {
    if (!Form.currentEntry) return;

    const project = App.currentProject;
    if (!project) return;

    const projectDefaults = project.defaults || {};
    const userDefaults = (Auth.userData && Auth.userData.defaults) || {};
    const defaults = Config.getResolvedDefaults(projectDefaults, userDefaults);

    // Reset only defaultable fields
    for (const field of getDefaultableFields()) {
      if (defaults[field.id] !== undefined) {
        Form.currentEntry.fields[field.id] = defaults[field.id];
      }
    }

    Form.renderEntry(Form.currentEntry);
    App.markDirty();
  }
};
