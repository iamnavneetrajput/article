import React, { useState, useEffect } from "react";
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  doc, 
  setDoc, 
  serverTimestamp, 
  updateDoc, 
  writeBatch, 
  getDocs, 
  where 
} from "firebase/firestore";
import { useSearchParams } from "react-router-dom";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { handleFirestoreError, OperationType } from "../lib/errorHandling";
import { motion, AnimatePresence } from "motion/react";
import { 
  Trash2, 
  Edit2, 
  Plus, 
  Search, 
  X, 
  Check, 
  ChevronRight, 
  ChevronDown, 
  Calendar, 
  ArrowLeft,
  Car,
  Layers,
  Settings,
  Database
} from "lucide-react";
import { slugify, cn } from "../lib/utils";
import ServiceScheduleManager from "./ServiceScheduleManager";

export default function BrandManager() {
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Real-time Firestore state
  const [brands, setBrands] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [powertrains, setPowertrains] = useState<Record<string, any[]>>({});

  // Dynamic search state (shares same search input for brands or models)
  const [searchTerm, setSearchTerm] = useState("");

  // Navigation states bound to URL Search Params for deep linking
  const selectedBrandId = searchParams.get("brandId");
  const expandedModelId = searchParams.get("modelId");

  // Modals visibility state
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [isPTModalOpen, setIsPTModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Focus edits
  const [editingBrand, setEditingBrand] = useState<any | null>(null);
  const [editingModel, setEditingModel] = useState<any | null>(null);
  const [editingPT, setEditingPT] = useState<any | null>(null);

  // Parent IDs for nested adds
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [selectedPowertrain, setSelectedPowertrain] = useState<any | null>(null);

  // Bulk deletion
  const [itemToDelete, setItemToDelete] = useState<{ type: "brand" | "model" | "powertrain"; data: any } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form states
  const [brandForm, setBrandForm] = useState({
    name: "",
    country: ""
  });

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

  // Query database in real-time
  useEffect(() => {
    const bq = query(collection(db, "brands"), orderBy("name"));
    const mq = query(collection(db, "models"), orderBy("brandName"), orderBy("name"));
    const pq = query(collection(db, "powertrains"), orderBy("modelId"));

    const unsubBrands = onSnapshot(bq, (snapshot) => {
      setBrands(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "brands");
    });

    const unsubModels = onSnapshot(mq, (snapshot) => {
      setModels(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "models");
    });

    const unsubPowertrains = onSnapshot(pq, (snapshot) => {
      const ptsByModel: Record<string, any[]> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data() as any;
        const pt = { id: doc.id, ...data };
        const mId = data.modelId || data.modelSlug;
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
      unsubBrands();
      unsubModels();
      unsubPowertrains();
    };
  }, []);

  // Sync / Reset Search term when switching views
  useEffect(() => {
    setSearchTerm("");
  }, [selectedBrandId]);

  // URL Navigation triggers
  const selectBrand = (id: string | null) => {
    const params: Record<string, string> = {};
    if (id) {
      params.brandId = id;
    }
    setSearchParams(params);
  };

  const toggleModelExpansion = (modelId: string) => {
    const newExpandedId = expandedModelId === modelId ? "" : modelId;
    const params: Record<string, string> = {};
    if (selectedBrandId) {
      params.brandId = selectedBrandId;
    }
    if (newExpandedId) {
      params.modelId = newExpandedId;
    }
    setSearchParams(params);
  };

  // ----------------------------------------------------
  // BRAND ACTIONS
  // ----------------------------------------------------
  const openBrandModal = (brand?: any) => {
    if (brand) {
      setEditingBrand(brand);
      setBrandForm({
        name: brand.name,
        country: brand.country || ""
      });
    } else {
      setEditingBrand(null);
      setBrandForm({
        name: "",
        country: ""
      });
    }
    setIsBrandModalOpen(true);
  };

  const handleBrandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandForm.name.trim()) return;

    setIsSubmitting(true);
    try {
      if (editingBrand) {
        await updateDoc(doc(db, "brands", editingBrand.id), {
          name: brandForm.name,
          searchName: brandForm.name.toLowerCase(),
          country: brandForm.country,
          lastUpdated: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        const slug = slugify(brandForm.name);
        await setDoc(doc(db, "brands", slug), {
          name: brandForm.name,
          searchName: brandForm.name.toLowerCase(),
          country: brandForm.country,
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      setIsBrandModalOpen(false);
      setEditingBrand(null);
      setBrandForm({ name: "", country: "" });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "brand_registry");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ----------------------------------------------------
  // MODEL ACTIONS
  // ----------------------------------------------------
  const openModelModal = (model?: any) => {
    if (model && model.id) {
      setEditingModel(model);
      setModelForm({ name: model.name, brandId: model.brandId });
    } else {
      setEditingModel(null);
      setModelForm({ name: "", brandId: model?.brandId || selectedBrandId || brands[0]?.id || "" });
    }
    setIsModelModalOpen(true);
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
      setEditingModel(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "model_registry");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ----------------------------------------------------
  // POWERTRAIN ACTIONS
  // ----------------------------------------------------
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
      setIsPTModalOpen(false);
      setEditingPT(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "powertrain_registry");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ----------------------------------------------------
  // UNIFIED DELETION AGENT
  // ----------------------------------------------------
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);

    try {
      const { type, data } = itemToDelete;
      const batch = writeBatch(db);

      if (type === "brand") {
        // 1. Delete Brand
        batch.delete(doc(db, "brands", data.id));
        
        // 2. Find and Delete Models
        const modelsQuery = query(collection(db, "models"), where("brandId", "==", data.id));
        const modelsSnap = await getDocs(modelsQuery);
        modelsSnap.forEach(m => batch.delete(m.ref));
        
        // 3. Find and Delete Powertrains
        const ptsQuery = query(collection(db, "powertrains"), where("brandId", "==", data.id));
        const ptsSnap = await getDocs(ptsQuery);
        
        const ptIds: string[] = [];
        ptsSnap.forEach(p => {
          batch.delete(p.ref);
          ptIds.push(p.id);
        });
        
        // 4. Find and Delete Service Intervals
        for (const ptId of ptIds) {
          const intervalsQuery = query(collection(db, "serviceIntervals"), where("powertrainId", "==", ptId));
          const intervalsSnap = await getDocs(intervalsQuery);
          intervalsSnap.forEach(i => batch.delete(i.ref));
        }

        // Reset navigation if actively viewing the deleted brand
        if (selectedBrandId === data.id) {
          selectBrand(null);
        }
      } 
      else if (type === "model") {
        // 1. Delete Model
        batch.delete(doc(db, "models", data.id));
        
        // 2. Find and Delete Powertrains
        const ptsQuery = query(collection(db, "powertrains"), where("modelId", "==", data.id));
        const ptsSnap = await getDocs(ptsQuery);
        
        for (const p of ptsSnap.docs) {
          batch.delete(p.ref);
          
          // 3. Find and Delete Intervals per PT
          const intervalsQuery = query(collection(db, "serviceIntervals"), where("powertrainId", "==", p.id));
          const intervalsSnap = await getDocs(intervalsQuery);
          intervalsSnap.forEach(i => batch.delete(i.ref));
        }

        // Reset URL state if expanded
        if (expandedModelId === data.id) {
          toggleModelExpansion(data.id);
        }
      } 
      else if (type === "powertrain") {
        // 1. Delete Powertrain
        batch.delete(doc(db, "powertrains", data.id));
        
        // 2. Find and Delete Intervals
        const intervalsQuery = query(collection(db, "serviceIntervals"), where("powertrainId", "==", data.id));
        const intervalsSnap = await getDocs(intervalsQuery);
        intervalsSnap.forEach(i => batch.delete(i.ref));
      }

      await batch.commit();
      setItemToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${itemToDelete.type}_registry`);
    } finally {
      setIsDeleting(false);
    }
  };

  // ----------------------------------------------------
  // DATA FILTERING
  // ----------------------------------------------------
  const filteredBrands = brands.filter(b => 
    b.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredModels = models.filter(m => 
    m.brandId === selectedBrandId &&
    m.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const currentBrandDetails = brands.find(b => b.id === selectedBrandId);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 animate-fade-in"
    >
      {/* Dynamic Drilldown Navigation header */}
      <AnimatePresence mode="wait">
        {selectedBrandId ? (
          <motion.div 
            key="model-view"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Breadcrumb row */}
            <div className="flex items-center gap-2">
              <button 
                onClick={() => selectBrand(null)}
                className="p-1.5 px-3 bg-slate-900/5 hover:bg-slate-900/10 text-slate-700 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95"
              >
                <ArrowLeft size={12} strokeWidth={2.5} /> All Manufacturers
              </button>
              <ChevronRight size={12} className="text-slate-300" />
              <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest">{currentBrandDetails?.name}</span>
            </div>

            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 text-[9px] font-bold rounded uppercase tracking-wider">{currentBrandDetails?.country || "Global"}</span>
                  <span className="text-[9px] font-mono text-slate-400">ID: {selectedBrandId}</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 uppercase">{currentBrandDetails?.name} Models</h2>
                <p className="text-slate-500 text-[10px] md:text-xs font-medium uppercase tracking-wider">Configure engines, specs, and intervals for {currentBrandDetails?.name}</p>
              </div>
              {isAdmin && (
                <div className="flex gap-2 w-full md:w-auto">
                  <button 
                    onClick={() => openModelModal({ brandId: selectedBrandId })}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-[11px] md:text-sm font-bold uppercase tracking-widest rounded-xl shadow-lg hover:bg-slate-800 transition-colors"
                  >
                    <Plus size={16} /> Add Model
                  </button>
                </div>
              )}
            </header>
          </motion.div>
        ) : (
          <motion.header 
            key="brand-view"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 uppercase">Brands & Models</h2>
              <p className="text-slate-500 text-[10px] md:text-xs font-medium uppercase tracking-widest">Select an automotive manufacturer to manage models and powertrains</p>
            </div>
            {isAdmin && (
              <button 
                onClick={() => openBrandModal()}
                className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-[11px] md:text-sm font-bold uppercase tracking-widest rounded-xl shadow-lg hover:bg-blue-500 transition-colors"
              >
                <Plus size={16} /> Add Brand
              </button>
            )}
          </motion.header>
        )}
      </AnimatePresence>

      {/* Global search-filter input */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input 
          type="text" 
          placeholder={selectedBrandId ? `Filter ${currentBrandDetails?.name || ""} models...` : "Filter brands..."}
          className="w-full bg-white border border-slate-200 rounded-xl p-4 pl-12 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button 
            onClick={() => setSearchTerm("")}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* RENDER TABLE FLOWS */}
      <AnimatePresence mode="wait">
        {!selectedBrandId ? (
          // LEVEL 1: BRANDS TABLE LISTING
          <motion.div 
            key="brands-table"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="tech-card divide-y divide-slate-100"
          >
            <div className="hidden md:grid grid-cols-12 bg-slate-50 tech-table-header px-4 py-3 border-b border-slate-100 font-mono italic text-[11px] text-slate-400">
              <div className="col-span-1">#</div>
              <div className="col-span-4">Manufacturer</div>
              <div className="col-span-2">Region</div>
              <div className="col-span-2">Models Registered</div>
              <div className="col-span-1 text-center">Status</div>
              <div className="col-span-2 text-right">Action</div>
            </div>
            
            {filteredBrands.length > 0 ? filteredBrands.map((brand, i) => (
              <div 
                key={brand.id} 
                onClick={() => selectBrand(brand.id)}
                className="flex flex-col md:grid md:grid-cols-12 px-4 py-4 hover:bg-slate-50/80 transition-all group gap-1.5 md:gap-0 cursor-pointer text-sm items-start md:items-center"
              >
                <div className="md:col-span-1 text-[10px] font-mono text-slate-400 flex items-center md:block">
                  <span className="md:hidden mr-2">Brand #</span>{i + 1}
                </div>
                <div className="md:col-span-4 font-bold text-slate-900 flex items-center gap-2">
                  <Car size={16} className="text-slate-400 group-hover:text-blue-500 transition-colors shrink-0" />
                  <span className="group-hover:text-blue-600 transition-colors uppercase tracking-tight">{brand.name}</span>
                </div>
                <div className="md:col-span-2 text-[11px] text-slate-500 flex items-center">
                  <span className="md:hidden mr-2 uppercase font-bold text-slate-300">Region:</span>
                  {brand.country || "Global"}
                </div>
                <div className="md:col-span-2 text-[11px] text-slate-500 flex items-center">
                  <span className="md:hidden mr-2 uppercase font-bold text-slate-300 text-xs">Models:</span>
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded uppercase">
                    {models.filter(m => m.brandId === brand.id).length} Models
                  </span>
                </div>
                <div className="md:col-span-1 text-[10px] font-mono text-blue-600 font-bold flex items-center md:justify-center">
                   <span className="md:hidden mr-2 uppercase text-slate-300">Status:</span>
                   Active
                </div>
                <div className="md:col-span-2 text-right flex justify-end items-center" onClick={(e) => e.stopPropagation()}>
                  {isAdmin ? (
                    <div className="flex justify-end gap-3 md:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => openBrandModal(brand)}
                        className="p-2 text-slate-400 hover:text-slate-600 bg-slate-50 md:bg-transparent rounded-lg"
                        title="Edit Manufacturer"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        onClick={() => setItemToDelete({ type: "brand", data: brand })}
                        className="p-2 text-slate-400 hover:text-red-500 bg-slate-50 md:bg-transparent rounded-lg"
                        title="Delete Manufacturer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest md:opacity-0 group-hover:opacity-100 transition-opacity">
                      Read Only
                    </span>
                  )}
                </div>
              </div>
            )) : (
              <div className="p-20 text-center bg-white rounded-xl">
                <Car size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-slate-400 italic font-mono uppercase text-[11px]">No manufacturers match criteria</p>
              </div>
            )}
          </motion.div>
        ) : (
          // LEVEL 2 & 3: EXPORTED MODELS & INTEGRATED POWERTRAINS LISTING FOR CHOSEN BRAND
          <motion.div 
            key="models-table"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="tech-card divide-y divide-slate-100"
          >
            {/* Header schema */}
            <div className="hidden md:grid grid-cols-12 p-3 bg-slate-50 tech-table-header ring-1 ring-slate-100 italic text-[11px] text-slate-400 font-mono">
               <div className="col-span-3">Manufacturer</div>
               <div className="col-span-4">Model Name</div>
               <div className="col-span-3">Powertrains Available</div>
               <div className="col-span-2 text-right">Actions</div>
            </div>

            {filteredModels.length > 0 ? filteredModels.map((model) => (
              <div key={model.id} className="tech-container border-b border-slate-100 bg-white">
                {/* Expandable Model Row Trigger */}
                <div 
                  onClick={() => toggleModelExpansion(model.id)}
                  className="flex flex-col md:grid md:grid-cols-12 p-4 hover:bg-slate-50/80 transition-colors text-sm items-start md:items-center cursor-pointer group gap-1 md:gap-0"
                >
                  <div className="md:col-span-3 font-mono text-slate-400 uppercase text-[9px] md:text-[10px] tracking-widest">{model.brandName}</div>
                  <div className="md:col-span-4 font-bold flex items-center gap-2 text-slate-700 w-full">
                    {expandedModelId === model.id ? (
                      <ChevronDown size={14} className="text-blue-500 shrink-0" />
                    ) : (
                      <ChevronRight size={14} className="text-slate-300 shrink-0 group-hover:text-blue-400 transition-colors" />
                    )}
                    <span className="truncate group-hover:text-blue-600 transition-colors uppercase">{model.name}</span>
                  </div>
                  <div className="md:col-span-3">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded uppercase">
                      {powertrains[model.id]?.length || "0"} Specifications
                    </span>
                  </div>
                  <div className="md:col-span-2 text-right w-full md:w-auto mt-2 md:mt-0 flex justify-end" onClick={(e) => e.stopPropagation()}>
                    {isAdmin ? (
                      <div className="flex justify-end gap-3 md:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => openModelModal(model)}
                          className="p-1.5 md:p-2 text-slate-400 hover:text-slate-600 transition-colors bg-slate-50 md:bg-transparent rounded"
                          title="Edit Model"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button 
                          onClick={() => setItemToDelete({ type: "model", data: model })}
                          className="p-1.5 md:p-2 text-slate-400 hover:text-red-500 transition-colors bg-slate-50 md:bg-transparent rounded"
                          title="Delete Model"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[9px] md:text-[10px] text-slate-400 uppercase font-bold tracking-widest md:opacity-0 group-hover:opacity-100 transition-opacity">Read Only</span>
                    )}
                  </div>
                </div>

                {/* LEVEL 3 PANEL (POWERTRAINS GRID REVEAL) */}
                <AnimatePresence>
                  {expandedModelId === model.id && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden bg-slate-50/50 border-l-4 border-blue-500"
                    >
                      <div className="p-6 space-y-6">
                        <div className="flex justify-between items-center bg-slate-100/40 p-3 rounded-xl border border-slate-200">
                          <div>
                            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center gap-1.5">
                              <Layers size={12} /> Specs & Powertrain configurations
                            </h4>
                            <p className="text-[9px] text-slate-400">Manage technical parameters and mechanical structures linked to {model.name}</p>
                          </div>
                          {isAdmin && (
                            <button 
                              onClick={() => openPTModal(model.id)}
                              className="text-[11px] font-bold uppercase tracking-widest text-blue-600 flex items-center gap-1 hover:text-blue-700 transition-colors py-1 px-3 bg-white border border-blue-100 rounded-lg shadow-sm"
                            >
                              <Plus size={12} /> Add Powertrain
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {powertrains[model.id]?.map((pt) => (
                            <div key={pt.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-blue-400 hover:shadow-md transition-all group/pt relative flex flex-col justify-between min-h-[140px]">
                              <div>
                                <div className="flex justify-between items-start mb-1">
                                  <span className="text-xs font-bold uppercase text-slate-800 tracking-tight">{pt.name}</span>
                                  {isAdmin && (
                                    <div className="flex gap-1.5 opacity-0 group-hover/pt:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                       <button 
                                         onClick={() => openPTModal(model.id, pt)}
                                         className="p-1 text-slate-400 hover:text-blue-500"
                                         title="Edit Specs"
                                       >
                                         <Edit2 size={11} />
                                       </button>
                                       <button 
                                         onClick={() => setItemToDelete({ type: "powertrain", data: pt })}
                                         className="p-1 text-slate-400 hover:text-red-500"
                                         title="Delete Specs"
                                       >
                                         <Trash2 size={11} />
                                       </button>
                                    </div>
                                  )}
                                </div>
                                <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wide mb-3">{pt.transmission} • {pt.engine}</div>
                              </div>
                              <div className="flex justify-between items-center pt-3 border-t border-slate-100 mt-2">
                                <div className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">{pt.fuelType}</div>
                                <button 
                                  onClick={() => setSelectedPowertrain(pt)}
                                  className="text-[10px] font-bold uppercase text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1"
                                >
                                  <Calendar size={11} /> View Schedule
                                </button>
                              </div>
                            </div>
                          ))}
                          {(!powertrains[model.id] || powertrains[model.id].length === 0) && (
                            <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-200 bg-white rounded-2xl">
                              <Database className="mx-auto text-slate-200 mb-2" size={32} />
                              <p className="text-slate-400 text-[11px] uppercase font-bold font-mono tracking-widest italic">Zero specs stored for {model.name}</p>
                              {isAdmin && (
                                <button 
                                  onClick={() => openPTModal(model.id)}
                                  className="text-[10px] font-bold uppercase text-blue-600 hover:underline mt-2 flex items-center gap-1 mx-auto"
                                >
                                  <Plus size={10} /> Register first powertrain
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )) : (
              <div className="p-20 text-center bg-white rounded-xl">
                <Database className="mx-auto text-slate-300 mb-2" size={36} />
                <p className="text-slate-400 italic font-mono uppercase text-[11px]">No vehicle models registered for this brand</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================================================== */}
      {/* UNIFIED DELETION WARNING MODAL SCREEN */}
      {/* ==================================================== */}
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
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                  <Trash2 size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-red-900 uppercase tracking-tighter">Purge Data Record</h3>
                  <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest">Permanent database synchronization action</p>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-sm text-slate-600 mb-2">
                    Confirm deleting <span className="font-bold text-slate-900">{itemToDelete.data.name}</span> ({itemToDelete.type.toUpperCase()}).
                  </p>
                  <ul className="space-y-1.5">
                    {itemToDelete.type === "brand" && (
                      <>
                        <li className="flex items-center gap-2 text-[10px] text-slate-500 font-mono italic">
                          <X size={10} className="text-red-400 shrink-0" /> Removes the manufacturer profile
                        </li>
                        <li className="flex items-center gap-2 text-[10px] text-slate-500 font-mono italic">
                          <X size={10} className="text-red-400 shrink-0" /> Cascade deletes all associated vehicle models
                        </li>
                        <li className="flex items-center gap-2 text-[10px] text-slate-500 font-mono italic">
                          <X size={10} className="text-red-400 shrink-0" /> Erases schedules and powertrain specifications
                        </li>
                      </>
                    )}
                    {itemToDelete.type === "model" && (
                      <>
                        <li className="flex items-center gap-2 text-[10px] text-slate-500 font-mono italic">
                          <X size={10} className="text-red-400 shrink-0" /> Removes the model and its search indexing
                        </li>
                        <li className="flex items-center gap-2 text-[10px] text-slate-500 font-mono italic">
                          <X size={10} className="text-red-400 shrink-0" /> Deletes nested powertrains and pricing
                        </li>
                      </>
                    )}
                    {itemToDelete.type === "powertrain" && (
                      <li className="flex items-center gap-2 text-[10px] text-slate-500 font-mono italic">
                        <X size={10} className="text-red-400 shrink-0" /> Erases variant technical specs and labor/parts cost schedules
                      </li>
                    )}
                  </ul>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setItemToDelete(null)}
                    className="flex-1 py-3 text-slate-500 text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleConfirmDelete}
                    disabled={isDeleting}
                    className="flex-1 py-3 bg-red-600 text-white text-xs font-bold uppercase tracking-widest rounded-xl shadow-lg shadow-red-200 hover:bg-red-500 transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? "Purging..." : "Confirm Purge"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================================================== */}
      {/* BRAND MODAL INFO SHEET */}
      {/* ==================================================== */}
      <AnimatePresence>
        {isBrandModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsBrandModalOpen(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="relative w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 uppercase tracking-tighter">
                    {editingBrand ? "Modify Manufacturer" : "Register Manufacturer"}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Brand profile metadata</p>
                </div>
                <button onClick={() => setIsBrandModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                  <X size={20} className="text-slate-500" />
                </button>
              </div>

              <form onSubmit={handleBrandSubmit} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Name</label>
                  <input 
                    type="text" required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase font-bold"
                    placeholder="e.g. Toyota"
                    value={brandForm.name}
                    onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Country / Region</label>
                  <input 
                    type="text" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase font-bold"
                    placeholder="e.g. Japan"
                    value={brandForm.country}
                    onChange={(e) => setBrandForm({ ...brandForm, country: e.target.value })}
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setIsBrandModalOpen(false)} className="flex-1 py-3 text-slate-500 text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-slate-100 transition-colors">Cancel</button>
                  <button disabled={isSubmitting} className="flex-1 py-3 bg-blue-600 text-white text-xs font-bold uppercase tracking-widest rounded-xl shadow-lg hover:bg-blue-500 disabled:opacity-50">
                    {isSubmitting ? "Saving..." : (editingBrand ? "Modify" : "Register")}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================================================== */}
      {/* MODEL REGISTRY MODAL INFORMATION SHEET */}
      {/* ==================================================== */}
      <AnimatePresence>
        {isModelModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsModelModalOpen(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="relative w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
               <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 uppercase tracking-tighter">{editingModel ? "Edit Model" : "Register New Model"}</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Model profile specifications</p>
                  </div>
                  <button onClick={() => setIsModelModalOpen(false)}><X size={20} className="text-slate-400" /></button>
               </div>
               <form onSubmit={handleModelSubmit} className="p-6 space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">Manufacturer / Brand</label>
                    <select 
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 font-bold"
                      value={modelForm.brandId}
                      onChange={(e) => setModelForm({...modelForm, brandId: e.target.value})}
                    >
                      {brands.map(b => <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">Model Name</label>
                    <input 
                      type="text" required
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 uppercase font-bold"
                      value={modelForm.name}
                      onChange={(e) => setModelForm({...modelForm, name: e.target.value})}
                      placeholder="e.g. Amaze"
                    />
                  </div>
                  <div className="pt-4 flex gap-3">
                    <button type="button" onClick={() => setIsModelModalOpen(false)} className="flex-1 py-3 text-xs font-bold uppercase tracking-widest text-slate-500 rounded-xl hover:bg-slate-100">Cancel</button>
                    <button type="submit" disabled={isSubmitting} className="flex-1 py-3 bg-slate-900 text-white text-xs font-bold uppercase tracking-widest rounded-xl disabled:opacity-50">
                      {isSubmitting ? "Saving..." : (editingModel ? "Save Changes" : "Register Model")}
                    </button>
                  </div>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================================================== */}
      {/* POWERTRAIN SPECIFICATION MODAL SHEET */}
      {/* ==================================================== */}
      <AnimatePresence>
        {isPTModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsPTModalOpen(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="relative w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
               <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 uppercase tracking-tighter">{editingPT ? "Edit Specifications" : "Register Powertrain"}</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Engine & Transmission specs parameters</p>
                  </div>
                  <button onClick={() => setIsPTModalOpen(false)}><X size={20} className="text-slate-400" /></button>
               </div>
               <form onSubmit={handlePTSubmit} className="p-6 space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">Package Name (Identifer)</label>
                    <input 
                      type="text" required
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 uppercase font-bold"
                      value={ptForm.name}
                      onChange={(e) => setPtForm({...ptForm, name: e.target.value})}
                      placeholder="e.g. 1.2L PETROL MANUAL"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">Fuel Engine Group</label>
                      <select 
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 font-bold"
                        value={ptForm.fuelType}
                        onChange={(e) => setPtForm({...ptForm, fuelType: e.target.value})}
                      >
                        <option>Petrol</option>
                        <option>Diesel</option>
                        <option>Electric</option>
                        <option>Hybrid</option>
                        <option>CNG</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">Transmission SPEC</label>
                      <select 
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 font-bold"
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
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">Engine displacement, cylinders & layout</label>
                    <input 
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 uppercase font-bold"
                      value={ptForm.engine}
                      onChange={(e) => setPtForm({...ptForm, engine: e.target.value})}
                      placeholder="e.g. 1199cc 4-CYL DOHC"
                    />
                  </div>
                  <div className="pt-4 flex gap-3">
                    <button type="button" onClick={() => setIsPTModalOpen(false)} className="flex-1 py-3 text-xs font-bold uppercase tracking-widest text-slate-500 rounded-xl hover:bg-slate-100">Cancel</button>
                    <button type="submit" disabled={isSubmitting} className="flex-1 py-3 bg-blue-600 text-white text-xs font-bold uppercase tracking-widest rounded-xl disabled:opacity-50">
                      {isSubmitting ? "Saving..." : "Save Specs"}
                    </button>
                  </div>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================================================== */}
      {/* REAL-TIME MAINTENANCE INTERVALS MODAL SYSTEM OVERLAY */}
      {/* ==================================================== */}
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
