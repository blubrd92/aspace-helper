// db.js
// Firestore CRUD operations for institutions, users, projects, and invite codes.

const DB = {

  // Show a toast for Firestore errors (if App is available)
  _showError(message, error) {
    console.error(message, error);
    if (typeof App !== 'undefined' && App.showToast) {
      App.showToast(message, 'error');
    }
  },

  // ===== USERS =====

  async getUser(uid) {
    try {
      const doc = await db.collection('users').doc(uid).get();
      return doc.exists ? { id: doc.id, ...doc.data() } : null;
    } catch (error) {
      DB._showError('Failed to load user data.', error);
      return null;
    }
  },

  async createUser(uid, data) {
    try {
      await db.collection('users').doc(uid).set({
        email: data.email,
        display_name: data.display_name,
        institution_id: data.institution_id,
        role: data.role,
        created_at: firebase.firestore.FieldValue.serverTimestamp(),
        last_login: firebase.firestore.FieldValue.serverTimestamp(),
        defaults: {}
      });
      return true;
    } catch (error) {
      DB._showError('Failed to create user account.', error);
      return false;
    }
  },

  async updateUser(uid, data) {
    try {
      await db.collection('users').doc(uid).update(data);
      return true;
    } catch (error) {
      DB._showError('Failed to update user.', error);
      return false;
    }
  },

  async getUsersByInstitution(institutionId) {
    try {
      const snapshot = await db.collection('users')
        .where('institution_id', '==', institutionId).get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      DB._showError('Failed to load team members.', error);
      return [];
    }
  },

  async deleteUser(uid) {
    try {
      await db.collection('users').doc(uid).delete();
      return true;
    } catch (error) {
      DB._showError('Failed to remove user.', error);
      return false;
    }
  },

  // Check if a user is the last admin for their institution
  async isLastAdmin(institutionId, userId) {
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists || userDoc.data().role !== 'admin') {
        return false; // Not an admin, so not the "last admin"
      }
      const admins = await db.collection('users')
        .where('institution_id', '==', institutionId)
        .where('role', '==', 'admin')
        .get();
      return admins.size <= 1;
    } catch (error) {
      console.error('Error checking last admin:', error);
      return true; // Fail safe: assume they are the last admin
    }
  },

  // ===== INSTITUTIONS =====

  async getInstitution(institutionId) {
    try {
      const doc = await db.collection('institutions').doc(institutionId).get();
      return doc.exists ? { id: doc.id, ...doc.data() } : null;
    } catch (error) {
      DB._showError('Failed to load institution.', error);
      return null;
    }
  },

  async createInstitution(data) {
    try {
      const docRef = await db.collection('institutions').add({
        name: data.name,
        created_by: firebase.auth().currentUser.uid,
        created_at: firebase.firestore.FieldValue.serverTimestamp(),
        invite_code: data.invite_code,
        config: {
          enabled_fields: getDefaultEnabledFields().map(f => f.id),
          custom_help_text: {},
          custom_vocabularies: {},
          aspace_version: '4.1'
        },
        defaults: {
          cont_instance_type: 'mixed_materials',
          type_1: 'box',
          type_2: 'folder',
          dates_label: 'creation',
          publish: 'TRUE',
          extent_type: 'linear_feet',
          portion: 'whole',
          subject_1_source: 'lcsh',
          people_agent_role_1: 'creator'
        }
      });
      return docRef.id;
    } catch (error) {
      DB._showError('Failed to create institution.', error);
      return null;
    }
  },

  async updateInstitution(institutionId, data) {
    try {
      await db.collection('institutions').doc(institutionId).update(data);
      return true;
    } catch (error) {
      DB._showError('Failed to update institution.', error);
      return false;
    }
  },

  // ===== INVITE CODES =====

  // Generate an invite code from institution name
  generateInviteCode(institutionName) {
    const prefix = institutionName.trim().split(/\s+/)[0]
      .toUpperCase().replace(/[^A-Z]/g, '').substring(0, 8);
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 for readability
    let suffix = '';
    for (let i = 0; i < 4; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${prefix}-${suffix}`;
  },

  async createInviteCode(code, institutionId, institutionName) {
    try {
      const data = { institution_id: institutionId };
      if (institutionName) {
        data.institution_name = institutionName;
      }
      await db.collection('invite_codes').doc(code.toUpperCase()).set(data);
      return true;
    } catch (error) {
      DB._showError('Failed to create invite code.', error);
      return false;
    }
  },

  async lookupInviteCode(code) {
    try {
      const doc = await db.collection('invite_codes').doc(code.toUpperCase()).get();
      if (!doc.exists) return null;
      return doc.data();
    } catch (error) {
      DB._showError('Failed to look up invite code.', error);
      return null;
    }
  },

  async deleteInviteCode(code) {
    try {
      await db.collection('invite_codes').doc(code.toUpperCase()).delete();
      return true;
    } catch (error) {
      DB._showError('Failed to delete invite code.', error);
      return false;
    }
  },

  // Update the institution_name on an existing invite code doc
  async updateInviteCodeName(code, newName) {
    try {
      await db.collection('invite_codes').doc(code.toUpperCase()).update({
        institution_name: newName
      });
      return true;
    } catch (error) {
      // Non-critical — log but don't block settings save
      console.error('Failed to update invite code name:', error);
      return false;
    }
  },

  // Regenerate invite code: delete old, create new, update institution
  async regenerateInviteCode(institutionId, oldCode, institutionName) {
    const newCode = DB.generateInviteCode(institutionName);

    try {
      // Delete old code if it still exists (skip if already removed)
      if (oldCode) {
        const oldDoc = await db.collection('invite_codes').doc(oldCode.toUpperCase()).get();
        if (oldDoc.exists) {
          await db.collection('invite_codes').doc(oldCode.toUpperCase()).delete();
        }
      }

      // Create new code and update institution in a batch
      const batch = db.batch();
      batch.set(db.collection('invite_codes').doc(newCode.toUpperCase()), {
        institution_id: institutionId,
        institution_name: institutionName
      });
      batch.update(db.collection('institutions').doc(institutionId), {
        invite_code: newCode
      });
      await batch.commit();
      return newCode;
    } catch (error) {
      DB._showError('Failed to regenerate invite code.', error);
      return null;
    }
  },

  // ===== PROJECTS =====

  async getProjectsByInstitution(institutionId) {
    try {
      const snapshot = await db.collection('projects')
        .where('institution_id', '==', institutionId)
        .get();
      const projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort client-side to avoid requiring a Firestore composite index
      projects.sort((a, b) => {
        const aTime = a.updated_at ? a.updated_at.toMillis() : 0;
        const bTime = b.updated_at ? b.updated_at.toMillis() : 0;
        return bTime - aTime;
      });
      return projects;
    } catch (error) {
      DB._showError('Failed to load projects.', error);
      return [];
    }
  },

  async getProject(projectId) {
    try {
      const doc = await db.collection('projects').doc(projectId).get();
      return doc.exists ? { id: doc.id, ...doc.data() } : null;
    } catch (error) {
      DB._showError('Failed to load project.', error);
      return null;
    }
  },

  async createProject(data) {
    try {
      const docRef = await db.collection('projects').add({
        institution_id: data.institution_id,
        name: data.name,
        resource_identifier: data.resource_identifier,
        identifier_type: data.identifier_type,
        created_by: data.created_by,
        created_at: firebase.firestore.FieldValue.serverTimestamp(),
        updated_at: firebase.firestore.FieldValue.serverTimestamp(),
        updated_by: data.created_by,
        status: 'in_progress',
        defaults: {},
        entries: []
      });
      return docRef.id;
    } catch (error) {
      DB._showError('Failed to create project.', error);
      return null;
    }
  },

  async updateProject(projectId, data) {
    try {
      await db.collection('projects').doc(projectId).update({
        ...data,
        updated_at: firebase.firestore.FieldValue.serverTimestamp(),
        updated_by: Auth.currentUser ? Auth.currentUser.uid : null
      });
      return true;
    } catch (error) {
      DB._showError('Failed to save project.', error);
      return false;
    }
  },

  async reassignProjects(institutionId, userId) {
    try {
      // Single .where() + client-side filter to avoid needing a composite index
      const snapshot = await db.collection('projects')
        .where('institution_id', '==', institutionId)
        .get();

      const userProjects = snapshot.docs.filter(doc => doc.data().created_by === userId);
      if (userProjects.length === 0) return true;

      // The leave flow blocks the last admin from leaving, so there's
      // always at least one other member remaining to reassign to.
      const members = await db.collection('users')
        .where('institution_id', '==', institutionId)
        .get();
      const newOwner = members.docs.find(doc => doc.id !== userId);
      if (!newOwner) return true; // no one left, projects stay as-is

      const batch = db.batch();
      for (const doc of userProjects) {
        batch.update(doc.ref, { created_by: newOwner.id });
      }
      await batch.commit();
      return true;
    } catch (error) {
      DB._showError('Failed to reassign projects.', error);
      return false;
    }
  },

  async deleteProject(projectId) {
    try {
      await db.collection('projects').doc(projectId).delete();
      return true;
    } catch (error) {
      DB._showError('Failed to delete project.', error);
      return false;
    }
  }
};
