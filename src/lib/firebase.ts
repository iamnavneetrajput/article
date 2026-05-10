import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";
import firebaseConfig from "@/firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

// Explicitly set persistence to local to handle iframe session issues better
setPersistence(auth, browserLocalPersistence).catch(err => console.error("Persistence error:", err));

// Connection Test as per instructions
export let isFirebaseConnected = true;
const connectionPromise = (async () => {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    isFirebaseConnected = true;
    console.log("Firebase connection established successfully");
  } catch (error: any) {
    // If it's a permission error, it means we reached the server but don't have access, which is fine for a connection test
    if (error.code === "permission-denied" || error.message?.includes("insufficient permissions")) {
      isFirebaseConnected = true;
      return;
    }
    
    isFirebaseConnected = false;
    if (error instanceof Error && (error.message.includes("offline") || error.message.includes("network"))) {
      console.error("Firebase Connectivity Error: The application cannot reach the backend. This is often caused by ad-blockers, strict firewalls, or lack of internet.");
    } else {
      console.error("Firebase connection test failed:", error);
    }
  }
})();

export { connectionPromise };
