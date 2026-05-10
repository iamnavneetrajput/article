import React, { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy, getDocs, where, deleteDoc, doc, setDoc, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { handleFirestoreError, OperationType } from "../lib/errorHandling";
import { motion, AnimatePresence } from "motion/react";
import { Trash2, Edit2, Plus, Search, ChevronDown, ChevronRight, Activity, X, Calendar } from "lucide-react";
import { formatCurrency, cn, slugify } from "../lib/utils";
import ServiceScheduleManager from "./ServiceScheduleManager";

export default function ModelManager() {
  const { isAdmin } = useAuth();
  const [models, setModels] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [powertrains, setPowertrains] = useState<Record<string, any[]>>({});
  
  // Modals state
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [isPTModalOpen, setIsPTModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [editingModel, setEditingModel] = useState<any | null>(null);
  const [editingPT, setEditingPT] = useState<any | null>(null);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [selectedPowertrain, setSelectedPowertrain] = useState<any | null>(null);

  // Delete state
  const [itemToDelete, setItemToDelete] = useState<{ type: "model" | "powertrain"; data: any } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form states
  const [modelForm, setModelForm] = useState({
    name: "",
    brandId: ""
  });
  
  const [ptForm, setPtForm] = useState({
    name: "",
    engine: "",
    fuelType: "Petrol",
    transmission: "Manual"
  });

  useEffect(() => {
    const mq = query(collection(db, "models"), orderBy("brandName"), orderBy("name"));
    const bq = query(collection(db, "brands"), orderBy("name"));
    const pq = query(collection(db, "powertrains"), orderBy("modelId"));
    
    const unsubModels = onSnapshot(mq, (snapshot) => {
      setModels(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "models");
    });

    const unsubBrands = onSnapshot(bq, (snapshot) => {
      setBrands(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubPowertrains = onSnapshot(pq, (snapshot) => {
      const ptsByModel: Record<string, any[]> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data() as any;
        const pt = { id: doc.id, ...data };
        const mId = data.modelId || data.modelSlug; // Supporting both if they exist
        if (mId) {
          if (!ptsByModel[mId]) ptsByModel[mId] = [];
          ptsByModel[mId].push(pt);
        }
      });
      setPowertrains(ptsByModel);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "powertrain_registry");
    });

    return () => {
      unsubModels();
      unsubBrands();
      unsubPowertrains();
    };
  }, []);

  const openModelModal = (model?: any) => {
    if (model) {
      setEditingModel(model);
      setModelForm({ name: model.name, brandId: model.brandId });
    } else {
      setEditingModel(null);
      setModelForm({ name: "", brandId: brands[0]?.id || "" });
    }
    setIsModelModalOpen(true);
  };

  const openPTModal = (modelId: string, pt?: any) => {
    setActiveModelId(modelId);
    if (pt) {
      setEditingPT(pt);
      setPtForm({
        name: pt.name,
        engine: pt.engine || "",
        fuelType: pt.fuelType || "Petrol",
        transmission: pt.transmission || "Manual"
      });
    } else {
      setEditingPT(null);
      setPtForm({
        name: "",
        engine: "",
        fuelType: "Petrol",
        transmission: "Manual"
      });
    }
    setIsPTModalOpen(true);
  };

  const handleModelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelForm.name || !modelForm.brandId) return;

    setIsSubmitting(true);
    try {
      const selectedBrand = brands.find(b => b.id === modelForm.brandId);
      if (editingModel) {
        await updateDoc(doc(db, "models", editingModel.id), {
          name: modelForm.name,
          searchName: modelForm.name.toLowerCase(),
          brandId: modelForm.brandId,
          brandName: selectedBrand?.name,
          updatedAt: serverTimestamp()
        });
      } else {
        const slug = slugify(`${selectedBrand.name}-${modelForm.name}`);
        await setDoc(doc(db, "models", slug), {
          name: modelForm.name,
          searchName: modelForm.name.toLowerCase(),
          brandId: modelForm.brandId,
          brandName: selectedBrand?.name,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      setIsModelModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "model_registry");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePTSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeModelId || !ptForm.name) return;

    setIsSubmitting(true);
    try {
      const model = models.find(m => m.id === activeModelId);
      if (editingPT) {
        await updateDoc(doc(db, "powertrains", editingPT.id), {
          ...ptForm,
          searchName: ptForm.name.toLowerCase(),
          updatedAt: serverTimestamp()
        });
      } else {
        const slug = slugify(`${model.brandName}-${model.name}-${ptForm.name}`);
        await setDoc(doc(db, "powertrains", slug), {
          ...ptForm,
          searchName: ptForm.name.toLowerCase(),
          modelId: activeModelId,
          modelName: model.name,
          brandId: model.brandId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      // Refresh local powertrains
      loadPowertrains(activeModelId);
      setIsPTModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "powertrain_registry");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModelDelete = async () => {
    if (!itemToDelete || itemToDelete.type !== "model") return;
    
    const { id } = itemToDelete.data;
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      
      // 1. Delete Model
      batch.delete(doc(db, "models", id));
      
      // 2. Find and Delete Powertrains
      const ptsQuery = query(collection(db, "powertrains"), where("modelId", "==", id));
      const ptsSnap = await getDocs(ptsQuery);
      
      for (const p of ptsSnap.docs) {
        batch.delete(p.ref);
        
        // 3. Find and Delete Intervals per PT
        const intervalsQuery = query(collection(db, "serviceIntervals"), where("powertrainId", "==", p.id));
        const intervalsSnap = await getDocs(intervalsQuery);
        intervalsSnap.forEach(i => batch.delete(i.ref));
      }

      await batch.commit();
      setItemToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "model_registry");
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePTDelete = async () => {
    if (!itemToDelete || itemToDelete.type !== "powertrain") return;
    
    const { id, modelId } = itemToDelete.data;
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      
      // 1. Delete Powertrain
      batch.delete(doc(db, "powertrains", id));
      
      // 2. Find and Delete Intervals
      const intervalsQuery = query(collection(db, "serviceIntervals"), where("powertrainId", "==", id));
      const intervalsSnap = await getDocs(intervalsQuery);
      intervalsSnap.forEach(i => batch.delete(i.ref));

      await batch.commit();
      loadPowertrains(modelId);
      setItemToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "powertrain_registry");
    } finally {
      setIsDeleting(false);
    }
  };

  const loadPowertrains = (modelId: string) => {
    setExpandedModel(expandedModel === modelId ? null : modelId);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tighter uppercase">Vehicle Models</h2>
          <p className="text-slate-400 text-[10px] md:text-xs font-medium uppercase tracking-widest whitespace-nowrap">Manage variants and specifications</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2 w-full md:w-auto">
            <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 bg-white text-slate-600 text-[11px] md:text-sm font-bold uppercase tracking-widest rounded-xl transition-colors hover:bg-slate-50">
              CSV
            </button>
            <button 
              onClick={() => openModelModal()}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-[11px] md:text-sm font-bold uppercase tracking-widest rounded-xl shadow-lg hover:bg-slate-800 transition-colors"
            >
              <Plus size={16} /> Add Model
            </button>
          </div>
        )}
      </header>

      <div className="tech-card divide-y divide-slate-100">
        <div className="hidden md:grid grid-cols-12 p-3 bg-slate-50 tech-table-header ring-1 ring-slate-100 italic">
           <div className="col-span-3">Manufacturer</div>
           <div className="col-span-4">Model</div>
           <div className="col-span-3">Variants</div>
           <div className="col-span-2 text-right">Actions</div>
        </div>

        {models.map((model) => (
          <div key={model.id} className="tech-container">
            <div 
              onClick={() => loadPowertrains(model.id)}
              className="flex flex-col md:grid md:grid-cols-12 p-4 hover:bg-slate-50/80 transition-colors text-sm items-start md:items-center cursor-pointer group gap-2 md:gap-0"
            >
              <div className="md:col-span-3 font-mono text-slate-400 uppercase text-[9px] md:text-[10px] tracking-widest">{model.brandName}</div>
              <div className="md:col-span-4 font-bold flex items-center gap-2 text-slate-700 w-full">
                {expandedModel === model.id ? <ChevronDown size={14} className="text-blue-500 shrink-0" /> : <ChevronRight size={14} className="text-slate-300 shrink-0" />}
                <span className="truncate">{model.name}</span>
              </div>
              <div className="md:col-span-3">
                <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[9px] md:text-[10px] font-bold rounded uppercase">
                  {powertrains[model.id]?.length || "0"} Powertrains
                </span>
              </div>
              <div className="md:col-span-2 text-right w-full md:w-auto mt-2 md:mt-0 flex justify-end">
                {isAdmin ? (
                  <div className="flex justify-end gap-3 md:opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => { e.stopPropagation(); openModelModal(model); }}
                      className="p-1.5 md:p-2 text-slate-400 hover:text-slate-600 transition-colors bg-slate-50 md:bg-transparent rounded"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setItemToDelete({ type: "model", data: model }); }}
                      className="p-1.5 md:p-2 text-slate-400 hover:text-red-500 transition-colors bg-slate-50 md:bg-transparent rounded"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ) : (
                  <span className="text-[9px] md:text-[10px] text-slate-400 uppercase font-bold tracking-widest md:opacity-0 group-hover:opacity-100 transition-opacity">Read Only</span>
                )}
              </div>
            </div>

            <AnimatePresence>
              {expandedModel === model.id && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden bg-slate-50/50 border-l-4 border-blue-500"
                >
                  <div className="p-6 space-y-6">
                    <div className="flex justify-between items-center">
                      <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Powertrain Variants</h4>
                      {isAdmin && (
                        <button 
                          onClick={() => openPTModal(model.id)}
                          className="text-[10px] font-bold uppercase tracking-widest text-blue-600 flex items-center gap-1 hover:underline"
                        >
                          <Plus size={12} /> Add Powertrain
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {powertrains[model.id]?.map((pt) => (
                        <div key={pt.id} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm hover:border-blue-300 transition-all group/pt relative">
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-xs font-bold uppercase text-slate-700">{pt.name}</span>
                            {isAdmin && (
                              <div className="flex gap-1 opacity-0 group-hover/pt:opacity-100">
                                 <button 
                                   onClick={() => openPTModal(model.id, pt)}
                                   className="p-1 text-slate-400 hover:text-blue-500"
                                 >
                                   <Edit2 size={10} />
                                 </button>
                                 <button 
                                   onClick={() => setItemToDelete({ type: "powertrain", data: pt })}
                                   className="p-1 text-slate-400 hover:text-red-500"
                                 >
                                   <Trash2 size={10} />
                                 </button>
                              </div>
                            )}
                          </div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-4">{pt.transmission} • {pt.engine}</div>
                          <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                             <div className="text-[10px] font-mono text-slate-400">{pt.fuelType}</div>
                            <button 
                              onClick={() => setSelectedPowertrain(pt)}
                              className="text-[10px] font-bold uppercase text-blue-600 flex items-center gap-1 hover:text-blue-500 transition-colors"
                            >
                              <Calendar size={10} /> View Service Schedule
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {itemToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setItemToDelete(null)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 bg-red-50 border-b border-red-100 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                  <Trash2 size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-red-900 uppercase tracking-tighter">Delete Record</h3>
                  <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest">This action cannot be undone</p>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-sm text-slate-600 mb-2">
                    Purging <span className="font-bold text-slate-900">{itemToDelete.data.name}</span>.
                  </p>
                  <ul className="space-y-2">
                    {itemToDelete.type === "model" ? (
                      <>
                        <li className="flex items-center gap-2 text-[11px] text-slate-500 font-mono italic">
                          <X size={10} className="text-red-400" /> Related powertrain data
                        </li>
                        <li className="flex items-center gap-2 text-[11px] text-slate-500 font-mono italic">
                          <X size={10} className="text-red-400" /> Maintenance schedules
                        </li>
                      </>
                    ) : (
                      <li className="flex items-center gap-2 text-[11px] text-slate-500 font-mono italic">
                        <X size={10} className="text-red-400" /> Service schedule data
                      </li>
                    )}
                  </ul>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setItemToDelete(null)}
                    className="flex-1 py-3 text-slate-500 text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-slate-100 transition-colors"
                  >
                    Abort
                  </button>
                  <button 
                    onClick={itemToDelete.type === "model" ? handleModelDelete : handlePTDelete}
                    disabled={isDeleting}
                    className="flex-1 py-3 bg-red-600 text-white text-xs font-bold uppercase tracking-widest rounded-xl shadow-lg shadow-red-200 hover:bg-red-500 transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? "Purging..." : "Confirm Delete"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Model Modal */}
      <AnimatePresence>
        {isModelModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsModelModalOpen(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
               <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="font-bold uppercase tracking-tight">{editingModel ? "Edit Model" : "Add New Model"}</h3>
                  <button onClick={() => setIsModelModalOpen(false)}><X size={20} className="text-slate-400" /></button>
               </div>
               <form onSubmit={handleModelSubmit} className="p-6 space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500">Manufacturer</label>
                    <select 
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500"
                      value={modelForm.brandId}
                      onChange={(e) => setModelForm({...modelForm, brandId: e.target.value})}
                    >
                      {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500">Model Name</label>
                    <input 
                      type="text" required
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 uppercase font-bold"
                      value={modelForm.name}
                      onChange={(e) => setModelForm({...modelForm, name: e.target.value})}
                    />
                  </div>
                  <div className="pt-4 flex gap-3">
                    <button type="button" onClick={() => setIsModelModalOpen(false)} className="flex-1 py-3 text-xs font-bold uppercase text-slate-500 rounded-xl hover:bg-slate-100">Cancel</button>
                    <button type="submit" disabled={isSubmitting} className="flex-1 py-3 bg-slate-900 text-white text-xs font-bold uppercase rounded-xl disabled:opacity-50">
                      {isSubmitting ? "Saving..." : "Add Model"}
                    </button>
                  </div>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Powertrain Modal */}
      <AnimatePresence>
        {isPTModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsPTModalOpen(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
               <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="font-bold uppercase tracking-tight">{editingPT ? "Edit Powertrain" : "Add Powertrain"}</h3>
                  <button onClick={() => setIsPTModalOpen(false)}><X size={20} className="text-slate-400" /></button>
               </div>
               <form onSubmit={handlePTSubmit} className="p-6 space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500">Package Name</label>
                    <input 
                      type="text" required
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 uppercase font-bold"
                      value={ptForm.name}
                      onChange={(e) => setPtForm({...ptForm, name: e.target.value})}
                      placeholder="e.g. 1.0L TSI MANUAL"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-slate-500">Fuel Type</label>
                      <select 
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500"
                        value={ptForm.fuelType}
                        onChange={(e) => setPtForm({...ptForm, fuelType: e.target.value})}
                      >
                        <option>Petrol</option>
                        <option>Diesel</option>
                        <option>Electric</option>
                        <option>Hybrid</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-slate-500">Transmission</label>
                      <select 
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500"
                        value={ptForm.transmission}
                        onChange={(e) => setPtForm({...ptForm, transmission: e.target.value})}
                      >
                        <option>Manual</option>
                        <option>Automatic (TC)</option>
                        <option>Automatic (DSG)</option>
                        <option>Automatic (CVT)</option>
                        <option>Automatic (AMT)</option>
                        <option>Single Speed</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-500">Engine Config</label>
                    <input 
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 uppercase font-bold"
                      value={ptForm.engine}
                      onChange={(e) => setPtForm({...ptForm, engine: e.target.value})}
                      placeholder="e.g. 999cc 3-CYL TURBO"
                    />
                  </div>
                  <div className="pt-4 flex gap-3">
                    <button type="button" onClick={() => setIsPTModalOpen(false)} className="flex-1 py-3 text-xs font-bold uppercase text-slate-500 rounded-xl hover:bg-slate-100">Cancel</button>
                    <button type="submit" disabled={isSubmitting} className="flex-1 py-3 bg-blue-600 text-white text-xs font-bold uppercase rounded-xl disabled:opacity-50">
                      {isSubmitting ? "Saving..." : "Save Powertrain"}
                    </button>
                  </div>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedPowertrain && (
          <ServiceScheduleManager 
            powertrainId={selectedPowertrain.id}
            powertrainName={`${selectedPowertrain.modelName} ${selectedPowertrain.name}`}
            onClose={() => setSelectedPowertrain(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
