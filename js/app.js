// app.js
// Main application initialization, routing, view management, and event wiring.

const App = {
  currentProject: null,
  isDirty: false,
  saveTimer: null,
  _projectUnsubscribe: null,  // onSnapshot listener teardown
  _projectCache: [],         // cached project list for client-side filtering
  _memberNameCache: {},      // uid -> display_name lookup
  _projectFilter: 'all',    // 'all' or 'mine'
  _projectSearch: '',        // current search query

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

  },

  async renderProjectList() {
    const institutionId = Auth.getInstitutionId();
    const projects = await DB.getProjectsByInstitution(institutionId);

    // Cache projects for client-side filtering
    App._projectCache = projects;

    // Build member name cache (uid -> display_name) for "created by" display
    const creatorUids = [...new Set(projects.map(p => p.created_by).filter(Boolean))];
    const uncachedUids = creatorUids.filter(uid => !App._memberNameCache[uid]);
    if (uncachedUids.length > 0) {
      const members = await DB.getUsersByInstitution(institutionId);
      for (const m of members) {
        App._memberNameCache[m.id] = m.display_name || m.email || 'Unknown';
      }
    }

    // Reset filter state
    App._projectFilter = 'all';
    App._projectSearch = '';
    const searchInput = document.getElementById('input-project-search');
    if (searchInput) searchInput.value = '';
    const allBtn = document.getElementById('btn-filter-all');
    const mineBtn = document.getElementById('btn-filter-mine');
    if (allBtn) allBtn.classList.add('active');
    if (mineBtn) mineBtn.classList.remove('active');

    App._renderFilteredProjects();
  },

  _renderFilteredProjects() {
    const container = document.getElementById('project-list');
    const emptyState = document.getElementById('empty-projects');
    if (!container) return;
    container.innerHTML = '';

    const projects = App._projectCache;

    if (projects.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    // Apply filters
    const search = App._projectSearch.toLowerCase();
    const currentUid = Auth.currentUser ? Auth.currentUser.uid : null;

    const filtered = projects.filter(project => {
      // Filter by ownership
      if (App._projectFilter === 'mine' && project.created_by !== currentUid) return false;
      // Filter by search text (match name or creator name)
      if (search) {
        const name = (project.name || '').toLowerCase();
        const creator = (App._memberNameCache[project.created_by] || '').toLowerCase();
        if (!name.includes(search) && !creator.includes(search)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div class="project-list-empty-filter">No projects match your search.</div>`;
      return;
    }

    for (const project of filtered) {
      const card = document.createElement('div');
      card.className = 'project-card';

      const entryCount = (project.entries || []).length;
      const updatedAt = project.updated_at
        ? new Date(project.updated_at.seconds * 1000).toLocaleDateString()
        : 'Never';
      const creatorName = App._memberNameCache[project.created_by] || '';
      const creatorSuffix = creatorName ? ` &middot; ${creatorName}` : '';

      card.innerHTML = `
        <div class="project-card-info">
          <h4>${project.name}</h4>
          <span class="project-card-meta">${entryCount} entries &middot; Updated ${updatedAt}${creatorSuffix}</span>
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

    // Watch for concurrent edits from other users
    App._watchProject(projectId);

    // Update UI
    document.getElementById('editor-project-name').textContent = project.name;
    const ridBadge = document.getElementById('editor-resource-id');
    if (project.resource_identifier) {
      ridBadge.textContent = project.resource_identifier;
      ridBadge.classList.remove('unset');
    } else {
      ridBadge.textContent = '(click to set resource ID)';
      ridBadge.classList.add('unset');
    }

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
      status: App.currentProject.status,
      resource_identifier: App.currentProject.resource_identifier || '',
      identifier_type: App.currentProject.identifier_type || 'res_uri'
    });

    if (success) {
      App.isDirty = false;
      App.updateSyncStatus('saved');
    } else {
      App.updateSyncStatus('error');
    }
  },

  // Listen for remote changes to the current project via Firestore onSnapshot.
  // Shows a warning toast if another user modifies the project while it's open.
  _watchProject(projectId) {
    App._unwatchProject();
    const currentUid = Auth.currentUser ? Auth.currentUser.uid : null;
    let firstSnapshot = true;

    App._projectUnsubscribe = db.collection('projects').doc(projectId)
      .onSnapshot((doc) => {
        // Skip the initial snapshot (it's just the current state)
        if (firstSnapshot) {
          firstSnapshot = false;
          return;
        }
        if (!doc.exists || !App.currentProject) return;

        const data = doc.data();
        if (data.updated_by && data.updated_by !== currentUid) {
          App.showToast(
            'Another team member just edited this project. Reload to see their changes.',
            'warning'
          );
        }
      }, (error) => {
        console.warn('Project watch listener failed:', error);
      });
  },

  _unwatchProject() {
    if (App._projectUnsubscribe) {
      App._projectUnsubscribe();
      App._projectUnsubscribe = null;
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
    document.getElementById('btn-onboarding-signout').addEventListener('click', () => Auth.signOut());

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

      // Create institution first so we have a real ID for the invite code
      const inviteCode = DB.generateInviteCode(name);
      const institutionId = await DB.createInstitution({ name, invite_code: inviteCode });
      if (!institutionId) {
        App.showToast('Failed to create institution.', 'error');
        return;
      }

      // Create invite code with all data in one shot (update rules are denied)
      let codeCreated = await DB.createInviteCode(inviteCode, institutionId, name);

      // Retry on collision (extremely unlikely)
      let attempts = 0;
      while (!codeCreated && attempts < 5) {
        const retryCode = DB.generateInviteCode(name);
        codeCreated = await DB.createInviteCode(retryCode, institutionId, name);
        if (codeCreated) {
          await DB.updateInstitution(institutionId, { invite_code: retryCode });
        }
        attempts++;
      }

      if (!codeCreated) {
        App.showToast('Failed to create invite code. Please try again.', 'error');
        return;
      }

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

      const instName = codeData.institution_name || 'Unknown Institution';

      document.getElementById('join-error').classList.add('hidden');
      document.getElementById('join-institution-name').textContent = instName;
      document.getElementById('join-confirm').classList.remove('hidden');
      document.getElementById('join-confirm').setAttribute('data-institution-id', codeData.institution_id);
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

    // --- Project List: Search & Filters ---
    document.getElementById('input-project-search').addEventListener('input', (e) => {
      App._projectSearch = e.target.value;
      App._renderFilteredProjects();
    });

    document.getElementById('btn-filter-all').addEventListener('click', () => {
      App._projectFilter = 'all';
      document.getElementById('btn-filter-all').classList.add('active');
      document.getElementById('btn-filter-mine').classList.remove('active');
      App._renderFilteredProjects();
    });

    document.getElementById('btn-filter-mine').addEventListener('click', () => {
      App._projectFilter = 'mine';
      document.getElementById('btn-filter-mine').classList.add('active');
      document.getElementById('btn-filter-all').classList.remove('active');
      App._renderFilteredProjects();
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

      // Reassign the leaving user's projects to another member
      await DB.reassignProjects(institutionId, uid);

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

    // --- Editor: Edit resource identifier ---
    document.getElementById('editor-resource-id').addEventListener('click', () => {
      if (!App.currentProject) return;

      const current = App.currentProject.resource_identifier || '';
      const currentType = App.currentProject.identifier_type || 'res_uri';
      const typeLabel = currentType === 'ead' ? 'EAD ID' : 'Resource URI';
      const placeholder = currentType === 'ead' ? 'e.g., MS-0042' : 'e.g., /repositories/2/resources/123';

      const newValue = prompt(`Enter ${typeLabel}:`, current);
      if (newValue === null) return; // cancelled

      App.currentProject.resource_identifier = newValue.trim();
      App.markDirty();

      const badge = document.getElementById('editor-resource-id');
      if (newValue.trim()) {
        badge.textContent = newValue.trim();
        badge.classList.remove('unset');
      } else {
        badge.textContent = '(click to set resource ID)';
        badge.classList.add('unset');
      }
    });

    // --- Editor: Back to projects ---
    document.getElementById('btn-back-projects').addEventListener('click', () => {
      if (App.isDirty) {
        App.autoSave(); // save before leaving
      }
      App._unwatchProject();
      App.currentProject = null;
      App.loadAndShowProjects();
    });

    document.getElementById('btn-back-to-projects').addEventListener('click', () => {
      if (App.isDirty) App.autoSave();
      App._unwatchProject();
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
            // Reset settings display to hidden state
            const settingsEl = document.getElementById('settings-invite-code');
            settingsEl.dataset.code = newCode;
            settingsEl.dataset.revealed = 'false';
            settingsEl.textContent = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
            document.getElementById('btn-reveal-invite-settings').textContent = 'Show';

            App.showToast('Invite code regenerated.', 'success');
          }
        }
      );
    });

    // Settings: reveal / copy invite code
    document.getElementById('btn-reveal-invite-settings').addEventListener('click', () => {
      const el = document.getElementById('settings-invite-code');
      const btn = document.getElementById('btn-reveal-invite-settings');
      if (el.dataset.revealed === 'true') {
        el.textContent = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
        el.dataset.revealed = 'false';
        btn.textContent = 'Show';
      } else {
        el.textContent = el.dataset.code;
        el.dataset.revealed = 'true';
        btn.textContent = 'Hide';
      }
    });

    document.getElementById('btn-copy-invite-settings').addEventListener('click', () => {
      const code = document.getElementById('settings-invite-code').dataset.code;
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
