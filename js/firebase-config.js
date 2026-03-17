// firebase-config.js
// Firebase initialization and configuration.
// Firebase web API keys are designed to be public. Security comes from Firestore Security Rules.
// Replace these placeholder values with your actual Firebase project config.

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Convenience references
const auth = firebase.auth();
const db = firebase.firestore();

// Google Auth provider
const googleProvider = new firebase.auth.GoogleAuthProvider();
