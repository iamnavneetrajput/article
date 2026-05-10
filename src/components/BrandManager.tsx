import React, { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, setDoc, serverTimestamp, updateDoc, writeBatch, getDocs, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { handleFirestoreError, OperationType } from "../lib/errorHandling";
import { motion, AnimatePresence } from "motion/react";
import { Trash2, Edit2, Plus, Search, X, Check } from "lucide-react";
import { slugify } from "../lib/utils";

export default function BrandManager() {
  const { isAdmin } = useAuth();
  const [brands, setBrands] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingBrand, setEditingBrand] = useState<any | null>(null);
  
  const [brandToDelete, setBrandToDelete] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: "",
    country: ""
  });

  useEffect(() => {
    const q = query(collection(db, "brands"), orderBy("name"));
    return onSnapshot(q, (snapshot) => {
      setBrands(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "brands");
    });
  }, []);

  const openModal = (brand?: any) => {
    if (brand) {
      setEditingBrand(brand);
      setFormData({
        name: brand.name,
        country: brand.country || ""
      });
    } else {
      setEditingBrand(null);
      setFormData({
        name: "",
        country: ""
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingBrand(null);
    setFormData({ name: "", country: "" });
  };

  const openDeleteModal = (brand: any) => {
    setBrandToDelete(brand);
  };

  const closeDeleteModal = () => {
    setBrandToDelete(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    
    setIsSubmitting(true);
    try {
      if (editingBrand) {
        const brandRef = doc(db, "brands", editingBrand.id);
        await updateDoc(brandRef, {
          name: formData.name,
          searchName: formData.name.toLowerCase(),
          country: formData.country,
          lastUpdated: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        const slug = slugify(formData.name);
        const brandRef = doc(db, "brands", slug);
        await setDoc(brandRef, {
          name: formData.name,
          searchName: formData.name.toLowerCase(),
          country: formData.country,
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      closeModal();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "brand_registry");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredBrands = brands.filter(b => 
    b.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = async () => {
    if (!brandToDelete) return;
    
    const { id, name } = brandToDelete;
    setIsDeleting(true);
    
    try {
      const batch = writeBatch(db);
      
      // 1. Delete Brand
      batch.delete(doc(db, "brands", id));
      
      // 2. Find and Delete Models
      const modelsQuery = query(collection(db, "models"), where("brandId", "==", id));
      const modelsSnap = await getDocs(modelsQuery);
      modelsSnap.forEach(m => batch.delete(m.ref));
      
      // 3. Find and Delete Powertrains
      const ptsQuery = query(collection(db, "powertrains"), where("brandId", "==", id));
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

      await batch.commit();
      closeDeleteModal();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "brand_registry");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tighter uppercase">Brands</h2>
          <p className="text-slate-400 text-[10px] md:text-xs font-medium uppercase tracking-widest whitespace-nowrap">Manage automotive manufacturers</p>
        </div>
        {isAdmin && (
          <button 
            onClick={() => openModal()}
            className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-[11px] md:text-sm font-bold uppercase tracking-widest rounded-xl shadow-lg hover:bg-blue-500 transition-colors"
          >
            <Plus size={16} /> Add Brand
          </button>
        )}
      </header>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input 
          type="text" 
          placeholder="Filter brands..."
          className="w-full bg-white border border-slate-200 rounded-xl p-4 pl-12 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="tech-card divide-y divide-slate-100 italic">
        <div className="hidden md:grid grid-cols-12 bg-slate-50 tech-table-header px-4 py-3">
          <div className="col-span-1">#</div>
          <div className="col-span-4">Manufacturer</div>
          <div className="col-span-3">Region</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2 text-right">Action</div>
        </div>
        
        {filteredBrands.length > 0 ? filteredBrands.map((brand, i) => (
          <div key={brand.id} className="flex flex-col md:grid md:grid-cols-12 px-4 py-4 hover:bg-slate-50 transition-colors group gap-1 md:gap-0">
            <div className="md:col-span-1 text-[10px] font-mono text-slate-400 flex items-center md:block">
              <span className="md:hidden mr-2">Brand #</span>{i + 1}
            </div>
            <div className="md:col-span-4 font-bold text-slate-900 flex items-center">
              {brand.name}
            </div>
            <div className="md:col-span-3 text-[11px] text-slate-500 flex items-center">
              <span className="md:hidden mr-2 uppercase font-bold text-slate-300">Region:</span>
              {brand.country || "Global"}
            </div>
            <div className="md:col-span-2 text-[10px] font-mono text-blue-600 font-bold flex items-center">
               <span className="md:hidden mr-2 uppercase text-slate-300">Status:</span>
               Active
            </div>
            <div className="md:col-span-2 text-right flex justify-end items-center">
              {isAdmin ? (
                <div className="flex justify-end gap-3 md:opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => openModal(brand)}
                    className="p-2 text-slate-400 hover:text-slate-600 bg-slate-50 md:bg-transparent rounded-lg"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button 
                    onClick={() => openDeleteModal(brand)}
                    className="p-2 text-slate-400 hover:text-red-500 bg-slate-50 md:bg-transparent rounded-lg"
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
          <div className="p-20 text-center">
            <p className="tech-header text-slate-400 italic font-mono uppercase text-[11px]">No brands found in registry</p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {brandToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={closeDeleteModal}
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
                  <h3 className="text-lg font-bold text-red-900 uppercase tracking-tighter">Delete Brand</h3>
                  <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest">This action cannot be undone</p>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-sm text-slate-600 mb-2">You are about to delete <span className="font-bold text-slate-900">{brandToDelete.name}</span>. This action is irreversible.</p>
                  <ul className="space-y-2">
                    {[
                      "Associated vehicle models",
                      "Powertrain configurations",
                      "Maintenance schedules and intervals",
                      "Search history and links"
                    ].map((item, i) => (
                      <li key={i} className="flex items-center gap-2 text-[11px] text-slate-500 font-mono italic">
                        <X size={10} className="text-red-400" /> {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 text-amber-700 text-[10px] leading-relaxed uppercase font-bold tracking-tight">
                  Warning: Deleting this manufacturer will remove all linked data from the database.
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={closeDeleteModal}
                    className="flex-1 py-3 text-slate-500 text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex-1 py-3 bg-red-600 text-white text-xs font-bold uppercase tracking-widest rounded-xl shadow-lg shadow-red-200 hover:bg-red-500 transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? "Purging..." : "Confirm Deletion"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={closeModal}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 uppercase tracking-tighter">
                    {editingBrand ? "Edit Brand" : "Add Brand"}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Brand Information</p>
                </div>
                <button onClick={closeModal} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                  <X size={20} className="text-slate-500" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Name</label>
                  <input 
                    type="text" 
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase font-bold"
                    placeholder="e.g. Toyota"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Country / Region</label>
                  <input 
                    type="text" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase font-bold"
                    placeholder="e.g. Japan"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={closeModal}
                    className="flex-1 py-3 text-slate-500 text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    disabled={isSubmitting}
                    className="flex-1 py-3 bg-blue-600 text-white text-xs font-bold uppercase tracking-widest rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-500 transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? "Saving..." : (editingBrand ? "Save Changes" : "Add Brand")}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
