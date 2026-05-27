import React, { useState, useCallback } from "react";
import { 
  Upload, 
  AlertCircle, 
  CheckCircle2, 
  ChevronRight, 
  FileJson, 
  Trash2, 
  Play, 
  Lock, 
  Files, 
  FolderPlus,
  Loader2,
  X,
  FileText
} from "lucide-react";
import { processJsonImport, ImportMode } from "../lib/importEngine";
import { useAuth } from "../contexts/AuthContext";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";

interface UploadedFile {
  name: string;
  size: number;
  data: any[];
  status: "validated" | "error";
  errorMsg?: string;
  itemCount: number;
}

export default function ImportPanel() {
  const { user, isAdmin } = useAuth();

  // State
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeImportingFile, setActiveImportingFile] = useState<string | null>(null);
  const [processedFileCount, setProcessedFileCount] = useState<number>(0);
  
  const [results, setResults] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  // Format File Size Helper
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  // Multiple File Reader core
  const readFiles = useCallback((files: FileList) => {
    setError(null);
    const filesArray = Array.from(files);

    filesArray.forEach((file) => {
      // Check if file is JSON
      if (!file.name.endsWith(".json")) {
        setUploadedFiles((prev) => {
          const filtered = prev.filter(f => f.name !== file.name);
          return [
            ...filtered,
            {
              name: file.name,
              size: file.size,
              data: [],
              status: "error",
              errorMsg: "File format must be .json",
              itemCount: 0
            }
          ];
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target?.result as string);
          const data = Array.isArray(json) ? json : [json];

          if (data.length > 0) {
            data[0]._fileName = file.name;
          }

          setUploadedFiles((prev) => {
            const filtered = prev.filter(f => f.name !== file.name);
            return [
              ...filtered,
              {
                name: file.name,
                size: file.size,
                data: data,
                status: "validated",
                itemCount: data.length
              }
            ];
          });
        } catch (err) {
          setUploadedFiles((prev) => {
            const filtered = prev.filter(f => f.name !== file.name);
            return [
              ...filtered,
              {
                name: file.name,
                size: file.size,
                data: [],
                status: "error",
                errorMsg: "Malformed JSON file format",
                itemCount: 0
              }
            ];
          });
        }
      };
      reader.readAsText(file);
    });
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      readFiles(e.target.files);
    }
  };

  const removeFile = (fileName: string) => {
    setUploadedFiles(prev => prev.filter(f => f.name !== fileName));
  };

  // Perform multiple JSON sequential importing
  const handleImport = async () => {
    const valid = uploadedFiles.filter(f => f.status === "validated");
    if (valid.length === 0) return;

    setIsProcessing(true);
    setProcessedFileCount(0);
    setError(null);

    let combinedResults = {
      brands: 0,
      models: 0,
      powertrains: 0,
      intervals: 0,
      errors: [] as string[]
    };

    try {
      for (let i = 0; i < valid.length; i++) {
        const file = valid[i];
        setActiveImportingFile(file.name);

        const res = await processJsonImport(file.data, importMode);

        combinedResults.brands += res.brands;
        combinedResults.models += res.models;
        combinedResults.powertrains += res.powertrains;
        combinedResults.intervals += res.intervals;
        if (res.errors && res.errors.length > 0) {
          combinedResults.errors = [...combinedResults.errors, ...res.errors];
        }

        setProcessedFileCount(i + 1);
      }

      setResults(combinedResults);
      setUploadedFiles([]); // Clear queue upon success
    } catch (err: any) {
      setError(`Sequential Import crashed: ${err.message}`);
    } finally {
      setIsProcessing(false);
      setActiveImportingFile(null);
    }
  };

  // Derive consolidated previews
  const validFiles = uploadedFiles.filter(f => f.status === "validated");
  const aggregatedContent = validFiles.reduce<any[]>((acc, file) => {
    return [...acc, ...file.data];
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-6xl mx-auto space-y-8 animate-fade-in"
    >
      <header className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 uppercase">JSON Importer</h2>
          <p className="text-slate-500 text-[10px] md:text-sm font-medium uppercase tracking-widest mt-1">
            Batch import vehicle maintenance schedules. Supports uploading multiple JSON datasets concurrently.
          </p>
        </div>
      </header>

      {/* RENDER VIEW STATES */}
      {uploadedFiles.length === 0 && !results && (
        <div 
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files) {
              readFiles(e.dataTransfer.files);
            }
          }}
          className={cn(
            "border-2 border-dashed rounded-3xl p-24 flex flex-col items-center justify-center space-y-5 transition-all duration-300 shadow-sm",
            isDragging ? "bg-blue-50/50 border-blue-400 scale-[1.01]" : "bg-white border-slate-200 hover:border-slate-300"
          )}
        >
          <div className="w-20 h-20 rounded-full bg-blue-50/70 flex items-center justify-center text-blue-600 shadow-inner">
            <Upload size={32} className={isDragging ? "animate-bounce" : ""} />
          </div>
          <div className="text-center space-y-1">
            <h3 className="font-extrabold text-slate-900 uppercase tracking-tight text-base">Drop JSON Datasets here</h3>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Drag and drop multiple files, or browse folders</p>
          </div>
          <label className="cursor-pointer px-10 py-3 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-extrabold uppercase tracking-widest rounded-xl shadow-lg transition-transform active:scale-[0.98] select-none">
            Choose JSON Files
            <input type="file" className="hidden" accept=".json" multiple onChange={handleFileUpload} />
          </label>
        </div>
      )}

      {/* QUEUED FILES INTERFACE */}
      {uploadedFiles.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          
          {/* LEFT: FILES QUEUE OR DROP MORE ZONE */}
          <div className="md:col-span-7 space-y-6">
            <div className="tech-card overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
                  <Files size={14} className="text-blue-500" /> 
                  Upload Queue ({uploadedFiles.length} {uploadedFiles.length === 1 ? "File" : "Files"})
                </h3>
                <button 
                  onClick={() => setUploadedFiles([])}
                  className="text-slate-400 hover:text-red-500 text-[10px] uppercase font-bold tracking-widest transition-colors flex items-center gap-1"
                >
                  <Trash2 size={12} /> Clear Queue
                </button>
              </div>

              <div className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto">
                <AnimatePresence initial={false}>
                  {uploadedFiles.map((file) => (
                    <motion.div 
                      key={file.name}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                          file.status === "validated" ? "bg-blue-50 text-blue-600" : "bg-red-50 text-red-500"
                        )}>
                          <FileJson size={20} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate uppercase tracking-tight">{file.name}</p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                            <span>{formatSize(file.size)}</span>
                            <span>•</span>
                            {file.status === "validated" ? (
                              <span className="text-emerald-600 font-bold uppercase">{file.itemCount} Records</span>
                            ) : (
                              <span className="text-red-500 font-bold uppercase">{file.errorMsg || "Error"}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button 
                        onClick={() => removeFile(file.name)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            {/* QUICK DROP/ADD MORE MINIFIED AREA */}
            <div className="relative">
              <label className="border border-dashed border-slate-300 hover:border-slate-400 bg-white/50 hover:bg-white rounded-2xl p-5 flex items-center justify-center gap-2 cursor-pointer transition-all duration-200">
                <FolderPlus size={16} className="text-slate-400" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Add more JSON datasets</span>
                <input type="file" className="hidden" accept=".json" multiple onChange={handleFileUpload} />
              </label>
            </div>
          </div>

          {/* RIGHT: BULK ACTIONS CARD */}
          <div className="md:col-span-5 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden text-white flex flex-col">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-mono italic">batch_orchestrator.rs</span>
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/30"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Aggregate Payload</h4>
                  <div className="mt-2 grid grid-cols-2 gap-4">
                    <div className="p-3 bg-white/5 border border-white/10 rounded-xl">
                      <p className="text-[9px] text-white/40 uppercase font-mono">Files Count</p>
                      <p className="text-2xl font-bold font-mono text-blue-400">{validFiles.length}</p>
                    </div>
                    <div className="p-3 bg-white/5 border border-white/10 rounded-xl">
                      <p className="text-[9px] text-white/40 uppercase font-mono">Total Records</p>
                      <p className="text-2xl font-bold font-mono text-emerald-400">{aggregatedContent.length}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Synchronization Mode</label>
                  <div className="space-y-1">
                    {(["replace", "merge", "skip"] as const).map(mode => (
                      <button 
                        key={mode} 
                        onClick={() => setImportMode(mode)}
                        disabled={isProcessing}
                        className={cn(
                          "w-full text-left p-3.5 rounded-xl transition-all text-xs font-bold uppercase tracking-widest flex items-center justify-between",
                          importMode === mode 
                            ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40 border-l-4 border-white" 
                            : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
                        )}
                      >
                        <span>{mode} existing data</span>
                        <ChevronRight size={14} className={importMode === mode ? "text-white" : "text-slate-600"} />
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-slate-500 uppercase font-mono italic pt-1 leading-normal">
                    * Replace mode completely rewrites powertrain attributes if matching slug is encountered.
                  </p>
                </div>

                {isProcessing && (
                  <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-2">
                    <div className="flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin text-blue-400" />
                      <span className="text-[10px] font-mono text-slate-300">Processing queue...</span>
                    </div>
                    <div className="text-[9px] font-mono text-slate-400 truncate">
                      File {processedFileCount} of {validFiles.length}: 
                      <span className="text-white ml-1 font-bold">{activeImportingFile}</span>
                    </div>
                    <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-blue-500 h-full transition-all duration-300"
                        style={{ width: `${(processedFileCount / validFiles.length) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                <button 
                  onClick={handleImport}
                  disabled={isProcessing || validFiles.length === 0}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-extrabold rounded-xl text-xs transition-all uppercase tracking-[0.2em] shadow-lg shadow-blue-900/20 disabled:opacity-40 disabled:grayscale"
                >
                  {isProcessing ? "Executing Injections..." : "Start Batch Import"}
                </button>
              </div>
            </div>
          </div>

          {/* LOWER: AGGREGATE PREVIEW TABLE */}
          {aggregatedContent.length > 0 && (
            <div className="md:col-span-12 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2 px-1">
                <FileText size={14} /> Comprehensive Queue Preview ({aggregatedContent.length} Rows)
              </h3>
              <div className="tech-card overflow-hidden">
                <div className="overflow-x-auto max-h-[300px]">
                  <table className="w-full text-left border-collapse">
                    <thead className="tech-table-header sticky top-0 bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-5 py-3">Vehicle / Brand</th>
                        <th className="px-5 py-3">Model</th>
                        <th className="px-5 py-3">Powertrain Package</th>
                        <th className="px-5 py-3">Source Dataset File</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {aggregatedContent.slice(0, 50).map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50/40 transition-colors">
                          <td className="px-5 py-3 font-bold uppercase tracking-tight text-slate-900">{row.brand}</td>
                          <td className="px-5 py-3 font-semibold uppercase text-slate-700">{row.model}</td>
                          <td className="px-5 py-3">
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-600 font-extrabold rounded uppercase text-[9px]">
                              {typeof row.powertrain === 'object' ? (row.powertrain?.name || row.powertrain?.engine || 'Set') : (row.powertrain || "Standard")}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-slate-400 font-mono text-[10px] uppercase">{row._fileName || "Direct Input"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {aggregatedContent.length > 50 && (
                  <div className="p-4 bg-slate-50 text-center text-[10px] font-mono uppercase tracking-widest border-t border-slate-100 text-slate-400">
                    + {aggregatedContent.length - 50} more records in queue payload
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* COMPLETED SUCCESS RESULTS */}
      {results && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-emerald-50 border border-emerald-200 p-8 rounded-3xl space-y-6 shadow-md"
        >
          <div className="flex items-center gap-3 text-emerald-800">
            <CheckCircle2 size={28} />
            <div>
              <h3 className="text-xl font-bold tracking-tight uppercase">Bulk Import Process Completed</h3>
              <p className="text-emerald-600 text-[10px] font-bold uppercase tracking-widest mt-0.5">Sequential data pipeline successfully flushed to database</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Brands Registered", value: results.brands },
              { label: "Models Synchronized", value: results.models },
              { label: "Powertrains Activated", value: results.powertrains },
              { label: "Service Intervals Linked", value: results.intervals },
            ].map((r, i) => (
              <div key={i} className="bg-white/80 border border-emerald-100 p-5 rounded-2xl shadow-sm">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700 mb-1">{r.label}</p>
                <p className="text-2xl font-mono font-extrabold text-emerald-950">{r.value}</p>
              </div>
            ))}
          </div>

          {results.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5 space-y-3">
              <p className="text-xs font-bold text-red-700 uppercase tracking-widest flex items-center gap-1.5">
                <AlertCircle size={14} /> Structural Validation Errors Detected ({results.errors.length})
              </p>
              <div className="max-h-[140px] overflow-y-auto text-[10px] font-mono text-red-600 space-y-1 bg-white/40 p-3 rounded-xl border border-red-100">
                {results.errors.map((e: string, i: number) => <p key={i}>• {e}</p>)}
              </div>
            </div>
          )}

          <div className="flex gap-4">
            <button 
              onClick={() => setResults(null)}
              className="flex-1 py-3.5 bg-emerald-800 hover:bg-emerald-700 text-white text-[11px] font-extrabold uppercase tracking-[0.2em] rounded-xl transition-all shadow-md shadow-emerald-950/20"
            >
              Acknowledge and Clear
            </button>
          </div>
        </motion.div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-xl text-red-700 text-xs flex items-center gap-2 font-mono">
          <AlertCircle size={14} />
          {error}
        </div>
      )}
    </motion.div>
  );
}
