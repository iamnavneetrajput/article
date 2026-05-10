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
        if (months < 12) return `${months} months`;
        if (months === 12) return "1 year";
        const years = months / 12;
        if (Number.isInteger(years)) return `${years} years`;
        return `${years.toFixed(1).replace(/\.0$/, "")} years`;
      };

      const formatPTName = (name: string) => {
          return name
            .replace(/\bPetrol Manual\b/gi, "Petrol-Manual")
            .replace(/\bPetrol Automatic\b/gi, "Petrol-Automatic")
            .replace(/\bDiesel Manual\b/gi, "Diesel-Manual")
            .replace(/\bDiesel Automatic\b/gi, "Diesel-Automatic")
            .replace(/\bTurbo Petrol Manual\b/gi, "Turbo Petrol-Manual")
            .replace(/\bTurbo Petrol Automatic\b/gi, "Turbo Petrol-Automatic");
      };

      const formatNumber = (num: number) => new Intl.NumberFormat('en-IN').format(num);

      const powertrainNames = pts.map(p => formatPTName(p.name)).join(" and ");
      const fuelType = (pts[0]?.fuelType || "petrol").toLowerCase();

      let content = `Meta Title: ${brand.name} ${model.name} Maintenance Cost (${maxYear} Year - ${formatLakh(maxKm)} km)\n\n`;
      content += `<h1>${brand.name} ${model.name} Service Cost (${maxYear}-Year / ${formatLakh(maxKm)} Kilometres)</h1>\n\n`;
      content += `Meta:\nFind out the ${model.name} maintenance cost estimates for ${fuelType} for up to ${maxYear} years or ${formatLakh(maxKm)} kilometres based on the official ${brand.name} India website claimed service cost.\n\n`;
      content += `Image:\nAny ${brand.name} ${model.name} Image\n\n`;
      content += `Caption:\n${brand.name} ${model.name} Service Cost\n\nOfficial Estimates (${formatNumber(maxKm)}km)\n\n`;
      content += `Social:\nNA\n\n`;
      content += `Intro:\n\nIn this article, we’ll provide you with the routine service and maintenance cost for the ${brand.name} ${model.name} ${powertrainNames}. These are periodic service cost estimates of up to ${maxYear} years or ${formatLakh(maxKm)} kilometres for the following powertrains of the ${brand.name} ${model.name}:\n\n`;
      content += pts.map(pt => `- ${formatPTName(pt.name)}`).join('\n') + "\n\n";

      // Generate section for each powertrain
      pts.forEach(pt => {
        const ptIntervals = intervalsByPT[pt.id] || [];
        if (ptIntervals.length === 0) return;

        const pName = formatPTName(pt.name);
        const maxPTYear = Math.max(...ptIntervals.map(i => i.months / 12), 0);
        const maxLabour = Math.max(...ptIntervals.map(i => i.laborCost), 0);
        const firstFreeInterval = ptIntervals.find(i => i.laborCost === 0);
        const freeKm = firstFreeInterval ? firstFreeInterval.kilometers : 0;
        const freeMo = firstFreeInterval ? firstFreeInterval.months : 0;

        // Editorial Text Header
        content += `<h2>${brand.name} ${model.name} – ${pName} Service Cost</h2>\n\n`;
        content += `The ${brand.name} ${model.name} ${pName} has labour-free service for the first ${new Intl.NumberFormat('en-IN').format(freeKm)}km or ${getPeriodLabel(freeMo)}. The remaining periodic services carry a labour charge of up to Rs. ${new Intl.NumberFormat('en-IN').format(maxLabour)}.\n\n`;
        content += `The following table provides a ${maxPTYear}-year periodic service cost breakdown of the ${brand.name} ${model.name} ${pName}:\n\n`;

        // Get all unique service items across all intervals for this PT
        const allItems = new Set<string>();
        ptIntervals.forEach(i => {
          i.items?.forEach((item: any) => allItems.add(item.service || item.name));
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
        let tableHtml = `<div class="workshop-table-container"><table class="workshop-table"><thead>`;
        tableHtml += `<tr><th colspan="${ptIntervals.length + 1}" class="workshop-title"><h3>${brand.name.toUpperCase()} ${model.name.toUpperCase()}<br/>${pName.toUpperCase()}<br/>SERVICE COST</h3></th></tr>`;
        tableHtml += `<tr class="header-row"><th class="label-col">INTERVAL →</th>${ptIntervals.map(i => `<th>${i.months >= 12 ? Math.floor(i.months / 12) + 'YR' : i.months + 'M'}</th>`).join('')}</tr>`;
        tableHtml += `<tr class="header-row"><th class="label-col">ODO MTR →</th>${ptIntervals.map(i => `<th>${formatNumber(i.kilometers)}</th>`).join('')}</tr></thead>`;
        tableHtml += `<tbody><tr><td class="label-col">Labour charges</td>${ptIntervals.map(i => `<td>${formatNumber(Math.round(i.laborCost || 0))}</td>`).join('')}</tr>`;
        
        itemsList.forEach(item => {
          tableHtml += `<tr><td class="label-col">${item.displayName}</td>`;
          ptIntervals.forEach(interval => {
            const match = interval.items?.find((it: any) => (it.service || it.name) === item.name);
            tableHtml += `<td>${match ? formatNumber(Math.round(match.total)) : 0}</td>`;
          });
          tableHtml += `</tr>`;
        });

        tableHtml += `<tr class="total-charges-row"><td class="label-col">Total Charges</td>${ptIntervals.map(i => `<td>${formatNumber(Math.round(i.totalCost || 0))}</td>`).join('')}</tr>`;
        tableHtml += `</tbody></table></div>`;

        content += `\n${tableHtml}\n\n`;

        // Ownership Cost Paragraph
        const totalCost = ptIntervals.reduce((acc, i) => acc + (i.totalCost || 0), 0);
        const months = Math.max(...ptIntervals.map(i => i.months));
        const avgMonthly = Math.round(totalCost / months);
        
        content += `For the first ${maxPTYear} years of ownership, your average monthly maintenance cost will stand at Rs. ${new Intl.NumberFormat('en-IN').format(avgMonthly)} with total costs adding up to Rs. ${new Intl.NumberFormat('en-IN').format(totalCost)}. If you keep the ${model.name} ${pName} for ${maxPTYear} years, you can expect to spend Rs. ${new Intl.NumberFormat('en-IN').format(avgMonthly)} per month on maintenance. In this case, the total maintenance expense for long-term ownership will be Rs. ${new Intl.NumberFormat('en-IN').format(totalCost)}.\n\n`;

        // Summary Table
        const milestones = [36, 60, 84, 120, 180]; // 3, 5, 7, 10, 15 years
        const summaryIntervals = ptIntervals.filter(i => milestones.includes(i.months));

        if (summaryIntervals.length > 0) {
          let summaryTableHtml = `<div class="workshop-table-container"><table class="workshop-table"><thead>`;
          summaryTableHtml += `<tr><th colspan="${summaryIntervals.length + 1}" class="workshop-title"><h3>${brand.name.toUpperCase()} ${model.name.toUpperCase()}<br/>${pName.toUpperCase()}<br/>TOTAL & AVERAGE PERIODIC SERVICE COST</h3></th></tr>`;
          summaryTableHtml += `<tr class="header-row"><th class="label-col">Interval</th>${summaryIntervals.map(i => `<th>${getPeriodLabel(i.months)}</th>`).join('')}</tr></thead>`;
          summaryTableHtml += `<tbody>`;
          summaryTableHtml += `<tr><td class="label-col">Odometer</td>${summaryIntervals.map(i => `<td>${formatNumber(i.kilometers)}km</td>`).join('')}</tr>`;
          summaryTableHtml += `<tr><td class="label-col">Total</td>${summaryIntervals.map(i => {
            const cumulativeTotal = ptIntervals.filter(p => p.months <= i.months).reduce((acc, p) => acc + (p.totalCost || 0), 0);
            return `<td>Rs. ${formatNumber(Math.round(cumulativeTotal))}</td>`;
          }).join('')}</tr>`;
          summaryTableHtml += `<tr><td class="label-col">Avg Cost/km</td>${summaryIntervals.map(i => {
            const cumulativeTotal = ptIntervals.filter(p => p.months <= i.months).reduce((acc, p) => acc + (p.totalCost || 0), 0);
            const avgPerKm = (cumulativeTotal / i.kilometers).toFixed(2);
            return `<td>Rs. ${avgPerKm}</td>`;
          }).join('')}</tr>`;
          summaryTableHtml += `<tr><td class="label-col">Avg Cost/month</td>${summaryIntervals.map(i => {
            const cumulativeTotal = ptIntervals.filter(p => p.months <= i.months).reduce((acc, p) => acc + (p.totalCost || 0), 0);
            const avgPerMo = Math.round(cumulativeTotal / i.months);
            return `<td>Rs. ${formatNumber(avgPerMo)}</td>`;
          }).join('')}</tr>`;
          summaryTableHtml += `</tbody></table></div>`;
          content += `${summaryTableHtml}\n\n`;
        }

        const firstKm = ptIntervals[0]?.kilometers || 0;
        const lastKm = ptIntervals[ptIntervals.length - 1]?.kilometers || 0;
        const firstTotal = ptIntervals[0]?.totalCost || 0;
        const lastAvgPerKm = (totalCost / lastKm).toFixed(2);

        content += `For the first ${new Intl.NumberFormat('en-IN').format(firstKm)}km of driving the ${brand.name} ${model.name} ${pName}, you will have to pay Rs. ${(firstTotal / firstKm).toFixed(2)} per km in routine maintenance, amounting to a total of Rs. ${new Intl.NumberFormat('en-IN').format(firstTotal)}. By the ${new Intl.NumberFormat('en-IN').format(lastKm)}km mark, your per kilometre maintenance cost will be Rs. ${lastAvgPerKm} per km with the total adding up to Rs. ${new Intl.NumberFormat('en-IN').format(totalCost)}.\n\n`;
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
    
    const tableStyles = `
      <style>
        table { border-collapse: collapse; width: 100%; max-width: 1280px; border: 1px solid #000; margin: 10px 0; font-family: Arial, sans-serif; background: #fff; }
        tr { height: 30px; }
        th, td { border: 1px solid #000; padding: 4px 6px; text-align: center; font-size: 10px; white-space: nowrap; vertical-align: middle; line-height: 1.1; color: #000; }
        .workshop-title { padding: 2px; text-align: center; text-transform: uppercase; font-weight: 700; }
        .workshop-title h3 { font-size: 11px; line-height: 1.1; margin: 0; padding: 0; font-weight: 700; }
        .header-row { font-weight: 700; text-transform: uppercase; font-size: 11px; }
        .label-col { text-align: center; font-weight: 700; min-width: 150px; white-space: normal; }
        .total-charges-row { font-weight: 700; font-size: 11px; }
      </style>
    `;

    const element = document.getElementById('article-preview-content');
    if (!element) return;

    const htmlContent = tableStyles + element.innerHTML;
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

            <div id="article-preview-content" className="p-12 prose prose-sm max-w-none prose-table:border prose-table:border-brand-line prose-th:bg-brand-bg/50 prose-th:p-2 prose-td:p-2">
              <Markdown rehypePlugins={[rehypeRaw]}>{article}</Markdown>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
