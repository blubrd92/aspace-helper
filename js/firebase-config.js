// firebase-config.js
// Firebase initialization and configuration.
// Firebase web API keys are designed to be public. Security comes from Firestore Security Rules.
// Replace these placeholder values with your actual Firebase project config.

const firebaseConfig = {
  apiKey: "AIzaSyCuECv_JVM8AwYAAeGf1jk8G5F_Xh4Lw3s",
  authDomain: "aspace-helper.firebaseapp.com",
  projectId: "aspace-helper",
  storageBucket: "aspace-helper.firebasestorage.app",
  messagingSenderId: "444451094910",
  appId: "1:444451094910:web:a70d01058a445ebcd5332f"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Convenience references
const auth = firebase.auth();
const db = firebase.firestore();

// Google Auth provider
const googleProvider = new firebase.auth.GoogleAuthProvider();
