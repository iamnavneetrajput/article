import React, { useState, useEffect } from "react";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  doc, 
  setDoc, 
  deleteDoc, 
  serverTimestamp,
  updateDoc
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { handleFirestoreError, OperationType } from "../lib/errorHandling";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  Calendar, 
  Zap, 
  Wrench, 
  ChevronRight,
  ChevronDown,
  Settings,
  Database
} from "lucide-react";
import { cn, slugify, formatCurrency } from "../lib/utils";

interface ScheduleItem {
  service: string;
  action: string;
  pricePerUnit: number;
  requiredQuantity: number;
  total: number;
  required: boolean;
}

interface ServiceInterval {
  id: string;
  name: string;
  kilometers: number;
  months: number;
  laborCost: number;
  partsCost: number;
  totalCost: number;
  items: ScheduleItem[];
}

interface Props {
  powertrainId: string;
  powertrainName: string;
  onClose: () => void;
}

const MASTER_COMPONENTS: ScheduleItem[] = [
  { service: "ENGINE OIL - HIGH PERFORMANCE SYNTHETIC", action: "Replace", pricePerUnit: 0, requiredQuantity: 1, total: 0, required: true },
  { service: "ELEMENT ASSEMBLY - OIL FILTER", action: "Replace", pricePerUnit: 0, requiredQuantity: 1, total: 0, required: true },
  { service: "AIR CLEANER ELEMENT - ENGINE AIR FILTER", action: "Replace", pricePerUnit: 0, requiredQuantity: 1, total: 0, required: true },
  { service: "FILTER ASSEMBLY - CABIN / AC DUST FILTER", action: "Replace", pricePerUnit: 0, requiredQuantity: 1, total: 0, required: true },
  { service: "WASHER - SUMP PLUG SEALING", action: "Replace", pricePerUnit: 0, requiredQuantity: 1, total: 0, required: true },
  { service: "BRAKE FLUID - DOT 4 SPECIFICATION", action: "Inspect", pricePerUnit: 0, requiredQuantity: 1, total: 0, required: true },
  { service: "COOLANT - ETHYLENE GLYCOL CONCENTRATE", action: "Inspect", pricePerUnit: 0, requiredQuantity: 1, total: 0, required: true },
  { service: "SPARK PLUGS - IRIDIUM / PLATINUM CORE", action: "Inspect", pricePerUnit: 0, requiredQuantity: 1, total: 0, required: true },
  { service: "WINDSHIELD WASHER FLUID CONCENTRATE", action: "Top-up", pricePerUnit: 0, requiredQuantity: 1, total: 0, required: true },
  { service: "GENERAL LUBRICATION & DOOR HINGE SERVICE", action: "Lubricate", pricePerUnit: 0, requiredQuantity: 1, total: 0, required: true }
];

