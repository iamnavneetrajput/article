import React, { useState, useEffect } from "react";
import { collection, getDocs, query, where, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { motion, AnimatePresence } from "motion/react";
import { 
  FileText, 
  Download, 
  ExternalLink, 
  Copy, 
  Check,
  ChevronRight,
  Printer,
  Table as TableIcon
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { formatCurrency, cn, slugify } from "../lib/utils";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";

export default function ArticleGenerator() {
  const { isAdmin } = useAuth();
  const [brands, setBrands] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [powertrains, setPowertrains] = useState<any[]>([]);
  
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedPT, setSelectedPT] = useState("");
  const [intervals, setIntervals] = useState<any[]>([]);
  
  const [article, setArticle] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function init() {
      const snap = await getDocs(collection(db, "brands"));
      setBrands(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }
    init();
  }, []);

  const handleBrandChange = async (brandId: string) => {
    setSelectedBrand(brandId);
    setSelectedModel("");
    setSelectedPT("");
    setArticle(null);
    const q = query(collection(db, "models"), where("brandId", "==", brandId));
    const snap = await getDocs(q);
    setModels(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const handleModelChange = async (modelId: string) => {
    setSelectedModel(modelId);
    setSelectedPT("");
    setArticle(null);
    const q = query(collection(db, "powertrains"), where("modelId", "==", modelId));
    const snap = await getDocs(q);
    setPowertrains(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const handlePTChange = async (ptId: string) => {
    setSelectedPT(ptId);
    setArticle(null);
    const q = query(collection(db, "serviceIntervals"), where("powertrainId", "==", ptId));
    const snap = await getDocs(q);
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    setIntervals(data.sort((a, b) => a.kilometers - b.kilometers));
  };

  const generateArticle = async () => {
    if (!selectedModel) return;
    setIsGenerating(true);
    
    try {
      const brand = brands.find(b => b.id === selectedBrand) as any;
      const model = models.find(m => m.id === selectedModel) as any;
      
      if (!brand || !model) {
        setIsGenerating(false);
        return;
      }
      
      // Fetch all powertrains for this model if we want to "Repeat for all powertrains"
      const ptsSnap = await getDocs(query(collection(db, "powertrains"), where("modelId", "==", selectedModel)));
      const pts = ptsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

      if (pts.length === 0) {
        setIsGenerating(false);
        return;
      }

      // Fetch all intervals for all powertrains of this model
      const intervalsSnap = await getDocs(query(collection(db, "serviceIntervals"), where("powertrainId", "in", pts.map(p => p.id))));
      const allIntervals = intervalsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

      // Group intervals by powertrainId and sort them
      const intervalsByPT: Record<string, any[]> = {};
      pts.forEach(pt => {
        intervalsByPT[pt.id] = allIntervals
          .filter(i => i.powertrainId === pt.id)
          .sort((a, b) => a.kilometers - b.kilometers);
      });

      // Calculate overall max year and km for the meta title
      let maxYear = 0;
      let maxKm = 0;
      allIntervals.forEach(i => {
        if (i.months / 12 > maxYear) maxYear = i.months / 12;
        if (i.kilometers > maxKm) maxKm = i.kilometers;
      });

      const formatLakh = (km: number) => {
        if (km >= 100000) {
          return `${(km / 100000).toFixed(1).replace(/\.0$/, "")} Lakh`;
        }
        return new Intl.NumberFormat('en-IN').format(km);
      };

      const getPeriodLabel = (months: number) => {
        if (months === 1) return "1 month";
        if (months < 12) return `${months}m`;
        const years = months / 12;
        return `${years.toFixed(1).replace(/\.0$/, "")}y`;
      };

      const formatPTName = (name: string) => {
          return name
            .replace(/\bPetrol-Manual\b/gi, "Petrol-Manual")
            .replace(/\bPetrol-Automatic\b/gi, "Petrol-Automatic")
            .replace(/\bDiesel-Manual\b/gi, "Diesel-Manual")
            .replace(/\bDiesel-Automatic\b/gi, "Diesel-Automatic")
            .replace(/\bPetrol Manual\b/gi, "Petrol-Manual")
            .replace(/\bPetrol Automatic\b/gi, "Petrol-Automatic")
            .replace(/\bDiesel Manual\b/gi, "Diesel-Manual")
            .replace(/\bDiesel Automatic\b/gi, "Diesel-Automatic")
            .replace(/\bTurbo Petrol Manual\b/gi, "Turbo Petrol-Manual")
            .replace(/\bTurbo Petrol Automatic\b/gi, "Turbo Petrol-Automatic")
            .replace(/Turbo-Petrol-Manual/gi, "Turbo Petrol-Manual")
            .replace(/Turbo-Petrol-Automatic/gi, "Turbo Petrol-Automatic")
            .replace(/Turbo-Petrol/gi, "Turbo Petrol")
            .replace(/TurboPetrol/gi, "Turbo Petrol")
            .replace(/Turbo-Petrol/gi, "Turbo Petrol");
      };

      const formatNumber = (num: number) => new Intl.NumberFormat('en-IN').format(num);

      // Sort powertrains: Petrol First, then engine size (e.g. 1.2 before 1.5)
      const sortedPts = [...pts].sort((a, b) => {
        const fuelOrder: Record<string, number> = { 'petrol': 1, 'diesel': 2, 'ev': 3, 'cng': 4 };
        const fuelA = (a.fuelType || 'petrol').toLowerCase();
        const fuelB = (b.fuelType || 'petrol').toLowerCase();
        
        if (fuelOrder[fuelA] !== fuelOrder[fuelB]) {
          return (fuelOrder[fuelA] || 99) - (fuelOrder[fuelB] || 99);
        }
        
        const getVal = (name: string) => {
          const m = name.match(/(\d+\.?\d*)/);
          return m ? parseFloat(m[1]) : 0;
        };
        
        const valA = getVal(a.name);
        const valB = getVal(b.name);
        
        if (valA !== valB) return valA - valB;
        
        // Priority: Manual first
        const isManual = (n: string) => n.toLowerCase().includes('manual') ? 0 : 1;
        const transA = isManual(a.name);
        const transB = isManual(b.name);
        if (transA !== transB) return transA - transB;

        return a.name.localeCompare(b.name);
      });

      const s = {
        h1: 'style="font-size: 20px; font-weight: 700; margin: 0 0 10px 0; line-height: 1.15;"',
        h2: 'style="font-size: 16px; font-weight: 700; margin: 15px 0 10px 0; line-height: 1.15;"',
        p: 'style="line-height: 1.15; margin-top: 0; margin-bottom: 0; padding: 0;"',
        table: 'style="border-collapse: collapse; width: 100%; border: 1px solid #000; margin: 10px 0; font-family: Arial, sans-serif; background: #fff; line-height: 1.15;"',
        thTd: 'style="border: 1px solid #000; padding: 4px 6px; text-align: center; font-size: 10px; vertical-align: middle; line-height: 1.1; color: #000;"',
        h3: 'style="font-size: 11px; line-height: 1.15; margin: 0; padding: 0; font-weight: 700;"',
        bold: 'style="font-weight: 700;"'
      };

      const powertrainNames = sortedPts.map(p => `${brand.name} ${model.name} ${formatPTName(p.name)}`).join(" and ");
      const fuelType = (sortedPts[0]?.fuelType || "petrol").toLowerCase();

      let content = `Meta Title: ${brand.name} ${model.name} Maintenance Cost (${maxYear} Year - ${formatLakh(maxKm)} km)\n\n`;
      content += `<h1 ${s.h1}>${brand.name} ${model.name} Service Cost (${maxYear}-Year / ${formatLakh(maxKm)} Kilometres)</h1>\n\n`;
      content += `<p ${s.p}>Meta:\nFind out the ${model.name} maintenance cost estimates for ${fuelType} for up to ${maxYear} years or ${formatLakh(maxKm)} kilometres based on the official ${brand.name} India website claimed service cost.</p>\n\n`;
      content += `<p ${s.p}>Image:\nAny ${brand.name} ${model.name} Image</p>\n\n`;
      content += `<p ${s.p}>Caption:\n${brand.name} ${model.name} Service Cost\n\nOfficial Estimates (${formatNumber(maxKm)}km)</p>\n\n`;
      content += `<p ${s.p}>Social:\nNA</p>\n\n`;
      content += `<p ${s.p}>Intro:\n\nIn this article, we’ll provide you with the routine service and maintenance cost for the ${powertrainNames}. These are periodic service cost estimates of up to ${maxYear} years or ${formatLakh(maxKm)} kilometres for the following powertrains of the ${brand.name} ${model.name}:</p>\n\n`;
      content += sortedPts.map(pt => `<p ${s.p}>- ${brand.name} ${model.name} ${formatPTName(pt.name)}</p>`).join('\n') + "\n\n";

      // Generate section for each powertrain
      sortedPts.forEach(pt => {
        const ptIntervals = intervalsByPT[pt.id] || [];
        if (ptIntervals.length === 0) return;

        const pName = formatPTName(pt.name);
        const maxPTYear = Math.max(...ptIntervals.map(i => i.months / 12), 0);
        const maxLabour = Math.max(...ptIntervals.map(i => i.laborCost), 0);
        
        // Find the last free service in the initial sequence
        let lastFreeInterval = null;
        for (const interval of ptIntervals) {
          if ((interval.laborCost || 0) === 0) {
            lastFreeInterval = interval;
          } else {
            break;
          }
        }

        const freeKm = lastFreeInterval ? lastFreeInterval.kilometers : 0;
        const freeMo = lastFreeInterval ? lastFreeInterval.months : 0;

        // Editorial Text Header
        content += `<h2 ${s.h2}>${brand.name} ${model.name} – ${pName} Service Cost</h2>\n\n`;
        
        if (lastFreeInterval) {
          content += `<p ${s.p}>The ${brand.name} ${model.name} ${pName} has labour-free service for the first ${new Intl.NumberFormat('en-IN').format(freeKm)}km or ${getPeriodLabel(freeMo)}. The remaining periodic services carry a labour charge of up to Rs. ${new Intl.NumberFormat('en-IN').format(maxLabour)}.</p>\n\n`;
        } else {
          content += `<p ${s.p}>The periodic services for the ${brand.name} ${model.name} ${pName} carry a labour charge of up to Rs. ${new Intl.NumberFormat('en-IN').format(maxLabour)}.</p>\n\n`;
        }
        content += `<p ${s.p}>The following table provides a ${maxPTYear}-year periodic service cost breakdown of the ${brand.name} ${model.name} ${pName}:</p>\n\n`;

        // Get all unique service items across all intervals for this PT
        const allItems = new Set<string>();
        ptIntervals.forEach(i => {
          if (i.items && i.items.length > 0) {
            i.items.forEach((item: any) => allItems.add(item.service || item.name));
          }
        });
        
        const itemsList = Array.from(allItems).map(serviceName => {
          let quantityLabel = "";
          for (const interval of ptIntervals) {
            const match = interval.items?.find((it: any) => (it.service || it.name) === serviceName);
            if (match) {
              const qty = match.quantity || match.requiredQuantity || match.capacity;
              const unit = (match.unit || "").trim();
              if (qty && (qty > 1 || unit)) {
                quantityLabel = ` (${qty}${unit})`;
                break;
              }
            }
          }
          return {
            name: serviceName,
            displayName: `${serviceName}${quantityLabel}`
          };
        });

        // Workshop Style HTML Table
        let tableHtml = `<div class="workshop-table-container"><table ${s.table} cellpadding="0" cellspacing="0"><thead>`;
        tableHtml += `<tr><th colspan="${ptIntervals.length + 1}" style="padding: 10px; text-align: center; border: 1px solid #000; background: #f8f9fa;"><h3 ${s.h3}>${brand.name.toUpperCase()} ${model.name.toUpperCase()}<br/>${pName.toUpperCase()}<br/>SERVICE COST</h3></th></tr>`;
        tableHtml += `<tr><th ${s.thTd}><b>INTERVAL →</b></th>${ptIntervals.map(i => `<th ${s.thTd}><b>${getPeriodLabel(i.months).toUpperCase()}</b></th>`).join('')}</tr>`;
        tableHtml += `<tr><th ${s.thTd}><b>ODO MTR →</b></th>${ptIntervals.map(i => `<th ${s.thTd}><b>${formatNumber(i.kilometers)}</b></th>`).join('')}</tr></thead>`;
        tableHtml += `<tbody><tr><td ${s.thTd}><b>Labour charges</b></td>${ptIntervals.map(i => `<td ${s.thTd}><b>${formatNumber(Math.round(i.laborCost || 0))}</b></td>`).join('')}</tr>`;
        
        itemsList.forEach(item => {
          tableHtml += `<tr><td ${s.thTd}><b>${item.displayName || "Maintenance Item"}</b></td>`;
          ptIntervals.forEach(interval => {
            const match = interval.items?.find((it: any) => (it.service || it.name) === item.name);
            const val = match ? match.total : 0;
            tableHtml += `<td ${s.thTd}><b>${formatNumber(Math.round(val))}</b></td>`;
          });
          tableHtml += `</tr>`;
        });

        // Aggregate parts row: only show values for intervals that have no itemized parts
        const hasUnitemizedParts = ptIntervals.some(i => (!i.items || i.items.length === 0) && (i.partsCost || i.partsConsumablesCost || 0) > 0);
        if (hasUnitemizedParts) {
          tableHtml += `<tr><td ${s.thTd}><b>Parts</b></td>${ptIntervals.map(i => {
            const hasItems = i.items && i.items.length > 0;
            const val = hasItems ? 0 : (i.partsCost || i.partsConsumablesCost || 0);
            return `<td ${s.thTd}><b>${formatNumber(Math.round(val))}</b></td>`;
          }).join('')}</tr>`;
        }
        
        tableHtml += `<tr><td ${s.thTd}><b>Total Charges</b></td>${ptIntervals.map(i => `<td ${s.thTd}><b>${formatNumber(Math.round(i.totalCost || 0))}</b></td>`).join('')}</tr>`;
        tableHtml += `</tbody></table></div>`;

        content += `\n${tableHtml}\n\n`;

        // Ownership Cost Paragraph
        const getCumulativeAt = (pts: any[], limit: number, mode: 'months' | 'km') => {
          const relevant = pts.filter(p => mode === 'months' ? p.months <= limit : p.kilometers <= limit);
          const total = relevant.reduce((acc, p) => acc + (p.totalCost || 0), 0);
          const actualLimit = relevant.length > 0 ? (mode === 'months' ? Math.max(...relevant.map(r => r.months)) : Math.max(...relevant.map(r => r.kilometers))) : limit;
          return { total, limit: actualLimit };
        };

        const cost5y = getCumulativeAt(ptIntervals, 60, 'months');
        const cost10y = getCumulativeAt(ptIntervals, 120, 'months');
        const costMaxY = getCumulativeAt(ptIntervals, 999, 'months');

        const avg5y = cost5y.limit > 0 ? Math.round(cost5y.total / cost5y.limit) : 0;
        const avgLong = costMaxY.limit > 0 ? Math.round(costMaxY.total / costMaxY.limit) : 0;
        const longTermLabel = costMaxY.limit >= 120 ? "10 years" : `${(costMaxY.limit / 12).toFixed(1).replace(/\.0$/, "")} years`;

        content += `<p ${s.p}>For the first 5 years of ownership, your average monthly maintenance cost will stand at Rs. ${formatNumber(avg5y)} with total costs adding up to Rs. ${formatNumber(cost5y.total)}. If you keep the ${model.name} ${pName} for ${longTermLabel}, you can expect to spend Rs. ${formatNumber(avgLong)} per month on maintenance. In this case, the total maintenance expense for long-term ownership will be Rs. ${formatNumber(costMaxY.total)}.</p>\n\n`;

        // Summary Table
        const milestones = [36, 60, 84, 120, 180]; // 3, 5, 7, 10, 15 years
        const summaryIntervals = ptIntervals.filter(i => milestones.includes(i.months));

        if (summaryIntervals.length > 0) {
          let summaryTableHtml = `<div class="workshop-table-container"><table ${s.table} cellpadding="0" cellspacing="0"><thead>`;
          summaryTableHtml += `<tr><th colspan="${summaryIntervals.length + 1}" style="padding: 10px; text-align: center; border: 1px solid #000; background: #f8f9fa;"><h3 ${s.h3}>${brand.name.toUpperCase()} ${model.name.toUpperCase()}<br/>${pName.toUpperCase()}<br/>TOTAL & AVERAGE PERIODIC SERVICE COST</h3></th></tr>`;
          summaryTableHtml += `<tr><th ${s.thTd}><b>Interval</b></th>${summaryIntervals.map(i => `<th ${s.thTd}><b>${getPeriodLabel(i.months).toUpperCase()}</b></th>`).join('')}</tr></thead>`;
          summaryTableHtml += `<tbody>`;
          summaryTableHtml += `<tr><td ${s.thTd}><b>Odometer</b></td>${summaryIntervals.map(i => `<td ${s.thTd}><b>${formatNumber(i.kilometers)}km</b></td>`).join('')}</tr>`;
          summaryTableHtml += `<tr><td ${s.thTd}><b>Total</b></td>${summaryIntervals.map(i => {
            const cumulativeTotal = ptIntervals.filter(p => p.months <= i.months).reduce((acc, p) => acc + (p.totalCost || 0), 0);
            return `<td ${s.thTd}><b>Rs. ${formatNumber(Math.round(cumulativeTotal))}</b></td>`;
          }).join('')}</tr>`;
          summaryTableHtml += `<tr><td ${s.thTd}><b>Avg Cost/km</b></td>${summaryIntervals.map(i => {
            const cumulativeTotal = ptIntervals.filter(p => p.months <= i.months).reduce((acc, p) => acc + (p.totalCost || 0), 0);
            const avgPerKm = (cumulativeTotal / i.kilometers).toFixed(2);
            return `<td ${s.thTd}><b>Rs. ${avgPerKm}</b></td>`;
          }).join('')}</tr>`;
          summaryTableHtml += `<tr><td ${s.thTd}><b>Avg Cost/month</b></td>${summaryIntervals.map(i => {
            const cumulativeTotal = ptIntervals.filter(p => p.months <= i.months).reduce((acc, p) => acc + (p.totalCost || 0), 0);
            const avgPerMo = Math.round(cumulativeTotal / i.months);
            return `<td ${s.thTd}><b>Rs. ${formatNumber(avgPerMo)}</b></td>`;
          }).join('')}</tr>`;
          summaryTableHtml += `</tbody></table></div>`;
          content += `${summaryTableHtml}\n\n`;
        }

        const cost75k = getCumulativeAt(ptIntervals, 75000, 'km');
        const cost105k = getCumulativeAt(ptIntervals, 105000, 'km');
        const costMaxK = getCumulativeAt(ptIntervals, 999999, 'km');

        const rate75k = cost75k.limit > 0 ? (cost75k.total / cost75k.limit).toFixed(2) : "0.00";
        const rate105k = cost105k.limit > 0 ? (cost105k.total / cost105k.limit).toFixed(2) : "0.00";
        const rateMax = costMaxK.limit > 0 ? (costMaxK.total / costMaxK.limit).toFixed(2) : "0.00";

        content += `<p ${s.p}>For the first ${formatNumber(cost75k.limit)}km of driving the ${brand.name} ${model.name} ${pName}, you will have to pay Rs. ${rate75k} per km in routine maintenance, amounting to a total of Rs. ${formatNumber(cost75k.total)}. By ${formatNumber(cost105k.limit)}km, the ${model.name} ${pName} will cost Rs. ${formatNumber(cost105k.total)} in periodic maintenance, which is Rs. ${rate105k} per kilometer. At the ${formatNumber(costMaxK.limit)}km mark, your per kilometre maintenance cost will increase to Rs. ${rateMax} per km with the total adding up to Rs. ${formatNumber(costMaxK.total)}.</p>\n\n`;
      });

      setArticle(content);
      
      // Auto-save to articles collection for tracking
      const articleId = slugify(`${brand.name}-${model.name}-maintenance-cost`);
      await setDoc(doc(db, "articles", articleId), {
        brandId: selectedBrand,
        brandName: brand.name,
        modelId: selectedModel,
        modelName: model.name,
        content,
        updatedAt: serverTimestamp()
      }, { merge: true });

      setIsGenerating(false);
    } catch (error) {
       console.error("Article Generation Failed:", error);
       setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    if (!article) return;
    navigator.clipboard.writeText(article);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyAsRichText = async () => {
    if (!article) return;
    
    // Inline all styles for maximum compatibility with Google Docs
    const element = document.getElementById('article-preview-content');
    if (!element) return;

    // Use a temporary clone to ensure we have the computed styles or standard tags
    const htmlContent = element.innerHTML;
    const blob = new Blob([htmlContent], { type: "text/html" });
    const textBlob = new Blob([article], { type: "text/plain" });

    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": blob,
          "text/plain": textBlob
        })
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Rich text copy failed:", err);
      copyToClipboard(); 
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8 pb-20"
    >
      <header>
        <h2 className="text-3xl font-bold tracking-tighter uppercase">Article Hub</h2>
        <p className="tech-header">Generate search-optimized maintenance cost articles</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white border tech-grid p-6">
        <div className="space-y-4">
          <label className="tech-header text-[10px]">Select Brand</label>
          <select 
            value={selectedBrand} 
            onChange={(e) => handleBrandChange(e.target.value)}
            className="w-full bg-brand-bg border tech-grid p-2 text-sm focus:outline-none"
          >
            <option value="">Choose Brand...</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        <div className="space-y-4">
          <label className="tech-header text-[10px]">Select Model</label>
          <select 
            value={selectedModel} 
            onChange={(e) => handleModelChange(e.target.value)}
            disabled={!selectedBrand}
            className="w-full bg-brand-bg border tech-grid p-2 text-sm focus:outline-none disabled:opacity-50"
          >
            <option value="">Choose Model...</option>
            {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>

        <div className="space-y-4">
          <label className="tech-header text-[10px]">Service Overview</label>
          <div className="w-full bg-brand-bg/50 border border-brand-line/30 p-2 text-[10px] font-bold uppercase text-slate-400 flex items-center gap-2">
            <TableIcon size={12} /> {powertrains.length} Powertrains Detected
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        {isAdmin ? (
          <button 
            onClick={generateArticle}
            disabled={!selectedModel || isGenerating}
            className="flex items-center gap-2 px-12 py-4 bg-brand-ink text-brand-bg font-bold uppercase tracking-[0.3em] hover:bg-brand-ink/90 disabled:opacity-50 transition-all shadow-xl"
          >
            {isGenerating ? "Generating Article..." : "Generate article"}
          </button>
        ) : (
          <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl text-amber-700 text-xs font-bold uppercase tracking-widest text-center max-w-md w-full">
            Article generation is restricted to administrators.
          </div>
        )}
      </div>

      <AnimatePresence>
        {article && (
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border tech-grid overflow-hidden shadow-2xl"
          >
            <div className="p-4 bg-brand-ink text-brand-bg flex justify-between items-center sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <FileText size={16} />
                <span className="text-xs font-bold uppercase tracking-widest">Article Preview</span>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={copyToClipboard}
                  className="p-2 hover:bg-white/10 rounded-full flex items-center gap-2 text-[10px] font-bold uppercase"
                >
                  {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />} {copied ? "Copied" : "Copy MD"}
                </button>
                <button 
                   onClick={copyAsRichText}
                  className="p-2 hover:bg-white/10 rounded-full flex items-center gap-2 text-[10px] font-bold uppercase bg-blue-600/30"
                >
                  <ExternalLink size={14} /> {copied ? "Done" : "Copy for GDocs"}
                </button>
              </div>
            </div>

            <div id="article-preview-content" className="p-4 md:p-12 prose prose-sm max-w-none prose-table:border prose-table:border-brand-line prose-th:bg-brand-bg/50 prose-th:p-2 prose-td:p-2 
              prose-h1:text-[20px] prose-h1:font-bold prose-h1:leading-tight
              prose-h3:text-[11px] prose-h3:font-bold prose-h3:leading-none
              prose-p:leading-[1.15] prose-p:my-0
              prose-table:text-[10px] prose-td:text-center prose-th:text-center
            ">
              <Markdown rehypePlugins={[rehypeRaw]}>{article}</Markdown>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
