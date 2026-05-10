import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation } from "react-router-dom";
import { 
  Car, 
  Database, 
  FileText, 
  Upload, 
  LayoutDashboard, 
  ChevronRight, 
  User, 
  LogOut,
  Settings,
  Plus,
  Trash2,
  Download,
  AlertCircle,
  Lock,
  ShieldCheck,
  Users,
  CheckCircle2,
  Clock
} from "lucide-react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider, connectionPromise, isFirebaseConnected, db } from "./lib/firebase";
import { doc, setDoc, serverTimestamp, getDocs, collection, query, where, addDoc } from "firebase/firestore";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { handleFirestoreError, OperationType } from "./lib/errorHandling";
import { cn } from "./lib/utils";
import { motion, AnimatePresence } from "motion/react";

function ConnectivityBanner() {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    // Initial check
    connectionPromise.then(() => {
      setIsConnected(isFirebaseConnected);
    });
    
    // Check periodically
    const check = setInterval(() => {
      setIsConnected(isFirebaseConnected);
    }, 3000);
    
    return () => clearInterval(check);
  }, []);

  if (isConnected) return null;

  return (
    <motion.div 
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      className="bg-orange-600 text-white px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 shrink-0 overflow-hidden"
    >
      <AlertCircle size={12} />
      <span>Connection Status: Cannot reach database. Check ad-blockers or connection.</span>
    </motion.div>
  );
}

// Components
import Dashboard from "./components/Dashboard";
import BrandManager from "./components/BrandManager";
import ModelManager from "./components/ModelManager";
import ImportPanel from "./components/ImportPanel";
import ArticleGenerator from "./components/ArticleGenerator";
import GlobalSearch from "./components/GlobalSearch";
import AdminDashboard from "./components/AdminDashboard";

