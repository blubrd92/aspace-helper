# ASpace Helper — Claude Code Project Guide

## What This Is

A browser-based tool for library archivists to prepare ArchivesSpace bulk import data. It's a single-page app using vanilla JS + Firebase (Auth, Firestore). No build step — open `index.html` or serve it statically.

## Architecture

- **No frameworks, no bundler** — vanilla JS with global objects (`App`, `Auth`, `DB`, `Config`, `Tree`, `Form`, `Validation`, `Export`)
- **Firebase compat SDK** loaded via CDN in `index.html` (not modular imports)
- **Single HTML file** with multiple views toggled by `App.showView()`
- **Firestore security rules** in `firestore.rules` — deploy via Firebase console or CLI

## File Map

```
index.html              — All HTML views (login, onboarding, projects, editor, modals)
css/styles.css          — All styles (single file)
firestore.rules         — Firestore security rules
js/
  firebase-config.js    — Firebase init + config keys (public keys, not secrets)
  field-registry.js     — Field definitions, categories, vocabularies (ASpace schema)
  auth.js               — Auth module (email/password, Google, password reset)
  db.js                 — All Firestore CRUD (users, institutions, projects, invite codes)
  config.js             — Institution config, defaults, settings UI, team management
  validation.js         — Field/row/sheet validation logic
  tree.js               — Hierarchy tree (left panel in editor)
  form.js               — Entry form (right panel in editor)
  export.js             — CSV export
  app.js                — Main app: init, routing, view management, event wiring
```

**Script load order matters** — scripts in `index.html` load sequentially and depend on globals from earlier scripts. `app.js` must be last.

## Key Patterns

- **Views**: Shown/hidden via `.view.active` class. Only one active at a time.
- **Auth flow**: `Auth.onAuthStateChanged` → check user doc exists → onboarding or project list
- **Modals**: Shown by removing `.hidden` class. `App.showConfirm()` for simple confirms, dedicated modals for typed confirmations (delete project, leave institution).
- **Toasts**: `App.showToast(message, type)` — types: `'success'`, `'error'`, `'warning'`
- **Firestore errors**: All DB methods show toast on failure via `DB._showError()`. Return `null`/`[]`/`false` on error.
- **Defaults cascade**: institution defaults → user defaults → project defaults (most specific wins)
- **Last-admin protection**: `DB.isLastAdmin()` prevents demoting/removing the sole admin

## Common Gotchas

1. **Firestore composite indexes**: Never combine `.where()` + `.orderBy()` — requires an index that may not exist. Sort client-side instead.
2. **Toggle elements**: The `.toggle` component uses a `<label>` wrapping a hidden checkbox + styled slider. Use `<label>` (not `<div>`) or clicks won't reach the checkbox.
3. **CSS selector specificity**: `.field-config-row > label` targets the text label; `.toggle` is also a `<label>` but shouldn't get `flex: 1`.
4. **Firebase error swallowing**: All `catch` blocks return falsy values. Always check return values from DB methods and handle failures.
5. **Security rules**: Admin reads on users collection are scoped to same institution. Test cross-institution isolation.
6. **No build step**: Changes are live immediately — just refresh the browser. No compilation, no hot reload needed.

## Testing & Verification

### Quick Smoke Test
Open the browser console and run:
```js
ASpaceTest.runAll()
```
This runs a non-destructive diagnostic that checks DOM elements, Firebase connectivity, auth state, data integrity, and module availability. Results are logged to the console with PASS/FAIL/WARN for each check.

### Manual Verification Checklist
After making changes, verify:
- [ ] **Auth**: Sign in/out with email, Google sign-in, create account, forgot password
- [ ] **Onboarding**: Create institution, join with invite code
- [ ] **Projects**: Create, open, delete (typed confirmation), list refreshes
- [ ] **Editor**: Add entries, edit fields, hierarchy tree, defaults bar
- [ ] **Settings** (admin): Toggle fields, change institution defaults, team management
- [ ] **Last-admin guard**: Can't demote/remove sole admin, can't leave as sole admin
- [ ] **Validation**: Required fields flagged, controlled vocabularies enforced
- [ ] **Export**: CSV export with correct columns and data

### What to Check After Firestore Rule Changes
1. Can a member read their own user doc?
2. Can a member read another institution's data? (should fail)
3. Can an admin change roles in their institution?
4. Can a non-admin change roles? (should fail)
5. Can a user self-update without changing role/institution_id?
6. Does project CRUD work for members? Does delete fail for non-admins?

## Conventions

- No TypeScript, no JSX — plain JS with `const` objects as modules
- CSS uses custom properties defined in `:root` (see top of `styles.css`)
- IDs for JS-targeted elements, classes for styling
- `data-*` attributes for dynamic element identification (e.g., `data-field-id`, `data-delete-project`)
- Error messages should be human-readable, never show raw Firebase error codes to users
- Destructive actions require typed confirmation (project deletion, leaving institution)
