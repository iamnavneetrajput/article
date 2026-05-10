import { 
  collection, 
  doc, 
  getDocs, 
  query, 
  where, 
  writeBatch, 
  serverTimestamp,
  getDoc,
  addDoc
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { slugify } from "./utils";
import { handleFirestoreError, OperationType } from "./errorHandling";

export type ImportMode = "replace" | "merge" | "skip";

export async function processJsonImport(data: any[], mode: ImportMode = "merge") {
  const batch = writeBatch(db);
  const results = {
    brands: 0,
    models: 0,
    powertrains: 0,
    intervals: 0,
    errors: [] as string[]
  };

  try {
    for (const item of data) {
      try {
        if (!item.brand) continue;

        // 1. Handle Brand
        const brandSlug = slugify(item.brand);
        const brandRef = doc(db, "brands", brandSlug);
        const brandSnap = await getDoc(brandRef);

        if (!brandSnap.exists()) {
          batch.set(brandRef, {
            name: item.brand,
            searchName: item.brand.toLowerCase(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          results.brands++;
        }

        if (!item.model) continue;

        // 2. Handle Model
        const modelSlug = slugify(`${item.brand}-${item.model}`);
        const modelRef = doc(db, "models", modelSlug);
        const modelSnap = await getDoc(modelRef);

        if (!modelSnap.exists()) {
          batch.set(modelRef, {
            name: item.model,
            searchName: item.model.toLowerCase(),
            brandId: brandSlug,
            brandName: item.brand,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          results.models++;
        }

        const ptData = typeof item.powertrain === 'object' ? item.powertrain : null;
        const ptName = ptData ? (ptData.name || `${ptData.engine} ${ptData.transmission}`) : item.powertrain;

        if (!ptName) continue;

        // 3. Handle Powertrain
        const powertrainSlug = slugify(`${item.brand}-${item.model}-${ptName}`);
        const powertrainRef = doc(db, "powertrains", powertrainSlug);
        const ptSnap = await getDoc(powertrainRef);

        if (!ptSnap.exists() || mode === "replace") {
          batch.set(powertrainRef, {
            name: ptName,
            searchName: ptName.toLowerCase(),
            modelId: modelSlug,
            modelName: item.model,
            brandId: brandSlug,
            engine: ptData?.engine || item.engine || "",
            fuelType: ptData?.fuelType || item.fuelType || "",
            transmission: ptData?.transmission || item.transmission || "",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }, { merge: mode === "merge" });
          results.powertrains++;
        }

        // 4. Handle Intervals (intervals or serviceSchedule)
        const schedules = item.intervals || item.serviceSchedule;
        if (schedules && Array.isArray(schedules)) {
          for (const s of schedules) {
            const intervalName = s.name || s.interval?.label || `Interval ${s.kilometers || s.interval?.km}`;
            const intervalId = slugify(`${powertrainSlug}-${intervalName}`);
            const intervalRef = doc(db, "serviceIntervals", intervalId);
            
            batch.set(intervalRef, {
              name: intervalName,
              kilometers: s.kilometers || s.interval?.km || 0,
              months: s.months || s.interval?.months || 0,
              laborCost: s.laborCost || s.labourCost || 0,
              partsCost: s.partsCost || s.partsConsumablesCost || 0,
              totalCost: s.totalCost || 0,
              items: s.items || [],
              powertrainId: powertrainSlug,
              updatedAt: serverTimestamp()
            }, { merge: mode === "merge" });
            results.intervals++;
          }
        }

      } catch (err: any) {
        results.errors.push(`Error processing ${item.brand} ${item.model}: ${err.message}`);
      }
    }

    await batch.commit();

    // 5. Save Import Log
    await addDoc(collection(db, "importLogs"), {
      userId: auth.currentUser?.uid || "anonymous",
      userEmail: auth.currentUser?.email || "anonymous",
      timestamp: serverTimestamp(),
      results: {
        brands: results.brands,
        models: results.models,
        powertrains: results.powertrains,
        intervals: results.intervals
      },
      errorCount: results.errors.length,
      mode,
      fileName: data[0]?._fileName || "unknown_source"
    }).catch(err => console.error("Failed to save import log:", err));

  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, "bulk_import");
  }
  return results;
}
