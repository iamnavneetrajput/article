import React, { useState, useEffect } from "react";
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc, 
  setDoc,
  deleteDoc,
  serverTimestamp 
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { handleFirestoreError, OperationType } from "../lib/errorHandling";
import { 
  Users, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Shield, 
  User as UserIcon,
  Search,
  MoreVertical,
  ChevronDown
} from "lucide-react";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";

interface AccessRequest {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  status: 'pending' | 'approved' | 'rejected';
  timestamp: any;
  message?: string;
}

export default function AdminDashboard() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [admins, setAdmins] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'requests' | 'users'>('requests');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    // Listen for requests
    const qRequests = query(collection(db, "accessRequests"), orderBy("timestamp", "desc"));
    const unsubscribeRequests = onSnapshot(qRequests, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AccessRequest[];
      setRequests(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "accessRequests");
    });

    // Listen for users
    const qUsers = query(collection(db, "users"), orderBy("email", "asc"));
    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "users");
    });

    // Listen for admins list for role checking
    const unsubscribeAdmins = onSnapshot(collection(db, "admins"), (snapshot) => {
      setAdmins(snapshot.docs.map(doc => doc.id));
    });

    return () => {
      unsubscribeRequests();
      unsubscribeUsers();
      unsubscribeAdmins();
    };
  }, []);

  const handleAction = async (request: AccessRequest, action: 'approve' | 'reject') => {
    try {
      const requestRef = doc(db, "accessRequests", request.id);
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      
      await updateDoc(requestRef, {
        status: newStatus,
        processedAt: serverTimestamp()
      });

      if (action === 'approve') {
        // Add to admins collection
        await setDoc(doc(db, "admins", request.userId), {
          uid: request.userId,
          email: request.userEmail,
          grantedAt: serverTimestamp(),
          grantedBy: "system"
        });
      } else {
        // Remove from admins collection if they were previously approved
        await deleteDoc(doc(db, "admins", request.userId));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "accessRequests");
    }
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (userEmail.toLowerCase() === "navneet709123@gmail.com") {
      alert("The primary administrator account cannot be deleted.");
      return;
    }

    if (!confirm("Are you sure you want to delete this user? This will permanently remove their profile data.")) {
      return;
    }

    try {
      await deleteDoc(doc(db, "users", userId));
      await deleteDoc(doc(db, "admins", userId)); // Also revoke admin status if they had it
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${userId}`);
    }
  };

  const filteredRequests = requests.filter(req => {
    const matchesFilter = filter === 'all' || req.status === filter;
    const matchesSearch = req.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         req.userName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const filteredUsers = users.filter(u => {
    const term = searchTerm.toLowerCase();
    return u.email?.toLowerCase().includes(term) || u.displayName?.toLowerCase().includes(term);
  });

  const counts = {
    all: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tighter uppercase flex items-center gap-3 text-slate-800">
            <Shield className="w-8 h-8 text-blue-600" />
            Administration
          </h2>
          <p className="text-slate-500 text-sm italic">User permissions and access gateway.</p>
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto shrink-0">
          <button 
            onClick={() => setActiveTab('requests')}
            className={cn(
              "flex-1 sm:flex-none px-6 py-2 text-[10px] font-bold uppercase tracking-[0.1em] rounded-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap",
              activeTab === 'requests' ? "bg-white text-slate-900 shadow-md" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Clock size={14} /> Requests
          </button>
          <button 
            onClick={() => setActiveTab('users')}
            className={cn(
              "flex-1 sm:flex-none px-6 py-2 text-[10px] font-bold uppercase tracking-[0.1em] rounded-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap",
              activeTab === 'users' ? "bg-white text-slate-900 shadow-md" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Users size={14} /> Users
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Pending", count: counts.pending, status: "pending", color: "text-amber-500" },
          { label: "Approved", count: counts.approved, status: "approved", color: "text-emerald-500" },
          { label: "Rejected", count: counts.rejected, status: "rejected", color: "text-rose-500" },
          { label: "Total Users", count: users.length, status: "all", color: "text-slate-900" },
        ].map((stat, i) => (
          <div 
            key={i} 
            className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer group"
            onClick={() => {
              if (stat.status !== "all") {
                setActiveTab('requests');
                setFilter(stat.status as any);
              } else {
                setActiveTab('users');
              }
            }}
          >
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{stat.label}</div>
            <div className={cn("text-2xl font-mono font-black", stat.color)}>
              {stat.count.toString().padStart(2, '0')}
            </div>
            <div className="w-full h-1 bg-slate-100 mt-3 rounded-full overflow-hidden">
               <motion.div 
                 initial={{ width: 0 }}
                 animate={{ width: "100%" }}
                 className={cn("h-full", stat.color.replace('text', 'bg'))} 
               />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="flex border-b border-slate-200 bg-slate-50/30">
          <button
            onClick={() => setActiveTab('requests')}
            className={cn(
              "px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] relative transition-all",
              activeTab === 'requests' ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
            )}
          >
            Requests
            {activeTab === 'requests' && (
              <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
            )}
            {counts.pending > 0 && (
              <span className="ml-2 px-1.5 py-0.5 bg-amber-500 text-white rounded-full text-[8px] animate-pulse">
                {counts.pending}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={cn(
              "px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] relative transition-all",
              activeTab === 'users' ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
            )}
          >
            Users
            {activeTab === 'users' && (
              <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
            )}
            <span className="ml-2 text-slate-300 font-mono">[{users.length}]</span>
          </button>
        </div>

        {activeTab === 'requests' ? (
          <>
            <div className="flex border-b border-slate-100 px-4 bg-slate-50/10">
              {(['pending', 'approved', 'rejected', 'all'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={cn(
                    "px-4 py-3 text-[9px] font-bold uppercase tracking-wider relative transition-colors flex items-center gap-2",
                    filter === t ? "text-slate-900" : "text-slate-400 hover:text-slate-500"
                  )}
                >
                  <span className="relative z-10">{t}</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-full text-[8px] font-mono",
                    filter === t ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
                  )}>
                    {counts[t]}
                  </span>
                  {filter === t && (
                    <motion.div 
                      layoutId="filter-pill"
                      className="absolute bottom-0 left-2 right-2 h-0.5 bg-slate-900"
                    />
                  )}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 text-slate-500 text-[10px] uppercase font-bold tracking-[0.1em]">
                    <th className="px-6 py-4">User Details</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Request Date</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <AnimatePresence mode="popLayout">
                    {filteredRequests.length === 0 ? (
                      <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <td colSpan={4} className="px-6 py-12 text-center text-slate-400 text-sm italic">
                          {loading ? "Loading requests..." : "No matching requests found."}
                        </td>
                      </motion.tr>
                    ) : (
                      filteredRequests.map((req) => (
                        <motion.tr 
                          key={req.id}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="group hover:bg-slate-50/50 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 shrink-0">
                                <UserIcon size={18} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-800 truncate">{req.userName}</p>
                                <p className="text-xs text-slate-500 truncate">{req.userEmail}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-tight",
                              req.status === 'pending' && "bg-amber-50 text-amber-600 border border-amber-100",
                              req.status === 'approved' && "bg-emerald-50 text-emerald-600 border border-emerald-100",
                              req.status === 'rejected' && "bg-rose-50 text-rose-600 border border-rose-100"
                            )}>
                              {req.status === 'pending' && <Clock size={12} />}
                              {req.status === 'approved' && <CheckCircle2 size={12} />}
                              {req.status === 'rejected' && <XCircle size={12} />}
                              {req.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-xs text-slate-500">
                              {req.timestamp?.toDate ? req.timestamp.toDate().toLocaleString() : "Syncing..."}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {req.status !== 'approved' && (
                                <button
                                  onClick={() => handleAction(req, 'approve')}
                                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                                  title="Approve Admin"
                                >
                                  <Shield size={16} />
                                </button>
                              )}
                              {req.status !== 'rejected' && (
                                <button
                                  onClick={() => handleAction(req, 'reject')}
                                   className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                                   title="Reject/Revoke"
                                >
                                  <XCircle size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      ))
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 text-slate-500 text-[10px] uppercase font-bold tracking-[0.1em]">
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Joined</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <AnimatePresence mode="popLayout">
                  {filteredUsers.length === 0 ? (
                    <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <td colSpan={4} className="px-6 py-12 text-center text-slate-400 text-sm">
                        No identities found in central repository.
                      </td>
                    </motion.tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <motion.tr 
                        key={user.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="group hover:bg-slate-50/30"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {user.photoURL ? (
                              <img src={user.photoURL} className="w-8 h-8 rounded-full border border-slate-200" alt="" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-[10px] font-bold">
                                {user.displayName?.charAt(0) || "U"}
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-semibold text-slate-800">{user.displayName || "New User"}</p>
                              <p className="text-[10px] font-mono text-slate-400">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {admins.includes(user.id) || user.email?.toLowerCase() === "navneet709123@gmail.com" ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-600 border border-blue-100 rounded text-[10px] font-bold uppercase">
                              <Shield size={10} /> Admin
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-slate-100 text-slate-500 border border-slate-200 rounded text-[10px] font-bold uppercase">
                              Standard
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs text-slate-500 flex flex-col gap-0.5">
                            <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400"><Clock size={10} /> Init:</span>
                            {user.createdAt?.toDate ? user.createdAt.toDate().toLocaleDateString() : "Historical"}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleDeleteUser(user.id, user.email)}
                            className={cn(
                              "p-2 rounded-lg transition-colors",
                              user.email?.toLowerCase() === "navneet709123@gmail.com"
                                ? "text-slate-200 cursor-not-allowed"
                                : "text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            )}
                            title="Delete User"
                            disabled={user.email?.toLowerCase() === "navneet709123@gmail.com"}
                          >
                            <XCircle size={18} />
                          </button>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
