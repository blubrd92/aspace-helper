// db.js
// Firestore CRUD operations for institutions, users, projects, and invite codes.

const DB = {

  // ===== USERS =====

  async getUser(uid) {
    try {
      const doc = await db.collection('users').doc(uid).get();
      return doc.exists ? { id: doc.id, ...doc.data() } : null;
    } catch (error) {
      console.error('Error getting user:', error);
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
      console.error('Error creating user:', error);
      return false;
    }
  },

  async updateUser(uid, data) {
    try {
      await db.collection('users').doc(uid).update(data);
      return true;
    } catch (error) {
      console.error('Error updating user:', error);
      return false;
    }
  },

  async getUsersByInstitution(institutionId) {
    try {
      const snapshot = await db.collection('users')
        .where('institution_id', '==', institutionId).get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting users:', error);
      return [];
    }
  },

  async deleteUser(uid) {
    try {
      await db.collection('users').doc(uid).delete();
      return true;
    } catch (error) {
      console.error('Error deleting user:', error);
      return false;
    }
  },

  // ===== INSTITUTIONS =====

  async getInstitution(institutionId) {
    try {
      const doc = await db.collection('institutions').doc(institutionId).get();
      return doc.exists ? { id: doc.id, ...doc.data() } : null;
    } catch (error) {
      console.error('Error getting institution:', error);
      return null;
    }
  },

  async createInstitution(data) {
    try {
      const docRef = await db.collection('institutions').add({
        name: data.name,
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
      console.error('Error creating institution:', error);
      return null;
    }
  },

  async updateInstitution(institutionId, data) {
    try {
      await db.collection('institutions').doc(institutionId).update(data);
      return true;
    } catch (error) {
      console.error('Error updating institution:', error);
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

  async createInviteCode(code, institutionId) {
    try {
      await db.collection('invite_codes').doc(code.toUpperCase()).set({
        institution_id: institutionId
      });
      return true;
    } catch (error) {
      // If the document already exists, this will fail (collision)
      console.error('Error creating invite code:', error);
      return false;
    }
  },

  async lookupInviteCode(code) {
    try {
      const doc = await db.collection('invite_codes').doc(code.toUpperCase()).get();
      if (!doc.exists) return null;
      return doc.data();
    } catch (error) {
      console.error('Error looking up invite code:', error);
      return null;
    }
  },

  async deleteInviteCode(code) {
    try {
      await db.collection('invite_codes').doc(code.toUpperCase()).delete();
      return true;
    } catch (error) {
      console.error('Error deleting invite code:', error);
      return false;
    }
  },

  // Regenerate invite code: delete old, create new, update institution
  async regenerateInviteCode(institutionId, oldCode, institutionName) {
    const newCode = DB.generateInviteCode(institutionName);
    const batch = db.batch();

    // Delete old code
    batch.delete(db.collection('invite_codes').doc(oldCode.toUpperCase()));

    // Create new code
    batch.set(db.collection('invite_codes').doc(newCode.toUpperCase()), {
      institution_id: institutionId
    });

    // Update institution
    batch.update(db.collection('institutions').doc(institutionId), {
      invite_code: newCode
    });

    try {
      await batch.commit();
      return newCode;
    } catch (error) {
      console.error('Error regenerating invite code:', error);
      return null;
    }
  },

  // ===== PROJECTS =====

  async getProjectsByInstitution(institutionId) {
    try {
      const snapshot = await db.collection('projects')
        .where('institution_id', '==', institutionId)
        .orderBy('updated_at', 'desc')
        .get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting projects:', error);
      return [];
    }
  },

  async getProject(projectId) {
    try {
      const doc = await db.collection('projects').doc(projectId).get();
      return doc.exists ? { id: doc.id, ...doc.data() } : null;
    } catch (error) {
      console.error('Error getting project:', error);
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
      console.error('Error creating project:', error);
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
      console.error('Error updating project:', error);
      return false;
    }
  },

  async deleteProject(projectId) {
    try {
      await db.collection('projects').doc(projectId).delete();
      return true;
    } catch (error) {
      console.error('Error deleting project:', error);
      return false;
    }
  }
};