export default function ServiceScheduleManager({ powertrainId, powertrainName, onClose }: Props) {
  const { isAdmin } = useAuth();
  const [intervals, setIntervals] = useState<ServiceInterval[]>([]);
  const [editingInterval, setEditingInterval] = useState<ServiceInterval | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commonParts, setCommonParts] = useState<string[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, "serviceIntervals"), 
      where("powertrainId", "==", powertrainId),
      orderBy("kilometers", "asc")
    );
    
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as ServiceInterval[];
      setIntervals(data);
      
      // Collect common parts for suggestions
      const parts = new Set<string>();
      data.forEach(interval => {
        interval.items?.forEach(item => parts.add(item.service));
      });
      setCommonParts(Array.from(parts));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "service_intervals");
    });
  }, [powertrainId]);

  const handleAddInterval = () => {
    // Inherit from latest interval if exists to save re-entry
    const latestInterval = intervals.length > 0 
      ? [...intervals].sort((a, b) => b.kilometers - a.kilometers)[0] 
      : null;

    const newInterval: ServiceInterval = {
      id: "",
      name: `New Service Node`,
      kilometers: (latestInterval?.kilometers || 0) + 15000,
      months: (latestInterval?.months || 0) + 12,
      laborCost: latestInterval?.laborCost || 0,
      partsCost: latestInterval?.partsCost || 0,
      totalCost: (latestInterval?.laborCost || 0) + (latestInterval?.partsCost || 0),
      items: latestInterval?.items 
        ? latestInterval.items.map(item => ({ ...item })) 
        : MASTER_COMPONENTS.map(item => ({ ...item }))
    };
    setEditingInterval(newInterval);
  };

  const handleEditInterval = (interval: ServiceInterval) => {
    setEditingInterval({ ...interval, items: [...(interval.items || [])] });
  };

  const handleDeleteInterval = async (id: string) => {
    if (confirm("Delete this entire service interval?")) {
      try {
        await deleteDoc(doc(db, "serviceIntervals", id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, "service_intervals");
      }
    }
  };

  const addItemToInterval = () => {
    if (!editingInterval) return;
    const newItem: ScheduleItem = {
      service: "",
      action: "Replace",
      pricePerUnit: 0,
      requiredQuantity: 1,
      total: 0,
      required: true
    };
    setEditingInterval({
      ...editingInterval,
      items: [...editingInterval.items, newItem]
    });
  };

  const updateItem = (index: number, updates: Partial<ScheduleItem>) => {
    if (!editingInterval) return;
    const newItems = [...editingInterval.items];
    const item = { ...newItems[index], ...updates };
    item.total = item.pricePerUnit * item.requiredQuantity;
    newItems[index] = item;
    
    // Recalculate parts cost
    const partsCost = newItems.reduce((acc, curr) => acc + curr.total, 0);
    
    setEditingInterval({
      ...editingInterval,
      items: newItems,
      partsCost,
      totalCost: partsCost + (editingInterval.laborCost || 0)
    });
  };

  const removeItem = (index: number) => {
    if (!editingInterval) return;
    const newItems = editingInterval.items.filter((_, i) => i !== index);
    const partsCost = newItems.reduce((acc, curr) => acc + curr.total, 0);
    setEditingInterval({
      ...editingInterval,
      items: newItems,
      partsCost,
      totalCost: partsCost + (editingInterval.laborCost || 0)
    });
  };

  const handleSaveInterval = async () => {
    if (!editingInterval) return;
    setIsSubmitting(true);
    try {
      const data = {
        name: editingInterval.name || `${editingInterval.kilometers} km / ${editingInterval.months} mo`,
        kilometers: Number(editingInterval.kilometers),
        months: Number(editingInterval.months),
        laborCost: Number(editingInterval.laborCost),
        partsCost: Number(editingInterval.partsCost),
        totalCost: Number(editingInterval.totalCost),
        items: editingInterval.items,
        powertrainId,
        updatedAt: serverTimestamp()
      };

      if (editingInterval.id) {
        await updateDoc(doc(db, "serviceIntervals", editingInterval.id), data);
      } else {
        const id = slugify(`${powertrainId}-${data.name}`);
        await setDoc(doc(db, "serviceIntervals", id), {
          ...data,
          createdAt: serverTimestamp()
        });
      }
      setEditingInterval(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "service_intervals");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
        onClick={onClose}
      />
      
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="relative w-full max-w-5xl bg-white rounded-2xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] md:max-h-[85vh]"
      >
        <header className="p-4 md:p-5 border-b border-slate-100 bg-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
              <Settings size={20} />
            </div>
            <div>
              <h2 className="text-sm md:text-lg font-bold tracking-tight text-slate-900 leading-none mb-1">Service Schedule Manager</h2>
              <p className="text-[9px] md:text-[10px] text-slate-400 font-medium uppercase tracking-widest leading-none">
                Vehicle Variant: <span className="text-slate-600 font-bold truncate max-w-[150px] md:max-w-none inline-block align-bottom">{powertrainName}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </header>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* List Sidebar */}
          <div className="w-full md:w-72 border-r border-slate-100 bg-slate-50/30 flex flex-col shrink-0 max-h-48 md:max-h-none border-b md:border-b-0">
            <div className="p-4 flex justify-between items-center bg-white/50 border-b border-slate-100/50 shrink-0">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Maintenance Intervals</h3>
              {isAdmin && (
                <button 
                  onClick={handleAddInterval}
                  className="w-7 h-7 flex items-center justify-center bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all shadow-lg active:scale-95"
                  title="Add Interval"
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              {intervals.map((interval) => (
                <div
                  role="button"
                  tabIndex={0}
                  key={interval.id}
                  onClick={() => handleEditInterval(interval)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleEditInterval(interval);
                    }
                  }}
                  className={cn(
                    "w-full p-3 rounded-xl border text-left transition-all group relative overflow-hidden cursor-pointer",
                    editingInterval?.id === interval.id 
                      ? "bg-white border-blue-500 shadow-lg shadow-blue-500/5 ring-1 ring-blue-500" 
                      : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
                  )}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={cn(
                      "text-xs font-bold transition-colors",
                      editingInterval?.id === interval.id ? "text-blue-600" : "text-slate-900"
                    )}>{interval.name}</span>
                    {isAdmin && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDeleteInterval(interval.id); }}
                        className="p-1 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[9px] text-slate-400 font-bold uppercase">
                    <span className="flex items-center gap-1"><Database size={10} /> {interval.kilometers.toLocaleString()}</span>
                    <span className="flex items-center gap-1"><Calendar size={10} /> {interval.months}M</span>
                    <span className="ml-auto text-blue-600">{formatCurrency(interval.totalCost)}</span>
                  </div>
                </div>
              ))}
              {intervals.length === 0 && (
                <div className="py-20 text-center text-slate-400 text-xs italic px-6">
                  No service intervals defined for this vehicle.
                </div>
              )}
            </div>
          </div>

          {/* Editor Panel */}
          <div className="flex-1 bg-white flex flex-col min-w-0">
            <AnimatePresence mode="wait">
              {editingInterval ? (
                <motion.div 
                  key="edit-form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 flex flex-col overflow-hidden"
                >
                  {/* Stats & Header Info */}
                  <div className="p-5 md:p-6 border-b border-slate-50 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">Service Name</label>
                        <input 
                          type="text"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold focus:bg-white focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all outline-none"
                          value={editingInterval.name}
                          placeholder="e.g., Minor Service"
                          onChange={(e) => setEditingInterval({ ...editingInterval, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">Kilometers Trigger</label>
                        <input 
                          type="number"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold focus:bg-white focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all outline-none font-mono"
                          value={editingInterval.kilometers}
                          onChange={(e) => setEditingInterval({ ...editingInterval, kilometers: Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">Months Trigger</label>
                        <input 
                          type="number"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold focus:bg-white focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all outline-none font-mono"
                          value={editingInterval.months}
                          onChange={(e) => setEditingInterval({ ...editingInterval, months: Number(e.target.value) })}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 p-4 bg-slate-900 rounded-2xl text-white">
                      <div className="flex-1 min-w-[120px]">
                        <p className="text-[9px] font-bold uppercase text-slate-400 mb-1">Labor Charges</p>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xs">₹</span>
                          <input 
                            type="number"
                            className="w-full bg-slate-800 border-none rounded-lg py-1.5 pl-6 pr-2 text-base font-black focus:ring-2 focus:ring-blue-500 outline-none font-mono text-blue-400"
                            value={editingInterval.laborCost}
                            onChange={(e) => setEditingInterval({ 
                              ...editingInterval, 
                              laborCost: Number(e.target.value),
                              totalCost: Number(e.target.value) + (editingInterval.partsCost || 0)
                            })}
                          />
                        </div>
                      </div>
                      <div className="w-px h-8 bg-slate-800 hidden sm:block" />
                      <div className="flex-1 min-w-[120px]">
                        <p className="text-[9px] font-bold uppercase text-slate-400 mb-1">Parts Subtotal</p>
                        <p className="text-lg font-black font-mono text-white">{formatCurrency(editingInterval.partsCost || 0)}</p>
                      </div>
                      <div className="w-px h-8 bg-slate-800 hidden sm:block" />
                      <div className="flex-1 min-w-[160px] bg-blue-600 rounded-xl p-3 shadow-lg shadow-blue-500/10">
                        <p className="text-[9px] font-bold uppercase text-blue-100 mb-0.5">Total Estimated Cost</p>
                        <p className="text-xl font-black font-mono">{formatCurrency(editingInterval.totalCost || 0)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 md:p-6 pt-0 custom-scrollbar">
                    <div className="flex justify-between items-center py-4 sticky top-0 bg-white z-10 border-b border-slate-50 mb-4">
                      <h4 className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                        <Wrench size={12} /> Service Parts & Operations
                      </h4>
                      {isAdmin && (
                        <button 
                          onClick={addItemToInterval}
                          className="px-3 py-1.5 bg-blue-50 text-blue-600 text-[9px] font-bold uppercase tracking-widest rounded-lg hover:bg-blue-100 transition-all flex items-center gap-2"
                        >
                          <Plus size={12} /> Add Line Item
                        </button>
                      )}
                    </div>

                    <div className="space-y-3">
                      {editingInterval.items?.map((item, idx) => (
                        <div key={idx} className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow relative group">
                          <div className="grid grid-cols-12 gap-4">
                            <div className="col-span-12 lg:col-span-5 space-y-1">
                               <label className="text-[8px] font-bold uppercase text-slate-400 tracking-tighter">Part / Service Name</label>
                               <input 
                                 list="common-parts"
                                 className="w-full bg-slate-50 border border-slate-100 rounded-lg p-2 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none uppercase"
                                 value={item.service}
                                 onChange={(e) => updateItem(idx, { service: e.target.value })}
                               />
                               <datalist id="common-parts">
                                 {commonParts.map(p => <option key={p} value={p} />)}
                               </datalist>
                            </div>
                            
                            <div className="col-span-6 lg:col-span-2 space-y-1">
                               <label className="text-[8px] font-bold uppercase text-slate-400 tracking-tighter">Action Type</label>
                               <select 
                                 className="w-full bg-slate-50 border border-slate-100 rounded-lg p-2 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none appearance-none"
                                 value={item.action}
                                 onChange={(e) => updateItem(idx, { action: e.target.value })}
                               >
                                  <option>Replace</option>
                                  <option>Inspect</option>
                                  <option>Cleaning</option>
                                  <option>Top-up</option>
                                  <option>Lubricate</option>
                                  <option>Adjustment</option>
                               </select>
                            </div>

                            <div className="col-span-6 lg:col-span-5 grid grid-cols-3 gap-3">
                              <div className="space-y-1">
                                 <label className="text-[8px] font-bold uppercase text-slate-400 tracking-tighter text-center block">Price</label>
                                 <input 
                                   type="number"
                                   className="w-full bg-slate-50 border border-slate-100 rounded-lg p-2 text-[11px] font-bold font-mono text-center"
                                   value={item.pricePerUnit}
                                   onChange={(e) => updateItem(idx, { pricePerUnit: Number(e.target.value) })}
                                 />
                              </div>
                              <div className="space-y-1">
                                 <label className="text-[8px] font-bold uppercase text-slate-400 tracking-tighter text-center block">Qty</label>
                                 <input 
                                   type="number"
                                   step="0.01"
                                   className="w-full bg-slate-50 border border-slate-100 rounded-lg p-2 text-[11px] font-bold font-mono text-center"
                                   value={item.requiredQuantity}
                                   onChange={(e) => updateItem(idx, { requiredQuantity: Number(e.target.value) })}
                                 />
                              </div>
                              <div className="space-y-1">
                                 <label className="text-[8px] font-bold uppercase text-slate-400 tracking-tighter text-center block">Subtotal</label>
                                 <div className="w-full bg-blue-50 border border-blue-100 rounded-lg p-2 text-[10px] font-bold font-mono text-blue-600 text-center">
                                   {formatCurrency(item.total).replace('₹', '')}
                                 </div>
                              </div>
                            </div>
                          </div>
                          
                          {isAdmin && (
                            <button 
                              onClick={() => removeItem(idx)}
                              className="absolute -right-2.5 -top-2.5 p-1.5 bg-white border border-slate-100 shadow-md text-slate-300 hover:text-red-500 rounded-lg transition-all opacity-0 group-hover:opacity-100 hover:scale-110 active:scale-95 z-10"
                              title="Remove Item"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                      
                      {(!editingInterval.items || editingInterval.items.length === 0) && (
                        <div className="py-16 text-center border-2 border-dashed border-slate-100 rounded-3xl">
                          <Wrench className="mx-auto text-slate-200 mb-4" size={48} />
                          <p className="text-slate-400 text-sm font-medium italic">No parts or services listed for this interval.</p>
                          <button 
                            onClick={addItemToInterval}
                            className="mt-4 text-blue-600 text-xs font-bold uppercase hover:underline"
                          >
                            Add your first item
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-4 md:p-5 border-t border-slate-100 flex flex-col sm:flex-row gap-3 bg-slate-50/50">
                    <button 
                      onClick={() => setEditingInterval(null)}
                      className="flex-1 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 bg-white border border-slate-200 rounded-xl shadow-sm transition-all"
                    >
                      Cancel
                    </button>
                    {isAdmin && (
                      <button 
                        onClick={handleSaveInterval}
                        disabled={isSubmitting}
                        className="flex-[2] py-3 bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl shadow-lg hover:bg-slate-800 transition-all disabled:opacity-50 active:scale-[0.98]"
                      >
                        {isSubmitting ? "Saving..." : "Save Service Node"}
                      </button>
                    )}
                  </div>
                </motion.div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                  <div className="w-24 h-24 bg-slate-50 rounded-[32px] flex items-center justify-center text-slate-200 mb-6 border border-slate-100">
                    <Database size={48} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">No Interval Selected</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto mb-6">
                    Select a maintenance interval from the sidebar to view and manage its data, or create a new one to expand the architecture.
                  </p>
                  <button 
                    onClick={handleAddInterval}
                    className="px-6 py-3 bg-blue-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-blue-500 transition-all shadow-xl shadow-blue-500/20 active:scale-95"
                  >
                    Initialize New Interval
                  </button>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
