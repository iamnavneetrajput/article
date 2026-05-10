import React, { useState, useEffect, useRef } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Search, Car, Database, X, Loader2, ChevronRight, ArrowUpDown, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";

interface FlatResult {
  id: string;
  name: string;
  type: "Brand" | "Model" | "Powertrain";
  path: string;
  parent?: string;
  subParent?: string;
}

export default function GlobalSearch() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [allData, setAllData] = useState<FlatResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Load all data for indexing (Advanced Search behavior)
  useEffect(() => {
    async function fetchPayload() {
      if (!isOpen || allData.length > 0) return;
      setIsLoading(true);
      try {
        const [brandSnap, modelSnap, ptSnap] = await Promise.all([
          getDocs(collection(db, "brands")),
          getDocs(collection(db, "models")),
          getDocs(collection(db, "powertrains"))
        ]);

        const brands: FlatResult[] = brandSnap.docs.map(d => ({
          id: d.id,
          name: d.data().name,
          type: "Brand",
          path: "/brands"
        }));

        const models: FlatResult[] = modelSnap.docs.map(d => ({
          id: d.id,
          name: d.data().name,
          parent: d.data().brandName || "Unknown Brand",
          type: "Model",
          path: "/models"
        }));

        const pts: FlatResult[] = ptSnap.docs.map(d => ({
          id: d.id,
          name: d.data().name,
          parent: d.data().brandName || "Unknown Brand",
          subParent: d.data().modelName || "Unknown Model",
          type: "Powertrain",
          path: "/models"
        }));

        setAllData([...brands, ...models, ...pts]);
      } catch (error) {
        console.error("Search index failed", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchPayload();
  }, [isOpen, allData.length]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredResults = allData.filter(item => {
    const matchesSearch = 
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.parent?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.subParent?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === "all" || item.type.toLowerCase() === filterType;
    return matchesSearch && matchesType;
  }).slice(0, 50); // Limit dropdown results to 50 for performance

  const handleSelect = (path: string) => {
    navigate(path);
    setIsOpen(false);
    setSearchTerm("");
  };

  return (
    <div className="relative" ref={searchRef}>
      <div className="relative flex items-center">
        <Search className="absolute left-3 text-slate-400" size={14} />
        <input
          type="text"
          placeholder="Global Advanced Search (Brand, Model, PT)..."
          className="bg-slate-100 border-none rounded-full py-2.5 pl-9 pr-10 text-xs w-full max-w-[16rem] sm:max-w-xs md:max-w-md focus:ring-2 focus:ring-blue-500 transition-all outline-none font-medium shadow-inner"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && searchTerm.trim()) {
              setIsOpen(false);
            }
          }}
        />
        {searchTerm && (
          <button 
            onClick={() => setSearchTerm("")}
            className="absolute right-3 p-0.5 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X size={12} className="text-slate-500" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute top-full mt-2 w-[calc(100vw-2rem)] sm:w-[500px] md:w-[650px] max-w-[95vw] border-slate-200 right-0 bg-white border rounded-2xl shadow-2xl z-50 overflow-hidden shadow-blue-900/10"
          >
            {/* Advanced Filters */}
            <div className="flex bg-slate-50 p-1.5 border-b border-slate-100 items-center justify-between">
              <div className="flex gap-1 flex-1">
                {(["all", "brand", "model", "powertrain"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={cn(
                      "px-3 py-1.5 text-[9px] font-bold uppercase tracking-tighter rounded-lg transition-all",
                      filterType === type 
                        ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-200" 
                        : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    {type === "all" ? "Everywhere" : type + "s"}
                  </button>
                ))}
              </div>
              <span className="px-3 text-[9px] font-mono text-slate-300 hidden md:block">MASTER_INDEX_PRO</span>
            </div>

            <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
              {isLoading ? (
                <div className="p-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <Loader2 className="animate-spin" size={24} />
                  <span className="text-[10px] font-bold uppercase tracking-widest animate-pulse">Synchronizing Global Registry...</span>
                </div>
              ) : searchTerm && filteredResults.length > 0 ? (
                <div className="divide-y divide-slate-50">
                  {filteredResults.map((item) => (
                    <button
                      key={`${item.type}-${item.id}`}
                      onClick={() => handleSelect(item.path)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50/50 transition-colors group text-left"
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className={cn(
                          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110",
                          item.type === "Brand" ? "bg-blue-50 text-blue-600" :
                          item.type === "Model" ? "bg-indigo-50 text-indigo-600" :
                          "bg-purple-50 text-purple-600"
                        )}>
                          {item.type === "Brand" ? <Car size={18} /> : <Database size={18} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                             <span className={cn(
                              "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest border shrink-0",
                              item.type === "Brand" ? "bg-blue-50 text-blue-700 border-blue-100" :
                              item.type === "Model" ? "bg-indigo-50 text-indigo-700 border-indigo-100" :
                              "bg-purple-50 text-purple-700 border-purple-100"
                            )}>
                              {item.type}
                            </span>
                            <span className="text-sm font-bold text-slate-900 truncate uppercase tracking-tight group-hover:text-blue-600 transition-colors">
                              {item.name}
                            </span>
                          </div>
                          
                          <div className="flex items-center text-[10px] text-slate-400 mt-0.5 truncate font-medium uppercase tracking-tighter">
                            {item.parent && (
                              <>
                                <span className="text-slate-600 font-bold">{item.parent}</span>
                                <ChevronRight size={10} className="mx-1 opacity-50" />
                              </>
                            )}
                            {item.subParent && (
                              <>
                                <span className="text-slate-500">{item.subParent}</span>
                                <ChevronRight size={10} className="mx-1 opacity-30" />
                              </>
                            )}
                            <span className="opacity-40 italic">Node</span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight size={14} className="text-slate-300 group-hover:text-blue-400 transition-colors ml-4 shrink-0" />
                    </button>
                  ))}
                </div>
              ) : searchTerm ? (
                <div className="p-16 text-center">
                  <div className="text-slate-200 mb-4 flex justify-center"><AlertCircle size={48} strokeWidth={1} /></div>
                  <div className="text-sm font-bold text-slate-900 uppercase tracking-tight">Zero Registry Matches</div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2 max-w-[200px] mx-auto italic">
                    The search term "{searchTerm}" did not return any results from the master database.
                  </p>
                </div>
              ) : (
                <div className="p-12 text-center text-slate-400">
                  <Search size={32} className="mx-auto mb-3 opacity-20" />
                  <p className="text-[10px] font-bold uppercase tracking-widest">Type to search the global registry</p>
                </div>
              )}
            </div>
            
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
               <div className="flex items-center gap-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                 <span>{allData.length} Indexed Records</span>
                 <span className="w-1 h-1 bg-slate-300 rounded-full" />
                 <span>v8.2.1-ADV</span>
               </div>
               <div className="flex items-center gap-1 text-[9px] font-mono text-slate-300">
                 ESC to exit • ENTER for broad search
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
