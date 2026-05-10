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
        className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <header className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Settings className="text-blue-600" size={18} />
              <h2 className="text-2xl font-black tracking-tighter uppercase text-slate-900">Service Architecture</h2>
            </div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.3em] font-mono">
              Engineering Node: {powertrainName}
            </p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-200 rounded-full transition-colors">
            <X size={24} className="text-slate-500" />
          </button>
        </header>

        <div className="flex-1 overflow-hidden flex">
          {/* List Profile */}
          <div className="w-1/3 border-r border-slate-100 bg-slate-50/50 flex flex-col">
            <div className="p-6 flex justify-between items-center">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Intervals</h3>
              {isAdmin && (
                <button 
                  onClick={handleAddInterval}
                  className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors shadow-lg shadow-blue-200"
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {intervals.map((interval) => (
                <div
                  role="button"
                  tabIndex={0}
                  key={interval.id}
                  onClick={() => handleEditInterval(interval)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleEditInterval(interval);
                    }
                  }}
                  className={cn(
                    "w-full p-4 rounded-2xl border text-left transition-all group relative cursor-pointer",
                    editingInterval?.id === interval.id 
                      ? "bg-white border-blue-200 shadow-xl shadow-blue-50/50 ring-2 ring-blue-500/10" 
                      : "bg-white border-slate-200 hover:border-blue-200 shadow-sm"
                  )}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-black uppercase text-slate-900">{interval.name}</span>
                    {isAdmin && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeleteInterval(interval.id); }}
                          className="p-1 text-slate-400 hover:text-red-500"
                          aria-label="Delete interval"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500 font-bold uppercase font-mono">
                    <span className="flex items-center gap-1"><Database size={10} /> {interval.kilometers.toLocaleString()} KM</span>
                    <span className="flex items-center gap-1"><Calendar size={10} /> {interval.months} MO</span>
                  </div>
                  {editingInterval?.id === interval.id && (
                    <motion.div layoutId="active-indicator" className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-600 rounded-full" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Edit Panel */}
          <div className="flex-1 bg-white flex flex-col">
            <AnimatePresence mode="wait">
              {editingInterval ? (
                <motion.div 
                  key="edit-form"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex-1 flex flex-col overflow-hidden"
                >
                  <div className="p-8 border-b border-slate-50 space-y-6">
                    <div className="grid grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Internal Label</label>
                        <input 
                          type="text"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-blue-500/20 outline-none"
                          value={editingInterval.name}
                          onChange={(e) => setEditingInterval({ ...editingInterval, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Odometer Trigger (KM)</label>
                        <input 
                          type="number"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-blue-500/20 outline-none font-mono"
                          value={editingInterval.kilometers}
                          onChange={(e) => setEditingInterval({ ...editingInterval, kilometers: Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Temporal Trigger (Months)</label>
                        <input 
                          type="number"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-blue-500/20 outline-none font-mono"
                          value={editingInterval.months}
                          onChange={(e) => setEditingInterval({ ...editingInterval, months: Number(e.target.value) })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-6 pt-4 border-t border-slate-50">
                       <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Labor Cost (INR)</label>
                        <input 
                          type="number"
                          className="w-full bg-blue-50/30 border border-blue-100 rounded-xl p-3 text-sm font-bold text-blue-600 focus:ring-2 focus:ring-blue-500/20 outline-none font-mono"
                          value={editingInterval.laborCost}
                          onChange={(e) => setEditingInterval({ 
                            ...editingInterval, 
                            laborCost: Number(e.target.value),
                            totalCost: Number(e.target.value) + (editingInterval.partsCost || 0)
                          })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Aggregate Parts</label>
                        <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-400 font-mono">
                          {formatCurrency(editingInterval.partsCost || 0)}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Total Valuation</label>
                        <div className="w-full bg-blue-600 text-white border border-blue-600 rounded-xl p-3 text-sm font-black font-mono">
                          {formatCurrency(editingInterval.totalCost || 0)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="flex justify-between items-center mb-6">
                      <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Bill of Materials / Operations</h4>
                      {isAdmin && (
                        <button 
                          onClick={addItemToInterval}
                          className="text-[10px] font-bold uppercase tracking-widest text-blue-600 flex items-center gap-1 hover:underline decoration-2"
                        >
                          <Plus size={12} /> Add Component
                        </button>
                      )}
                    </div>

                    <div className="space-y-3">
                      {editingInterval.items?.map((item, idx) => (
                        <div key={idx} className="flex gap-4 items-end bg-slate-50 p-4 rounded-2xl border border-slate-100 group">
                          <div className="flex-1 space-y-1">
                             <label className="text-[8px] font-bold uppercase text-slate-400">Resource / Part Name</label>
                             <input 
                               list="common-parts"
                               className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-bold focus:ring-2 focus:ring-blue-500/20 outline-none uppercase"
                               value={item.service}
                               onChange={(e) => updateItem(idx, { service: e.target.value })}
                             />
                             <datalist id="common-parts">
                               {commonParts.map(p => <option key={p} value={p} />)}
                             </datalist>
                          </div>
                          <div className="w-32 space-y-1">
                             <label className="text-[8px] font-bold uppercase text-slate-400">Action</label>
                             <select 
                               className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-bold focus:ring-2 focus:ring-blue-500/20 outline-none"
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
                          <div className="w-24 space-y-1">
                             <label className="text-[8px] font-bold uppercase text-slate-400">Price</label>
                             <input 
                               type="number"
                               className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-bold font-mono"
                               value={item.pricePerUnit}
                               onChange={(e) => updateItem(idx, { pricePerUnit: Number(e.target.value) })}
                             />
                          </div>
                          <div className="w-20 space-y-1">
                             <label className="text-[8px] font-bold uppercase text-slate-400">Qty</label>
                             <input 
                               type="number"
                               step="0.01"
                               className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-bold font-mono"
                               value={item.requiredQuantity}
                               onChange={(e) => updateItem(idx, { requiredQuantity: Number(e.target.value) })}
                             />
                          </div>
                          <div className="w-32 space-y-1">
                             <label className="text-[8px] font-bold uppercase text-slate-400">Subtotal</label>
                             <div className="w-full bg-slate-200/50 rounded-lg p-2 text-xs font-bold font-mono text-slate-600">
                               {formatCurrency(item.total)}
                             </div>
                          </div>
                          <button 
                            onClick={() => removeItem(idx)}
                            className="p-2 text-slate-300 hover:text-red-500 transition-colors mb-0.5"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      {editingInterval.items?.length === 0 && (
                        <div className="py-12 text-center text-slate-400 text-xs font-medium italic border-2 border-dashed border-slate-100 rounded-3xl">
                          No components defined for this interval node.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-8 border-t border-slate-50 flex gap-4 bg-slate-50/30">
                    <button 
                      onClick={() => setEditingInterval(null)}
                      className="flex-1 py-4 text-xs font-black uppercase tracking-[0.2em] text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {isAdmin ? "Stash Changes" : "Close Inspection"}
                    </button>
                    {isAdmin && (
                      <button 
                        onClick={handleSaveInterval}
                        disabled={isSubmitting}
                        className="flex-[2] py-4 bg-blue-600 text-white text-xs font-black uppercase tracking-[0.2em] rounded-2xl shadow-2xl shadow-blue-200 hover:bg-blue-500 transition-all disabled:opacity-50"
                      >
                        {isSubmitting ? "Committing Bit..." : "Finalize Sync"}
                      </button>
                    )}
                  </div>
                </motion.div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-6">
                  <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
                    <Settings size={48} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">No Active Buffer</h3>
                    <p className="text-sm text-slate-500 max-w-xs mx-auto">Select an interval from the registry or create a new node to begin engineering.</p>
                  </div>
                  <button 
                    onClick={handleAddInterval}
                    className="px-6 py-3 bg-slate-900 text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all"
                  >
                    Initialize New Node
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
