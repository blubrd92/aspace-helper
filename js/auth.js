// auth.js
// Authentication module: Google sign-in, session management, auth state changes.

const Auth = {
  currentUser: null,   // Firebase auth user
  userData: null,       // Firestore user document data

  // Sign in with Google popup
  async signIn() {
    try {
      const result = await auth.signInWithPopup(googleProvider);
      return result.user;
    } catch (error) {
      console.error('Sign-in error:', error);
      App.showToast('Sign-in failed. Please try again.', 'error');
      return null;
    }
  },

  // Sign out
  async signOut() {
    try {
      await auth.signOut();
      Auth.currentUser = null;
      Auth.userData = null;
      App.showView('login');
    } catch (error) {
      console.error('Sign-out error:', error);
    }
  },

  // Listen for auth state changes. Called once on app init.
  onAuthStateChanged(callback) {
    auth.onAuthStateChanged(async (user) => {
      Auth.currentUser = user;
      if (user) {
        // Try to load existing user document
        Auth.userData = await DB.getUser(user.uid);
        if (Auth.userData) {
          // Update last_login
          DB.updateUser(user.uid, { last_login: firebase.firestore.FieldValue.serverTimestamp() });
        }
      }
      callback(user, Auth.userData);
    });
  },

  // Check if current user is an admin
  isAdmin() {
    return Auth.userData && Auth.userData.role === 'admin';
  },

  // Get the institution ID for the current user
  getInstitutionId() {
    return Auth.userData ? Auth.userData.institution_id : null;
  }
};
