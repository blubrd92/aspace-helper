# ASpace Helper: Claude Code Build Prompt

## What This Document Is

This is a build prompt for Claude Code to create the first version of ASpace Helper, a browser-based tool that helps archivists and library staff prepare data for import into ArchivesSpace (commonly called "ASpace"), an open-source archives management application. The tool outputs properly formatted CSV/Excel spreadsheets that conform to ASpace's bulk import template specification.

This prompt was developed through extensive research into ArchivesSpace's import system, known usability problems, community workarounds, and the specific pain points experienced by working archivists. The developer (Javi) is a proficient vibe coder, not a professional programmer. Explain technical decisions clearly in comments. Prioritize readable, maintainable code over cleverness.

---

## The Problem This Tool Solves

ArchivesSpace is powerful archival management software used by hundreds of institutions. Its spreadsheet bulk import feature allows staff to create archival objects (the components of a finding aid: series, subseries, files, items) by uploading a CSV or Excel file. However:

1. **The import template is overwhelming.** It contains 50-80+ columns. Most institutions use 15-25 regularly. Presenting all columns to new staff causes paralysis.

2. **ASpace's terminology doesn't match archival terminology.** What archivists call a "Collection" ASpace calls a "Resource." Everything below that (series, subseries, file, item) ASpace generically calls an "Archival Object." Staff must mentally translate between professional vocabulary and software vocabulary constantly.

3. **Validation failures are common and opaque.** Wrong date formats, misspelled controlled vocabulary terms, hierarchy logic errors, missing required fields, and character encoding problems cause imports to fail. Error messages reference ASpace's internal JSON data model rather than telling staff what they did wrong in plain language. A single error can cascade and cause dozens of rows to fail.

4. **The hierarchy is represented as a number in a flat column.** The parent-child relationships between series, subseries, and files are encoded as integers (1, 2, 3...) in a "hierarchy" column. This is error-prone and unintuitive. Users can create impossible hierarchies (e.g., jumping from level 1 to level 3 with no level 2) with no warning until import fails.

5. **Fear of breaking things prevents adoption.** Staff who have experienced failed imports, lost work, or accidentally created bad data in ASpace become reluctant to use the system at all. The tool must make it impossible to produce an invalid spreadsheet.

## What This Tool Does

ASpace Helper is a **browser-based team application** (GitHub Pages + Firebase) that:

- Presents a friendly, intuitive interface using archival terminology
- Lets users enter data for archival objects with built-in guidance
- Represents hierarchy visually (tree/nesting) rather than as raw numbers
- Enforces validation rules at the point of entry, not after the fact
- Allows institutional admins to configure which fields are visible (toggle on/off), with that configuration shared automatically to all team members
- Supports multiple concurrent projects (e.g., one per collection being described)
- Persists all work to Firebase so nothing is lost and staff can work across devices
- Exports a properly formatted CSV or Excel file ready for ASpace's bulk import
- Runs a final validation pass before export and reports issues in plain language

The tool lives entirely upstream of ASpace. It does not interact with ASpace's API or require access to any ASpace instance. It produces files; ASpace consumes them. Firebase handles authentication, shared configuration, and data persistence. All export/validation logic runs client-side.

---

## Architecture

### Three-Layer Design

#### 1. Field Registry (`field-registry.json`)

A single JSON file that defines every field ASpace's bulk import template supports. This is the single source of truth. When ASpace releases a new version with template changes, only this file needs updating.

Each field entry contains:

```json
{
  "id": "unique_field_id",
  "aspace_code": "the_exact_csv_column_header_aspace_expects",
  "label": "Human-readable label in archival language",
  "help_text": "Plain-language explanation of what goes here, with examples",
  "type": "text|number|date|select|multiline",
  "required": true|false,
  "category": "structure|description|dates|containers|notes|agents|subjects|digital_objects",
  "default_value": null,
  "validation": {
    "controlled_vocabulary": null|["list", "of", "accepted", "values"],
    "pattern": null|"regex_pattern",
    "min": null|number,
    "max": null|number,
    "date_format": null|"YYYY-MM-DD|YYYY",
    "custom_rule": null|"rule_name"
  },
  "aspace_version_introduced": "2.8.0",
  "enabled_by_default": true|false,
  "supports_default": true|false
}
```

#### 2. Configuration Layer

Stored in Firestore under the institution's document. Shared automatically with all team members. Contains:

- Which fields are enabled/disabled (toggles)
- Custom help text overrides per field
- Custom default values per field
- Institution name and branding (appears on exported spreadsheets as a comment/metadata row)
- Target ASpace version (for future version-specific registry support)
- Custom controlled vocabulary additions (institution-specific extent types, etc.)

An admin/settings panel lets the archivist (the person who understands ASpace) configure the tool for their staff. Configuration changes propagate to all team members. Staff with a "member" role see only the data entry interface with the fields the admin has enabled. The admin role is assigned per institution in Firestore.

Configuration can also be exported as JSON for backup or sharing with other institutions, and imported to bootstrap a new institution's setup.

#### 3. Data Entry Interface

What staff actually interact with. Features:

- **Visual hierarchy builder**: A tree/outline view where users add items at different levels. Dragging or nesting determines hierarchy. The tool calculates the hierarchy numbers automatically for export.
- **Smart forms**: Only enabled fields appear. Controlled vocabulary fields render as dropdowns. Date fields use date pickers with format enforcement. Required fields are visually marked.
- **Inline validation**: Errors appear next to the field in real time, in plain language.
- **Row-by-row entry**: Each archival object is a discrete entry. Users can reorder, nest, and rearrange entries in the tree view.
- **Pre-export validation**: A final check that scans all entries and produces a plain-language report of any issues before generating the file.

