import { createContext, useContext, useState, useEffect } from 'react';
import {
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import { auth } from '../firebase';

const ACCESS_TOKEN_KEY = 'digiscribe_access_token';

const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('user');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          const tokenResult = await firebaseUser.getIdTokenResult();
          const token = await firebaseUser.getIdToken();
          try {
            sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
          } catch {
            // ignore storage failures
          }
          const claims = tokenResult.claims;
          // Support legacy admin boolean and old role names
          let userRole = claims.role || (claims.admin ? 'admin' : 'user');
          if (userRole === 'superAdmin' || userRole === 'lguAdmin') {
            userRole = 'admin';
          }
          setRole(userRole);
        } catch {
          setRole('user');
        }
      } else {
        setUser(null);
        setRole('user');
        try {
          sessionStorage.removeItem(ACCESS_TOKEN_KEY);
        } catch {
          // ignore storage failures
        }
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email, password, options = {}) => {
    const remember = Boolean(options.remember);
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    return signInWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    try {
      sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    } catch {
      // ignore storage failures
    }
    return signOut(auth);
  };

  const getIdToken = async (forceRefresh = false) => {
    if (!auth.currentUser) return null;
    const token = await auth.currentUser.getIdToken(forceRefresh);
    try {
      sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
    } catch {
      // ignore storage failures
    }
    return token;
  };

  const isAdmin = role === 'admin';

  const value = { user, loading, role, isAdmin, login, logout, getIdToken };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
