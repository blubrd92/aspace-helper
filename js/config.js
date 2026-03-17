// config.js
// Configuration management: institution config, defaults, admin settings panel.

const Config = {
  // Cached institution config (loaded once on login)
  institutionConfig: null,
  institutionDefaults: null,
  institutionData: null,

  // Load institution data and cache it
  async loadInstitution(institutionId) {
    const inst = await DB.getInstitution(institutionId);
    if (!inst) return false;

    Config.institutionData = inst;
    Config.institutionConfig = inst.config || {};
    Config.institutionDefaults = inst.defaults || {};

    // Also cache in localStorage for offline fallback
    try {
      localStorage.setItem('aspace_inst_config', JSON.stringify(Config.institutionConfig));
      localStorage.setItem('aspace_inst_defaults', JSON.stringify(Config.institutionDefaults));
    } catch (e) { /* ignore storage errors */ }

    return true;
  },

  // Get config from cache, falling back to localStorage
  getConfig() {
    if (Config.institutionConfig) return Config.institutionConfig;
    try {
      const cached = localStorage.getItem('aspace_inst_config');
      return cached ? JSON.parse(cached) : { enabled_fields: getDefaultEnabledFields().map(f => f.id) };
    } catch (e) {
      return { enabled_fields: getDefaultEnabledFields().map(f => f.id) };
    }
  },

  // Get list of enabled field IDs
  getEnabledFields() {
    const config = Config.getConfig();
    return config.enabled_fields || getDefaultEnabledFields().map(f => f.id);
  },

  // Check if a specific field is enabled
  isFieldEnabled(fieldId) {
    return Config.getEnabledFields().includes(fieldId);
  },

  // ===== DEFAULTS RESOLUTION =====

  // Resolve the active default for a field, cascading: project > user > institution
  resolveDefault(fieldId, projectDefaults, userDefaults) {
    // Tier 3: Project defaults (highest priority)
    if (projectDefaults && projectDefaults[fieldId] !== undefined && projectDefaults[fieldId] !== null) {
      return { value: projectDefaults[fieldId], source: 'project' };
    }

    // Tier 2: User defaults
    if (userDefaults && userDefaults[fieldId] !== undefined && userDefaults[fieldId] !== null) {
      return { value: userDefaults[fieldId], source: 'user' };
    }

    // Tier 1: Institution defaults
    const instDefaults = Config.institutionDefaults || {};
    if (instDefaults[fieldId] !== undefined && instDefaults[fieldId] !== null) {
      return { value: instDefaults[fieldId], source: 'institution' };
    }

    return null;
  },

  // Get all resolved defaults for creating a new entry
  getResolvedDefaults(projectDefaults, userDefaults) {
    const resolved = {};
    const defaultableFields = getDefaultableFields();

    for (const field of defaultableFields) {
      const result = Config.resolveDefault(field.id, projectDefaults, userDefaults);
      if (result) {
        resolved[field.id] = result.value;
      }
    }

    return resolved;
  },

  // ===== SETTINGS PANEL =====

  // Render the fields configuration tab
  renderFieldsConfig() {
    const container = document.getElementById('fields-config-list');
    if (!container) return;

    const enabledFields = Config.getEnabledFields();
    const categories = Object.keys(FIELD_CATEGORIES).sort(
      (a, b) => FIELD_CATEGORIES[a].order - FIELD_CATEGORIES[b].order
    );

    container.innerHTML = '';

    for (const category of categories) {
      const fields = getFieldsByCategory(category);
      if (fields.length === 0) continue;

      const section = document.createElement('div');
      section.className = 'fields-config-category';

      const heading = document.createElement('h5');
      heading.textContent = FIELD_CATEGORIES[category].label;
      section.appendChild(heading);

      for (const field of fields) {
        if (HIDDEN_FORM_FIELDS.includes(field.id)) continue;

        const row = document.createElement('div');
        row.className = 'field-config-row';

        const label = document.createElement('label');
        label.innerHTML = `
          <span>${field.label}</span>
          <span class="field-config-code">${field.aspace_code}</span>
        `;

        const toggle = document.createElement('div');
        toggle.className = 'toggle';
        toggle.innerHTML = `
          <input type="checkbox" data-field-id="${field.id}"
                 ${enabledFields.includes(field.id) ? 'checked' : ''}
                 ${field.required ? 'checked disabled' : ''}>
          <span class="toggle-slider"></span>
        `;

        row.appendChild(label);
        row.appendChild(toggle);
        section.appendChild(row);
      }

      container.appendChild(section);
    }
  },

  // Render institution defaults tab
  renderInstitutionDefaults() {
    const container = document.getElementById('inst-defaults-list');
    if (!container) return;

    const defaults = Config.institutionDefaults || {};
    const defaultableFields = getDefaultableFields();
    container.innerHTML = '';

    for (const field of defaultableFields) {
      const row = document.createElement('div');
      row.className = 'default-row';

      const currentValue = defaults[field.id] || '';

      row.innerHTML = `
        <span class="default-row-label">${field.label}</span>
        <div class="default-row-value">
          ${Config.renderDefaultInput(field, currentValue, 'inst-default')}
        </div>
      `;

      container.appendChild(row);
    }
  },

  // Render My Defaults modal content
  renderMyDefaults() {
    const container = document.getElementById('my-defaults-list');
    if (!container) return;

    const userDefaults = (Auth.userData && Auth.userData.defaults) || {};
    const instDefaults = Config.institutionDefaults || {};
    const defaultableFields = getDefaultableFields();
    container.innerHTML = '';

    for (const field of defaultableFields) {
      const row = document.createElement('div');
      row.className = 'default-row';

      const instValue = instDefaults[field.id] || '(none)';
      const userValue = userDefaults[field.id] || '';

      row.innerHTML = `
        <span class="default-row-label">${field.label}</span>
        <span class="default-row-inst">${instValue}</span>
        <div class="default-row-value">
          ${Config.renderDefaultInput(field, userValue, 'user-default')}
        </div>
        <div class="default-row-clear">
          ${userValue ? '<button class="btn btn-text btn-small" data-clear-default="' + field.id + '">Clear</button>' : ''}
        </div>
      `;

      container.appendChild(row);
    }

    // Handle clear buttons
    container.querySelectorAll('[data-clear-default]').forEach(btn => {
      btn.addEventListener('click', () => {
        const fieldId = btn.getAttribute('data-clear-default');
        const input = container.querySelector(`[data-default-field="${fieldId}"]`);
        if (input) {
          input.value = '';
        }
        btn.remove();
      });
    });
  },

  // Render a default input (text or select) for a field
  renderDefaultInput(field, value, prefix) {
    if (field.validation && field.validation.controlled_vocabulary) {
      const options = field.validation.controlled_vocabulary
        .map(v => `<option value="${v}" ${v === value ? 'selected' : ''}>${v}</option>`)
        .join('');
      return `<select data-default-field="${field.id}" data-prefix="${prefix}">
                <option value="">(no default)</option>
                ${options}
              </select>`;
    }
    return `<input type="text" data-default-field="${field.id}" data-prefix="${prefix}" value="${value || ''}">`;
  },

  // Collect defaults from a container's inputs
  collectDefaults(container, prefix) {
    const defaults = {};
    container.querySelectorAll(`[data-prefix="${prefix}"]`).forEach(input => {
      const fieldId = input.getAttribute('data-default-field');
      const value = input.value.trim();
      if (value) {
        defaults[fieldId] = value;
      }
    });
    return defaults;
  },

  // Save institution settings (fields + defaults)
  async saveSettings() {
    const enabledFields = [];
    document.querySelectorAll('#fields-config-list input[type="checkbox"]').forEach(cb => {
      if (cb.checked) {
        enabledFields.push(cb.getAttribute('data-field-id'));
      }
    });

    const instDefaults = Config.collectDefaults(
      document.getElementById('inst-defaults-list'), 'inst-default'
    );

    const instName = document.getElementById('settings-inst-name').value.trim();
    const aspaceVersion = document.getElementById('settings-aspace-version').value;

    const institutionId = Auth.getInstitutionId();
    const success = await DB.updateInstitution(institutionId, {
      name: instName || Config.institutionData.name,
      defaults: instDefaults,
      'config.enabled_fields': enabledFields,
      'config.aspace_version': aspaceVersion
    });

    if (success) {
      // Refresh cached config
      await Config.loadInstitution(institutionId);
      App.showToast('Settings saved.', 'success');
    } else {
      App.showToast('Failed to save settings.', 'error');
    }

    return success;
  },

  // Save user defaults
  async saveMyDefaults() {
    const userDefaults = Config.collectDefaults(
      document.getElementById('my-defaults-list'), 'user-default'
    );

    const success = await DB.updateUser(Auth.currentUser.uid, { defaults: userDefaults });
    if (success) {
      Auth.userData.defaults = userDefaults;
      App.showToast('Your defaults have been saved.', 'success');
    } else {
      App.showToast('Failed to save defaults.', 'error');
    }

    return success;
  },

  // Render team management tab
  async renderTeam() {
    const container = document.getElementById('team-list');
    if (!container) return;

    const institutionId = Auth.getInstitutionId();
    const users = await DB.getUsersByInstitution(institutionId);
    container.innerHTML = '';

    // Count admins to enforce last-admin protection
    const adminCount = users.filter(u => u.role === 'admin').length;

    for (const user of users) {
      const row = document.createElement('div');
      row.className = 'team-member-row';

      const isCurrentUser = user.id === Auth.currentUser.uid;
      const isSoleAdmin = user.role === 'admin' && adminCount <= 1;

      let roleOptions;
      if (isCurrentUser) {
        roleOptions = `<span>${user.role}</span>`;
      } else if (isSoleAdmin) {
        // Disable role change for the sole admin
        roleOptions = `<select disabled title="This is the only admin. Promote another member to admin first.">
             <option value="admin" selected>Admin</option>
           </select>
           <span class="sole-admin-note">Only admin</span>`;
      } else {
        roleOptions = `<select data-user-id="${user.id}" data-action="change-role">
             <option value="member" ${user.role === 'member' ? 'selected' : ''}>Member</option>
             <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
           </select>`;
      }

      // Block remove button for sole admin
      let removeBtn = '';
      if (!isCurrentUser) {
        if (isSoleAdmin) {
          removeBtn = `<button class="btn btn-small btn-danger" disabled title="This is the only admin. Promote another member to admin first.">Remove</button>`;
        } else {
          removeBtn = `<button class="btn btn-small btn-danger" data-remove-user="${user.id}">Remove</button>`;
        }
      }

      row.innerHTML = `
        <div class="team-member-info">
          <strong>${user.display_name || user.email}${isCurrentUser ? ' (you)' : ''}</strong>
          <span>${user.email}</span>
        </div>
        <div class="team-member-role">${roleOptions}</div>
        ${removeBtn}
      `;

      container.appendChild(row);
    }

    // Role change handlers — with last-admin guard
    container.querySelectorAll('[data-action="change-role"]').forEach(select => {
      select.addEventListener('change', async () => {
        const userId = select.getAttribute('data-user-id');
        const newRole = select.value;

        // Double-check before demoting an admin
        if (newRole !== 'admin') {
          const isLast = await DB.isLastAdmin(institutionId, userId);
          if (isLast) {
            App.showToast('Cannot demote the only admin. Promote another member to admin first.', 'error');
            select.value = 'admin'; // revert
            return;
          }
        }

        await DB.updateUser(userId, { role: newRole });
        App.showToast('Role updated.', 'success');
        Config.renderTeam(); // re-render to update sole-admin state
      });
    });

    // Remove user handlers — with last-admin guard
    container.querySelectorAll('[data-remove-user]').forEach(btn => {
      btn.addEventListener('click', () => {
        const userId = btn.getAttribute('data-remove-user');
        App.showConfirm(
          'Remove Team Member',
          'This person will lose access to the institution. They can rejoin with a new invite code.',
          async () => {
            // Double-check before removing an admin
            const isLast = await DB.isLastAdmin(institutionId, userId);
            if (isLast) {
              App.showToast('Cannot remove the only admin. Promote another member to admin first.', 'error');
              return;
            }
            await DB.deleteUser(userId);
            Config.renderTeam();
            App.showToast('Team member removed.', 'success');
          }
        );
      });
    });

    // Show invite code
    const codeEl = document.getElementById('settings-invite-code');
    if (codeEl && Config.institutionData) {
      codeEl.textContent = Config.institutionData.invite_code;
    }
  },

  // Export configuration as JSON
  exportConfig() {
    const data = {
      name: Config.institutionData.name,
      config: Config.institutionConfig,
      defaults: Config.institutionDefaults,
      exported_at: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aspace-helper-config-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // Import configuration from JSON
  async importConfig(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.config || !data.defaults) {
        App.showToast('Invalid configuration file.', 'error');
        return;
      }

      const institutionId = Auth.getInstitutionId();
      await DB.updateInstitution(institutionId, {
        config: data.config,
        defaults: data.defaults
      });

      await Config.loadInstitution(institutionId);
      App.showToast('Configuration imported.', 'success');

      // Re-render settings panels
      Config.renderFieldsConfig();
      Config.renderInstitutionDefaults();
    } catch (e) {
      console.error('Import error:', e);
      App.showToast('Failed to import configuration file.', 'error');
    }
  }
};
