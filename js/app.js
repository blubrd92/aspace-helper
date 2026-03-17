// app.js
// Main application initialization, routing, view management, and event wiring.

const App = {
  currentProject: null,
  isDirty: false,
  saveTimer: null,

  // ===== INITIALIZATION =====

  init() {
    // Set up auth state listener
    Auth.onAuthStateChanged((user, userData) => {
      // Hide loading spinner if it was shown
      App.showAuthForm('signin');

      if (!user) {
        App.showView('login');
        return;
      }

      if (!userData) {
        // New user — show onboarding
        App.showView('onboarding');
      } else {
        // Existing user — load institution and show projects
        App.loadAndShowProjects();
      }
    });

    // Wire up all event listeners
    App.bindEvents();
  },

  // Show a specific auth form (signin, create, forgot, loading)
  showAuthForm(formId) {
    ['auth-signin', 'auth-create', 'auth-forgot', 'auth-loading'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', id !== `auth-${formId}`);
    });
    // Clear error/message elements when switching forms
    document.querySelectorAll('.auth-error, .auth-message').forEach(el => el.classList.add('hidden'));
  },

  // ===== VIEW MANAGEMENT =====

  showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(`view-${viewId}`);
    if (view) view.classList.add('active');
  },

  // ===== PROJECTS VIEW =====

  async loadAndShowProjects() {
    const institutionId = Auth.getInstitutionId();
    if (!institutionId) {
      App.showView('onboarding');
      return;
    }

    await Config.loadInstitution(institutionId);
    App.updateUserDisplay();
    App.showView('projects');
    App.renderProjectList();
  },

  updateUserDisplay() {
    const user = Auth.currentUser;
    if (!user) return;

    // Set user name and avatar in all locations
    const initial = (user.displayName || user.email || '?')[0].toUpperCase();

    document.querySelectorAll('#user-name-display').forEach(el => {
      el.textContent = user.displayName || user.email;
    });
    document.querySelectorAll('.avatar').forEach(el => {
      el.textContent = initial;
    });

    // Institution name
    const instName = Config.institutionData ? Config.institutionData.name : '';
    document.querySelectorAll('#institution-name-display').forEach(el => {
      el.textContent = instName;
    });

    // Show/hide admin-only elements
    const isAdmin = Auth.isAdmin();
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = isAdmin ? '' : 'none';
    });

    // Show invite code banner for admins with new institutions
    if (isAdmin && Config.institutionData) {
      const banner = document.getElementById('invite-code-banner');
      const codeDisplay = document.getElementById('invite-code-display');
      if (banner && codeDisplay) {
        codeDisplay.textContent = Config.institutionData.invite_code;
        banner.classList.remove('hidden');
      }
    }
  },

  async renderProjectList() {
    const institutionId = Auth.getInstitutionId();
    const projects = await DB.getProjectsByInstitution(institutionId);
    const container = document.getElementById('project-list');
    const emptyState = document.getElementById('empty-projects');

    if (!container) return;
    container.innerHTML = '';

    if (projects.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    for (const project of projects) {
      const card = document.createElement('div');
      card.className = 'project-card';

      const entryCount = (project.entries || []).length;
      const updatedAt = project.updated_at
        ? new Date(project.updated_at.seconds * 1000).toLocaleDateString()
        : 'Never';

      card.innerHTML = `
        <div class="project-card-info">
          <h4>${project.name}</h4>
          <span class="project-card-meta">${entryCount} entries &middot; Updated ${updatedAt}</span>
        </div>
        <div class="project-card-actions">
          <span class="project-card-status">${project.status || 'in_progress'}</span>
          ${Auth.isAdmin() ? `<button class="btn btn-small btn-danger" data-delete-project="${project.id}">Delete</button>` : ''}
        </div>
      `;

      // Click card to open project
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-delete-project]')) return;
        App.openProject(project.id);
      });

      // Delete button — opens typed confirmation modal
      const deleteBtn = card.querySelector('[data-delete-project]');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          App.showDeleteProjectModal(project.id, project.name);
        });
      }

      container.appendChild(card);
    }
  },

  // ===== EDITOR VIEW =====

  async openProject(projectId) {
    const project = await DB.getProject(projectId);
    if (!project) {
      App.showToast('Project not found.', 'error');
      return;
    }

    App.currentProject = project;
    App.isDirty = false;

    // Update UI
    document.getElementById('editor-project-name').textContent = project.name;
    document.getElementById('editor-resource-id').textContent =
      project.resource_identifier || '(no identifier set)';

    // Reset form panel
    document.getElementById('no-selection').classList.remove('hidden');
    document.getElementById('entry-form-container').classList.add('hidden');
    Tree.selectedEntryId = null;

    // Render tree
    Tree.render(project.entries || []);

    // Update defaults bar
    App.renderDefaultsBar();

    App.showView('editor');
  },

  // Render the defaults bar showing current active defaults
  renderDefaultsBar() {
    const project = App.currentProject;
    if (!project) return;

    const boxNumber = document.getElementById('current-box-number');
    const content = document.getElementById('defaults-bar-content');
    if (!content) return;

    const projectDefaults = project.defaults || {};
    const userDefaults = (Auth.userData && Auth.userData.defaults) || {};

    // Update box number display
    const boxDefault = Config.resolveDefault('indicator_1', projectDefaults, userDefaults);
    if (boxNumber) {
      boxNumber.textContent = boxDefault ? boxDefault.value : '—';
    }

    // Render all defaults
    const defaultableFields = getDefaultableFields();
    content.innerHTML = '';

    for (const field of defaultableFields) {
      const resolved = Config.resolveDefault(field.id, projectDefaults, userDefaults);
      if (!resolved) continue;

      const chip = document.createElement('div');
      chip.className = 'default-chip';

      const sourceLabel = resolved.source === 'institution' ? '(institution)'
        : resolved.source === 'user' ? '(you)' : '';

      chip.innerHTML = `
        <span class="default-chip-label">${field.label}:</span>
        <span class="default-chip-value" data-default-edit="${field.id}">${resolved.value}</span>
        ${sourceLabel ? `<span class="default-chip-source">${sourceLabel}</span>` : ''}
      `;

      // Click to edit project default inline
      const valueEl = chip.querySelector('[data-default-edit]');
      valueEl.addEventListener('click', () => {
        const newValue = prompt(`Set project default for ${field.label}:`, resolved.value);
        if (newValue !== null) {
          if (!project.defaults) project.defaults = {};
          if (newValue.trim()) {
            project.defaults[field.id] = newValue.trim();
          } else {
            delete project.defaults[field.id];
          }
          App.markDirty();
          App.renderDefaultsBar();
        }
      });

      content.appendChild(chip);
    }
  },

  // ===== AUTO-SAVE =====

  markDirty() {
    App.isDirty = true;
    App.updateSyncStatus('saving');

    // Debounce: save after 2 seconds of inactivity
    clearTimeout(App.saveTimer);
    App.saveTimer = setTimeout(() => App.autoSave(), 2000);
  },

  async autoSave() {
    if (!App.isDirty || !App.currentProject) return;

    const success = await DB.updateProject(App.currentProject.id, {
      entries: App.currentProject.entries,
      defaults: App.currentProject.defaults,
      status: App.currentProject.status
    });

    if (success) {
      App.isDirty = false;
      App.updateSyncStatus('saved');
    } else {
      App.updateSyncStatus('error');
    }
  },

  updateSyncStatus(status) {
    const el = document.getElementById('sync-status');
    if (!el) return;

    el.className = 'sync-indicator';
    switch (status) {
      case 'saved':
        el.textContent = 'Saved';
        el.classList.add('saved');
        break;
      case 'saving':
        el.textContent = 'Saving...';
        el.classList.add('saving');
        break;
      case 'error':
        el.textContent = 'Save failed';
        el.classList.add('error');
        break;
    }
  },

  // ===== HELPERS =====

  getEntryById(entryId) {
    if (!App.currentProject || !App.currentProject.entries) return null;
    return App.currentProject.entries.find(e => e.id === entryId);
  },

  showToast(message, type) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type || ''}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 4000);
  },

  showConfirm(title, message, onConfirm) {
    const modal = document.getElementById('modal-confirm');
    document.getElementById('modal-confirm-title').textContent = title;
    document.getElementById('modal-confirm-message').textContent = message;

    const okBtn = document.getElementById('btn-confirm-ok');
    const cancelBtn = document.getElementById('btn-confirm-cancel');

    // Remove old listeners by cloning
    const newOk = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOk, okBtn);
    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    newOk.addEventListener('click', () => {
      modal.classList.add('hidden');
      onConfirm();
    });

    newCancel.addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    modal.classList.remove('hidden');
  },

  // Show typed-confirmation modal for project deletion
  _deleteProjectId: null,

  showDeleteProjectModal(projectId, projectName) {
    App._deleteProjectId = projectId;
    const modal = document.getElementById('modal-delete-project');
    const input = document.getElementById('input-delete-project-confirm');
    const confirmBtn = document.getElementById('btn-confirm-delete-project');
    document.getElementById('delete-project-name-display').textContent = projectName;
    input.value = '';
    input.placeholder = projectName;
    confirmBtn.disabled = true;
    modal.classList.remove('hidden');
    input.focus();
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('hidden');
  },

  // ===== EVENT BINDING =====

  bindEvents() {
    // --- Auth: Form switching ---
    document.getElementById('btn-show-create').addEventListener('click', () => App.showAuthForm('create'));
    document.getElementById('btn-show-signin').addEventListener('click', () => App.showAuthForm('signin'));
    document.getElementById('btn-show-forgot').addEventListener('click', () => App.showAuthForm('forgot'));
    document.getElementById('btn-back-signin').addEventListener('click', () => App.showAuthForm('signin'));

    // --- Auth: Email/Password Sign In ---
    document.getElementById('btn-signin').addEventListener('click', async () => {
      const email = document.getElementById('signin-email').value.trim();
      const password = document.getElementById('signin-password').value;
      const errorEl = document.getElementById('signin-error');

      if (!email || !password) {
        errorEl.textContent = 'Please enter your email and password.';
        errorEl.classList.remove('hidden');
        return;
      }

      errorEl.classList.add('hidden');
      App.showAuthForm('loading');

      const result = await Auth.signInWithEmail(email, password);
      if (result.error) {
        App.showAuthForm('signin');
        errorEl.textContent = result.error;
        errorEl.classList.remove('hidden');
      }
      // If success, onAuthStateChanged fires and handles navigation
    });

    // Allow Enter key to submit sign-in form
    document.getElementById('signin-password').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('btn-signin').click();
    });

    // --- Auth: Create Account ---
    document.getElementById('btn-create-account').addEventListener('click', async () => {
      const email = document.getElementById('create-email').value.trim();
      const password = document.getElementById('create-password').value;
      const confirm = document.getElementById('create-password-confirm').value;
      const errorEl = document.getElementById('create-error');

      if (!email || !password || !confirm) {
        errorEl.textContent = 'Please fill in all fields.';
        errorEl.classList.remove('hidden');
        return;
      }

      // Client-side password match check before hitting Firebase
      if (password !== confirm) {
        errorEl.textContent = 'Passwords don\'t match.';
        errorEl.classList.remove('hidden');
        return;
      }

      if (password.length < 6) {
        errorEl.textContent = 'Password must be at least 6 characters.';
        errorEl.classList.remove('hidden');
        return;
      }

      errorEl.classList.add('hidden');
      App.showAuthForm('loading');

      const result = await Auth.createAccountWithEmail(email, password);
      if (result.error) {
        App.showAuthForm('create');
        errorEl.textContent = result.error;
        errorEl.classList.remove('hidden');
      }
      // If success, onAuthStateChanged fires and handles navigation
    });

    // Allow Enter key to submit create form
    document.getElementById('create-password-confirm').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('btn-create-account').click();
    });

    // --- Auth: Google Sign In (both sign-in and sign-up buttons) ---
    const googleSignInHandler = async () => {
      App.showAuthForm('loading');
      const result = await Auth.signInWithGoogle();
      if (result.error) {
        App.showAuthForm('signin');
        const errorEl = document.getElementById('signin-error');
        errorEl.textContent = result.error;
        errorEl.classList.remove('hidden');
      }
    };
    document.getElementById('btn-google-signin').addEventListener('click', googleSignInHandler);
    document.getElementById('btn-google-signup').addEventListener('click', googleSignInHandler);

    // --- Auth: Forgot Password ---
    document.getElementById('btn-send-reset').addEventListener('click', async () => {
      const email = document.getElementById('forgot-email').value.trim();
      const errorEl = document.getElementById('forgot-error');
      const messageEl = document.getElementById('forgot-message');

      if (!email) {
        errorEl.textContent = 'Please enter your email address.';
        errorEl.classList.remove('hidden');
        messageEl.classList.add('hidden');
        return;
      }

      errorEl.classList.add('hidden');

      const result = await Auth.sendPasswordReset(email);
      if (result.success) {
        messageEl.textContent = 'If an account exists for that email, a password reset link has been sent. Check your inbox.';
        messageEl.classList.remove('hidden');
      } else {
        errorEl.textContent = result.error;
        errorEl.classList.remove('hidden');
      }
    });

    // Allow Enter key to submit forgot password form
    document.getElementById('forgot-email').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('btn-send-reset').click();
    });

    // --- Auth: Password visibility toggles ---
    document.querySelectorAll('.btn-toggle-password').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.querySelector('.icon-eye').classList.toggle('hidden', isPassword);
        btn.querySelector('.icon-eye-off').classList.toggle('hidden', !isPassword);
        btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      });
    });

    // --- Onboarding ---
    const btnCreateInst = document.getElementById('btn-create-institution');
    const btnJoinInst = document.getElementById('btn-join-institution');
    const onboardingCreate = document.getElementById('onboarding-create');
    const onboardingJoin = document.getElementById('onboarding-join');
    const onboardingOptions = document.querySelector('.onboarding-options');

    btnCreateInst.addEventListener('click', () => {
      onboardingOptions.classList.add('hidden');
      onboardingCreate.classList.remove('hidden');
    });

    btnJoinInst.addEventListener('click', () => {
      onboardingOptions.classList.add('hidden');
      onboardingJoin.classList.remove('hidden');
    });

    document.getElementById('btn-back-onboarding').addEventListener('click', () => {
      onboardingCreate.classList.add('hidden');
      onboardingOptions.classList.remove('hidden');
    });

    document.getElementById('btn-back-onboarding-join').addEventListener('click', () => {
      onboardingJoin.classList.add('hidden');
      onboardingOptions.classList.remove('hidden');
    });

    // Create institution
    document.getElementById('btn-confirm-create').addEventListener('click', async () => {
      const name = document.getElementById('input-institution-name').value.trim();
      if (!name) {
        App.showToast('Please enter an institution name.', 'error');
        return;
      }

      // Generate invite code
      let inviteCode = DB.generateInviteCode(name);
      let codeCreated = await DB.createInviteCode(inviteCode, 'pending');

      // Retry on collision (extremely unlikely)
      let attempts = 0;
      while (!codeCreated && attempts < 5) {
        inviteCode = DB.generateInviteCode(name);
        codeCreated = await DB.createInviteCode(inviteCode, 'pending');
        attempts++;
      }

      if (!codeCreated) {
        App.showToast('Failed to create invite code. Please try again.', 'error');
        return;
      }

      // Create institution
      const institutionId = await DB.createInstitution({ name, invite_code: inviteCode });
      if (!institutionId) {
        App.showToast('Failed to create institution.', 'error');
        return;
      }

      // Update invite code with real institution ID
      await db.collection('invite_codes').doc(inviteCode.toUpperCase()).update({
        institution_id: institutionId
      });

      // Create user document
      const user = Auth.currentUser;
      const created = await DB.createUser(user.uid, {
        email: user.email,
        display_name: user.displayName,
        institution_id: institutionId,
        role: 'admin'
      });

      if (created) {
        Auth.userData = await DB.getUser(user.uid);
        App.loadAndShowProjects();
        App.showToast('Institution created! Share your invite code with your team.', 'success');
      }
    });

    // Join institution: lookup code
    document.getElementById('btn-lookup-code').addEventListener('click', async () => {
      const code = document.getElementById('input-invite-code').value.trim();
      if (!code) {
        document.getElementById('join-error').textContent = 'Please enter an invite code.';
        document.getElementById('join-error').classList.remove('hidden');
        return;
      }

      const codeData = await DB.lookupInviteCode(code);
      if (!codeData) {
        document.getElementById('join-error').textContent =
          "That code doesn't match any institution. Check with your administrator.";
        document.getElementById('join-error').classList.remove('hidden');
        document.getElementById('join-confirm').classList.add('hidden');
        return;
      }

      // Show institution name for confirmation
      const inst = await DB.getInstitution(codeData.institution_id);
      if (!inst) {
        document.getElementById('join-error').textContent = 'Institution not found.';
        document.getElementById('join-error').classList.remove('hidden');
        return;
      }

      document.getElementById('join-error').classList.add('hidden');
      document.getElementById('join-institution-name').textContent = inst.name;
      document.getElementById('join-confirm').classList.remove('hidden');
      document.getElementById('join-confirm').setAttribute('data-institution-id', inst.id);
    });

    // Join institution: confirm
    document.getElementById('btn-confirm-join').addEventListener('click', async () => {
      const institutionId = document.getElementById('join-confirm').getAttribute('data-institution-id');
      const user = Auth.currentUser;

      const created = await DB.createUser(user.uid, {
        email: user.email,
        display_name: user.displayName,
        institution_id: institutionId,
        role: 'member'
      });

      if (created) {
        Auth.userData = await DB.getUser(user.uid);
        App.loadAndShowProjects();
        App.showToast('Welcome! You\'ve joined the team.', 'success');
      }
    });

    // --- Project List ---
    document.getElementById('btn-new-project').addEventListener('click', () => {
      document.getElementById('modal-new-project').classList.remove('hidden');
      document.getElementById('input-project-name').value = '';
      document.getElementById('input-resource-id').value = '';
    });

    document.getElementById('btn-cancel-new-project').addEventListener('click', () => {
      App.closeModal('modal-new-project');
    });

    document.getElementById('btn-create-project').addEventListener('click', async () => {
      const name = document.getElementById('input-project-name').value.trim();
      if (!name) {
        App.showToast('Please enter a project name.', 'error');
        return;
      }

      const resourceId = document.getElementById('input-resource-id').value.trim();
      const idType = document.querySelector('input[name="id-type"]:checked').value;

      const projectId = await DB.createProject({
        institution_id: Auth.getInstitutionId(),
        name,
        resource_identifier: resourceId,
        identifier_type: idType,
        created_by: Auth.currentUser.uid
      });

      if (projectId) {
        App.closeModal('modal-new-project');
        App.openProject(projectId);
        App.showToast('Project created.', 'success');
      } else {
        App.showToast('Failed to create project.', 'error');
      }
    });

    // --- Copy invite code ---
    document.getElementById('btn-copy-invite').addEventListener('click', () => {
      const code = document.getElementById('invite-code-display').textContent;
      navigator.clipboard.writeText(code).then(() => {
        App.showToast('Invite code copied!', 'success');
      });
    });

    // --- Sign out ---
    const signOutHandler = () => Auth.signOut();
    document.getElementById('btn-signout').addEventListener('click', signOutHandler);
    document.getElementById('btn-signout-editor').addEventListener('click', signOutHandler);

    // --- Leave Institution ---
    const leaveModal = document.getElementById('modal-leave-institution');
    const leaveInput = document.getElementById('input-leave-confirm');
    const leaveBtn = document.getElementById('btn-confirm-leave');
    const leaveWarning = document.getElementById('leave-last-admin-warning');
    const leaveFields = document.getElementById('leave-confirm-fields');

    const openLeaveModal = async () => {
      leaveInput.value = '';
      leaveBtn.disabled = true;
      leaveWarning.classList.add('hidden');
      leaveFields.classList.remove('hidden');
      leaveBtn.classList.remove('hidden');

      // Check if sole admin
      const institutionId = Auth.getInstitutionId();
      if (institutionId && Auth.isAdmin()) {
        const isLast = await DB.isLastAdmin(institutionId, Auth.currentUser.uid);
        if (isLast) {
          leaveWarning.classList.remove('hidden');
          leaveFields.classList.add('hidden');
          leaveBtn.classList.add('hidden');
        }
      }

      leaveModal.classList.remove('hidden');
    };

    document.getElementById('btn-leave-institution').addEventListener('click', openLeaveModal);
    document.getElementById('btn-leave-institution-editor').addEventListener('click', openLeaveModal);

    // Enable confirm button only when user types LEAVE
    leaveInput.addEventListener('input', () => {
      leaveBtn.disabled = leaveInput.value.trim() !== 'LEAVE';
    });

    // Cancel
    document.getElementById('btn-cancel-leave').addEventListener('click', () => {
      leaveModal.classList.add('hidden');
    });

    // Confirm leave
    leaveBtn.addEventListener('click', async () => {
      if (leaveInput.value.trim() !== 'LEAVE') return;

      const institutionId = Auth.getInstitutionId();
      const uid = Auth.currentUser.uid;

      // Final safety check
      if (Auth.isAdmin()) {
        const isLast = await DB.isLastAdmin(institutionId, uid);
        if (isLast) {
          App.showToast('Cannot leave — you are the only admin. Promote another member first.', 'error');
          leaveModal.classList.add('hidden');
          return;
        }
      }

      // Remove user document (removes institution membership)
      await DB.deleteUser(uid);

      // Sign out and return to login
      leaveModal.classList.add('hidden');
      Auth.userData = null;
      App.showToast('You have left the institution.', 'success');
      await Auth.signOut();
    });

    // --- Delete Project modal ---
    const deleteProjectInput = document.getElementById('input-delete-project-confirm');
    const deleteProjectBtn = document.getElementById('btn-confirm-delete-project');
    const deleteProjectModal = document.getElementById('modal-delete-project');

    deleteProjectInput.addEventListener('input', () => {
      const expected = document.getElementById('delete-project-name-display').textContent;
      deleteProjectBtn.disabled = deleteProjectInput.value.trim() !== expected;
    });

    document.getElementById('btn-cancel-delete-project').addEventListener('click', () => {
      deleteProjectModal.classList.add('hidden');
      App._deleteProjectId = null;
    });

    deleteProjectBtn.addEventListener('click', async () => {
      if (!App._deleteProjectId || deleteProjectBtn.disabled) return;
      await DB.deleteProject(App._deleteProjectId);
      deleteProjectModal.classList.add('hidden');
      App._deleteProjectId = null;
      App.renderProjectList();
      App.showToast('Project deleted.', 'success');
    });

    // --- User menu dropdowns ---
    App.setupDropdown('btn-user-menu', 'user-dropdown');
    App.setupDropdown('btn-user-menu-editor', 'user-dropdown-editor');

    // --- Editor: Back to projects ---
    document.getElementById('btn-back-projects').addEventListener('click', () => {
      if (App.isDirty) {
        App.autoSave(); // save before leaving
      }
      App.currentProject = null;
      App.loadAndShowProjects();
    });

    document.getElementById('btn-back-to-projects').addEventListener('click', () => {
      if (App.isDirty) App.autoSave();
      App.currentProject = null;
      App.loadAndShowProjects();
    });

    // --- Editor: Add entry ---
    document.getElementById('btn-add-entry').addEventListener('click', () => {
      Tree.addEntry(null, false);
    });

    // --- Editor: Save entry ---
    document.getElementById('btn-save-entry').addEventListener('click', () => {
      Form.saveCurrentEntry();
      App.showToast('Entry saved.', 'success');
    });

    // --- Editor: Delete entry ---
    document.getElementById('btn-delete-entry').addEventListener('click', () => {
      if (!Tree.selectedEntryId) return;
      App.showConfirm(
        'Delete Entry',
        'Delete this entry and all its children? This cannot be undone.',
        () => {
          Tree.deleteEntry(Tree.selectedEntryId);
          App.showToast('Entry deleted.', 'success');
        }
      );
    });

    // --- Editor: Reset to defaults ---
    document.getElementById('btn-reset-defaults').addEventListener('click', () => {
      Form.resetToDefaults();
      App.showToast('Entry reset to defaults.', 'success');
    });

    // --- Editor: Validate All ---
    document.getElementById('btn-validate-all').addEventListener('click', () => {
      if (!App.currentProject) return;
      const enabledFields = Config.getEnabledFields();
      const results = Validation.validateSpreadsheet(App.currentProject, enabledFields);
      Export.showValidationReport(results, false);
    });

    // --- Editor: Export CSV ---
    document.getElementById('btn-export-csv').addEventListener('click', () => {
      if (!App.currentProject) return;
      Export.exportWithValidation(App.currentProject);
    });

    // --- Editor: Defaults bar toggle ---
    document.getElementById('btn-toggle-defaults').addEventListener('click', () => {
      const content = document.getElementById('defaults-bar-content');
      const btn = document.getElementById('btn-toggle-defaults');
      content.classList.toggle('hidden');
      btn.textContent = content.classList.contains('hidden') ? 'Show Defaults' : 'Hide Defaults';
    });

    // --- My Defaults modal ---
    const openMyDefaults = () => {
      Config.renderMyDefaults();
      document.getElementById('modal-my-defaults').classList.remove('hidden');
    };
    document.getElementById('btn-my-defaults').addEventListener('click', openMyDefaults);
    document.getElementById('btn-my-defaults-editor').addEventListener('click', openMyDefaults);

    document.getElementById('btn-save-my-defaults').addEventListener('click', async () => {
      await Config.saveMyDefaults();
      App.closeModal('modal-my-defaults');
      if (App.currentProject) App.renderDefaultsBar();
    });

    document.getElementById('btn-cancel-my-defaults').addEventListener('click', () => {
      App.closeModal('modal-my-defaults');
    });

    // --- Settings modal ---
    const openSettings = () => {
      Config.renderFieldsConfig();
      Config.renderInstitutionDefaults();
      Config.renderTeam();

      // General tab
      const instNameInput = document.getElementById('settings-inst-name');
      if (instNameInput && Config.institutionData) {
        instNameInput.value = Config.institutionData.name;
      }
      const versionSelect = document.getElementById('settings-aspace-version');
      if (versionSelect && Config.institutionConfig) {
        versionSelect.value = Config.institutionConfig.aspace_version || '4.1';
      }

      document.getElementById('modal-settings').classList.remove('hidden');
    };
    document.getElementById('btn-settings').addEventListener('click', openSettings);
    document.getElementById('btn-settings-editor').addEventListener('click', openSettings);

    // Settings tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
        btn.classList.add('active');

        const panelMap = {
          'fields': 'tab-fields',
          'inst-defaults': 'tab-inst-defaults',
          'team': 'tab-team',
          'general': 'tab-general'
        };
        document.getElementById(panelMap[tab]).classList.remove('hidden');
      });
    });

    document.getElementById('btn-save-settings').addEventListener('click', async () => {
      await Config.saveSettings();
      App.closeModal('modal-settings');

      // Re-render form if in editor to reflect field changes
      if (App.currentProject && Form.currentEntry) {
        Form.renderEntry(Form.currentEntry);
      }
    });

    document.getElementById('btn-close-settings').addEventListener('click', () => {
      App.closeModal('modal-settings');
    });

    // Settings: regenerate invite code
    document.getElementById('btn-regenerate-code').addEventListener('click', () => {
      App.showConfirm(
        'Regenerate Invite Code',
        'This will invalidate the current code. Anyone who hasn\'t joined yet will need the new code.',
        async () => {
          const newCode = await DB.regenerateInviteCode(
            Auth.getInstitutionId(),
            Config.institutionData.invite_code,
            Config.institutionData.name
          );
          if (newCode) {
            Config.institutionData.invite_code = newCode;
            document.getElementById('settings-invite-code').textContent = newCode;
            document.getElementById('invite-code-display').textContent = newCode;
            App.showToast('Invite code regenerated.', 'success');
          }
        }
      );
    });

    // Settings: copy invite code
    document.getElementById('btn-copy-invite-settings').addEventListener('click', () => {
      const code = document.getElementById('settings-invite-code').textContent;
      navigator.clipboard.writeText(code).then(() => {
        App.showToast('Invite code copied!', 'success');
      });
    });

    // Settings: export/import config
    document.getElementById('btn-export-config').addEventListener('click', () => {
      Config.exportConfig();
    });

    document.getElementById('btn-import-config').addEventListener('click', () => {
      document.getElementById('input-import-config').click();
    });

    document.getElementById('input-import-config').addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        Config.importConfig(e.target.files[0]);
      }
    });

    // --- Validation modal close ---
    document.getElementById('btn-close-validation').addEventListener('click', () => {
      App.closeModal('modal-validation');
    });

    // Close buttons on all modals
    document.querySelectorAll('.btn-close').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.modal');
        if (modal) modal.classList.add('hidden');
      });
    });

    // Close modals on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
        }
      });
    });

    // --- Panel resize ---
    App.setupPanelResize();

    // --- Warn before unload with unsaved changes ---
    window.addEventListener('beforeunload', (e) => {
      if (App.isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  },

  // Setup dropdown toggle behavior
  setupDropdown(buttonId, dropdownId) {
    const btn = document.getElementById(buttonId);
    const dropdown = document.getElementById(dropdownId);
    if (!btn || !dropdown) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
      dropdown.classList.add('hidden');
    });
  },

  // Setup panel resize (drag the handle between tree and form)
  setupPanelResize() {
    const handle = document.getElementById('panel-resize');
    const tree = document.getElementById('panel-tree');
    if (!handle || !tree) return;

    let startX, startWidth;

    handle.addEventListener('mousedown', (e) => {
      startX = e.clientX;
      startWidth = tree.offsetWidth;
      handle.classList.add('dragging');

      function onMouseMove(e) {
        const newWidth = startWidth + (e.clientX - startX);
        if (newWidth >= 200 && newWidth <= 600) {
          tree.style.width = newWidth + 'px';
        }
      }

      function onMouseUp() {
        handle.classList.remove('dragging');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }
};

// ===== LAUNCH =====
document.addEventListener('DOMContentLoaded', () => App.init());
