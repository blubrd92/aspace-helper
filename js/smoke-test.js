// smoke-test.js
// Non-destructive diagnostic utility for LLM coders to verify app health.
// Run in browser console: ASpaceTest.runAll()
// Or run individual checks: ASpaceTest.checkDOM(), ASpaceTest.checkFirebase(), etc.

const ASpaceTest = {
  _results: [],
  _pass: 0,
  _fail: 0,
  _warn: 0,

  _log(status, category, message) {
    const icon = status === 'PASS' ? '\u2705' : status === 'FAIL' ? '\u274C' : '\u26A0\uFE0F';
    const entry = `${icon} [${status}] ${category}: ${message}`;
    ASpaceTest._results.push(entry);
    if (status === 'PASS') ASpaceTest._pass++;
    else if (status === 'FAIL') ASpaceTest._fail++;
    else ASpaceTest._warn++;

    if (status === 'FAIL') console.error(entry);
    else if (status === 'WARN') console.warn(entry);
    else console.log(entry);
  },

  pass(cat, msg) { ASpaceTest._log('PASS', cat, msg); },
  fail(cat, msg) { ASpaceTest._log('FAIL', cat, msg); },
  warn(cat, msg) { ASpaceTest._log('WARN', cat, msg); },

  // ===== DOM CHECKS =====
  checkDOM() {
    console.group('DOM Checks');

    // Views
    const views = ['view-login', 'view-onboarding', 'view-projects', 'view-editor'];
    for (const id of views) {
      document.getElementById(id)
        ? ASpaceTest.pass('DOM', `View #${id} exists`)
        : ASpaceTest.fail('DOM', `View #${id} MISSING`);
    }

    // Check exactly one view is active
    const activeViews = document.querySelectorAll('.view.active');
    activeViews.length === 1
      ? ASpaceTest.pass('DOM', `Exactly 1 active view: #${activeViews[0].id}`)
      : ASpaceTest.fail('DOM', `Expected 1 active view, found ${activeViews.length}`);

    // Auth forms
    const authForms = ['auth-signin', 'auth-create', 'auth-forgot', 'auth-loading'];
    for (const id of authForms) {
      document.getElementById(id)
        ? ASpaceTest.pass('DOM', `Auth form #${id} exists`)
        : ASpaceTest.fail('DOM', `Auth form #${id} MISSING`);
    }

    // Key buttons
    const buttons = [
      'btn-signin', 'btn-create-account', 'btn-google-signin', 'btn-google-signup',
      'btn-send-reset', 'btn-signout', 'btn-new-project', 'btn-add-entry',
      'btn-validate-all', 'btn-export-csv', 'btn-leave-from-profile',
      'btn-confirm-delete-project', 'btn-confirm-leave'
    ];
    for (const id of buttons) {
      document.getElementById(id)
        ? ASpaceTest.pass('DOM', `Button #${id} exists`)
        : ASpaceTest.fail('DOM', `Button #${id} MISSING`);
    }

    // Modals
    const modals = [
      'modal-new-project', 'modal-validation', 'modal-my-defaults',
      'modal-settings', 'modal-confirm', 'modal-delete-project',
      'modal-leave-institution'
    ];
    for (const id of modals) {
      const el = document.getElementById(id);
      if (!el) {
        ASpaceTest.fail('DOM', `Modal #${id} MISSING`);
      } else if (!el.classList.contains('hidden')) {
        ASpaceTest.warn('DOM', `Modal #${id} is visible (expected hidden)`);
      } else {
        ASpaceTest.pass('DOM', `Modal #${id} exists and hidden`);
      }
    }

    // Password toggle buttons
    const toggles = document.querySelectorAll('.btn-toggle-password');
    toggles.length >= 3
      ? ASpaceTest.pass('DOM', `${toggles.length} password toggle buttons found`)
      : ASpaceTest.fail('DOM', `Expected 3+ password toggles, found ${toggles.length}`);

    // Toggle elements are <label> not <div>
    const fieldToggles = document.querySelectorAll('.toggle');
    let toggleTagIssues = 0;
    fieldToggles.forEach(t => {
      if (t.tagName !== 'LABEL') toggleTagIssues++;
    });
    if (fieldToggles.length === 0) {
      ASpaceTest.warn('DOM', 'No .toggle elements found (settings not open?)');
    } else if (toggleTagIssues > 0) {
      ASpaceTest.fail('DOM', `${toggleTagIssues} toggle(s) are not <label> — clicks won't work`);
    } else {
      ASpaceTest.pass('DOM', `All ${fieldToggles.length} toggles are <label> elements`);
    }

    console.groupEnd();
  },

  // ===== MODULE CHECKS =====
  checkModules() {
    console.group('Module Checks');

    const modules = {
      'App': ['init', 'showView', 'showToast', 'showConfirm', 'showAuthForm', 'showDeleteProjectModal'],
      'Auth': ['signInWithEmail', 'createAccountWithEmail', 'signInWithGoogle', 'sendPasswordReset', 'signOut', 'isAdmin', 'getInstitutionId'],
      'DB': ['getUser', 'createUser', 'updateUser', 'deleteUser', 'isLastAdmin', 'getInstitution', 'createInstitution', 'getProjectsByInstitution', 'createProject', 'deleteProject', '_showError'],
      'Config': ['loadInstitution', 'renderFieldsConfig', 'renderTeam', 'saveSettings'],
      'Validation': ['validateField'],
      'Tree': ['addEntry', 'deleteEntry'],
      'Form': ['renderEntry', 'saveCurrentEntry'],
      'Export': ['downloadCSV']
    };

    for (const [name, methods] of Object.entries(modules)) {
      const mod = window[name];
      if (!mod) {
        ASpaceTest.fail('Module', `${name} is not defined`);
        continue;
      }
      ASpaceTest.pass('Module', `${name} exists`);
      for (const method of methods) {
        typeof mod[method] === 'function'
          ? ASpaceTest.pass('Module', `${name}.${method}() exists`)
          : ASpaceTest.fail('Module', `${name}.${method}() MISSING`);
      }
    }

    console.groupEnd();
  },

  // ===== FIREBASE CHECKS =====
  async checkFirebase() {
    console.group('Firebase Checks');

    // Firebase loaded
    if (typeof firebase === 'undefined') {
      ASpaceTest.fail('Firebase', 'firebase SDK not loaded');
      console.groupEnd();
      return;
    }
    ASpaceTest.pass('Firebase', 'SDK loaded');

    // App initialized
    try {
      const app = firebase.app();
      ASpaceTest.pass('Firebase', `App initialized: ${app.options.projectId}`);
    } catch (e) {
      ASpaceTest.fail('Firebase', 'App not initialized');
      console.groupEnd();
      return;
    }

    // Auth available
    if (typeof auth !== 'undefined' && auth) {
      ASpaceTest.pass('Firebase', 'Auth service available');
    } else {
      ASpaceTest.fail('Firebase', 'Auth service not available');
    }

    // Firestore available
    if (typeof db !== 'undefined' && db) {
      ASpaceTest.pass('Firebase', 'Firestore service available');
    } else {
      ASpaceTest.fail('Firebase', 'Firestore service not available');
    }

    // Auth state
    const user = auth.currentUser;
    if (user) {
      ASpaceTest.pass('Firebase', `Signed in as: ${user.email} (${user.uid})`);
    } else {
      ASpaceTest.warn('Firebase', 'Not signed in — auth-dependent checks will be limited');
    }

    // Firestore connectivity (read own user doc if signed in)
    if (user) {
      try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists) {
          const data = userDoc.data();
          ASpaceTest.pass('Firebase', `User doc exists — role: ${data.role}, institution: ${data.institution_id}`);
        } else {
          ASpaceTest.warn('Firebase', 'User doc does not exist (new user, needs onboarding)');
        }
      } catch (e) {
        ASpaceTest.fail('Firebase', `Cannot read user doc: ${e.code || e.message}`);
      }
    }

    console.groupEnd();
  },

  // ===== AUTH STATE CHECKS =====
  checkAuthState() {
    console.group('Auth State Checks');

    if (!Auth.currentUser) {
      ASpaceTest.warn('Auth', 'No current user — skipping auth state checks');
      console.groupEnd();
      return;
    }

    ASpaceTest.pass('Auth', `Auth.currentUser set: ${Auth.currentUser.email}`);

    if (Auth.userData) {
      ASpaceTest.pass('Auth', `Auth.userData loaded — role: ${Auth.userData.role}`);

      if (Auth.userData.institution_id) {
        ASpaceTest.pass('Auth', `Institution ID: ${Auth.userData.institution_id}`);
      } else {
        ASpaceTest.warn('Auth', 'No institution_id — user needs onboarding');
      }

      // Verify isAdmin matches
      const isAdmin = Auth.isAdmin();
      const expectedAdmin = Auth.userData.role === 'admin';
      isAdmin === expectedAdmin
        ? ASpaceTest.pass('Auth', `isAdmin() = ${isAdmin} (matches role)`)
        : ASpaceTest.fail('Auth', `isAdmin() = ${isAdmin} but role = ${Auth.userData.role}`);
    } else {
      ASpaceTest.warn('Auth', 'Auth.userData is null — user may need onboarding');
    }

    console.groupEnd();
  },

  // ===== DATA INTEGRITY CHECKS =====
  async checkData() {
    console.group('Data Integrity Checks');

    if (!Auth.currentUser || !Auth.userData || !Auth.userData.institution_id) {
      ASpaceTest.warn('Data', 'Not signed in to an institution — skipping data checks');
      console.groupEnd();
      return;
    }

    const instId = Auth.userData.institution_id;

    // Load institution
    const inst = await DB.getInstitution(instId);
    if (inst) {
      ASpaceTest.pass('Data', `Institution loaded: "${inst.name}"`);

      if (inst.invite_code) {
        ASpaceTest.pass('Data', `Invite code: ${inst.invite_code}`);
      } else {
        ASpaceTest.warn('Data', 'No invite code set');
      }

      if (inst.config && inst.config.enabled_fields) {
        ASpaceTest.pass('Data', `${inst.config.enabled_fields.length} fields enabled`);
      } else {
        ASpaceTest.warn('Data', 'No field config found');
      }
    } else {
      ASpaceTest.fail('Data', `Cannot load institution ${instId}`);
    }

    // Load team
    const users = await DB.getUsersByInstitution(instId);
    if (users.length > 0) {
      const admins = users.filter(u => u.role === 'admin');
      ASpaceTest.pass('Data', `${users.length} team member(s), ${admins.length} admin(s)`);

      if (admins.length === 0) {
        ASpaceTest.fail('Data', 'NO ADMINS — institution is locked out of settings');
      }
    } else {
      ASpaceTest.fail('Data', 'No users found for this institution');
    }

    // Load projects
    const projects = await DB.getProjectsByInstitution(instId);
    ASpaceTest.pass('Data', `${projects.length} project(s) found`);

    for (const project of projects) {
      const issues = [];
      if (!project.name) issues.push('missing name');
      if (!project.institution_id) issues.push('missing institution_id');
      if (!project.created_by) issues.push('missing created_by');

      if (issues.length > 0) {
        ASpaceTest.warn('Data', `Project "${project.name || project.id}" has issues: ${issues.join(', ')}`);
      }
    }

    console.groupEnd();
  },

  // ===== CSS / LAYOUT CHECKS =====
  checkCSS() {
    console.group('CSS Checks');

    // Check CSS custom properties are defined
    const root = getComputedStyle(document.documentElement);
    const vars = ['--color-primary', '--color-error', '--color-bg', '--font-sans'];
    for (const v of vars) {
      root.getPropertyValue(v).trim()
        ? ASpaceTest.pass('CSS', `${v} is defined`)
        : ASpaceTest.fail('CSS', `${v} is NOT defined`);
    }

    // Check toggle sizing
    const toggles = document.querySelectorAll('.toggle');
    let oversizedToggles = 0;
    toggles.forEach(t => {
      if (t.offsetWidth > 50) oversizedToggles++;
    });
    if (toggles.length > 0 && oversizedToggles > 0) {
      ASpaceTest.fail('CSS', `${oversizedToggles} toggle(s) wider than 50px — layout issue`);
    } else if (toggles.length > 0) {
      ASpaceTest.pass('CSS', 'All toggles properly sized');
    }

    console.groupEnd();
  },

  // ===== FIELD REGISTRY CHECKS =====
  checkFieldRegistry() {
    console.group('Field Registry Checks');

    if (typeof FIELD_REGISTRY === 'undefined') {
      ASpaceTest.fail('Fields', 'FIELD_REGISTRY not defined');
      console.groupEnd();
      return;
    }

    ASpaceTest.pass('Fields', `${FIELD_REGISTRY.length} fields registered`);

    const requiredFields = FIELD_REGISTRY.filter(f => f.required);
    ASpaceTest.pass('Fields', `${requiredFields.length} required field(s)`);

    // Check all fields have required properties
    let malformed = 0;
    for (const field of FIELD_REGISTRY) {
      if (!field.id || !field.label || !field.aspace_code || !field.category) {
        malformed++;
        ASpaceTest.fail('Fields', `Field "${field.id || 'UNNAMED'}" missing required properties`);
      }
    }
    if (malformed === 0) {
      ASpaceTest.pass('Fields', 'All fields have id, label, aspace_code, category');
    }

    // Check for duplicate IDs
    const ids = FIELD_REGISTRY.map(f => f.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length > 0) {
      ASpaceTest.fail('Fields', `Duplicate field IDs: ${[...new Set(dupes)].join(', ')}`);
    } else {
      ASpaceTest.pass('Fields', 'No duplicate field IDs');
    }

    console.groupEnd();
  },

  // ===== RUN ALL =====
  async runAll() {
    ASpaceTest._results = [];
    ASpaceTest._pass = 0;
    ASpaceTest._fail = 0;
    ASpaceTest._warn = 0;

    console.log('%c=== ASpace Helper Smoke Test ===', 'font-size: 16px; font-weight: bold; color: #2c5282;');
    console.log('Running non-destructive diagnostics...\n');

    ASpaceTest.checkDOM();
    ASpaceTest.checkModules();
    ASpaceTest.checkFieldRegistry();
    ASpaceTest.checkCSS();
    await ASpaceTest.checkFirebase();
    ASpaceTest.checkAuthState();
    await ASpaceTest.checkData();

    console.log('\n%c=== Summary ===', 'font-size: 14px; font-weight: bold;');
    console.log(`%c  ${ASpaceTest._pass} passed`, 'color: green; font-weight: bold;');
    if (ASpaceTest._warn > 0) console.log(`%c  ${ASpaceTest._warn} warnings`, 'color: orange; font-weight: bold;');
    if (ASpaceTest._fail > 0) console.log(`%c  ${ASpaceTest._fail} FAILED`, 'color: red; font-weight: bold;');
    console.log(`  ${ASpaceTest._pass + ASpaceTest._warn + ASpaceTest._fail} total checks`);

    return {
      pass: ASpaceTest._pass,
      warn: ASpaceTest._warn,
      fail: ASpaceTest._fail,
      results: ASpaceTest._results
    };
  }
};
