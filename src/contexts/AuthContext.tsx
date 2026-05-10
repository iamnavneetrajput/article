import React, { createContext, useContext, useState, useEffect } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Sync user profile to database automatically on login
        const syncProfile = async () => {
          try {
            const userRef = doc(db, "users", u.uid);
            // Check if user already exists to avoid overwriting createdAt
            const userDoc = await getDoc(userRef);
            
            const userData: any = {
              uid: u.uid,
              email: u.email,
              displayName: u.displayName,
              photoURL: u.photoURL,
              lastLogin: serverTimestamp(), 
            };

            if (!userDoc.exists()) {
              userData.createdAt = serverTimestamp();
            }

            await setDoc(userRef, userData, { merge: true });
            console.log("User profile synced to Firestore");
          } catch (err) {
            console.error("Failed to sync user profile to Firestore:", err);
          }
        };
        
        syncProfile();

        // Hardcoded admin check for the primary account
        const isDefaultAdmin = u.email?.toLowerCase() === "navneet709123@gmail.com";
        
        if (isDefaultAdmin) {
          setIsAdmin(true);
        } else {
          try {
            const adminDoc = await getDoc(doc(db, "admins", u.uid));
            setIsAdmin(adminDoc.exists());
          } catch (err) {
            setIsAdmin(false);
          }
        }
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