function Sidebar() {
  const location = useLocation();
  const { user, isAdmin } = useAuth();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [hasRequest, setHasRequest] = useState(false);

  useEffect(() => {
    if (user && !isAdmin) {
      const checkRequest = async () => {
        try {
          const q = query(collection(db, "accessRequests"), where("userId", "==", user.uid));
          const snap = await getDocs(q);
          setHasRequest(!snap.empty);
        } catch (err) {
          console.error("Error checking request status:", err);
        }
      };
      checkRequest();
    }
  }, [user, isAdmin]);

  const navItems = [
    { name: "Dashboard", path: "/", icon: LayoutDashboard },
    { name: "Brands & Models", path: "/brands", icon: Car },
    { name: "Powertrains", path: "/models", icon: Database },
    { name: "Articles", path: "/articles", icon: FileText },
    { name: "JSON Importer", path: "/import", icon: Upload },
  ];

  if (isAdmin) {
    navItems.push({ name: "User Requests", path: "/admin", icon: Users });
  }

  const handleRequestAccess = async () => {
    if (!user || requesting || hasRequest) return;
    setRequesting(true);
    try {
      await addDoc(collection(db, "accessRequests"), {
        userId: user.uid,
        userEmail: user.email,
        userName: user.displayName || "Unknown User",
        timestamp: serverTimestamp(),
        status: "pending",
        message: "User requested administrative access."
      });
      setHasRequest(true);
      alert("Request sent! A system administrator will review your access level.");
    } catch (err) {
      console.error("Error sending request:", err);
      handleFirestoreError(err, OperationType.WRITE, "accessRequests");
    } finally {
      setRequesting(false);
    }
  };

  const handleLogin = async () => {
    if (isLoggingIn) return;
    
    setIsLoggingIn(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      console.log("Authentication successful:", result.user.email);
    } catch (err: any) {
      const errorCode = err.code || "";
      const errorMessage = err.message || "";
      
      // Specifically handle the case where iframe restrictions block the popup result
      if (
        errorCode === "auth/popup-closed-by-user" || 
        errorCode === "auth/cancelled-popup-request"
      ) {
        // If it seems like a false positive (user says they didn't close it), suggest opening in new tab
        console.warn("Sign-in popup issue detected. This is often caused by iframe restrictions.");
        return;
      }

      if (errorCode === "auth/network-request-failed") {
        alert("Connectivity Error: Authentication service unreachable. Check ad-blockers.");
      } else if (errorCode === "auth/popup-blocked") {
        alert("Browser Error: Login popup blocked. Please allow popups.");
      } else {
        alert(`Authentication failed: ${errorMessage}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => signOut(auth);

  const openInNewTab = () => {
    window.open(window.location.href, "_blank");
  };

  return (
    <aside className="w-64 bg-slate-900 flex flex-col shrink-0 tech-sidebar">
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center">
          <Database className="w-5 h-5 text-white" />
        </div>
        <span className="text-lg font-bold text-white tracking-tight">Articles Hub</span>
      </div>

      <nav className="flex-1 px-4 space-y-1 pt-4">
        <div className="text-slate-500 text-[10px] uppercase font-bold tracking-widest px-2 mb-2">Navigation</div>
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "tech-nav-item",
              location.pathname === item.path && "tech-nav-item-active"
            )}
          >
            <item.icon className="w-4 h-4" />
            <span className="font-medium">{item.name}</span>
          </Link>
        ))}
      </nav>

      <div className="p-4 bg-slate-950 mt-auto">
        {user ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center overflow-hidden">
              {user.photoURL ? <img src={user.photoURL} alt="" /> : <User size={16} className="text-slate-400" />}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-semibold text-white truncate">{user.displayName || "User"}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={cn(
                  "text-[8px] uppercase font-bold tracking-tight px-1 rounded",
                  isAdmin ? "bg-blue-500 text-white" : "bg-slate-800 text-slate-400"
                )}>
                  {isAdmin ? "Administrator" : "Standard Access"}
                </span>
                {!isAdmin && (
                  <button
                    onClick={handleRequestAccess}
                    disabled={requesting || hasRequest}
                    className={cn(
                      "text-[8px] uppercase font-bold tracking-tight px-1.5 py-0.5 rounded flex items-center gap-1 transition-all",
                      hasRequest 
                        ? "bg-slate-800 text-slate-500 cursor-default" 
                        : "bg-blue-900/40 text-blue-300 hover:bg-blue-900/60"
                    )}
                  >
                    {hasRequest ? (
                      <>Requested <CheckCircle2 size={8} /></>
                    ) : (
                      <>Request Admin <ShieldCheck size={8} /></>
                    )}
                  </button>
                )}
              </div>
              <button 
                onClick={handleLogout}
                className="text-[9px] text-slate-500 hover:text-white uppercase font-bold tracking-widest flex items-center gap-1 mt-1 transition-colors"
              >
                Logout <LogOut size={10} />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <button 
              id="login-button-sidebar"
              onClick={handleLogin}
              disabled={isLoggingIn}
              className={cn(
                "w-full py-3 text-white text-[10px] font-bold uppercase tracking-[0.2em] rounded transition-all shadow-lg flex items-center justify-center gap-2 group",
                isLoggingIn ? "bg-slate-700 cursor-wait" : "bg-blue-600 hover:bg-blue-500 shadow-blue-900/40"
              )}
            >
              <User size={14} className={cn(isLoggingIn ? "animate-pulse" : "group-hover:scale-110 transition-transform")} />
              {isLoggingIn ? "Authenticating..." : "Sign in with Google"}
            </button>
            <div className="space-y-2">
              <p className="text-[9px] text-slate-400 text-center leading-relaxed">
                New users: Sign in to create your secure system account.
              </p>
              <div className="flex flex-col gap-1.5 pt-1">
                <button 
                  onClick={openInNewTab}
                  className="w-full text-center text-[8px] text-blue-400 hover:text-blue-300 uppercase font-bold tracking-widest transition-colors flex items-center justify-center gap-1"
                >
                  <Plus size={10} /> Open in New Window to Login
                </button>
                <button 
                  onClick={() => alert("TROUBLESHOOTING LOGIN:\n\n1. Popups: If nothing happens after clicking sign-in, check your browser settings to allow popups.\n2. In-App restrictions: If the popup closes without logging you in, please use the 'Open in New Window' button above to login in a dedicated tab.\n3. Cookies: Ensure third-party cookies are not blocked.")}
                  className="w-full text-center text-[8px] text-slate-600 hover:text-slate-400 uppercase font-bold tracking-widest transition-colors"
                >
                  Having trouble?
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function PageTitle() {
  const location = useLocation();
  const path = location.pathname.split("/")[1] || "Dashboard";
  const titles: Record<string, string> = {
    "dashboard": "Overview",
    "brands": "Brands",
    "models": "Models & Specs",
    "articles": "Articles Hub",
    "import": "Import Data"
  };
  
  return (
    <h1 className="text-lg font-semibold capitalize text-slate-800">
      {titles[path] || path}
    </h1>
  );
}

function AppContent() {
  const { user, isAdmin } = useAuth();
  
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <ConnectivityBanner />
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 shrink-0">
          <div className="flex items-center gap-4">
            <PageTitle />
            <span className="px-2 py-1 bg-green-50 text-green-700 border border-green-200 text-[10px] font-bold rounded uppercase">Online</span>
          </div>
          <div className="flex items-center gap-3">
            <GlobalSearch />
          </div>
        </header>
        
        <main className="flex-1 overflow-y-auto p-8">
          <AnimatePresence mode="wait">
            {user ? (
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/brands" element={<BrandManager />} />
                <Route path="/models" element={<ModelManager />} />
                <Route path="/articles" element={<ArticleGenerator />} />
                <Route path="/import" element={<ImportPanel />} />
                {isAdmin && <Route path="/admin" element={<AdminDashboard />} />}
              </Routes>
            ) : (
              <div className="h-full flex flex-col items-center justify-center space-y-6 max-w-md mx-auto text-center">
                <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center">
                  <Lock className="w-10 h-10 text-slate-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Access Restricted</h2>
                  <p className="mt-2 text-slate-500 leading-relaxed">
                    This repository is restricted to registered system users. Please sign in using your corporate credentials to continue.
                  </p>
                </div>
                <button 
                  onClick={() => document.getElementById('login-button-sidebar')?.click()}
                  className="px-8 py-3 bg-blue-600 text-white text-[11px] font-bold uppercase tracking-[0.2em] rounded-lg hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/20"
                >
                  Authenticate Now
                </button>
              </div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
}
