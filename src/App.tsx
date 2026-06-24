import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation } from "react-router-dom";
import { 
  Car, 
  Database, 
  FileText, 
  Upload, 
  LayoutDashboard, 
  ChevronRight, 
  Menu,
  X as CloseIcon,
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
      className="bg-orange-600 text-white px-4 py-2 text-[9px] md:text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 shrink-0 overflow-hidden text-center"
    >
      <AlertCircle size={12} className="shrink-0" />
      <span>Offline Mode: Database unreachable. Check ad-blockers.</span>
    </motion.div>
  );
}

// Components
import Dashboard from "./components/Dashboard";
import BrandManager from "./components/BrandManager";
import ImportPanel from "./components/ImportPanel";
import ArticleGenerator from "./components/ArticleGenerator";
import GlobalSearch from "./components/GlobalSearch";
import AdminDashboard from "./components/AdminDashboard";

function Sidebar({ 
  isCollapsed, 
  setIsCollapsed, 
  isMobileOpen, 
  setIsMobileOpen 
}: { 
  isCollapsed: boolean, 
  setIsCollapsed: (v: boolean) => void,
  isMobileOpen: boolean,
  setIsMobileOpen: (v: boolean) => void
}) {
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
      
      if (
        errorCode === "auth/popup-closed-by-user" || 
        errorCode === "auth/cancelled-popup-request"
      ) {
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

  const sidebarClasses = cn(
    "fixed inset-y-0 left-0 z-50 bg-slate-900 flex flex-col h-full shrink-0 tech-sidebar transition-all duration-300 lg:static lg:flex",
    isCollapsed ? "w-20" : "w-64",
    isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
  );

  return (
    <>
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileOpen(false)}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <aside className={sidebarClasses}>
        <div className={cn("p-6 flex items-center gap-3 relative", isCollapsed && "justify-center px-0")}>
          <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center shrink-0">
            <Database className="w-5 h-5 text-white" />
          </div>
          {!isCollapsed && (
            <motion.span 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-lg font-bold text-white tracking-tight truncate"
            >
              Articles Hub
            </motion.span>
          )}

          {/* Collapse Toggle - Desktop Only */}
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="absolute -right-3 top-7 w-6 h-6 bg-slate-800 border border-slate-700 text-slate-400 rounded-full flex items-center justify-center hover:text-white transition-colors hidden lg:flex"
          >
            <ChevronRight className={cn("w-3 h-3 transition-transform", isCollapsed ? "" : "rotate-180")} />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-1 pt-4 overflow-y-auto no-scrollbar">
          <div className={cn("text-slate-500 text-[10px] uppercase font-bold tracking-widest px-2 mb-2", isCollapsed && "text-center")}>
            {isCollapsed ? "NAV" : "Navigation"}
          </div>
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setIsMobileOpen(false)}
              className={cn(
                "tech-nav-item relative group",
                location.pathname === item.path && "tech-nav-item-active",
                isCollapsed && "justify-center px-0"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {!isCollapsed && <span className="font-medium truncate">{item.name}</span>}
              
              {isCollapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                  {item.name}
                </div>
              )}
            </Link>
          ))}
        </nav>

        <div className="p-4 bg-slate-950 mt-auto">
          {user ? (
            <div className={cn("flex items-center gap-3", isCollapsed && "flex-col")}>
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                {user.photoURL ? <img src={user.photoURL} alt="" /> : <User size={16} className="text-slate-400" />}
              </div>
              {!isCollapsed ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex-1 overflow-hidden"
                >
                  <p className="text-xs font-semibold text-white truncate">{user.displayName || "User"}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    <span className={cn(
                      "text-[8px] uppercase font-bold tracking-tight px-1 rounded truncate max-w-[80px]",
                      isAdmin ? "bg-blue-500 text-white" : "bg-slate-800 text-slate-400"
                    )}>
                      {isAdmin ? "Admin" : "Standard"}
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
                        {hasRequest ? "Req sent" : "Req Admin"}
                      </button>
                    )}
                  </div>
                  <button 
                    onClick={handleLogout}
                    className="text-[9px] text-slate-500 hover:text-white uppercase font-bold tracking-widest flex items-center gap-1 mt-1 transition-colors"
                  >
                    Logout <LogOut size={10} />
                  </button>
                </motion.div>
              ) : (
                <button 
                  onClick={handleLogout}
                  className="p-1.5 text-slate-400 hover:text-white"
                  title="Logout"
                >
                  <LogOut size={16} />
                </button>
              )}
            </div>
          ) : (
            <div className={cn("space-y-4", isCollapsed && "space-y-2")}>
              <button 
                id="login-button-sidebar"
                onClick={handleLogin}
                disabled={isLoggingIn}
                className={cn(
                  "w-full py-3 text-white text-[10px] font-bold uppercase tracking-[0.2em] rounded transition-all shadow-lg flex items-center justify-center gap-2 group",
                  isLoggingIn ? "bg-slate-700 cursor-wait" : "bg-blue-600 hover:bg-blue-500 shadow-blue-900/40",
                  isCollapsed && "py-2 px-0"
                )}
              >
                <User size={14} className={cn(isLoggingIn ? "animate-pulse" : "group-hover:scale-110 transition-transform")} />
                {!isCollapsed && (isLoggingIn ? "Authenticating..." : "Sign in")}
              </button>
              
              {!isCollapsed && (
                <div className="space-y-2">
                  <p className="text-[9px] text-slate-400 text-center leading-relaxed">
                    New users: Sign in to create your account.
                  </p>
                  <div className="flex flex-col gap-1.5 pt-1">
                    <button 
                      onClick={openInNewTab}
                      className="w-full text-center text-[8px] text-blue-400 hover:text-blue-300 uppercase font-bold tracking-widest transition-colors flex items-center justify-center gap-1"
                    >
                      <Plus size={10} /> Dedicated Tab Login
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar 
        isCollapsed={isCollapsed} 
        setIsCollapsed={setIsCollapsed}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
      />
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <ConnectivityBanner />
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-3 md:px-6 shrink-0 z-30">
          <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
            {/* Hamburger Toggle - Mobile Only */}
            <button 
              onClick={() => setIsMobileOpen(true)}
              className="p-2.5 hover:bg-slate-100 rounded-xl text-slate-900 lg:hidden shadow-sm border border-slate-100"
            >
              <Menu size={20} />
            </button>
            <div className="truncate shrink">
              <PageTitle />
            </div>
            <span className="hidden lg:inline-block px-2 py-1 bg-green-50 text-green-700 border border-green-200 text-[10px] font-bold rounded uppercase">BY NAVNEET</span>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <GlobalSearch />
          </div>
        </header>
        
        <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          <AnimatePresence mode="wait">
            {user ? (
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/brands" element={<BrandManager />} />
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
