import React, { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, limit, deleteDoc, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { ImportLog } from "../types";
import { History, FileText, User as UserIcon, Calendar, CheckCircle2, AlertCircle, Clock, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import { handleFirestoreError, OperationType } from "../lib/errorHandling";

export default function ImportHistory() {
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "importLogs"),
      orderBy("timestamp", "desc"),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ImportLog[];
      setLogs(logsData);
      setLoading(false);
    }, (error) => {
      console.error("ImportHistory: Insufficient permissions to view logs", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleDeleteLog = async (logId: string) => {
    if (!confirm("Are you sure you want to delete this import record? This does not undo the imported data, only removes the log entry.")) return;
    
    try {
      await deleteDoc(doc(db, "importLogs", logId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `importLogs/${logId}`);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tighter uppercase flex items-center gap-3">
            <History className="text-blue-600" /> Import History
          </h2>
          <p className="tech-header">Log of production data injections</p>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center h-48 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
          <div className="flex flex-col items-center gap-2">
            <Clock className="animate-spin text-slate-400" />
            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Loading History...</p>
          </div>
        </div>
      ) : logs.length === 0 ? (
        <div className="flex items-center justify-center h-48 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-slate-400">
          <p className="text-[10px] uppercase font-bold tracking-widest">No injection records found</p>
        </div>
      ) : (
        <div className="tech-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="tech-table-header">
                <tr>
                  <th className="px-6 py-4">Source File</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Orchestrated By</th>
                  <th className="px-6 py-4">Records Processed</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 italic font-mono text-[11px]">
                <AnimatePresence mode="popLayout">
                  {logs.map((log) => (
                    <motion.tr 
                      key={log.id} 
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="hover:bg-slate-50/50 transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-bold text-slate-900 not-italic uppercase tracking-tight flex items-center gap-2">
                            <FileText size={14} className="text-blue-500" /> {log.fileName}
                          </span>
                          <span className="text-slate-400 flex items-center gap-1">
                            <Calendar size={12} /> {log.timestamp?.toDate ? format(log.timestamp.toDate(), 'PPpp') : 'Processing...'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {log.errorCount === 0 ? (
                          <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-green-100 text-green-700 rounded-full text-[9px] font-bold uppercase tracking-tighter not-italic">
                            <CheckCircle2 size={12} /> Clean Import
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-[9px] font-bold uppercase tracking-tighter not-italic">
                            <AlertCircle size={12} /> {log.errorCount} Warnings
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-slate-600 not-italic uppercase font-bold text-[10px]">
                          <UserIcon size={14} className="text-slate-400" />
                          {log.userEmail}
                        </div>
                      </td>
                      <td className="px-6 py-4 not-italic">
                        <div className="flex items-center gap-3 text-[10px] font-bold uppercase">
                          <div className="text-blue-600 bg-blue-50 px-2 py-1 rounded">B:{log.results.brands}</div>
                          <div className="text-purple-600 bg-purple-50 px-2 py-1 rounded">M:{log.results.models}</div>
                          <div className="text-orange-600 bg-orange-50 px-2 py-1 rounded">P:{log.results.powertrains}</div>
                          <div className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded">I:{log.results.intervals}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => handleDeleteLog(log.id)}
                          className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="p-4 bg-slate-900 text-slate-500 text-[10px] font-mono italic rounded-lg">
        {"// "} Showing the latest 20 production data injection logs. Each injection is atomic and logged for audit purposes.
      </div>
    </motion.div>
  );
}