#### 4. Defaults System

Defaults eliminate repetitive data entry by pre-filling fields on new entries. They cascade in three tiers, where each tier overrides the one above it:

**Tier 1: Institution Defaults** (stored on the institution document in Firestore, set by admin)

These are the "house style" values. They apply to every user and every project as the baseline. Set once, rarely changed. Examples:
- `instance_type`: "mixed_materials" (most common across all archival collections)
- `top_container_type`: "box"
- `child_type`: "folder"
- `dates_label`: "creation"
- `publish`: "TRUE"
- `extent_type`: "linear_feet" (or "cubic_feet", depends on institution)
- `extent_portion`: "whole"
- `subject_source`: "lcsh"
- `agent_role`: "creator"

Admin sets these in the Settings/Configuration panel. They represent "unless you have a reason to do something different, use these values."

**Tier 2: User Defaults** (stored on the user document in Firestore, set by each user)

Each staff member can customize their own defaults based on the kind of work they typically do. These override institution defaults for that user. Stored per user account so they persist across projects and sessions.

A user who primarily processes photograph collections might set:
- `extent_type`: "photographic_prints"
- `dates_type`: "single" (individual photos often have single dates)

A user who handles administrative records might keep all the institution defaults as-is.

Users manage their personal defaults from a "My Defaults" panel accessible from their user menu. The interface should show the institution default alongside their override so they know what they're changing from.

**Tier 3: Project Defaults** (stored on the project document in Firestore, set by anyone working on the project)

