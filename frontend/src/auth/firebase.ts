import { getApps, initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseEnabled = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
const auth = firebaseEnabled ? getAuth(getApps()[0] ?? initializeApp(config)) : null;

export const firebaseAuth = {
  observe(callback: (user: User | null) => void) {
    return auth ? onAuthStateChanged(auth, callback) : () => undefined;
  },
  async signIn(): Promise<User | null> {
    if (!auth) {
      throw new Error('Firebase Google Authentication is not configured. Please supply VITE_FIREBASE_* environment variables.');
    }
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const res = await signInWithPopup(auth, provider);
      return res.user;
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        throw new Error('Google sign-in popup was closed before completing authentication.');
      }
      if (err?.code === 'auth/popup-blocked') {
        throw new Error('Google sign-in popup was blocked by browser. Please allow popups for this site.');
      }
      if (err?.code === 'auth/unauthorized-domain') {
        throw new Error('This domain is not authorized in Firebase Console (Authentication > Settings > Authorized domains).');
      }
      if (err?.code === 'auth/invalid-api-key') {
        throw new Error('Invalid Firebase API key in VITE_FIREBASE_API_KEY.');
      }
      console.warn('Firebase Google Auth error:', err);
      throw new Error(err?.message || 'Google sign-in failed.');
    }
  },
  async signOut(): Promise<void> {
    return auth ? signOut(auth) : Promise.resolve();
  },
};
