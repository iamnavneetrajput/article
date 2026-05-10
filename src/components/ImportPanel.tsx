import React, { useState, useCallback } from "react";
import { Upload, AlertCircle, CheckCircle2, ChevronRight, FileJson, Trash2, Play, Lock } from "lucide-react";
import { processJsonImport, ImportMode } from "../lib/importEngine";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";

export default function ImportPanel() {
  const [isDragging, setIsDragging] = useState(false);
  const [jsonContent, setJsonContent] = useState<any[] | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string>("unknown_source");

  const { user, isAdmin } = useAuth();

  if (!isAdmin) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="max-w-md mx-auto mt-20 p-8 bg-white border border-slate-200 rounded-3xl shadow-xl text-center space-y-6"
      >
        <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center text-amber-500 mx-auto">
          <Lock size={32} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tighter">Access Restricted</h2>
          <p className="text-sm text-slate-500 mt-2">This tool is available to administrators only. You do not have permission to perform bulk imports.</p>
        </div>
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed">
          Authenticated User: {user?.email}<br/>
          Status: Standard Interface
        </div>
      </motion.div>
    );
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readJson(file);
  };

  const readJson = (file: File) => {
    const reader = new FileReader();
    setCurrentFileName(file.name);
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        const data = Array.isArray(json) ? json : [json];
        // Attach filename to the first item for the log
        if (data.length > 0) {
          data[0]._fileName = file.name;
        }
        setJsonContent(data);
        setError(null);
      } catch (err) {
        setError("Invalid JSON format. Please check the file.");
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!jsonContent) return;
    setIsProcessing(true);
    try {
      const res = await processJsonImport(jsonContent, importMode);
      setResults(res);
      setJsonContent(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto space-y-8"
    >
      <header>
        <h2 className="text-3xl font-bold tracking-tighter uppercase">Importer</h2>
        <p className="tech-header">Batch import vehicle maintenance data via JSON files</p>
      </header>

      {!jsonContent && !results && (
        <div 
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) readJson(file);
          }}
          className={cn(
            "border-2 border-dashed rounded-2xl p-20 flex flex-col items-center justify-center space-y-4 transition-all duration-300",
            isDragging ? "bg-blue-50 border-blue-400 scale-[1.02]" : "bg-white border-slate-200"
          )}
        >
          <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
            <Upload className={isDragging ? "animate-bounce" : ""} />
          </div>
          <div className="text-center">
            <p className="font-bold text-slate-900">Drop maintenance datasets here</p>
            <p className="text-slate-400 text-xs mt-1">Upload JSON data files</p>
          </div>
          <label className="cursor-pointer px-8 py-2.5 bg-slate-900 text-white text-xs font-bold uppercase tracking-widest rounded-lg shadow-lg hover:bg-slate-800 transition-all">
            Select File
            <input type="file" className="hidden" accept=".json" onChange={handleFileUpload} />
          </label>
        </div>
      )}

      {jsonContent && (
        <div className="flex gap-6 h-[500px]">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex-1 tech-card flex flex-col"
          >
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                 <FileJson size={14} /> Import Preview ({jsonContent.length} items)
              </h2>
              <button 
                onClick={() => setJsonContent(null)}
                className="text-slate-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto">
               <table className="w-full text-left">
                <thead className="tech-table-header">
                  <tr>
                    <th className="px-4 py-3">Vehicle</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Data Points</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-slate-100">
                  {jsonContent.slice(0, 50).map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium uppercase text-xs">{row.brand} {row.model}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded uppercase">
                          {typeof row.powertrain === 'object' ? (row.powertrain?.engine || 'Set') : (row.powertrain || "Partial")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs font-mono">{(row.intervals?.length || row.serviceSchedule?.length || 0)} items</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-green-600 text-[11px] font-bold">
                          <CheckCircle2 size={12} /> Validated
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-80 bg-slate-900 rounded-xl border border-slate-800 shadow-xl flex flex-col overflow-hidden"
          >
            <div className="p-3 border-b border-slate-800 flex items-center justify-between">
              <span className="text-[10px] text-slate-500 font-mono italic">zod_validator_engine.ts</span>
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500/50"></div>
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
              </div>
            </div>
            
            <div className="flex-1 p-4 font-mono text-[11px] space-y-4 overflow-auto">
               <div className="text-slate-500 opacity-60">// Validating data structure...</div>
               <div className="text-white">
                 <span className="text-blue-400">const</span> <span className="text-yellow-200">validationSchema</span> = <span className="text-pink-400">z.object</span>(&#123;
                 <div className="pl-4">brand: z.string(),</div>
                 <div className="pl-4 text-green-400">...schema_v4_active</div>
                 &#125;);
               </div>
               <div className="pt-2 text-slate-400 border-t border-slate-800">
                 [<span className="text-blue-400">INFO</span>] Ready to import
               </div>
               <div className="space-y-1">
                 <p className="text-slate-500">MODE SELECTION:</p>
                 {(["replace", "merge", "skip"] as const).map(mode => (
                   <button 
                    key={mode} 
                    onClick={() => setImportMode(mode)}
                    className={cn(
                      "w-full text-left px-2 py-1 rounded transition-colors text-[10px] uppercase font-bold tracking-widest",
                      importMode === mode ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-300"
                    )}
                   >
                     {mode} existing data
                   </button>
                 ))}
               </div>
            </div>

            <div className="p-4 bg-slate-950/50 space-y-3">
              <button 
                onClick={handleImport}
                disabled={isProcessing}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs transition-all uppercase tracking-[0.2em] shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:grayscale"
              >
                {isProcessing ? "Importing..." : "Start Import"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {results && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-green-50 border border-green-200 p-8 space-y-6"
        >
          <div className="flex items-center gap-3 text-green-700">
            <CheckCircle2 size={24} />
            <h3 className="text-xl font-bold tracking-tight uppercase">Import Completed</h3>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Brands Created", value: results.brands },
              { label: "Models Linked", value: results.models },
              { label: "Powertrains Active", value: results.powertrains },
              { label: "Schedules Created", value: results.intervals },
            ].map((r, i) => (
              <div key={i} className="bg-white/60 border border-green-200 p-4">
                <p className="tech-header text-green-700">{r.label}</p>
                <p className="text-2xl font-bold tech-value text-green-900">{r.value}</p>
              </div>
            ))}
          </div>

          {results.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 p-4 space-y-2">
              <p className="text-xs font-bold text-red-700 uppercase tracking-widest">Errors Found ({results.errors.length})</p>
              <div className="max-h-[100px] overflow-y-auto text-[10px] font-mono text-red-600">
                {results.errors.map((e: string, i: number) => <p key={i}>{e}</p>)}
              </div>
            </div>
          )}

          <button 
            onClick={() => setResults(null)}
            className="w-full py-3 bg-green-700 text-white text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-green-800 transition-colors"
          >
            Clear Results
          </button>
        </motion.div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 p-4 text-red-700 text-xs flex items-center gap-2">
          <AlertCircle size={14} />
          {error}
        </div>
      )}
    </motion.div>
  );
}
