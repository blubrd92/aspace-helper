// auth.js
// Authentication module: email/password (primary), Google sign-in (optional),
// password reset, session management, and auth state changes.

const Auth = {
  currentUser: null,   // Firebase auth user
  userData: null,       // Firestore user document data

  // Map Firebase error codes to friendly messages
  ERROR_MESSAGES: {
    'auth/email-already-in-use': 'An account with this email already exists. Try signing in instead.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/user-not-found': 'Invalid email or password.',
    'auth/wrong-password': 'Invalid email or password.',
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Check your internet connection and try again.',
    'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
    'auth/cancelled-popup-request': 'Google sign-in was cancelled.',
    'auth/requires-recent-login': 'Please sign out and sign back in before changing your email.',
    'auth/operation-not-allowed': 'Email update is not allowed. Please contact support.'
  },

  // Get a human-readable error message from a Firebase error
  getErrorMessage(error) {
    return Auth.ERROR_MESSAGES[error.code] || 'Something went wrong. Please try again.';
  },

  // Sign in with email and password
  async signInWithEmail(email, password) {
    try {
      const result = await auth.signInWithEmailAndPassword(email, password);
      return { user: result.user, error: null };
    } catch (error) {
      console.error('Email sign-in error:', error);
      return { user: null, error: Auth.getErrorMessage(error) };
    }
  },

  // Create account with email and password, optionally setting display name
  async createAccountWithEmail(email, password, displayName) {
    try {
      const result = await auth.createUserWithEmailAndPassword(email, password);
      if (displayName) {
        await result.user.updateProfile({ displayName });
      }
      return { user: result.user, error: null };
    } catch (error) {
      console.error('Account creation error:', error);
      return { user: null, error: Auth.getErrorMessage(error) };
    }
  },

  // Sign in with Google popup
  async signInWithGoogle() {
    try {
      const result = await auth.signInWithPopup(googleProvider);
      return { user: result.user, error: null };
    } catch (error) {
      console.error('Google sign-in error:', error);
      return { user: null, error: Auth.getErrorMessage(error) };
    }
  },

  // Send password reset email
  // Always returns success to avoid revealing whether email exists (security)
  async sendPasswordReset(email) {
    try {
      await auth.sendPasswordResetEmail(email);
      return { success: true, error: null };
    } catch (error) {
      // Return success for user-not-found to prevent email enumeration
      if (error.code === 'auth/user-not-found') {
        return { success: true, error: null };
      }
      console.error('Password reset error:', error);
      return { success: false, error: Auth.getErrorMessage(error) };
    }
  },

  // Sign out
  async signOut() {
    try {
      await auth.signOut();
      Auth.currentUser = null;
      Auth.userData = null;
      App.showView('login');
      App.showAuthForm('signin');
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

  // Update display name on Firebase Auth profile and Firestore user doc
  async updateDisplayName(displayName) {
    try {
      await Auth.currentUser.updateProfile({ displayName });
      await DB.updateUser(Auth.currentUser.uid, { display_name: displayName });
      Auth.userData.display_name = displayName;
      return { success: true, error: null };
    } catch (error) {
      console.error('Display name update error:', error);
      return { success: false, error: 'Failed to update display name. Please try again.' };
    }
  },

  // Update email address. Requires re-authentication with current password.
  async updateEmail(newEmail, currentPassword) {
    try {
      // Re-authenticate the user first
      const credential = firebase.auth.EmailAuthProvider.credential(
        Auth.currentUser.email, currentPassword
      );
      await Auth.currentUser.reauthenticateWithCredential(credential);

      // Update email in Firebase Auth
      await Auth.currentUser.updateEmail(newEmail);

      // Update email in Firestore user doc
      await DB.updateUser(Auth.currentUser.uid, { email: newEmail });
      Auth.userData.email = newEmail;

      return { success: true, error: null };
    } catch (error) {
      console.error('Email update error:', error);
      const msg = Auth.ERROR_MESSAGES[error.code] || 'Failed to update email. Please check your password and try again.';
      return { success: false, error: msg };
    }
  },

  // Update password. Requires re-authentication with current password.
  async updatePassword(currentPassword, newPassword) {
    try {
      const credential = firebase.auth.EmailAuthProvider.credential(
        Auth.currentUser.email, currentPassword
      );
      await Auth.currentUser.reauthenticateWithCredential(credential);
      await Auth.currentUser.updatePassword(newPassword);
      return { success: true, error: null };
    } catch (error) {
      console.error('Password update error:', error);
      const msg = Auth.ERROR_MESSAGES[error.code] || 'Failed to update password. Please check your current password and try again.';
      return { success: false, error: msg };
    }
  },

  // Check if current user signed in via Google (no email/password management)
  isGoogleUser() {
    return Auth.currentUser &&
      Auth.currentUser.providerData.some(p => p.providerId === 'google.com');
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
