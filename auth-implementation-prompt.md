# Authentication Implementation: Email/Password with Optional Google Sign-In

## Overview

ASpace Helper uses Firebase Auth with email/password as the primary authentication method. Google sign-in is available as an optional convenience but not required. Email/password is the default because not all library staff have or want to use Google accounts for work tools.

## Firebase Auth Providers to Enable

In the Firebase console under Authentication > Sign-in providers:
- **Email/Password**: Enabled (primary)
- **Google**: Enabled (optional convenience)

## Login/Signup Screen

Build a single authentication screen with two states: Login and Create Account.

### Login State (default)
- Email input field
- Password input field
- "Sign In" button
- "Forgot password?" link below the form
- "Don't have an account? Create one" link that toggles to Create Account state
- Divider line with "or"
- "Sign in with Google" button (styled secondary/subdued compared to the email form)
- Error messages appear inline below the form (e.g., "Invalid email or password", "No account found with this email")

### Create Account State
- Email input field
- Password input field (minimum 6 characters, Firebase's default requirement)
- Confirm password input field
- "Create Account" button
- "Already have an account? Sign in" link that toggles back to Login state
- Divider line with "or"
- "Sign up with Google" button
- Error messages inline (e.g., "Passwords don't match", "An account with this email already exists")

### Forgot Password Flow
- Clicking "Forgot password?" shows a simple form: email input and "Send Reset Link" button
- On submit, call `firebase.auth().sendPasswordResetEmail(email)`
- Show confirmation message: "If an account exists for that email, a password reset link has been sent. Check your inbox."
- "Back to sign in" link
- Do NOT reveal whether the email exists in the system (security best practice). Always show the same confirmation message.

## Firebase Auth Code Pattern

Using Firebase compat SDK loaded via CDN:

```html
<!-- In index.html -->
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js"></script>
```

```javascript
// auth.js

// Initialize Firebase (firebaseConfig comes from firebase-config.js)
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// Email/Password Sign Up
async function signUpWithEmail(email, password) {
  try {
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    return userCredential.user;
  } catch (error) {
    throw error; // error.code will be things like 'auth/email-already-in-use', 'auth/weak-password'
  }
}

// Email/Password Sign In
async function signInWithEmail(email, password) {
  try {
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    return userCredential.user;
  } catch (error) {
    throw error; // error.code: 'auth/user-not-found', 'auth/wrong-password', 'auth/invalid-email'
  }
}

// Google Sign In
async function signInWithGoogle() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const userCredential = await auth.signInWithPopup(provider);
    return userCredential.user;
  } catch (error) {
    throw error;
  }
}

// Password Reset
async function sendPasswordReset(email) {
  try {
    await auth.sendPasswordResetEmail(email);
    // Always return success to avoid revealing whether email exists
    return true;
  } catch (error) {
    // Still return true for user-not-found to avoid email enumeration
    if (error.code === 'auth/user-not-found') {
      return true;
    }
    throw error;
  }
}

// Sign Out
async function signOut() {
  await auth.signOut();
}

// Auth State Listener - fires on login, logout, and page load
auth.onAuthStateChanged(async (user) => {
  if (user) {
    // User is signed in
    // Check if user document exists in Firestore
    // If not, this is a new user - show onboarding (create/join institution)
    // If yes, load their institution and show the project list
  } else {
    // User is signed out - show login screen
  }
});
```

## Error Messages (Human-Readable)

Map Firebase error codes to friendly messages:

| Firebase error code | Display message |
|---|---|
| `auth/email-already-in-use` | An account with this email already exists. Try signing in instead. |
| `auth/invalid-email` | Please enter a valid email address. |
| `auth/weak-password` | Password must be at least 6 characters. |
| `auth/user-not-found` | Invalid email or password. (Do not reveal that the account doesn't exist) |
| `auth/wrong-password` | Invalid email or password. (Same message as user-not-found) |
| `auth/too-many-requests` | Too many failed attempts. Please try again later. |
| `auth/network-request-failed` | Network error. Check your internet connection and try again. |
| `auth/popup-closed-by-user` | Google sign-in was cancelled. |
| (any other error) | Something went wrong. Please try again. |

## Post-Authentication Flow

After successful sign-in (by any method), the `onAuthStateChanged` listener fires. The app then:

1. Checks Firestore for a `users/{uid}` document.
2. If the document exists: load the user's `institution_id`, fetch the institution config, and navigate to the project list.
3. If the document does NOT exist: this is a first-time user. Show the onboarding screen where they choose to create a new institution or join an existing one with an invite code. After onboarding, the `users/{uid}` document gets created.

## UI Notes

- The auth screen should be clean, centered, and professional. No clutter.
- Show a loading spinner while authentication is processing.
- After sign-in, show a brief loading state ("Loading your workspace...") while Firestore data is fetched.
- The Google sign-in button should follow Google's branding guidelines (white background, Google "G" logo, "Sign in with Google" text). Use their standard button styling.
- On the Create Account form, validate that passwords match BEFORE submitting to Firebase. Don't waste a round trip for something you can catch client-side.
