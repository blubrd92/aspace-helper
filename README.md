# ASpace Helper

A browser-based tool for library archivists to prepare [ArchivesSpace](https://archivesspace.org/) bulk import spreadsheets. Built with vanilla JavaScript and Firebase.

## What It Does

ASpace Helper lets archivists collaboratively build hierarchical finding aid data (series, subseries, files, items) in a guided editor, then export a CSV that can be imported directly into ArchivesSpace via its bulk import tool.

**Key features:**

- Hierarchical tree editor for archival objects (drag to reorder, indent/outdent, add children/siblings)
- Field validation aligned with ArchivesSpace controlled vocabularies
- Smart defaults cascade: institution defaults, user defaults, project defaults
- Auto-increment folder numbers when adding sibling entries
- Date expression auto-parsing (year ranges, circa dates, "undated")
- CSV export formatted for ASpace's bulk importer (field code row, label row, data rows)
- Team collaboration with institution accounts, invite codes, and role management (admin/member)
- Project status workflow: In Progress, Ready for Review, Ready for Export, Exported
- Admin-configurable field visibility and vocabulary restrictions per institution

## Tech Stack

- **Frontend**: Vanilla JavaScript (no framework, no bundler)
- **Backend**: Firebase Authentication + Cloud Firestore
- **Hosting**: GitHub Pages (or any static host)
- **Testing**: Node.js built-in test runner + ESLint

No build step required. Open `index.html` or serve the directory statically.

## Getting Started

### Prerequisites

- A Firebase project with Authentication (Email/Password + Google) and Firestore enabled
- Node.js 18+ (for running tests and linting)

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/blubrd92/aspace-helper.git
   cd aspace-helper
   ```

2. Install dev dependencies:
   ```bash
   npm install
   ```

3. Update `js/firebase-config.js` with your Firebase project credentials.

4. Deploy Firestore security rules from `firestore.rules` via the Firebase console or CLI.

5. Open `index.html` in a browser, or serve with any static file server:
   ```bash
   npx serve .
   ```

### First Use

1. Create an account (email/password or Google sign-in)
2. Create a new institution or join an existing one with an invite code
3. Create a project, set the resource identifier (EAD ID or Resource URI)
4. Add entries using the tree editor, fill in fields, and export when ready

## Project Structure

```
index.html              -- Single HTML file with all views and modals
css/styles.css          -- All styles
firestore.rules         -- Firestore security rules

js/
  firebase-config.js    -- Firebase initialization
  field-registry.js     -- ASpace field definitions, categories, vocabularies
  auth.js               -- Authentication (email, Google, password reset)
  db.js                 -- Firestore CRUD operations
  config.js             -- Institution config, defaults, settings UI
  validation.js         -- Field, row, and spreadsheet validation
  tree.js               -- Hierarchy tree editor (left panel)
  form.js               -- Entry form (right panel)
  export.js             -- CSV export for ASpace bulk import
  app.js                -- Main app: init, routing, events
  smoke-test.js         -- Browser console diagnostic

tests/
  setup.js              -- Test harness (loads browser JS into Node via vm)
  field-registry.test.js
  validation.test.js
  export.test.js
  tree.test.js
```

## Development

### Run Lint + Tests

```bash
npm run check
```

Or individually:

```bash
npm run lint    # ESLint (0 errors expected, warnings are informational)
npm test        # Node.js test runner (122 tests)
```

### Browser Smoke Test

Open the browser console on the running app and run:

```js
ASpaceTest.runAll()
```

This checks DOM elements, Firebase connectivity, auth state, data integrity, and module availability.

### Architecture Notes

- **No frameworks, no bundler** -- vanilla JS with `const` objects as module namespaces (`App`, `Auth`, `DB`, `Config`, `Tree`, `Form`, `Validation`, `Export`)
- **Script load order matters** -- scripts in `index.html` load sequentially; `app.js` must be last
- **Views** are shown/hidden via `.view.active` CSS class (only one active at a time)
- **Modals** use `.hidden` class toggling, with Escape key support
- **Firestore errors** are caught and shown as user-friendly toasts via `DB._showError()`
- **XSS prevention** -- all user-controlled data is escaped via `_escapeHTML()` before innerHTML insertion
- **Defaults cascade** -- institution > user > project (most specific wins)

## CSV Export Format

The exported CSV follows ArchivesSpace's bulk import template:

| Row | Content |
|-----|---------|
| 1 | Field codes (first cell: "ArchivesSpace field code (please don't edit this row)") |
| 2 | Human-readable field labels (ignored by importer) |
| 3+ | Data rows (first cell empty, then field values) |

The resource identifier (EAD ID or Resource URI) is included on every data row for robustness. Controlled vocabulary values use the ASpace "Value" form (e.g., `cubic_feet`), not the "Translation" form.

## Security

- Firebase API keys in `firebase-config.js` are public client-side identifiers (not secrets)
- Data access is controlled by Firestore security rules (`firestore.rules`)
- All user-controlled text is HTML-escaped before DOM insertion to prevent XSS
- Destructive actions (delete project, leave institution) require typed confirmation
- Admin operations are enforced both client-side and in Firestore rules

## License

ISC
