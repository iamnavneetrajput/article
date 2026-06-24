import React, { useState, useCallback, useEffect } from "react";
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
  FileText,
  Database,
  Globe,
  RefreshCw,
  ExternalLink
} from "lucide-react";
import { handleFirestoreError, OperationType } from "../lib/errorHandling";
import { processJsonImport, ImportMode } from "../lib/importEngine";
import { useAuth } from "../contexts/AuthContext";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { db } from "../lib/firebase";
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  writeBatch, 
  serverTimestamp 
} from "firebase/firestore";

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

  // Navigation State
  const [activeTab, setActiveTab] = useState<"json" | "sheet">("json");

  // State for JSON Importer
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeImportingFile, setActiveImportingFile] = useState<string | null>(null);
  const [processedFileCount, setProcessedFileCount] = useState<number>(0);
  const [results, setResults] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  // State for Sheet Scraper
  const [isScraping, setIsScraping] = useState(false);
  const [selectedSheet, setSelectedSheet] = useState<"ev" | "fuel-efficiency">("ev");
  const [scrapedData, setScrapedData] = useState<any[]>([]);
  const [scrapeResults, setScrapeResults] = useState<any | null>(null);

  // Selection and Deletion States
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    title: string;
    description: string;
    warningText?: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  // Clear selections when changing tabs or selected sheet
  useEffect(() => {
    setSelectedRowIds([]);
  }, [selectedSheet, activeTab]);

  // Delete single item from evRangeData
  const handleDeleteSingle = (id: string) => {
    setDeleteConfirm({
      title: "Delete Dataset?",
      description: `Are you sure you want to permanently delete the cached dataset "${id}" from the database?`,
      warningText: "This action cannot be undone and will affect future article generation queries for this vehicle.",
      onConfirm: async () => {
        setIsDeleting(true);
        try {
          const batch = writeBatch(db);
          batch.delete(doc(db, "evRangeData", id));
          await batch.commit();
          setSelectedRowIds(prev => prev.filter(item => item !== id));
          await loadScrapedData();
        } catch (err) {
          console.error("Failed to delete record:", err);
          try {
            handleFirestoreError(err, OperationType.DELETE, `evRangeData/${id}`);
          } catch (firestoreErr: any) {
            setError(firestoreErr.message || "Failed to delete record.");
          }
        } finally {
          setIsDeleting(false);
        }
      }
    });
  };

  // Delete multiple selected items
  const handleDeleteSelected = () => {
    if (selectedRowIds.length === 0) return;
    setDeleteConfirm({
      title: `Delete ${selectedRowIds.length} Selected Datasets?`,
      description: `Are you sure you want to delete the ${selectedRowIds.length} selected dataset(s)?`,
      warningText: "This action will permanently remove all selected datasets from Firestore. This cannot be undone.",
      onConfirm: async () => {
        setIsDeleting(true);
        try {
          const batch = writeBatch(db);
          selectedRowIds.forEach(id => {
            batch.delete(doc(db, "evRangeData", id));
          });
          await batch.commit();
          setSelectedRowIds([]);
          await loadScrapedData();
        } catch (err) {
          console.error("Failed to delete selected records:", err);
          try {
            handleFirestoreError(err, OperationType.DELETE, "evRangeData/batch");
          } catch (firestoreErr: any) {
            setError(firestoreErr.message || "Failed to delete selected records.");
          }
        } finally {
          setIsDeleting(false);
        }
      }
    });
  };

  // Delete all datasets visible on the current sheet view
  const handleDeleteAllCurrent = (rowsToClear: any[]) => {
    if (rowsToClear.length === 0) {
      return;
    }
    const typeLabel = selectedSheet === "ev" ? "EV" : "Fuel-Efficiency";
    setDeleteConfirm({
      title: `⚠️ Delete ALL ${typeLabel} Data?`,
      description: `You are about to permanently delete all ${rowsToClear.length} indexed ${typeLabel} datasets visible on this page.`,
      warningText: "This will remove all stored metrics for this powertrain category. Are you absolutely certain you want to proceed?",
      onConfirm: async () => {
        setIsDeleting(true);
        try {
          const batch = writeBatch(db);
          rowsToClear.forEach(row => {
            batch.delete(doc(db, "evRangeData", row.id));
          });
          await batch.commit();
          setSelectedRowIds([]);
          await loadScrapedData();
        } catch (err) {
          console.error("Failed to delete all datasets:", err);
          try {
            handleFirestoreError(err, OperationType.DELETE, "evRangeData/all");
          } catch (firestoreErr: any) {
            setError(firestoreErr.message || "Failed to delete all datasets.");
          }
        } finally {
          setIsDeleting(false);
        }
      }
    });
  };

  // Load scraped models list
  const loadScrapedData = async () => {
    try {
      const snap = await getDocs(collection(db, "evRangeData"));
      setScrapedData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Failed to load scraped data list:", err);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadScrapedData();
    }
  }, [isAdmin]);

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
          <p className="text-sm text-slate-500 mt-2">This tool is available to administrators only. You do not have permission to perform bulk imports or scrape sheets.</p>
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

  // Helper to parse numeric values from CSV strings
  const parseNumeric = (val: string): number => {
    if (!val) return 0;
    const cleaned = val.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  // CSV parsing logic for Sheet Scraper
  const parseCSV = (text: string) => {
    const lines = text.split(/\r?\n/);
    // Find the actual header line by seeing if it has 'id,rank,brand,model'
    const headerIndex = lines.findIndex(l => {
      const parts = l.split(',').map(s => s.trim().replace(/^"|"$/g, '').toLowerCase());
      return parts.includes("id") && parts.includes("brand") && parts.includes("model");
    });

    if (headerIndex === -1) {
      console.error("Could not locate headers containing 'id' and 'brand' in text:", text.substring(0, 500));
      return [];
    }

    const headerLine = lines[headerIndex];
    const headers = splitCsvLine(headerLine);
    
    const results: any[] = [];
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.trim() === "" || line.split(',').every(s => !s.trim())) continue;
      
      const values = splitCsvLine(line);
      const rowObj: Record<string, string> = {};
      
      for (let j = 0; j < headers.length; j++) {
        const h = headers[j];
        if (h) {
          rowObj[h] = values[j] || "";
        }
      }
      
      if (rowObj.id) {
        results.push(rowObj);
      }
    }
    return results;
  };

  const splitCsvLine = (line: string) => {
    const result = [];
    let insideQuote = false;
    let entry = "";
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        insideQuote = !insideQuote;
      } else if (c === ',' && !insideQuote) {
        result.push(entry.replace(/^"|"$/g, '').trim());
        entry = "";
      } else {
        entry += c;
      }
    }
    result.push(entry.replace(/^"|"$/g, '').trim());
    return result;
  };

  // Execute Spreadsheet Scraper Core
  const handleScrapeSheet = async () => {
    setIsScraping(true);
    setError(null);
    setScrapeResults(null);
    try {
      const sheetUrl = selectedSheet === "ev"
        ? "https://docs.google.com/spreadsheets/d/1ha8jW02Ox0ObFwR2q-GIShk7WbxE8bDoRFsLCsCr--o/export?format=csv&gid=0"
        : "https://docs.google.com/spreadsheets/d/1ha8jW02Ox0ObFwR2q-GIShk7WbxE8bDoRFsLCsCr--o/gviz/tq?tqx=out:csv&sheet=fuel-efficiency";
        
      const response = await fetch(sheetUrl);
      if (!response.ok) {
        throw new Error("Failed to export Google Sheet. Make sure the document Link Access is Public.");
      }
      const rawText = await response.text();
      const parsedRows = parseCSV(rawText);

      if (parsedRows.length === 0) {
        throw new Error("No records could be parsed. Check Google Sheet structure.");
      }

      // Save into 'evRangeData' collection in Firestore
      const batch = writeBatch(db);
      
      const numericFields = [
        "rank", "battery_kwh", "battery_percentage", "test_year", "claimed_range_km", "real_range_km",
        "city_battery_level_drop_percentage", "city_distance_km", "city_efficiency_kmpu", "city_displayed_kmpu",
        "highway_battery_level_drop_percentage", "highway_distance_km", "highway_efficiency_kmpu", "highway_displayed_kmpu",
        "avg_city_speed_kmph", "avg_highway_speed_kmph", "charging_units_consumed",
        "home_charging_cost_per_unit_rs", "public_charging_cost_per_unit_rs",
        "efficiency_100_0_kmpu", "efficiency_90_10_kmpu", "efficiency_80_20_kmpu", "efficiency_70_30_kmpu", "efficiency_60_40_kmpu", "efficiency_50_50_kmpu", "efficiency_40_60_kmpu", "efficiency_30_70_kmpu", "efficiency_20_80_kmpu", "efficiency_10_90_kmpu", "efficiency_0_100_kmpu",
        "range_100_0_km", "range_90_10_km", "range_80_20_km", "range_70_30_km", "range_60_40_km", "range_50_50_km", "range_40_60_km", "range_30_70_km", "range_20_80_km", "range_10_90_km", "range_0_100_km",
        "home_cost_100_0_per_km", "home_cost_90_10_per_km", "home_cost_80_20_per_km", "home_cost_70_30_per_km", "home_cost_60_40_per_km", "home_cost_50_50_per_km", "home_cost_40_60_per_km", "home_cost_30_70_per_km", "home_cost_20_80_per_km", "home_cost_10_90_per_km", "home_cost_0_100_per_km",
        "public_cost_100_0_per_km", "public_cost_90_10_per_km", "public_cost_80_20_per_km", "public_cost_70_30_per_km", "public_cost_60_40_per_km", "public_cost_50_50_per_km", "public_cost_40_60_per_km", "public_cost_30_70_per_km", "public_cost_20_80_per_km", "public_cost_10_90_per_km", "public_cost_0_100_per_km",
        // Fuel-efficiency fields:
        "fuel_tank_capacity_l", "fuel_price_per_litre", "claimed_mileage_kmpl", "real_mileage_kmpl",
        "city_avg_speed_kmph", "city_fuel_consumed_l", "city_efficiency_kmpl", "city_displayed_efficiency_kmpl",
        "highway_avg_speed_kmph", "highway_fuel_consumed_l", "highway_efficiency_kmpl", "highway_displayed_efficiency_kmpl",
        "city_deviation_percentage", "highway_deviation_percentage", "combined_displayed_efficiency_kmpl", "combined_deviation_percentage",
        "deviation_100_0_percentage", "deviation_90_10_percentage", "deviation_80_20_percentage", "deviation_70_30_percentage", "deviation_60_40_percentage", "deviation_50_50_percentage", "deviation_40_60_percentage", "deviation_30_70_percentage", "deviation_20_80_percentage", "deviation_10_90_percentage", "deviation_0_100_percentage",
        "efficiency_100_0_kmpl", "efficiency_90_10_kmpl", "efficiency_80_20_kmpl", "efficiency_70_30_kmpl", "efficiency_60_40_kmpl", "efficiency_50_50_kmpl", "efficiency_40_60_kmpl", "efficiency_30_70_kmpl", "efficiency_20_80_kmpl", "efficiency_10_90_kmpl", "efficiency_0_100_kmpl",
        "cost_100_0_per_km", "cost_90_10_per_km", "cost_80_20_per_km", "cost_70_30_per_km", "cost_60_40_per_km", "cost_50_50_per_km", "cost_40_60_per_km", "cost_30_70_per_km", "cost_20_80_per_km", "cost_10_90_per_km", "cost_0_100_per_km",
        "range_min_km", "range_max_km"
      ];

      for (const row of parsedRows) {
        const docRef = doc(db, "evRangeData", row.id);
        const dataDoc: Record<string, any> = {
          scrapedAt: new Date().toISOString(),
          sheetType: selectedSheet
        };

        Object.keys(row).forEach(k => {
          if (numericFields.includes(k)) {
            dataDoc[k] = parseNumeric(row[k]);
          } else {
            dataDoc[k] = row[k];
          }
        });

        // Save cleanly using merge sets
        batch.set(docRef, dataDoc, { merge: true });
      }

      await batch.commit();
      
      setScrapeResults({
        success: true,
        count: parsedRows.length,
        timestamp: new Date().toLocaleTimeString()
      });

      // Reload list
      await loadScrapedData();
    } catch (err: any) {
      console.error(err);
      setError(`Scrape execution failure: ${err.message}`);
    } finally {
      setIsScraping(false);
    }
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
      className="max-w-6xl mx-auto space-y-6 pb-20 animate-fade-in"
    >
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!isDeleting) setDeleteConfirm(null); }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden p-8 text-center text-slate-800"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-100">
                <Trash2 size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-950 mb-2 uppercase tracking-tight">
                {deleteConfirm.title}
              </h3>
              <p className="text-sm text-slate-600 mb-4 font-medium sm:px-4">
                {deleteConfirm.description}
              </p>
              {deleteConfirm.warningText && (
                <div className="mb-6 p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-800 text-left flex gap-2">
                  <span className="font-extrabold uppercase shrink-0">Note:</span>
                  <span className="font-medium">{deleteConfirm.warningText}</span>
                </div>
              )}
              
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 bg-white border border-slate-200 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await deleteConfirm.onConfirm();
                    setDeleteConfirm(null);
                  }}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 bg-red-650 text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-red-700 transition-all disabled:opacity-50 shadow-lg shadow-red-200 flex items-center justify-center gap-1 cursor-pointer"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    "Confirm Delete"
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-200/80 pb-6">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse shadow-sm shadow-yellow-400/50" />
          <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-zinc-400">Database Tools</span>
        </div>

        {/* Custom Navigation Tabs */}
        <div className="flex bg-zinc-100 p-1.5 rounded-2xl border border-zinc-200/80 shadow-inner">
          <button 
            onClick={() => { setActiveTab("json"); setError(null); }}
            className={cn(
              "px-5 py-2.5 text-[10px] font-extrabold uppercase tracking-widest rounded-xl transition-all duration-200",
              activeTab === "json" 
                ? "bg-black text-white shadow-lg shadow-black/10 active:scale-95" 
                : "text-zinc-500 hover:text-zinc-900"
            )}
          >
            Upload Data Files
          </button>
          <button 
            onClick={() => { setActiveTab("sheet"); setError(null); }}
            className={cn(
              "px-5 py-2.5 text-[10px] font-extrabold uppercase tracking-widest rounded-xl duration-200 flex items-center gap-1.5 transition-all",
              activeTab === "sheet" 
                ? "bg-black text-white shadow-lg shadow-black/10 active:scale-95" 
                : "text-zinc-500 hover:text-zinc-900"
            )}
          >
            <Database size={12} className={cn(activeTab === "sheet" ? "text-yellow-400" : "text-zinc-400")} />
            Online Sheet Scraper
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-zinc-500 text-xs sm:text-sm font-medium">
          Import and update vehicle service schedules, EV range data, or fuel efficiency logs.
        </p>
      </div>

      {/* ERROR MSG BANNER */}
      {error && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-xl text-red-700 text-xs flex items-center gap-2 font-mono">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* TAB 1: JSON FILES QUEUE IMPORTER */}
      {activeTab === "json" && (
        <div className="space-y-6">
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
                "border-2 border-dashed rounded-[24px] p-24 flex flex-col items-center justify-center space-y-5 transition-all duration-300 shadow-sm",
                isDragging ? "bg-amber-50/20 border-yellow-400 scale-[1.01]" : "bg-white border-zinc-200 hover:border-yellow-400"
              )}
            >
              <div className="w-20 h-20 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center text-yellow-500 shadow-inner">
                <Upload size={32} className={isDragging ? "animate-bounce" : ""} />
              </div>
              <div className="text-center space-y-1">
                <h3 className="font-extrabold text-zinc-900 uppercase tracking-tight text-base">Drop JSON Datasets here</h3>
                <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Drag and drop multiple files, or browse folders</p>
              </div>
              <label className="cursor-pointer px-10 py-3 bg-black hover:bg-zinc-800 text-white text-[11px] font-extrabold uppercase tracking-widest rounded-xl shadow-lg shadow-black/10 transition-transform active:scale-[0.98] select-none">
                Choose JSON Files
                <input type="file" className="hidden" accept=".json" multiple onChange={handleFileUpload} />
              </label>
            </div>
          )}

          {uploadedFiles.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
              
              {/* LEFT: FILES QUEUE OR DROP MORE ZONE */}
              <div className="md:col-span-7 space-y-6">
                <div className="bg-white border border-zinc-200/80 rounded-[24px] shadow-sm overflow-hidden">
                  <div className="p-4 bg-zinc-50 border-b border-zinc-200/80 flex justify-between items-center">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-650 flex items-center gap-2">
                      <Files size={14} className="text-yellow-500" /> 
                      Upload Queue ({uploadedFiles.length} {uploadedFiles.length === 1 ? "File" : "Files"})
                    </h3>
                    <button 
                      onClick={() => setUploadedFiles([])}
                      className="text-zinc-400 hover:text-red-500 text-[10px] uppercase font-bold tracking-widest transition-colors flex items-center gap-1"
                    >
                      <Trash2 size={12} /> Clear Queue
                    </button>
                  </div>

                  <div className="divide-y divide-zinc-100 max-h-[360px] overflow-y-auto">
                    <AnimatePresence initial={false}>
                      {uploadedFiles.map((file) => (
                        <motion.div 
                          key={file.name}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="p-4 flex items-center justify-between hover:bg-zinc-50/30 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={cn(
                              "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border",
                              file.status === "validated" ? "bg-amber-50/40 border-amber-100 text-yellow-600" : "bg-red-50 border-red-100 text-red-500"
                            )}>
                              <FileJson size={20} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-zinc-900 truncate uppercase tracking-tight">{file.name}</p>
                              <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono mt-0.5">
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
                            className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-zinc-100 rounded-lg transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="relative animate-fade-in">
                  <label className="border border-dashed border-zinc-200 hover:border-yellow-400 bg-white hover:bg-zinc-50/5 rounded-2xl p-5 flex items-center justify-center gap-2 cursor-pointer transition-all duration-200">
                    <FolderPlus size={16} className="text-zinc-450" />
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Add more JSON datasets</span>
                    <input type="file" className="hidden" accept=".json" multiple onChange={handleFileUpload} />
                  </label>
                </div>
              </div>

              {/* RIGHT: BULK ACTIONS CARD */}
              <div className="md:col-span-5 space-y-6">
                <div className="bg-white border border-zinc-200/80 rounded-[24px] shadow-xl shadow-zinc-200/30 overflow-hidden text-zinc-950 flex flex-col">
                  <div className="p-4 bg-zinc-50 border-b border-zinc-200/80 flex items-center justify-between">
                    <span className="text-[10px] text-zinc-400 uppercase font-extrabold tracking-widest">Import Settings</span>
                    <div className="flex gap-1.5 items-center">
                      <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                      <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Active</span>
                    </div>
                  </div>

                  <div className="p-6 space-y-6">
                    <div>
                      <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Selected Data Summary</h4>
                      <div className="mt-2 grid grid-cols-2 gap-4">
                        <div className="p-3 bg-zinc-50 border border-zinc-200/60 rounded-xl">
                          <p className="text-[9px] text-zinc-400 uppercase font-bold tracking-wider">Files Selected</p>
                          <p className="text-2xl font-bold font-mono text-zinc-950">{validFiles.length}</p>
                        </div>
                        <div className="p-3 bg-zinc-50 border border-zinc-200/60 rounded-xl">
                          <p className="text-[9px] text-zinc-400 uppercase font-bold tracking-wider">Total Items</p>
                          <p className="text-2xl font-bold font-mono text-zinc-950">{aggregatedContent.length}</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">How to handle existing data</label>
                      <div className="space-y-1.5">
                        {(["replace", "merge", "skip"] as const).map(mode => (
                          <button 
                            key={mode} 
                            onClick={() => setImportMode(mode)}
                            disabled={isProcessing}
                            className={cn(
                              "w-full text-left p-3 rounded-xl transition-all text-xs font-bold uppercase tracking-widest flex items-center justify-between cursor-pointer border",
                              importMode === mode 
                                ? "bg-black text-white border-black shadow-lg" 
                                : "bg-zinc-50 text-zinc-500 border-zinc-250/50 hover:bg-zinc-100 hover:text-zinc-800"
                            )}
                          >
                            <span>{mode} existing records</span>
                            <ChevronRight size={14} className={importMode === mode ? "text-yellow-400" : "text-zinc-350"} />
                          </button>
                        ))}
                      </div>
                    </div>

                    {isProcessing && (
                      <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200/60 space-y-3">
                        <div className="flex items-center gap-2">
                          <Loader2 size={14} className="animate-spin text-yellow-500" />
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Processing queue...</span>
                        </div>
                        <div className="text-[10px] text-zinc-650 truncate font-mono">
                          File {processedFileCount} of {validFiles.length}: 
                          <span className="text-zinc-950 ml-1 font-bold">{activeImportingFile}</span>
                        </div>
                        <div className="w-full bg-zinc-200/60 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-yellow-400 h-full transition-all duration-300"
                            style={{ width: `${(processedFileCount / validFiles.length) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    )}

                    <button 
                      onClick={handleImport}
                      disabled={isProcessing || validFiles.length === 0}
                      className="w-full py-4 bg-black hover:bg-zinc-850 text-white font-extrabold rounded-xl text-xs transition-all uppercase tracking-[0.2em] shadow-lg shadow-black/10 disabled:opacity-40 select-none cursor-pointer"
                    >
                      {isProcessing ? "Processing Import..." : "Import Datasets"}
                    </button>
                  </div>
                </div>
              </div>

              {/* LOWER VALUE PREVIEW TABLE */}
              {aggregatedContent.length > 0 && (
                <div className="md:col-span-12 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2 px-1">
                    <FileText size={14} className="text-yellow-500" /> Comprehensive Queue Preview ({aggregatedContent.length} Rows)
                  </h3>
                  <div className="bg-white border border-zinc-200/80 rounded-[24px] shadow-sm overflow-hidden">
                    <div className="overflow-x-auto max-h-[300px]">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-zinc-50 border-b border-zinc-200/60 z-10 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          <tr>
                            <th className="px-5 py-3">Vehicle / Brand</th>
                            <th className="px-5 py-3">Model</th>
                            <th className="px-5 py-3">Powertrain Package</th>
                            <th className="px-5 py-3 col-span-2">Source Dataset File</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 text-xs">
                          {aggregatedContent.slice(0, 50).map((row, i) => (
                            <tr key={i} className="hover:bg-zinc-50/20 transition-colors">
                              <td className="px-5 py-3 font-bold uppercase tracking-tight text-zinc-900">{row.brand}</td>
                              <td className="px-5 py-3 font-semibold uppercase text-zinc-700">{row.model}</td>
                              <td className="px-5 py-3">
                                <span className="px-2.5 py-0.5 bg-yellow-50 text-amber-800 font-extrabold rounded uppercase text-[9px] border border-yellow-100">
                                  {typeof row.powertrain === 'object' ? (row.powertrain?.name || row.powertrain?.engine || 'Set') : (row.powertrain || "Standard")}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-zinc-400 font-mono text-[10px] uppercase">{row._fileName || "Direct Input"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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
        </div>
      )}

      {/* TAB 2: GOOGLE SHEETS IMMERSIVE SCRAPER */}
      {activeTab === "sheet" && (
        <div className="space-y-8 animate-fade-in">
          
          {/* MAIN PROMPT REFERENCE AND SCRAPER CONTROL ACTION CARD */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-6">
              <div className="bg-white border border-zinc-200/80 p-8 rounded-[24px] shadow-sm shadow-zinc-150 space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex items-center gap-3 text-yellow-600">
                    <Globe size={24} />
                    <h3 className="text-lg font-bold uppercase tracking-tighter text-zinc-950">Online Google Sheets Scraper</h3>
                  </div>
                </div>

                {/* Sheet Selection Selector */}
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 block">Select Spreadsheet Tab to Scrape</label>
                  <div className="flex bg-zinc-100 p-1.5 rounded-2xl border border-zinc-200/80 w-full sm:w-fit shadow-inner">
                    <button
                      onClick={() => { setSelectedSheet("ev"); setScrapeResults(null); }}
                      className={cn(
                        "px-5 py-2.5 text-[10px] font-extrabold uppercase tracking-widest rounded-xl transition-all duration-200",
                        selectedSheet === "ev"
                          ? "bg-black text-white shadow-md active:scale-95"
                          : "text-zinc-500 hover:text-zinc-950"
                      )}
                    >
                      EV Range (Sheet 1)
                    </button>
                    <button
                      onClick={() => { setSelectedSheet("fuel-efficiency"); setScrapeResults(null); }}
                      className={cn(
                        "px-5 py-2.5 text-[10px] font-extrabold uppercase tracking-widest rounded-xl transition-all duration-200",
                        selectedSheet === "fuel-efficiency"
                          ? "bg-black text-white shadow-md active:scale-95"
                          : "text-zinc-500 hover:text-zinc-950"
                      )}
                    >
                      Fuel Efficiency (Sheet 2)
                    </button>
                  </div>
                </div>

                <p className="text-sm text-zinc-500 leading-relaxed font-medium">
                  {selectedSheet === "ev" 
                    ? "Connects directly to the public Google Sheet containing live real-world EV city and highway range tests. Performs fully automated structure mapping, sanitizes numeric values, and stores them securely."
                    : "Connects directly to the public Google Sheet containing live real-world ICE/Fuel city and highway range tests. Performs fully automated structure mapping, sanitizes numeric values, and stores them securely."
                  }
                </p>

                {/* Spreadsheet Details */}
                <div className="p-5 bg-zinc-50 rounded-2xl border border-zinc-200/60 text-xs font-semibold uppercase tracking-wider space-y-2.5 text-zinc-650">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400 font-bold uppercase text-[10px]">Dataset Category:</span>
                    <span className="text-zinc-900 font-extrabold">{selectedSheet === "ev" ? "EV Range Tests" : "Fuel Efficiency Log"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400 font-bold uppercase text-[10px]">Table Name:</span>
                    <span className="text-zinc-900 font-mono font-bold">{selectedSheet === "ev" ? "evRangeData" : "fuelEfficiencyData"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400 font-bold uppercase text-[10px]">Source Spreadsheet:</span>
                    <a 
                      href={selectedSheet === "ev" 
                        ? "https://docs.google.com/spreadsheets/d/1ha8jW02Ox0ObFwR2q-GIShk7WbxE8bDoRFsLCsCr--o/edit?gid=0#gid=0"
                        : "https://docs.google.com/spreadsheets/d/1ha8jW02Ox0ObFwR2q-GIShk7WbxE8bDoRFsLCsCr--o/edit#gid=1384738472"}
                      target="_blank" 
                      rel="noreferrer"
                      className="text-amber-600 hover:text-amber-800 underline truncate flex items-center gap-1 font-semibold hover:scale-100 transition-transform"
                    >
                      Google Sheet Exporter
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={handleScrapeSheet}
                    disabled={isScraping}
                    className="flex-1 py-4 px-8 bg-black hover:bg-zinc-855 text-white font-extrabold uppercase tracking-widest rounded-xl text-xs transition-all shadow-lg shadow-black/10 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer select-none"
                  >
                    {isScraping ? (
                      <>
                        <Loader2 className="animate-spin text-yellow-400" size={16} />
                        Scraping Live Spreadsheet...
                      </>
                    ) : (
                      <>
                        <RefreshCw size={14} />
                        Scrape All Data in One Click
                      </>
                    )}
                  </button>
                  
                  {scrapedData.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center text-center">
                      {scrapedData.filter(row => selectedSheet === "ev" ? (row.sheetType === "ev" || (!row.sheetType && !row.fuel_type)) : (row.sheetType === "fuel-efficiency" || row.fuel_type !== undefined)).length} Datasets Indexed ({selectedSheet === "ev" ? "EV" : "Fuel"})
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* SCRAPE STATUS & LOGS SIDE PANEL */}
            <div className="space-y-6">
              <div className="bg-zinc-950 text-zinc-350 rounded-[24px] p-6 border border-zinc-800 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest">Scraper Engine Console</span>
                  <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse shadow-sm shadow-yellow-400/50" />
                </div>

                <div className="font-mono text-[10px] text-zinc-400 space-y-2.5 leading-relaxed h-[180px] overflow-y-auto bg-black/40 p-4 rounded-xl border border-zinc-900">
                  <p className="text-zinc-500 border-l-2 border-yellow-500 pl-2">[SYSTEM] Scraper Engine active.</p>
                  <p className="text-zinc-650">&gt; Loaded public sheet importer utility</p>
                  {isScraping && (
                    <p className="text-yellow-400 animate-pulse">[PROCESSING] Fetching live rows from Google Drive...</p>
                  )}
                  {scrapeResults && (
                    <>
                      <p className="text-emerald-400 font-bold">[SUCCESS] Scraping completed at {scrapeResults.timestamp}!</p>
                      <p className="text-zinc-500">&gt; Parsed {scrapeResults.count} records correctly.</p>
                      <p className="text-zinc-500">&gt; Ready for article content generation.</p>
                    </>
                  )}
                  {!isScraping && !scrapeResults && (
                    <p className="text-zinc-600">[READY] Click scrape button to initiate synchronization.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* REAL PREVIEW OF SYNCED SYSTEM MODELS */}
          {(() => {
            const currentFilteredRows = scrapedData
              .filter(row => selectedSheet === "ev" ? (row.sheetType === "ev" || (!row.sheetType && !row.fuel_type)) : (row.sheetType === "fuel-efficiency" || row.fuel_type !== undefined))
              .sort((a,b) => (a.rank || 0) - (b.rank || 0));

            const isAllSelected = currentFilteredRows.length > 0 && currentFilteredRows.every(row => selectedRowIds.includes(row.id));

            const handleToggleSelectAll = () => {
              if (isAllSelected) {
                // Deselect all on current sheet
                const leftOver = selectedRowIds.filter(id => !currentFilteredRows.some(row => row.id === id));
                setSelectedRowIds(leftOver);
              } else {
                // Select all on current sheet
                const combined = Array.from(new Set([...selectedRowIds, ...currentFilteredRows.map(row => row.id)]));
                setSelectedRowIds(combined);
              }
            };

            const handleToggleSelectRow = (id: string) => {
              if (selectedRowIds.includes(id)) {
                setSelectedRowIds(prev => prev.filter(item => item !== id));
              } else {
                setSelectedRowIds(prev => [...prev, id]);
              }
            };

            if (scrapedData.length === 0) return null;

            return (
              <div className="space-y-4 animate-fade-in text-zinc-700">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-1 pb-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xs font-extrabold uppercase tracking-widest text-zinc-800 flex items-center gap-2">
                      <Database size={15} className="text-yellow-500" />
                      Synced {selectedSheet === "ev" ? "EV" : "Fuel-Efficiency"} Database {selectedSheet === "ev" ? "Models" : "Vehicles"}
                    </h3>
                    <span className="p-1 px-2.5 bg-zinc-100 border border-zinc-200/60 rounded-full text-[9px] font-bold text-zinc-650 uppercase font-mono tracking-wider">
                      Total: {currentFilteredRows.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    {currentFilteredRows.length > 0 && (
                      <button
                        onClick={() => handleDeleteAllCurrent(currentFilteredRows)}
                        disabled={isDeleting}
                        className="px-3.5 py-1.5 text-[10px] uppercase tracking-widest font-extrabold text-red-650 bg-red-50 hover:bg-red-100/80 border border-red-200/70 rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                        title={`Clear all ${selectedSheet === "ev" ? "EV" : "Fuel"} datasets`}
                      >
                        <Trash2 size={12} className="text-red-500" />
                        Delete All {selectedSheet === "ev" ? "EV" : "Fuel"} Data
                      </button>
                    )}
                  </div>
                </div>

                {/* Bulk Actions Bar */}
                <AnimatePresence>
                  {selectedRowIds.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex flex-wrap items-center justify-between gap-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse"></div>
                        <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                          {selectedRowIds.length} Dataset(s) Selected
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedRowIds([])}
                          className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-extrabold text-zinc-500 hover:text-zinc-800 bg-white border border-zinc-200 rounded-lg transition-colors cursor-pointer"
                        >
                          Clear Selection
                        </button>
                        <button
                          onClick={handleDeleteSelected}
                          disabled={isDeleting}
                          className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-extrabold text-white bg-red-600 hover:bg-red-700 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                        >
                          <Trash2 size={12} />
                          Delete Selected
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="bg-white border border-zinc-200/80 rounded-[24px] shadow-sm overflow-hidden">
                  <div className="overflow-x-auto max-h-[400px]">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-zinc-50 border-b border-zinc-200/65 z-10 text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
                        {selectedSheet === "ev" ? (
                          <tr>
                            <th className="px-5 py-3 w-12 text-center">
                              <input
                                type="checkbox"
                                checked={isAllSelected}
                                onChange={handleToggleSelectAll}
                                className="w-4 h-4 text-black bg-zinc-100 border-zinc-300 rounded focus:ring-yellow-400 cursor-pointer accent-black"
                              />
                            </th>
                            <th className="px-5 py-3">Rank</th>
                            <th className="px-5 py-3">ID</th>
                            <th className="px-5 py-3">Brand</th>
                            <th className="px-5 py-3">Vehicle Model</th>
                            <th className="px-5 py-3">Battery Size (kWh)</th>
                            <th className="px-5 py-3">Claimed Range</th>
                            <th className="px-5 py-3">Real Range</th>
                            <th className="px-5 py-3">Tested Year</th>
                            <th className="px-5 py-3 text-right">Actions</th>
                          </tr>
                        ) : (
                          <tr>
                            <th className="px-5 py-3 w-12 text-center">
                              <input
                                type="checkbox"
                                checked={isAllSelected}
                                onChange={handleToggleSelectAll}
                                className="w-4 h-4 text-black bg-zinc-100 border-zinc-300 rounded focus:ring-yellow-400 cursor-pointer accent-black"
                              />
                            </th>
                            <th className="px-5 py-3">Rank</th>
                            <th className="px-5 py-3">ID</th>
                            <th className="px-5 py-3">Brand</th>
                            <th className="px-5 py-3">Vehicle Model</th>
                            <th className="px-5 py-3">Fuel Type</th>
                            <th className="px-5 py-3">Engine</th>
                            <th className="px-5 py-3">Transmission</th>
                            <th className="px-5 py-3">Claimed Mileage</th>
                            <th className="px-5 py-3">Real Mileage</th>
                            <th className="px-5 py-3">Tested Year</th>
                            <th className="px-5 py-3 text-right">Actions</th>
                          </tr>
                        )}
                      </thead>
                      <tbody className="divide-y divide-zinc-100 text-xs text-zinc-800">
                        {currentFilteredRows.map((row) => {
                          const isSelected = selectedRowIds.includes(row.id);
                          return (
                            <tr key={row.id} className={cn("hover:bg-zinc-50/20 transition-colors", isSelected && "bg-amber-50/25")}>
                              <td className="px-5 py-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleSelectRow(row.id)}
                                  className="w-4 h-4 text-black bg-zinc-100 border-zinc-300 rounded focus:ring-yellow-400 cursor-pointer accent-black"
                                />
                              </td>
                              <td className="px-5 py-3 font-mono font-bold text-zinc-400">#{row.rank || "—"}</td>
                              <td className="px-5 py-3 font-mono font-bold text-amber-700 uppercase text-[11px]">{row.id}</td>
                              <td className="px-5 py-3 font-bold text-zinc-950">{row.brand || "—"}</td>
                              <td className="px-5 py-3 font-extrabold text-zinc-900 uppercase">
                                {row.model || "—"} {row.variant ? <span className="text-[10px] text-zinc-400 font-normal uppercase">({row.variant})</span> : ""}
                              </td>
                              {selectedSheet === "ev" ? (
                                <>
                                  <td className="px-5 py-3 font-mono font-bold text-zinc-800">{row.battery_kwh || "—"} kWh</td>
                                  <td className="px-5 py-3 font-mono font-bold text-zinc-500">{row.claimed_range_km || "—"} km</td>
                                  <td className="px-5 py-3 font-mono font-bold text-amber-600">{row.real_range_km || "—"} km</td>
                                </>
                              ) : (
                                <>
                                  <td className="px-5 py-3 font-extrabold text-zinc-700 capitalize">{row.fuel_type || "—"}</td>
                                  <td className="px-5 py-3 font-mono font-bold text-zinc-500">{row.engine || "—"}</td>
                                  <td className="px-5 py-3 font-bold text-zinc-650 uppercase text-[10px]">{row.transmission || "—"}</td>
                                  <td className="px-5 py-3 font-mono font-bold text-zinc-500">{row.claimed_mileage_kmpl || "—"} kmpl</td>
                                  <td className="px-5 py-3 font-mono font-bold text-amber-600">{row.real_mileage_kmpl || "—"} kmpl</td>
                                </>
                              )}
                              <td className="px-5 py-3 text-zinc-400 font-mono">{row.test_year || "—"}</td>
                              <td className="px-5 py-3 text-right">
                                <button
                                  onClick={() => handleDeleteSingle(row.id)}
                                  disabled={isDeleting}
                                  className="p-1 px-2.5 text-red-650 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center gap-1 font-bold text-[10px] uppercase tracking-wider disabled:opacity-40 cursor-pointer"
                                  title="Delete this entry"
                                >
                                  <Trash2 size={12} />
                                  Delete
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}

        </div>
      )}

    </motion.div>
  );
}
