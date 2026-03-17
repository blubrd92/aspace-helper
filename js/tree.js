// tree.js
// Hierarchy tree UI: visual tree/outline for archival objects.
// Handles add, remove, reorder, indent/outdent, and selection.

const Tree = {
  selectedEntryId: null,

  // Render the full tree from project entries
  render(entries) {
    const container = document.getElementById('hierarchy-tree');
    const emptyState = document.getElementById('empty-tree');
    if (!container) return;

    container.innerHTML = '';

    if (!entries || entries.length === 0) {
      container.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    container.classList.remove('hidden');
    emptyState.classList.add('hidden');

    // Build tree structure from flat entries with parent_id
    const flatTree = Tree.flattenTree(entries);

    for (const entry of flatTree) {
      const item = Tree.createTreeItem(entry, entry._depth);
      container.appendChild(item);
    }
  },

  // Flatten entries into ordered list with depth, walking the tree
  flattenTree(entries) {
    if (!entries || entries.length === 0) return [];

    // Build lookup by id
    const byId = {};
    for (const entry of entries) {
      byId[entry.id] = entry;
    }

    // Find root entries (no parent_id or parent_id not found)
    const roots = entries
      .filter(e => !e.parent_id || !byId[e.parent_id])
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    // Find children of a given parent, sorted by order
    function getChildren(parentId) {
      return entries
        .filter(e => e.parent_id === parentId)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    // Walk tree depth-first
    const result = [];
    function walk(entry, depth) {
      entry._depth = depth;
      entry._hierarchy = depth + 1; // hierarchy is 1-based
      result.push(entry);

      const children = getChildren(entry.id);
      for (const child of children) {
        walk(child, depth + 1);
      }
    }

    for (const root of roots) {
      walk(root, 0);
    }

    return result;
  },

  // Create a single tree item element
  createTreeItem(entry, depth) {
    const item = document.createElement('div');
    item.className = 'tree-item';
    item.setAttribute('role', 'treeitem');
    item.setAttribute('data-entry-id', entry.id);
    item.style.setProperty('--tree-depth', depth);

    if (entry.id === Tree.selectedEntryId) {
      item.classList.add('selected');
    }

    // Validate entry to check for errors
    const enabledFields = Config.getEnabledFields();
    const issues = Validation.validateEntry(entry.fields || {}, enabledFields);
    if (issues.some(i => i.type === 'error')) {
      item.classList.add('has-error');
    }

    const level = (entry.fields && entry.fields.level) || '';
    const title = (entry.fields && entry.fields.title) || '';
    const levelClass = Tree.getLevelClass(level);
    const indicator = (entry.fields && entry.fields.indicator_1) || '';
    const childIndicator = (entry.fields && entry.fields.indicator_2) || '';
    const containerText = indicator ? `Box ${indicator}${childIndicator ? ', Folder ' + childIndicator : ''}` : '';

    item.innerHTML = `
      <span class="tree-item-level ${levelClass}">${level || '?'}</span>
      <span class="tree-item-title ${title ? '' : 'untitled'}">${title || 'Untitled'}</span>
      ${containerText ? `<span class="tree-item-container">${containerText}</span>` : ''}
      <span class="tree-item-actions">
        <button class="tree-item-btn" data-action="add-child" title="Add child entry">+C</button>
        <button class="tree-item-btn" data-action="add-sibling" title="Add sibling entry">+S</button>
        <button class="tree-item-btn" data-action="move-up" title="Move up">&uarr;</button>
        <button class="tree-item-btn" data-action="move-down" title="Move down">&darr;</button>
        <button class="tree-item-btn" data-action="indent" title="Indent (make child)">&rarr;</button>
        <button class="tree-item-btn" data-action="outdent" title="Outdent (move up a level)">&larr;</button>
      </span>
    `;

    // Click to select
    item.addEventListener('click', (e) => {
      if (e.target.closest('.tree-item-btn')) return; // don't select on button click
      Tree.selectEntry(entry.id);
    });

    // Button actions
    item.querySelectorAll('.tree-item-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        Tree.handleAction(action, entry.id);
      });
    });

    return item;
  },

  // Get CSS class for level badge color
  getLevelClass(level) {
    switch (level) {
      case 'series': return 'level-series';
      case 'subseries': return 'level-subseries';
      case 'file': return 'level-file';
      case 'item': return 'level-item';
      default: return 'level-other';
    }
  },

  // Select an entry in the tree and show its form
  selectEntry(entryId) {
    Tree.selectedEntryId = entryId;

    // Update tree selection UI
    document.querySelectorAll('.tree-item').forEach(item => {
      item.classList.toggle('selected', item.getAttribute('data-entry-id') === entryId);
    });

    // Show the entry form
    const entry = App.getEntryById(entryId);
    if (entry) {
      Form.renderEntry(entry);
      document.getElementById('no-selection').classList.add('hidden');
      document.getElementById('entry-form-container').classList.remove('hidden');
    }
  },

  // Handle tree button actions
  handleAction(action, entryId) {
    const project = App.currentProject;
    if (!project) return;

    const entries = project.entries || [];
    const entryIndex = entries.findIndex(e => e.id === entryId);
    if (entryIndex === -1) return;

    const entry = entries[entryIndex];

    switch (action) {
      case 'add-child':
        Tree.addEntry(entryId, true);
        break;

      case 'add-sibling':
        Tree.addEntry(entry.parent_id, false, entryIndex);
        break;

      case 'move-up':
        Tree.moveEntry(entryId, -1);
        break;

      case 'move-down':
        Tree.moveEntry(entryId, 1);
        break;

      case 'indent':
        Tree.indentEntry(entryId);
        break;

      case 'outdent':
        Tree.outdentEntry(entryId);
        break;
    }
  },

  // Add a new entry (as child of parentId, or as root if parentId is null)
  addEntry(parentId, asChild, afterIndex) {
    const project = App.currentProject;
    if (!project) return;

    const entries = project.entries || [];

    // Get defaults for the new entry
    const projectDefaults = project.defaults || {};
    const userDefaults = (Auth.userData && Auth.userData.defaults) || {};
    const defaults = Config.getResolvedDefaults(projectDefaults, userDefaults);

    // Determine the order: place after siblings of the same parent
    const siblings = entries.filter(e => e.parent_id === (asChild ? parentId : parentId));
    const newOrder = siblings.length > 0
      ? Math.max(...siblings.map(s => s.order || 0)) + 1
      : 0;

    const newEntry = {
      id: Tree.generateId(),
      parent_id: asChild ? parentId : (parentId || null),
      order: newOrder,
      fields: { ...defaults }
    };

    entries.push(newEntry);
    project.entries = entries;

    App.markDirty();
    Tree.render(entries);
    Tree.selectEntry(newEntry.id);
  },

  // Move an entry up or down among its siblings
  moveEntry(entryId, direction) {
    const project = App.currentProject;
    if (!project) return;

    const entries = project.entries || [];
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;

    const siblings = entries
      .filter(e => e.parent_id === entry.parent_id)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    const sibIndex = siblings.findIndex(s => s.id === entryId);
    const targetIndex = sibIndex + direction;

    if (targetIndex < 0 || targetIndex >= siblings.length) return;

    // Swap order values
    const temp = siblings[sibIndex].order;
    siblings[sibIndex].order = siblings[targetIndex].order;
    siblings[targetIndex].order = temp;

    App.markDirty();
    Tree.render(entries);
  },

  // Indent: make entry a child of its previous sibling
  indentEntry(entryId) {
    const project = App.currentProject;
    if (!project) return;

    const entries = project.entries || [];
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;

    const siblings = entries
      .filter(e => e.parent_id === entry.parent_id)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    const sibIndex = siblings.findIndex(s => s.id === entryId);
    if (sibIndex <= 0) return; // can't indent the first sibling

    const newParent = siblings[sibIndex - 1];
    entry.parent_id = newParent.id;

    // Set order to be last child of new parent
    const newSiblings = entries.filter(e => e.parent_id === newParent.id);
    entry.order = newSiblings.length > 0 ? Math.max(...newSiblings.map(s => s.order || 0)) + 1 : 0;

    App.markDirty();
    Tree.render(entries);
  },

  // Outdent: move entry to be a sibling of its parent
  outdentEntry(entryId) {
    const project = App.currentProject;
    if (!project) return;

    const entries = project.entries || [];
    const entry = entries.find(e => e.id === entryId);
    if (!entry || !entry.parent_id) return; // can't outdent root entries

    const parent = entries.find(e => e.id === entry.parent_id);
    if (!parent) return;

    entry.parent_id = parent.parent_id;

    // Set order to be right after the parent among its siblings
    const newSiblings = entries
      .filter(e => e.parent_id === entry.parent_id)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    const parentIndex = newSiblings.findIndex(s => s.id === parent.id);
    // Shift siblings after parent to make room
    for (let i = parentIndex + 1; i < newSiblings.length; i++) {
      newSiblings[i].order = (newSiblings[i].order || 0) + 1;
    }
    entry.order = (parent.order || 0) + 1;

    App.markDirty();
    Tree.render(entries);
  },

  // Delete an entry and all its descendants
  deleteEntry(entryId) {
    const project = App.currentProject;
    if (!project) return;

    const entries = project.entries || [];

    // Find all descendants
    const toDelete = new Set();
    function findDescendants(id) {
      toDelete.add(id);
      entries.filter(e => e.parent_id === id).forEach(child => findDescendants(child.id));
    }
    findDescendants(entryId);

    project.entries = entries.filter(e => !toDelete.has(e.id));

    if (Tree.selectedEntryId === entryId) {
      Tree.selectedEntryId = null;
      document.getElementById('no-selection').classList.remove('hidden');
      document.getElementById('entry-form-container').classList.add('hidden');
    }

    App.markDirty();
    Tree.render(project.entries);
  },

  // Generate a unique ID for a new entry
  generateId() {
    return 'entry_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  }
};