These are "for this specific collection right now" values. They override both institution and user defaults within this project. They change as you work through a collection. Examples:
- `level`: "file" (you're adding 40 file-level entries under a series)
- `top_container_indicator`: "3" (you're currently working in Box 3)
- `dates_type`: "inclusive" (everything in this series has date ranges)

Project defaults are shown in a small, collapsible "Current Defaults" bar at the top of the data entry view. Quick to change, immediately reflected in the next new entry.

**Critical behavior:**
- When a user creates a new archival object entry, all fields with an active default (from any tier) are pre-filled.
- The user can always override any pre-filled value on a per-entry basis. Overrides do not change the defaults.
- Changing a default (at any tier) affects only NEW entries created after the change. It never retroactively modifies existing entries. This is essential: staff must trust that changing a default won't silently alter work they've already done.
- The "Current Defaults" bar in the project view should clearly indicate which defaults are active and where they come from (institution, user, or project) so behavior is never mysterious.
- A "Reset entry to defaults" button on each entry re-applies the current defaults to that entry, replacing its current values. This is useful if someone made a mistake and wants to start an entry fresh.

**Which fields support defaults:**

Not every field should have a default. Defaults make sense for fields where:
- The value is the same for many entries in a row (container types, box numbers, date labels)
- The value is institution-standard (instance type, extent type, publish status)
- Entering the wrong default is easily caught and corrected (a wrong box number is visible; a wrong title is not)

Fields that should NOT have defaults:
- `title` (every entry has a unique title)
- `date_begin`, `date_end`, `date_expression` (dates are entry-specific)
- `component_id` (must be unique)
- Note content fields (always entry-specific)
- `hierarchy` (auto-calculated from tree position, never manually set)

In the field registry, add a `supports_default: true|false` property to each field definition to control this.

---

## Technical Stack

- **Vanilla JavaScript, HTML, CSS.** No frameworks. This follows the same pattern as the developer's other tools (Booklist Maker, library reservation system). Must be maintainable by someone who reads code but doesn't architect systems.
- **Firebase** for backend services. The developer has experience with Firebase from building a library reservation system. Use:
  - **Firebase Auth** with Google sign-in for authentication. Most library staff have Google accounts. Keep it simple: sign in with Google, that's it.
  - **Cloud Firestore** for data persistence (shared configuration, projects, user profiles). Firestore's real-time listeners are useful for keeping shared config in sync but are not required for MVP; standard reads/writes are sufficient.
  - **Firebase Security Rules** to ensure users can only access their own institution's data.
- **SheetJS (xlsx)** for Excel export. Load via CDN: `https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js`
- **GitHub Pages** for hosting. Static files only; all dynamic behavior comes from Firebase.
- **No custom server, no cloud functions for MVP.** All logic runs client-side. Firebase provides persistence and auth only.

---

## Field Registry: Complete Field Set

Below is the field registry based on the ASpace bulk import template (version 2.8.0+, which is current core code). This should be built as a complete JSON structure. Fields marked `enabled_by_default: true` are the most commonly used across institutions.

### Structure Fields (category: "structure")

| aspace_code | label | type | required | controlled_vocabulary | enabled_by_default | notes |
|---|---|---|---|---|---|---|
| `res_uri` | Resource URI | text | yes (one of res_uri or ead_id required per spreadsheet) | null | true | The URI of the parent Resource record in ASpace (e.g., `/repositories/2/resources/123`). Only needs to appear on the first row. |
| `ead_id` | EAD ID | text | yes (alternative to res_uri) | null | true | The EAD identifier of the parent Resource. Alternative to Resource URI. Only needs to appear on the first row. |
| `hierarchy` | Level in Hierarchy | number | yes | null | true | Auto-calculated by the tool from the visual tree. 1 = top level (series), 2 = child of 1 (subseries), 3 = child of 2 (file), etc. |
| `level` | Level of Description | select | yes | `["class", "collection", "file", "fonds", "item", "otherlevel", "recordgrp", "series", "subfonds", "subgrp", "subseries"]` | true | Must be exact lowercase string. |
| `other_level` | Other Level | text | no | null | false | Only used when level is "otherlevel". |
| `publish` | Publish | select | no | `["TRUE", "FALSE"]` | true | Whether this archival object is visible in the public interface. |
| `component_id` | Component Unique Identifier | text | no | null | false | Optional local identifier for this component. |

### Description Fields (category: "description")

| aspace_code | label | type | required | controlled_vocabulary | enabled_by_default | notes |
|---|---|---|---|---|---|---|
| `title` | Title | text | yes (title or date required) | null | true | The name/title of this component (e.g., "Correspondence", "Photographs, 1960-1975"). |
| `restrictions_apply` | Restrictions Apply | select | no | `["TRUE", "FALSE"]` | false | Flag indicating access or use restrictions. |

### Date Fields (category: "dates")

Dates are repeatable. The template supports multiple date entries. Each set has these fields:

| aspace_code | label | type | required | controlled_vocabulary | enabled_by_default | notes |
|---|---|---|---|---|---|---|
| `dates_label` | Date Label | select | yes (if any date field is filled) | `["agent_relation", "broadcast", "copyright", "creation", "deaccession", "digitized", "event", "existence", "issued", "modified", "other", "publication", "record_keeping"]` | true | Usually "creation" for most archival materials. |
| `dates_type` | Date Type | select | yes (if any date field is filled) | `["bulk", "inclusive", "single"]` | true | "inclusive" for date ranges, "single" for single dates, "bulk" for bulk dates. |
| `dates_certainty` | Date Certainty | select | no | `["approximate", "inferred", "questionable"]` | false | Leave blank if dates are known. |
| `date_expression` | Date Expression | text | no | null | true | Human-readable date display (e.g., "circa 1960-1975", "undated", "1945 March 12"). Freeform text. |
| `date_begin` | Date Begin | text | yes (if dates_type is "inclusive" or "bulk") | null | true | Normalized start date. Format: YYYY or YYYY-MM or YYYY-MM-DD. |
| `date_end` | Date End | text | yes (if dates_type is "inclusive" or "bulk") | null | true | Normalized end date. Must be same or after date_begin. Format: YYYY or YYYY-MM or YYYY-MM-DD. |

**Validation rules for dates:**
- If any date field is populated, `dates_label` and `dates_type` are required.
- If `dates_type` is "inclusive" or "bulk", both `date_begin` and `date_end` are required.
- If `dates_type` is "single", `date_begin` is required, `date_end` should be empty.
- `date_end` must not precede `date_begin`.
- `date_begin` and `date_end` must match pattern: `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`.
- Title OR at least one date is required per archival object. Both can be present.

### Extent Fields (category: "extents")

| aspace_code | label | type | required | controlled_vocabulary | enabled_by_default | notes |
|---|---|---|---|---|---|---|
| `extent_portion` | Extent Portion | select | yes (if any extent field is filled) | `["part", "whole"]` | false | Usually "whole" unless describing only part of the materials at this level. |
| `extent_number` | Extent Number | text | no | null | false | Numeric value (e.g., "3", "1.5"). |
| `extent_type` | Extent Type | select | yes (if extent_number is filled) | `["cassettes", "cubic_feet", "files", "gigabytes", "leaves", "linear_feet", "megabytes", "photographic_prints", "photographic_slides", "reels", "sheets", "terabytes", "volumes"]` | false | Note: this list may vary by institution. Some institutions add custom extent types. |
| `container_summary` | Container Summary | text | no | null | false | Freeform summary of containers (e.g., "3 boxes, 1 oversize folder"). |
| `physical_details` | Physical Details | text | no | null | false | Physical characteristics (e.g., "black and white photographs"). |
| `dimensions` | Dimensions | text | no | null | false | Physical dimensions if relevant. |

### Container/Instance Fields (category: "containers")

| aspace_code | label | type | required | controlled_vocabulary | enabled_by_default | notes |
|---|---|---|---|---|---|---|
| `instance_type` | Instance Type | select | yes (if any container fields are filled) | `["accession", "audio", "books", "computer_disks", "digital_object", "digital_object_link", "graphic_materials", "maps", "microform", "mixed_materials", "moving_images", "realia", "text"]` | true | "mixed_materials" is most common for archival collections. |
| `top_container_type` | Top Container Type (Box Type) | select | yes (if instance_type is filled) | `["box", "cabinet", "carton", "case", "drawer", "folder", "frame", "map-case", "object", "package", "page", "reel", "shelf", "volume"]` | true | Usually "box". |
| `top_container_indicator` | Top Container Number (Box Number) | text | yes (if top_container_type is filled) | null | true | The box number or identifier (e.g., "1", "2", "OS-1"). |
| `child_type` | Child Container Type (Folder Type) | select | no | `["box", "cabinet", "carton", "case", "drawer", "folder", "frame", "map-case", "object", "package", "page", "reel", "shelf", "volume"]` | true | Usually "folder". |
| `child_indicator` | Child Container Number (Folder Number) | text | no | null | true | The folder number within the box. |
| `grandchild_type` | Grandchild Container Type | select | no | Same as child_type vocabulary | false | Rarely used third level of container nesting. |
| `grandchild_indicator` | Grandchild Container Number | text | no | null | false | |
| `top_container_barcode` | Barcode | text | no | null | false | Barcode for the top container if applicable. |
| `top_container_uri` | Existing Top Container URI | text | no | null | false | URI of an already-existing top container in ASpace. Prevents duplicate creation. |

**Validation rules for containers:**
- If `instance_type` is provided, `top_container_type` and `top_container_indicator` are required.
- If `child_type` is provided, `child_indicator` is required (and vice versa).
- `top_container_indicator` should be consistent: if Box 1 appears in multiple rows, it should use the same indicator string every time.

### Note Fields (category: "notes")

Notes are the primary descriptive text fields. Each note type has a `_type` and `_content` pair, and optionally a `_publish` flag. The template supports multiple notes. Common note types:

| aspace_code | label | type | required | enabled_by_default | notes |
|---|---|---|---|---|---|
| `n_scopecontent` | Scope and Content Note | multiline | no | true | Describes the content, time period, and topics covered. Most commonly used note. |
| `n_accessrestrict` | Conditions Governing Access | multiline | no | true | Access restrictions (e.g., "Restricted until 2030"). |
| `n_userestrict` | Conditions Governing Use | multiline | no | false | Copyright or reproduction restrictions. |
| `n_abstract` | Abstract | multiline | no | false | Brief summary, shorter than scope and content. |
| `n_physdesc` | Physical Description | multiline | no | false | Physical characteristics and condition. |
| `n_odd` | General Note | multiline | no | false | Catch-all for notes that don't fit other categories. |
| `n_arrangement` | Arrangement | multiline | no | false | How the materials are organized. |
| `n_bioghist` | Biographical/Historical Note | multiline | no | false | Background on the creator. |
| `n_custodhist` | Custodial History | multiline | no | false | History of ownership/custody. |
| `n_acqinfo` | Immediate Source of Acquisition | multiline | no | false | How the repository obtained the materials. |
| `n_appraisal` | Appraisal | multiline | no | false | Appraisal decisions. |
| `n_accruals` | Accruals | multiline | no | false | Expected additions. |
| `n_relatedmaterial` | Related Materials | multiline | no | false | Related collections elsewhere. |
| `n_separatedmaterial` | Separated Materials | multiline | no | false | Materials separated from this collection. |
| `n_prefercite` | Preferred Citation | multiline | no | false | How to cite this collection. |
| `n_processinfo` | Processing Information | multiline | no | false | Information about archival processing. |
| `n_phystech` | Physical Characteristics and Technical Requirements | multiline | no | false | |
| `n_physloc` | Physical Location | multiline | no | false | Shelf or location information. |

Each note field in the export becomes multiple columns: the note content column, and optionally a `_publish` column (TRUE/FALSE). For the first version, include content and publish for each note type.

### Agent Fields (category: "agents")

Agents link people, families, and organizations to archival objects. The template supports multiple agents.

| aspace_code pattern | label | type | required | enabled_by_default | notes |
|---|---|---|---|---|---|
| `agent_role` | Agent Role | select: `["creator", "source", "subject"]` | yes if agent is being linked | false | |
| `agent_type` | Agent Type | select: `["person", "family", "corporate_entity"]` | yes if agent is being linked | false | |
| `agent_header` | Agent Name | text | yes if agent is being linked | false | Must match an existing agent record in ASpace, or a new one will be created. |

### Subject Fields (category: "subjects")

| aspace_code pattern | label | type | required | enabled_by_default | notes |
|---|---|---|---|---|---|
| `subject_source` | Subject Source | select: `["aat", "gmgpc", "gsafd", "lcgft", "lcnaf", "lcsh", "local", "mesh", "rbgenr", "tgm"]` | yes if subject is being linked | false | |
| `subject_term` | Subject Term | text | yes if subject is being linked | false | Must match an existing subject in ASpace or will create new. |
| `subject_term_type` | Subject Term Type | select: `["cultural_context", "function", "genre_form", "geographic", "occupation", "style_period", "technique", "temporal", "topical", "uniform_title"]` | yes if subject is being linked | false | |

### Digital Object Fields (category: "digital_objects")

| aspace_code | label | type | required | enabled_by_default | notes |
|---|---|---|---|---|---|
| `digital_object_link` | Digital Object Link (URL) | text | no | false | URL to the digital object. |
| `digital_object_title` | Digital Object Title | text | yes if link is provided | false | Cannot contain quotation marks (known ASpace limitation). |
| `digital_object_publish` | Publish Digital Object | select: `["TRUE", "FALSE"]` | no | false | |
| `thumbnail` | Thumbnail URL | text | no | false | URL to a thumbnail image. |

---

## Validation Rules Summary

Build these as functions that can be called per-field (inline validation) and per-row/per-spreadsheet (pre-export validation).

### Field-Level Validation (runs on input/blur)
1. **Required field check**: If field is marked required and is empty, show warning.
2. **Controlled vocabulary check**: If field has a vocabulary list, value must be in list (case-sensitive for export, but the UI uses dropdowns so this is enforced by design).
3. **Date format check**: `date_begin` and `date_end` must match `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`.
4. **Date logic check**: `date_end` >= `date_begin`.
5. **Conditional requirements**: If `dates_type` is "inclusive" or "bulk", require `date_begin` AND `date_end`. If `instance_type` is filled, require `top_container_type` and `top_container_indicator`.
6. **Character sanitization**: Strip curly/smart quotes, replace with straight quotes. Flag or strip non-UTF-8 characters. Strip leading/trailing whitespace. Warn on tab characters.
7. **Digital object title check**: Cannot contain quotation marks.

### Row-Level Validation (runs on each archival object entry)
1. **Title or date required**: Each archival object must have at least a title or a date.
2. **Level of description required**: Cannot be blank.
3. **Conditional field group checks**: If any field in a group is filled (e.g., any date field), all required fields in that group must be filled.

### Spreadsheet-Level Validation (runs before export)
1. **Resource identifier required**: Either `res_uri` or `ead_id` must be present (at minimum on the first row).
2. **Hierarchy continuity**: No jumps (e.g., level 1 to level 3 with no level 2). First entry must be level 1.
3. **Hierarchy must not be empty**: Every row needs a hierarchy value (auto-calculated from tree, so this should always pass, but verify).
4. **Consistent top containers**: If the same box number appears with different barcodes or URIs, flag as warning.
5. **No completely empty rows**: Every row must have at least the required structural fields.

### Validation Message Style
- Use plain language. Not "JSON validation error on property dates.begin" but "Row 5: The start date is empty, but this is a date range. Please add a start date."
- Group by severity: Errors (will cause import failure) vs. Warnings (may cause issues or data quality concerns).
- Include the row number (matching what will appear in the export) and the field name in human-readable form.

---

## UI Design Specifications

### Layout: Two-Panel Design

**Left Panel: Hierarchy Tree**
- Visual tree/outline showing the structure of archival objects
- Entries displayed with their title, level of description, and container info (e.g., "Series I: Correspondence | Box 1")
- Drag-and-drop reordering and re-nesting (or up/down/indent/outdent buttons as simpler alternative)
- Click an entry to edit it in the right panel
- "Add Sibling" and "Add Child" buttons contextual to the selected entry
- Color or icon coding by level of description (series, subseries, file, item)
- Visual indentation mirrors the hierarchy

**Right Panel: Entry Form**
- Shows the edit form for the currently selected archival object
- Fields grouped by category (Structure, Description, Dates, Containers, Notes, Agents, Subjects, Digital Objects)
- Category sections are collapsible
- Only enabled fields (per configuration) are shown
- Required fields have a visual indicator (asterisk, colored border, etc.)
- Controlled vocabulary fields render as `<select>` dropdowns
- Help text appears below each field (or on hover/focus), drawn from the field registry
- Inline validation errors appear below the field in red/orange text
- "Save Entry" button commits changes to the current archival object

### Top Bar
- Tool name / branding
- Current project name (clickable to return to project list)
- Resource URI or EAD ID input (applies to entire project/spreadsheet)
- "Settings" button (opens configuration panel; visible to admins only)
- "Validate All" button (runs full validation, shows report)
- "Export CSV" button
- "Export Excel" button
- Sync status indicator ("Saved" / "Saving..." / "Offline")
- User avatar/name with dropdown: My Defaults, Switch project, Sign out

### Project List View (shown after login, before entering a project)
- List of all projects for this institution, showing name, status, entry count, last updated, and updated-by
- "New Project" button
- Click a project to open it in the editor
- Delete/archive project (admin only, with confirmation)

### Current Defaults Bar (shown above the data entry form, within a project)
- Small, collapsible bar showing the currently active defaults for new entries
- Displays the resolved default for each defaultable field (showing the winning tier: institution, user, or project)
- Each value is editable inline: click a value to change the project-level default
- Changing a value here sets the project-level default going forward. A small label or color indicator shows which tier each default comes from (e.g., "(institution)" in muted text, or "(you)" for user defaults, or no label for project overrides since those are the most local)
- A "Reset project defaults" option clears all project-level overrides, reverting to user/institution defaults
- Box number gets special treatment: a prominent "Current Box" indicator that's always visible even when the bar is collapsed, since changing boxes is the most frequent default change during data entry

### My Defaults Panel (modal, accessible from user dropdown menu)
- Lists all fields that support defaults (`supports_default: true` in the registry)
- For each field, shows the institution default (read-only, for reference) and the user's override (editable)
- Clear/remove button next to each user override to revert to the institution default
- Save button persists to the user's Firestore document
- Plain-language explanation at top: "These are your personal defaults. They apply to every project you work on. Your institution's defaults are shown in gray for reference. You can override any of them."

### Settings/Configuration Panel (modal or separate view, admin only)
- **Fields tab**: List of all fields from the registry, grouped by category. Toggle switch for each field (enabled/disabled). Editable help text override per field.
- **Institution Defaults tab**: List of all fields that support defaults, with editable default values. These apply to all users as the baseline.
- **Team tab**: List of users with their roles and last login date. Ability to change roles (admin/member) and remove users. Invite code displayed prominently with a "Copy" button and a "Regenerate Code" button (with confirmation dialog warning that the old code will stop working).
- **General tab**: Institution name, target ASpace version selector (future use; single version for MVP).
- "Export Configuration" button (downloads JSON for sharing with other institutions, includes both field config and institution defaults)
- "Import Configuration" button (uploads JSON)
- "Reset to Defaults" button

### Validation Report (modal or panel)
- Appears when "Validate All" is clicked or before export
- Lists all errors and warnings grouped by entry (with entry title and position)
- Clicking an error navigates to the relevant entry and field
- "Export Anyway" option for warnings-only (no errors)
- Clear distinction between errors (red, blocking) and warnings (yellow, non-blocking)

### Visual Design
- Clean, professional, accessible
- High contrast for readability
- Responsive (should work on tablets, as some archivists work in stacks with tablets)
- Color palette suggestion: muted blues/grays for interface chrome, with archival-gold or warm-toned accents. Avoid bright/saturated colors. This is a professional tool for daily use, not a marketing page.
- Font: system fonts for performance. Monospace for identifiers/codes, sans-serif for everything else.

---

## Export Specifications

### CSV Export
- UTF-8 encoding with BOM (byte order mark) for Excel compatibility
- First row: ASpace field codes exactly as specified in the registry (`aspace_code` values)
- Subsequent rows: one archival object per row
- Empty fields export as empty strings (not "null" or "undefined")
- Hierarchy numbers calculated from the visual tree position
- `res_uri` or `ead_id` populated on first row (optionally all rows for safety)
- Fields that are disabled in configuration are still excluded from export (they simply don't appear as columns)
- Only columns for fields that have data anywhere in the spreadsheet, plus required fields, should appear in export. Do not export 80 empty columns.

### Excel Export (.xlsx via SheetJS)
- Same data structure as CSV
- First row (field codes) can optionally be styled (bold, frozen)
- Sheet name: "ASpace Import"
- Consider a second sheet with field documentation/help text as a reference for staff

---

## Data Persistence (Firebase)

### Firestore Collections

#### `institutions`
One document per institution. Contains:
```json
{
  "name": "Marin County History Library",
  "created_at": timestamp,
  "invite_code": "MARIN-7K2X",
  "config": {
    "enabled_fields": ["res_uri", "hierarchy", "level", "title", ...],
    "custom_help_text": { "field_id": "custom text", ... },
    "custom_vocabularies": { "extent_type": ["linear_feet", "custom_type"], ... },
    "aspace_version": "4.1"
  },
  "defaults": {
    "instance_type": "mixed_materials",
    "top_container_type": "box",
    "child_type": "folder",
    "dates_label": "creation",
    "publish": "TRUE",
    "extent_type": "linear_feet",
    "extent_portion": "whole",
    "subject_source": "lcsh",
    "agent_role": "creator"
  }
}
```

#### `invite_codes`
A lookup collection that enforces uniqueness. **The document ID is the invite code itself.** Since Firestore document IDs are inherently unique, two institutions can never share the same code.

```json
// Document ID: "MARIN-7K2X"
{
  "institution_id": "institution_doc_id"
}
```

That's it. One field. The collection exists purely to guarantee uniqueness and to resolve a code to an institution. When a new user enters a code, the app reads `invite_codes/{code}` to find the institution_id. If the document doesn't exist, the code is invalid.

**Code generation logic:**
- Auto-generated when an institution is created. Format: `[SHORT-NAME]-[4 random alphanumeric chars]`, e.g., "MARIN-7K2X", "YALE-P3QM". The short name portion is derived from the first word of the institution name (uppercased, max 8 characters). The random suffix provides uniqueness.
- On generation, the app attempts to create the `invite_codes/{code}` document. If it fails (document already exists, which is extremely unlikely with 4 random chars but possible), generate a new random suffix and retry. This is a simple loop, not a transaction, because the chance of collision is near zero.
- When an admin regenerates the code (e.g., a staff member left and they want to invalidate the old code), the app deletes the old `invite_codes` document, generates a new code, creates the new `invite_codes` document, and updates the `invite_code` field on the institution document. This is a batched write to keep it atomic.
- Codes are case-insensitive on input (convert to uppercase before lookup) but stored uppercase.

#### `users`
One document per authenticated user. Contains:
```json
{
  "email": "staff@library.org",
  "display_name": "Maria Garcia",
  "institution_id": "institution_doc_id",
  "role": "admin|member",
  "created_at": timestamp,
  "last_login": timestamp,
  "defaults": {
    "extent_type": "photographic_prints",
    "dates_type": "single"
  }
}
```
The `defaults` object on the user document only contains overrides. If a field is not present here, the institution default applies. This keeps the user document small and makes it clear what a user has intentionally customized versus what they've inherited.

Roles:
- **admin**: Can edit institution configuration (including institution defaults), manage team members, create/delete projects, and do everything members can do.
- **member**: Can edit their own user defaults, create/edit archival object entries within projects, run validation, and export spreadsheets.

#### `projects`
One document per import project (typically one per collection being described). Contains:
```json
{
  "institution_id": "institution_doc_id",
  "name": "Garcia Family Papers",
  "resource_identifier": "/repositories/2/resources/123",
  "identifier_type": "res_uri|ead_id",
  "created_by": "user_doc_id",
  "created_at": timestamp,
  "updated_at": timestamp,
  "updated_by": "user_doc_id",
  "status": "in_progress|ready_for_export|exported",
  "defaults": {
    "level": "file",
    "top_container_indicator": "3",
    "dates_type": "inclusive"
  },
  "entries": [
    {
      "id": "unique_entry_id",
      "parent_id": null|"parent_entry_id",
      "order": 0,
      "fields": {
        "title": "Series I: Correspondence",
        "level": "series",
        "dates_label": "creation",
        "dates_type": "inclusive",
        "date_begin": "1955",
        "date_end": "1978",
        ...
      }
    }
  ]
}
```

The `entries` array stores the flat list of archival objects. The `parent_id` and `order` fields define the hierarchy tree structure. The tree UI reconstructs the visual hierarchy from these relationships. On export, the tool walks the tree to calculate hierarchy numbers.

Note: Storing entries as a nested array within the project document keeps reads/writes simple and avoids subcollection complexity. For very large collections (500+ entries), this may need revisiting, but for the vast majority of use cases this is fine. Firestore documents can be up to 1MB.

### Firebase Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users can read/write their own user doc
    // Allow create for any authenticated user (needed during onboarding)
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow create: if request.auth != null && request.auth.uid == userId;
    }

    // Institution members can read their institution
    // Only admins can write institution config
    // Allow create for any authenticated user (needed when creating a new institution)
    match /institutions/{instId} {
      allow read: if request.auth != null &&
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.institution_id == instId;
      allow write: if request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.institution_id == instId &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
      allow create: if request.auth != null;
    }

    // Invite codes: anyone authenticated can read (needed to look up codes during join flow)
    // Only admins of the linked institution can write/delete
    match /invite_codes/{code} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow delete: if request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.institution_id ==
        resource.data.institution_id &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
    }

    // Institution members can read/write projects belonging to their institution
    match /projects/{projectId} {
      allow read, write: if request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.institution_id ==
        resource.data.institution_id;
      allow create: if request.auth != null;
    }
  }
}
```

These rules are a starting point. Refine as needed during development. The key principles: users can only access data belonging to their institution; invite codes are readable by anyone (they're short-lived lookup tokens, not secrets) but only writable by the institution's admin; the onboarding flow requires some `create` permissions for unauthenticated-as-member users (someone who just signed in but hasn't joined an institution yet).

### First-Run / Onboarding Flow

1. User visits the app and clicks "Sign in with Google."
2. If this is a brand-new user (no document in `users` collection):
   - Prompt: "Create a new institution or join an existing one?"
   - **Create new institution**:
     1. User enters institution name.
     2. App generates an invite code (e.g., "MARIN-7K2X") using the naming logic described above.
     3. App attempts to create the `invite_codes/{code}` document. If collision (unlikely), regenerate and retry.
     4. App creates the `institutions` document with the invite code, default config, and empty defaults.
     5. App creates the `users` document with role "admin" and the new institution_id.
     6. User lands on the project list (empty). A prominent banner shows the invite code with a "Copy" button and text: "Share this code with your team so they can join: MARIN-7K2X"
   - **Join existing institution**:
     1. User enters an invite code.
     2. App reads `invite_codes/{code_uppercased}`. If not found, show error: "That code doesn't match any institution. Check with your administrator."
     3. If found, read the institution document to get the name. Show confirmation: "Join Marin County History Library?"
     4. On confirm, app creates the `users` document with role "member" and the institution_id.
     5. User lands on the project list.
3. If the user already exists in the `users` collection, load their institution config and show the project list.

### Admin Team Management

- The Settings panel (Team tab) shows all users in the institution.
- Admin can change a user's role (member to admin, or admin to member, but cannot demote themselves if they are the only admin).
- Admin can remove a user (deletes their `users` document, or alternatively sets a "disabled" flag if you want to preserve history). Removed users see a "You no longer have access to this institution" message on next login, with the option to join a different institution or create a new one.
- Admin can view and regenerate the invite code. Regenerating invalidates the old code immediately (deletes old `invite_codes` document, creates new one, updates institution document). A confirmation dialog warns: "This will invalidate the current code. Anyone who hasn't joined yet will need the new code."

### Auto-save

- Auto-save the current project to Firestore on every entry save or structural change (add/remove/reorder).
- Debounce writes (e.g., 2-second delay after last change) to avoid excessive Firestore operations.
- Show "last saved" timestamp and sync status in the UI (e.g., "Saved" / "Saving..." / "Offline, changes pending").
- Implement a simple dirty-flag system to warn before navigating away with unsaved changes.
- If Firestore is temporarily unreachable, queue writes locally (localStorage as fallback buffer) and sync when connection restores. This is a nice-to-have for MVP but worth architecting for.

### Offline Considerations

The tool should remain functional if Firestore is briefly unavailable (e.g., flaky library Wi-Fi). For MVP, this means:
- The current project data is always held in memory and can be exported to CSV even if Firebase is down.
- Config is cached locally after first load so the form renders even without a live connection.
- Full offline-first architecture (Firestore persistence layer) is a Phase 2 enhancement.

---

## Development Phases (for planning, not strict requirements)

### Phase 1 (MVP - Build This First)
- Firebase Auth with Google sign-in
- Firestore data model (institutions, users, projects)
- First-run onboarding flow (create institution or join existing)
- Field registry with all fields documented above
- Configuration panel with toggle switches (admin only), persisted to Firestore
- Data entry form with all field types (text, select, date, multiline)
- Visual hierarchy tree (can be simple indented list with add/remove/reorder for MVP; drag-and-drop can come later)
- Field-level inline validation
- Pre-export validation with plain-language report
- CSV export
- Auto-save to Firestore with debounce
- Project list view (create, open, rename, delete projects)
- Basic role enforcement (admin vs. member)

### Phase 2 (Enhancement)
- Excel export via SheetJS
- Drag-and-drop hierarchy reordering
- Batch operations (set the same box number for multiple entries)
- Duplicate entry (copy an existing archival object as template for a new one)
- Undo/redo
- Keyboard shortcuts for power users
- Print-friendly validation report
- Invite code system for adding team members
- Firestore offline persistence for flaky connections
- Config export/import as JSON (for sharing between institutions)

### Phase 3 (Community Features)
- Multiple field registry versions for different ASpace versions
- Shareable configuration templates ("small historical society", "university archives", "museum collection")
- Import from existing ASpace CSV (for editing/correcting a previously exported spreadsheet)
- Controlled vocabulary customization via admin panel
- Project activity log (who edited what, when)

---

## Important Technical Notes

1. **The actual ASpace bulk import template is in the repo at `docs/templates/bulk_import_template.csv`.** It has 187 columns and two header rows (field codes and human-readable labels). The field registry in this prompt was compiled from research and may not match the template exactly. **Use the actual template file as the source of truth for field codes.** Cross-reference the registry descriptions in this prompt against the real column headers in that CSV. Where they differ, the CSV wins. Known discrepancies from initial research: the template uses `begin`/`end` (not `date_begin`/`date_end`), `cont_instance_type` (not `instance_type`), `type_1`/`indicator_1` (not `top_container_type`/`top_container_indicator`), `portion`/`number` (not `extent_portion`/`extent_number`). There are also fields in the template not covered in this prompt's registry, including language fields (`l_lang`, `l_langscript`, `n_langmaterial`, `p_langmaterial`), a second container instance set, `processing_note`, `restrictions_flag`, `ref_id`, `collection_id`, and access restriction date fields (`b_accessrestrict`, `e_accessrestrict`, `t_accessrestrict`). Build the field registry from the CSV, using this prompt's descriptions and validation rules as guidance for the human-readable labels, help text, categories, and validation logic.

2. **Controlled vocabulary lists may vary by institution.** Some institutions add custom extent types, container types, or other values via ASpace plugins. The field registry's vocabulary lists represent the defaults. The configuration layer should eventually allow editing these lists.

3. **The hierarchy auto-calculation is critical.** This is the single most important UX improvement over raw spreadsheet editing. The tree structure must reliably produce correct hierarchy numbers. Test extensively with nested structures: a series containing subseries containing files, multiple series at the same level, items nested under files, etc.

4. **Character sanitization must happen silently on export.** Don't reject entries with curly quotes during data entry (staff paste from Word constantly). Just fix them in the export. Straight quotes, UTF-8 clean, no BOM issues.

5. **The tool must not lose data.** Auto-save to Firestore aggressively (debounced, not on every keystroke, but on every entry save or structural change). Warn before destructive actions. The fear of losing work is real for these users and any data loss will destroy trust in the tool. Cache the current project in memory so that CSV export works even if Firestore is momentarily unreachable.

6. **Accessibility matters.** These are library workers. They care about accessibility. Use semantic HTML, ARIA labels, keyboard navigation, sufficient color contrast. This is non-negotiable.

7. **Firebase API keys in client-side code are normal.** Firebase web API keys are designed to be public. Security comes from Firestore Security Rules, not from hiding the key. Do not try to obscure or server-side proxy the Firebase config. Just set the security rules correctly.

8. **Keep Firestore reads minimal.** Load the institution config once on login and cache it. Load the project list on the project list view. Load a project's entries when it's opened. Don't set up real-time listeners for MVP unless needed; standard get/set operations are simpler and sufficient. Real-time sync between multiple users editing the same project simultaneously is a Phase 2/3 concern.

---

## ASpace Import Templates: Scope and Future Expansion

ASpace provides multiple import templates for different record types. All templates are committed to the repo at `docs/templates/` for reference. **This tool targets only the bulk import template (archival objects) for Phase 1.** The others are documented here for future planning.

### Phase 1 Target (build this now)
- **`bulk_import_template.csv` / `.xlsx`** - Creates archival objects (series, subseries, files, items) attached to an existing resource. 187 columns. This is the template staff use most frequently and the primary source of pain. This is what our tool replaces.

### Future Expansion (do not build yet, but the architecture supports them)
- **`bulk_import_DO_template.csv` / `.xlsx`** - Creates digital objects and links them to existing archival objects. Different fields, different workflow. Natural Phase 2 candidate since it's closely related to the primary template.
- **`aspace_accession_import_template.csv` / `.xlsx`** - Imports accession records (documentation of newly received materials). Different record type, different data model, but same architectural pattern: field registry, form, validated export.
- **`aspace_assessment_import_template.csv`** - Imports condition assessment records. Niche use case.
- **`aspace_digital_object_import_template.csv`** - Standalone digital object records (not linked to archival objects). Different from the DO template above.
- **`aspace_location_import_template.csv`** - Shelf/storage location records.
- **`aspace_subject_import_template.csv`** - Subject heading records.

The tool's architecture (field registry, configurable form, validation engine, CSV export) is template-agnostic. Expanding to a new template means creating a new field registry for that template's columns and adding any template-specific validation rules. The UI, Firebase infrastructure, config system, and export logic are all reusable. But for now: one template, one tool, one win.

---

## File Structure (suggested)

```
aspace-helper/
  index.html          # Main application (single page)
  css/
    styles.css        # All styles
  js/
    firebase-config.js # Firebase initialization and config (API keys, project ID)
    auth.js           # Authentication (Google sign-in, session management)
    db.js             # Firestore operations (CRUD for institutions, users, projects)
    field-registry.js # Field definitions (built from the actual template CSV)
    config.js         # Configuration management (read from Firestore, admin panel)
    validation.js     # All validation logic
    tree.js           # Hierarchy tree UI and logic
    form.js           # Entry form rendering and interaction
    export.js         # CSV and Excel export
    app.js            # Main application initialization, routing, and coordination
  lib/
    xlsx.full.min.js  # SheetJS library (download for offline use)
  docs/
    templates/        # ASpace import templates (reference, not served to users)
      bulk_import_template.csv      # PRIMARY - archival objects (Phase 1 target)
      bulk_import_template.xlsx
      bulk_import_DO_template.csv   # Digital objects (future)
      bulk_import_DO_template.xlsx
      aspace_accession_import_template.csv
      aspace_accession_import_template.xlsx
      aspace_assessment_import_template.csv
      aspace_digital_object_import_template.csv
      aspace_location_import_template.csv
      aspace_subject_import_template.csv
    aspace-helper-prompt.md         # This build prompt (for reference)
```

Firebase SDK should be loaded via CDN (the modular v9+ compat or v10 CDN builds). Do not use npm/bundler for MVP. Keep everything loadable as plain script tags.

---

## One Last Thing

This tool is being built to help a specific friend who works at a history library and struggles with ASpace's bulk import workflow. But it's designed from the ground up to be usable by any ASpace institution. The configurable field system is what makes that possible. Build it right, and it could serve the whole ASpace community, many of whom are small shops with limited technical resources and staff who are scared of the software they're required to use.

The goal is not to replace ArchivesSpace. The goal is to be the kindest possible front door to one of its most important features.
