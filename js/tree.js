// tree.js
// Hierarchy tree UI: visual tree/outline for archival objects.
// Handles add, remove, reorder, indent/outdent, and selection.

const Tree = {
  selectedEntryId: null,

  // Escape HTML to prevent XSS in tree item rendering
  _escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

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

    // Task 3: Track previous hierarchy level to detect skips
    let prevHierarchy = 0;
    for (const entry of flatTree) {
      const hasHierarchyWarning = entry._hierarchy > prevHierarchy + 1;
      const item = Tree.createTreeItem(entry, entry._depth, hasHierarchyWarning);
      container.appendChild(item);
      prevHierarchy = entry._hierarchy;
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

    // Pre-build children lookup for O(1) access instead of O(n) per node
    const childrenMap = {};
    for (const entry of entries) {
      const pid = entry.parent_id || null;
      if (!childrenMap[pid]) childrenMap[pid] = [];
      childrenMap[pid].push(entry);
    }
    // Sort each group by order
    for (const pid of Object.keys(childrenMap)) {
      childrenMap[pid].sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    function getChildren(parentId) {
      return childrenMap[parentId] || [];
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
  createTreeItem(entry, depth, hasHierarchyWarning) {
    const item = document.createElement('div');
    item.className = 'tree-item';
    item.setAttribute('role', 'listitem');
    item.setAttribute('aria-level', depth + 1); // 1-based depth for screen readers
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

    // Task 3: Flag hierarchy level skips
    if (hasHierarchyWarning) {
      item.classList.add('has-warning');
    }

    const level = (entry.fields && entry.fields.level) || '';
    const title = (entry.fields && entry.fields.title) || '';
    const levelClass = Tree.getLevelClass(level);
    const indicator = (entry.fields && entry.fields.indicator_1) || '';
    const childIndicator = (entry.fields && entry.fields.indicator_2) || '';
    const containerText = indicator ? `Box ${Tree._escapeHTML(indicator)}${childIndicator ? ', Folder ' + Tree._escapeHTML(childIndicator) : ''}` : '';
    const warningIcon = hasHierarchyWarning
      ? '<span class="tree-item-warning" title="Hierarchy level skip \u2014 this entry jumps more than one level from the previous entry">\u26A0</span>'
      : '';

    item.innerHTML = `
      ${warningIcon}<span class="tree-item-level ${levelClass}">${Tree._escapeHTML(level) || '?'}</span>
      <span class="tree-item-title ${title ? '' : 'untitled'}">${Tree._escapeHTML(title) || 'Untitled'}</span>
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

  // Add a new entry (as child of parentId, or as root if parentId is null).
  // afterIndex: when adding a sibling via "+S", the index of the clicked entry
  //   in the entries array, so the new sibling is placed right after it.
  addEntry(parentId, asChild, afterIndex) {
    const project = App.currentProject;
    if (!project) return;

    const entries = project.entries || [];

    // Get defaults for the new entry
    const projectDefaults = project.defaults || {};
    const userDefaults = (Auth.userData && Auth.userData.defaults) || {};
    const defaults = Config.getResolvedDefaults(projectDefaults, userDefaults);

    // Determine the effective parent for the new entry
    const effectiveParent = asChild ? parentId : (parentId || null);

    // Determine the order value for the new entry
    let newOrder;
    const siblings = entries
      .filter(e => e.parent_id === effectiveParent)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    if (!asChild && afterIndex !== undefined && entries[afterIndex]) {
      // "+S" button: insert right after the clicked entry among its siblings
      const clickedEntry = entries[afterIndex];
      const clickedOrder = clickedEntry.order || 0;

      // Shift all siblings after the clicked entry to make room
      for (const sib of siblings) {
        if ((sib.order || 0) > clickedOrder) {
          sib.order = (sib.order || 0) + 1;
        }
      }
      newOrder = clickedOrder + 1;
    } else {
      newOrder = siblings.length > 0
        ? Math.max(...siblings.map(s => s.order || 0)) + 1
        : 0;
    }

    const newEntry = {
      id: Tree.generateId(),
      parent_id: effectiveParent,
      order: newOrder,
      fields: { ...defaults }
    };

    // Auto-increment folder number from previous sibling.
    // Only when adding as sibling (not child), and only if the previous
    // sibling's folder number is a plain integer (not "1-3" or "A").
    // effectiveParent is null for root entries and a string ID for nested entries;
    // both cases should allow auto-increment.
    if (!asChild) {
      // Find the sibling just before the new entry's position
      const sortedSiblings = entries
        .filter(e => e.parent_id === effectiveParent && e.id !== newEntry.id)
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      let prevSibling = null;
      if (afterIndex !== undefined && entries[afterIndex]) {
        // "+S": the clicked entry is the previous sibling
        prevSibling = entries[afterIndex];
      } else if (sortedSiblings.length > 0) {
        // "Add Entry" at root: last existing sibling
        prevSibling = sortedSiblings[sortedSiblings.length - 1];
      }

      if (prevSibling) {
        const lastFolder = prevSibling.fields && prevSibling.fields.indicator_2;
        if (lastFolder && /^\d+$/.test(lastFolder.trim())) {
          newEntry.fields.indicator_2 = String(parseInt(lastFolder, 10) + 1);
        }
      }
    }

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

    // Prevent cycles: don't indent if the new parent is a descendant of this entry
    const isDescendant = (ancestorId, checkId) => {
      let current = entries.find(e => e.id === checkId);
      while (current && current.parent_id) {
        if (current.parent_id === ancestorId) return true;
        current = entries.find(e => e.id === current.parent_id);
      }
      return false;
    };

    if (isDescendant(entryId, newParent.id)) return; // would create a cycle

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

    // Clean up any orphaned entries (parent_id points to non-existent entry)
    const remainingIds = new Set(project.entries.map(e => e.id));
    for (const entry of project.entries) {
      if (entry.parent_id && !remainingIds.has(entry.parent_id)) {
        entry.parent_id = null; // promote to root rather than leave orphaned
      }
    }

    if (Tree.selectedEntryId === entryId) {
      Tree.selectedEntryId = null;
      document.getElementById('no-selection').classList.remove('hidden');
      document.getElementById('entry-form-container').classList.add('hidden');
    }

    App.markDirty();
    Tree.render(project.entries);
  },

  // Apply a field value to all descendants of an entry
  applyToDescendants(entryId, fieldId, value) {
    const project = App.currentProject;
    if (!project || !entryId) return;

    const entries = project.entries || [];
    const descendants = [];

    function findDescendants(id) {
      entries.filter(e => e.parent_id === id).forEach(child => {
        descendants.push(child);
        findDescendants(child.id);
      });
    }
    findDescendants(entryId);

    if (descendants.length === 0) {
      App.showToast('No child entries to update.', 'warning');
      return;
    }

    const apply = () => {
      for (const desc of descendants) {
        if (!desc.fields) desc.fields = {};
        desc.fields[fieldId] = value;
      }

      App.markDirty();
      Tree.render(entries);

      // Refresh the form if the selected entry was among the updated descendants
      if (Tree.selectedEntryId) {
        const selected = descendants.find(d => d.id === Tree.selectedEntryId);
        if (selected) Form.renderEntry(selected);
      }

      App.showToast(`Applied to ${descendants.length} child ${descendants.length === 1 ? 'entry' : 'entries'}.`, 'success');
    };

    if (descendants.length > 5) {
      App.showConfirm(
        'Apply to Children',
        `This will set "${fieldId}" to "${value}" on ${descendants.length} entries. Continue?`,
        apply
      );
    } else {
      apply();
    }
  },

  // Generate a unique ID for a new entry
  generateId() {
    return 'entry_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  }
};
