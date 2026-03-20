// tests/setup.js
// Loads the vanilla JS source files into Node for testing.
// Provides minimal browser-global stubs so the files parse without error.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Minimal stubs for browser globals the source files reference at parse time
const browserStubs = {
  document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null, createElement: () => ({ addEventListener: () => {} }) },
  window: {},
  console,
  firebase: { firestore: { FieldValue: { serverTimestamp: () => new Date() } }, app: () => ({}) },
  auth: { currentUser: null, onAuthStateChanged: () => {} },
  db: { collection: () => ({ doc: () => ({}), where: () => ({}) }) },
  googleProvider: {},
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Date,
  Array,
  Object,
  String,
  Number,
  JSON,
  Map,
  Set,
  RegExp,
  Error,
  Promise,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  encodeURIComponent,
  decodeURIComponent,
  URL: typeof URL !== 'undefined' ? URL : class {}
};

/**
 * Load JS source files into a shared context and return accessible globals.
 * Uses a wrapper to capture `const` declarations that vm.createContext can't expose directly.
 */
function loadSourceFiles(...filenames) {
  // Build a single script that loads all files and exposes key globals
  const context = vm.createContext({ ...browserStubs });

  for (const filename of filenames) {
    const filePath = path.join(__dirname, '..', 'js', filename);
    const code = fs.readFileSync(filePath, 'utf-8');
    // Wrap in a function to avoid const scoping issues, then assign to globalThis
    const wrappedCode = `
      (function() {
        ${code}
        // Expose top-level const/function declarations to the context
        if (typeof FIELD_REGISTRY !== 'undefined') globalThis.FIELD_REGISTRY = FIELD_REGISTRY;
        if (typeof FIELD_CATEGORIES !== 'undefined') globalThis.FIELD_CATEGORIES = FIELD_CATEGORIES;
        if (typeof HIDDEN_FORM_FIELDS !== 'undefined') globalThis.HIDDEN_FORM_FIELDS = HIDDEN_FORM_FIELDS;
        if (typeof getFieldById !== 'undefined') globalThis.getFieldById = getFieldById;
        if (typeof getFieldByAspaceCode !== 'undefined') globalThis.getFieldByAspaceCode = getFieldByAspaceCode;
        if (typeof getFieldsByCategory !== 'undefined') globalThis.getFieldsByCategory = getFieldsByCategory;
        if (typeof getDefaultEnabledFields !== 'undefined') globalThis.getDefaultEnabledFields = getDefaultEnabledFields;
        if (typeof getDefaultableFields !== 'undefined') globalThis.getDefaultableFields = getDefaultableFields;
        if (typeof Validation !== 'undefined') globalThis.Validation = Validation;
        if (typeof App !== 'undefined') globalThis.App = App;
        if (typeof Auth !== 'undefined') globalThis.Auth = Auth;
        if (typeof DB !== 'undefined') globalThis.DB = DB;
        if (typeof Config !== 'undefined') globalThis.Config = Config;
        if (typeof Tree !== 'undefined') globalThis.Tree = Tree;
        if (typeof Form !== 'undefined') globalThis.Form = Form;
        if (typeof Export !== 'undefined') globalThis.Export = Export;
      })();
    `;
    vm.runInContext(wrappedCode, context, { filename: filePath });
  }

  return context;
}

module.exports = { loadSourceFiles };
