import React, { useState, useEffect } from "react";
import { collection, getDocs, query, orderBy, limit, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { cn } from "../lib/utils";
import { handleFirestoreError, OperationType } from "../lib/errorHandling";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import { 
  Car, 
  Database, 
  FileText, 
  TrendingUp, 
  Activity,
  History,
  LayoutDashboard
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
} from "recharts";
import ImportHistory from "./ImportHistory";

interface ImportLogSummary {
  id: string;
  timestamp: Timestamp;
  results: {
    brands: number;
    models: number;
    powertrains: number;
    intervals: number;
  };
  fileName: string;
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<"overview" | "history">("overview");
  const [stats, setStats] = useState({
    brands: 0,
    models: 0,
    articles: 0,
    intervals: 0
  });
  const [logs, setLogs] = useState<ImportLogSummary[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    async function loadStats() {
      try {
        const [brandSnap, modelSnap, articleSnap, intervalSnap] = await Promise.all([
          getDocs(collection(db, "brands")),
          getDocs(collection(db, "models")),
          getDocs(collection(db, "articles")),
          getDocs(collection(db, "serviceIntervals"))
        ]);

        setStats({
          brands: brandSnap.size,
          models: modelSnap.size,
          articles: articleSnap.size,
          intervals: intervalSnap.size
        });

        // Fetch logs separately
        try {
          const logSnap = await getDocs(query(collection(db, "importLogs"), orderBy("timestamp", "desc"), limit(20)));
          const fetchedLogs = logSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as ImportLogSummary[];
          setLogs(fetchedLogs);

          // Process chart data
          const last7Days = Array.from({ length: 7 }, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - (6 - i));
            return {
              name: format(date, "EEE"),
              fullDate: format(date, "yyyy-MM-dd"),
              count: 0
            };
          });

          fetchedLogs.forEach(log => {
            if (!log.timestamp) return;
            const logDate = log.timestamp.toDate();
            const dateStr = format(logDate, "yyyy-MM-dd");
            const dayData = last7Days.find(d => d.fullDate === dateStr);
            if (dayData) {
              dayData.count += log.results.intervals;
            }
          });
          setChartData(last7Days);
        } catch (logError) {
          console.warn("Could not load logs - user likely not admin", logError);
          // Set empty chart data
          const emptyDays = Array.from({ length: 7 }, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - (6 - i));
            return { name: format(date, "EEE"), count: 0 };
          });
          setChartData(emptyDays);
        }

      } catch (error) {
        handleFirestoreError(error, OperationType.GET, "dashboard_stats");
      }
    }
    loadStats();
  }, []);

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tighter uppercase">Dashboard</h2>
          <p className="tech-header text-slate-500">Insights and publication statistics</p>
        </div>
        
        <div className="flex bg-slate-200/50 p-1 rounded-lg">
          <button 
            onClick={() => setActiveTab("overview")}
            className={cn(
              "px-4 py-1.5 text-xs font-bold uppercase tracking-widest rounded-md transition-all flex items-center gap-2",
              activeTab === "overview" ? "bg-white text-slate-900 shadow-sm" : "hover:text-slate-900 text-slate-500"
            )}
          >
            <LayoutDashboard size={14} /> Overview
          </button>
          <button 
            onClick={() => setActiveTab("history")}
            className={cn(
              "px-4 py-1.5 text-xs font-bold uppercase tracking-widest rounded-md transition-all flex items-center gap-2",
              activeTab === "history" ? "bg-white text-slate-900 shadow-sm" : "hover:text-slate-900 text-slate-500"
            )}
          >
            <History size={14} /> Import History
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {activeTab === "overview" ? (
          <motion.div 
            key="overview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Total Brands", value: stats.brands, icon: Car, color: "text-slate-900" },
                { label: "Vehicle Models", value: stats.models, icon: Database, color: "text-blue-600" },
                { label: "Service Intervals", value: stats.intervals, icon: Activity, color: "text-green-600" },
                { label: "Articles Created", value: stats.articles, icon: FileText, color: "text-slate-900" },
              ].map((stat, i) => (
                <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-slate-400 text-xs font-medium mb-1 uppercase tracking-wider">{stat.label}</div>
                  <div className={cn("text-2xl font-bold flex items-center justify-between", stat.color)}>
                    {stat.value.toString().padStart(2, '0')}
                    <stat.icon className="w-4 h-4 opacity-20" />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[500px]">
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    <TrendingUp size={14} /> Activity Growth 
                  </h3>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Last 7 Days</span>
                </div>
                <div className="flex-1 p-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                         dataKey="name" 
                         axisLine={false} 
                         tickLine={false} 
                         tick={{ fontSize: 10, fill: '#64748b' }}
                      />
                      <YAxis 
                         axisLine={false} 
                         tickLine={false} 
                         tick={{ fontSize: 10, fill: '#64748b' }}
                      />
                      <Tooltip 
                         cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }}
                         contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)' }}
                      />
                      <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-lg flex flex-col overflow-hidden">
                 <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <History size={14} /> Recent Activity
                  </h3>
                </div>
                <div className="flex-1 p-4 font-mono text-[11px] space-y-4 overflow-y-auto custom-scrollbar">
                  {logs.length > 0 ? logs.map(log => (
                    <div key={log.id} className="space-y-1 border-b border-slate-800/50 pb-3 last:border-0 italic">
                      <div className="flex justify-between items-center opacity-50">
                        <span className="text-slate-500">// {log.timestamp?.toDate() ? format(log.timestamp.toDate(), "yyyy-MM-dd HH:mm:ss") : "---"}Z</span>
                        <span className="text-green-400">OK</span>
                      </div>
                      <p className="text-blue-400">SchemaSync: <span className="text-yellow-200">{log.fileName}</span></p>
                      <p className="text-slate-500 text-[10px]">Processed {log.results.intervals} items</p>
                    </div>
                  )) : (
                    <div className="text-slate-600 italic">No validation logs recorded yet.</div>
                  )}
                </div>
                <div className="p-4 bg-slate-800/50">
                  <button 
                    onClick={() => setActiveTab("history")}
                    className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded text-xs transition-colors uppercase tracking-widest"
                  >
                    View Full Audit
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <ImportHistory />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
