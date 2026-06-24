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
  Table as TableIcon,
  HelpCircle,
  Database
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { formatCurrency, cn, slugify } from "../lib/utils";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

export default function ArticleGenerator() {
  const { isAdmin } = useAuth();

  // Selection Mode State (Maintenance vs EV Range)
  const [articleType, setArticleType] = useState<"service-cost" | "ev-range" | "fuel-efficiency">("service-cost");

  // Maintenance selection states
  const [brands, setBrands] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [powertrains, setPowertrains] = useState<any[]>([]);
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedPT, setSelectedPT] = useState("");
  const [intervals, setIntervals] = useState<any[]>([]);

  // EV Range selection states
  const [evModels, setEvModels] = useState<any[]>([]);
  const [selectedEvId, setSelectedEvId] = useState("");

  // Output states
  const [article, setArticle] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Initialize brand lists and EV models list
  useEffect(() => {
    async function init() {
      const snapBrands = await getDocs(collection(db, "brands"));
      setBrands(snapBrands.docs.map(d => ({ id: d.id, ...d.data() })));
    }
    init();
  }, []);

  // Sync EV Range Models choice lists dynamically
  useEffect(() => {
    async function initEv() {
      try {
        const snapEv = await getDocs(collection(db, "evRangeData"));
        setEvModels(snapEv.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Failed to load EV range models from database:", err);
      }
    }
    if (articleType === "ev-range" || articleType === "fuel-efficiency") {
      initEv();
    }
  }, [articleType]);

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

  // GENERATE PERIODIC MAINTENANCE COST ARTICLE
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

      const ptsSnap = await getDocs(query(collection(db, "powertrains"), where("modelId", "==", selectedModel)));
      const pts = ptsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

      if (pts.length === 0) {
        setIsGenerating(false);
        return;
      }

      const intervalsSnap = await getDocs(query(collection(db, "serviceIntervals"), where("powertrainId", "in", pts.map(p => p.id))));
      const allIntervals = intervalsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

      const intervalsByPT: Record<string, any[]> = {};
      pts.forEach(pt => {
        intervalsByPT[pt.id] = allIntervals
          .filter(i => i.powertrainId === pt.id)
          .sort((a, b) => a.kilometers - b.kilometers);
      });

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

      const getCleanPTName = (name: string, keepSpeedType = false) => {
        let formatted = formatPTName(name);
        if (!keepSpeedType) {
          formatted = formatted.replace(/\s*\([^)]+\)/gi, "");
        }
        formatted = formatted.toLowerCase();
        formatted = formatted.replace(/\b(\d+(?:\.\d+)?)l\b/gi, "$1L");
        if (keepSpeedType) {
          formatted = formatted
            .replace(/\bdct\b/g, "DCT")
            .replace(/\btc\b/g, "TC")
            .replace(/\bamt\b/g, "AMT")
            .replace(/\bcvt\b/g, "CVT")
            .replace(/\bat\b/g, "AT")
            .replace(/\bmt\b/g, "MT")
            .replace(/\bspeed\b/g, "speed");
        }
        return formatted;
      };

      const getH4PTName = (name: string) => {
        let formatted = formatPTName(name);
        formatted = formatted.replace(/\bSpeed\b/g, "speed");
        return formatted;
      };

      const formatNumber = (num: number) => new Intl.NumberFormat('en-IN').format(num);

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

        const isManual = (n: string) => n.toLowerCase().includes('manual') ? 0 : 1;
        const transA = isManual(a.name);
        const transB = isManual(b.name);
        if (transA !== transB) return transA - transB;

        return a.name.localeCompare(b.name);
      });

      const s = {
        h1: 'style="font-size: 20px; font-weight: 700; margin: 0 0 10px 0; line-height: 1.15;"',
        h2: 'style="font-size: 16px; font-weight: 700; margin: 15px 0 10px 0; line-height: 1.15;"',
        p: 'style="line-height: 1.15; margin: 0; padding: 0;"',
        table: 'style="border-collapse: collapse; width: 100%; border: 1px solid #000; margin: 10px 0; font-family: Arial, sans-serif; background: #fff; line-height: 1.15; font-size: 10px;"',
        thTd: 'style="border: 1px solid #000; padding: 4px 6px; text-align: center; font-size: 10px; vertical-align: middle; line-height: 1.15; color: #000; margin: 0;"',
        h3: 'style="font-size: 11pt; line-height: 1.15; margin: 0; padding: 0; font-weight: 700; text-align: center;"',
        h4: 'style="font-size: 14px; font-weight: 700; margin: 15px 0 5px 0; line-height: 1.15; color: #000;"',
        ul: 'style="list-style-type: disc; margin: 10px 0 10px 20px; padding: 0;"',
        li: 'style="line-height: 1.15; margin: 3px 0; padding: 0;"',
        bold: 'style="font-weight: 700;"'
      };

      const powertrainNames = sortedPts.map(p => `${brand.name} ${model.name} ${getCleanPTName(p.name, false)}`).join(" and ");

      const fuelTypes = Array.from(new Set(sortedPts.map(p => (p.fuelType || "petrol").toLowerCase())));
      let fuelTypeLabel = "";
      if (fuelTypes.length === 1) {
        fuelTypeLabel = fuelTypes[0];
      } else if (fuelTypes.length === 2) {
        fuelTypeLabel = `${fuelTypes[0]} and ${fuelTypes[1]}`;
      } else {
        fuelTypeLabel = fuelTypes.join(", ").replace(/, ([^,]*)$/, ", and $1");
      }

      let content = `Meta Title: ${brand.name} ${model.name} Maintenance Cost (${maxYear} Year - ${formatLakh(maxKm)} km)\n\n`;
      content += `<h1 ${s.h1}>${brand.name} ${model.name} Service Cost (${maxYear}-Year / ${formatLakh(maxKm)} Kilometres)</h1>\n\n`;
      content += `<p ${s.p}>Meta:\nFind out the ${model.name} maintenance cost estimates for ${fuelTypeLabel} for up to ${maxYear} years or ${formatLakh(maxKm)} kilometres based on the official ${brand.name} India website claimed service cost.</p>\n\n`;
      content += `<p ${s.p}>Image:\nAny ${brand.name} ${model.name} Image</p>\n\n`;
      content += `<p ${s.p}>Caption:\n${brand.name} ${model.name} Service Cost\n\nOfficial Estimates (${formatNumber(maxKm)}km)</p>\n\n`;
      content += `<p ${s.p}>Social:\nNA</p>\n\n`;
      content += `<p ${s.p}>Intro:\n\nIn this article, we'll provide you with the routine service and maintenance cost for the ${powertrainNames}. These are periodic service cost estimates of up to ${maxYear} years or ${formatLakh(maxKm)} kilometres for the following powertrains of the ${brand.name} ${model.name}:</p>\n\n`;
      content += `<ul ${s.ul}>\n` + sortedPts.map(pt => `  <li ${s.li}>${brand.name} ${model.name} ${formatPTName(pt.name)}</li>`).join('\n') + `\n</ul>\n\n`;

      sortedPts.forEach(pt => {
        const ptIntervals = intervalsByPT[pt.id] || [];
        if (ptIntervals.length === 0) return;

        const pName = formatPTName(pt.name);
        const pNameNoSpeed = getCleanPTName(pt.name, false);
        const pNameWithSpeed = getCleanPTName(pt.name, true);
        const pNameH4 = getH4PTName(pt.name);

        const maxPTYear = Math.max(...ptIntervals.map(i => i.months / 12), 0);
        const maxLabour = Math.max(...ptIntervals.map(i => i.laborCost), 0);

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

        content += `<h2 ${s.h2}>${brand.name} ${model.name} – ${pName} Service Cost</h2>\n\n`;

        if (lastFreeInterval) {
          content += `<p ${s.p}>The ${brand.name} ${model.name} ${pNameNoSpeed} has labour-free service for the first ${new Intl.NumberFormat('en-IN').format(freeKm)}km or ${getPeriodLabel(freeMo)}. The remaining periodic services carry a labour charge of up to Rs. ${new Intl.NumberFormat('en-IN').format(maxLabour)}.</p>\n\n`;
        } else {
          content += `<p ${s.p}>The periodic services for the ${brand.name} ${model.name} ${pNameNoSpeed} carry a labour charge of up to Rs. ${new Intl.NumberFormat('en-IN').format(maxLabour)}.</p>\n\n`;
        }
        content += `<p ${s.p}>The following table provides a ${maxPTYear}-year periodic service cost breakdown of the ${brand.name} ${model.name} ${pNameWithSpeed}:</p>\n\n`;

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

        const getCumulativeAt = (pts: any[], limit: number, mode: 'months' | 'km') => {
          const relevant = pts.filter(p => mode === 'months' ? p.months <= limit : p.kilometers <= limit);
          const total = relevant.reduce((acc, p) => acc + (p.totalCost || 0), 0);
          const actualLimit = relevant.length > 0 ? (mode === 'months' ? Math.max(...relevant.map(r => r.months)) : Math.max(...relevant.map(r => r.kilometers))) : limit;
          return { total, limit: actualLimit };
        };

        const cost5y = getCumulativeAt(ptIntervals, 60, 'months');
        const cost10y = getCumulativeAt(ptIntervals, 120, 'months');
        const maxMonths = Math.max(...ptIntervals.map(i => i.months));
        const longTermLimitMonths = maxMonths >= 120 ? 120 : maxMonths;
        const costLongY = getCumulativeAt(ptIntervals, longTermLimitMonths, 'months');

        const avg5y = cost5y.limit > 0 ? Math.round(cost5y.total / cost5y.limit) : 0;
        const avgLong = costLongY.limit > 0 ? Math.round(costLongY.total / costLongY.limit) : 0;
        const longTermLabel = costLongY.limit >= 120 ? "10 years" : `${(costLongY.limit / 12).toFixed(1).replace(/\.0$/, "")} years`;
        const headingYearsLabel = costLongY.limit >= 120 ? "10-Year" : `${(costLongY.limit / 12).toFixed(1).replace(/\.0$/, "")}-Year`;

        content += `<h4 ${s.h4}>${headingYearsLabel} Maintenance Cost — ${model.name} ${pNameH4}</h4>\n`;
        content += `<p ${s.p}>For the first 5 years of ownership, your average monthly maintenance cost will stand at Rs. ${formatNumber(avg5y)} with total costs adding up to Rs. ${formatNumber(cost5y.total)}. If you keep the ${model.name} ${pNameNoSpeed} for ${longTermLabel}, you can expect to spend Rs. ${formatNumber(avgLong)} per month on maintenance. In this case, the total maintenance expense for long-term ownership will be Rs. ${formatNumber(costLongY.total)}.</p>\n\n`;

        const milestones = [36, 60, 84, 120, 180];
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
            return `<td ${s.thTd}><b>Rs. ${(cumulativeTotal / i.kilometers).toFixed(2)}</b></td>`;
          }).join('')}</tr>`;
          summaryTableHtml += `<tr><td ${s.thTd}><b>Avg Cost/month</b></td>${summaryIntervals.map(i => {
            const cumulativeTotal = ptIntervals.filter(p => p.months <= i.months).reduce((acc, p) => acc + (p.totalCost || 0), 0);
            return `<td ${s.thTd}><b>Rs. ${formatNumber(Math.round(cumulativeTotal / i.months))}</b></td>`;
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

        content += `<h4 ${s.h4}>${formatNumber(costMaxK.limit)}km Maintenance Cost — ${brand.name} ${model.name} ${pNameH4}</h4>\n`;
        content += `<p ${s.p}>For the first ${formatNumber(cost75k.limit)}km of driving the ${brand.name} ${model.name} ${pNameNoSpeed}, you will have to pay Rs. ${rate75k} per km in routine maintenance, amounting to a total of Rs. ${formatNumber(cost75k.total)}. By ${formatNumber(cost105k.limit)}km, the ${model.name} ${pNameNoSpeed} will cost Rs. ${formatNumber(cost105k.total)} in periodic maintenance, which is Rs. ${rate105k} per kilometer. At the ${formatNumber(costMaxK.limit)}km mark, your per kilometre maintenance cost will increase to Rs. ${rateMax} per km with the total adding up to Rs. ${formatNumber(costMaxK.total)}.</p>\n\n`;
      });

      setArticle(content);

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

  // GENERATE EV RANGE TEST ARTICLE
  const generateEvRangeArticle = async () => {
    if (!selectedEvId) return;
    setIsGenerating(true);
    try {
      const ev = evModels.find(e => e.id === selectedEvId);
      if (!ev) {
        setIsGenerating(false);
        return;
      }

      // Helper to check for missing/null/undefined data
      const checkVal = (v: any, fallback: string = "Data not available") => {
        if (v === null || v === undefined || v === "") return fallback;
        return String(v).trim();
      };

      const checkNum = (v: any, fallback: number = 0) => {
        if (v === null || v === undefined || isNaN(Number(v)) || String(v).trim() === "") return fallback;
        return Number(v);
      };

      const make = checkVal(ev.brand);
      const model = checkVal(ev.model);
      const variant = String(ev.variant || "").trim();
      const fullVehicleName = variant ? `${make} ${model} ${variant}` : `${make} ${model}`;

      const s = {
        table: 'style="border-collapse: collapse; width: 100%; border: 1px solid #000; margin: 10px 0; font-family: Arial, sans-serif; background: #fff; line-height: 1.15; font-size: 10pt;"',
        thTd: 'style="border: 1px solid #000; padding: 10px 8px; text-align: center; font-size: 10pt; vertical-align: middle; line-height: 1.15; color: #000; font-weight: normal;"',
        td: 'style="border: 1px solid #000; padding: 10px 8px; text-align: center; vertical-align: middle; background-color: #ffffff; font-size: 10pt; line-height: 1.15;"',
        p: 'style="line-height: 1.15; margin: 0; padding: 0;"'
      };

      const batteryCapacity = checkNum(ev.battery_kwh, 0);
      const claimedRange = checkNum(ev.claimed_range_km, 0);

      const battery_percentage = checkNum(ev.battery_percentage, 100);
      const city_distance_km = checkNum(ev.city_distance_km, 100);
      const city_battery_level_drop_percentage = checkNum(ev.city_battery_level_drop_percentage, 0);
      const city_efficiency_kmpu = checkNum(ev.city_efficiency_kmpu, 0);
      const city_displayed_kmpu = checkNum(ev.city_displayed_kmpu, city_efficiency_kmpu);

      const highway_distance_km = checkNum(ev.highway_distance_km, 100);
      const highway_battery_level_drop_percentage = checkNum(ev.highway_battery_level_drop_percentage, 0);
      const highway_efficiency_kmpu = checkNum(ev.highway_efficiency_kmpu, 0);
      const highway_displayed_kmpu = checkNum(ev.highway_displayed_kmpu, highway_efficiency_kmpu);

      const avg_highway_speed_kmph = checkNum(ev.avg_highway_speed_kmph, 100);
      const charging_units_consumed = checkNum(ev.charging_units_consumed, 0);
      const home_charging_cost_per_unit_rs = checkNum(ev.home_charging_cost_per_unit_rs, 8.5);
      const public_charging_cost_per_unit_rs = checkNum(ev.public_charging_cost_per_unit_rs, 25);

      const realefficiency1 = city_efficiency_kmpu;
      const realefficiency2 = highway_efficiency_kmpu;

      // Extract min / max AC temp from string "21 to 25"
      const acTempRaw = ev.ac_temperature_between || "21 to 25";
      let min_ac_temp = "21";
      let max_ac_temp = "25";
      const parts = acTempRaw.split(/\s*to\s*|\s*-\s*/i);
      if (parts.length >= 2) {
        min_ac_temp = parts[0].trim();
        max_ac_temp = parts[1].trim();
      } else if (parts.length === 1 && parts[0]) {
        min_ac_temp = parts[0].trim();
        max_ac_temp = parts[0].trim();
      }

      // Calculations for the split efficiencies
      const efficiency_100_0_kmpu = ev.efficiency_100_0_kmpu !== undefined && ev.efficiency_100_0_kmpu !== null ? Number(ev.efficiency_100_0_kmpu) : realefficiency1;
      const efficiency_90_10_kmpu = ev.efficiency_90_10_kmpu !== undefined && ev.efficiency_90_10_kmpu !== null ? Number(ev.efficiency_90_10_kmpu) : (realefficiency1 * 0.9 + realefficiency2 * 0.1);
      const efficiency_80_20_kmpu = ev.efficiency_80_20_kmpu !== undefined && ev.efficiency_80_20_kmpu !== null ? Number(ev.efficiency_80_20_kmpu) : (realefficiency1 * 0.8 + realefficiency2 * 0.2);
      const efficiency_70_30_kmpu = ev.efficiency_70_30_kmpu !== undefined && ev.efficiency_70_30_kmpu !== null ? Number(ev.efficiency_70_30_kmpu) : (realefficiency1 * 0.7 + realefficiency2 * 0.3);
      const efficiency_60_40_kmpu = ev.efficiency_60_40_kmpu !== undefined && ev.efficiency_60_40_kmpu !== null ? Number(ev.efficiency_60_40_kmpu) : (realefficiency1 * 0.6 + realefficiency2 * 0.4);
      const efficiency_50_50_kmpu = ev.efficiency_50_50_kmpu !== undefined && ev.efficiency_50_50_kmpu !== null ? Number(ev.efficiency_50_50_kmpu) : (realefficiency1 * 0.5 + realefficiency2 * 0.5);
      const efficiency_40_60_kmpu = ev.efficiency_40_60_kmpu !== undefined && ev.efficiency_40_60_kmpu !== null ? Number(ev.efficiency_40_60_kmpu) : (realefficiency1 * 0.4 + realefficiency2 * 0.6);
      const efficiency_30_70_kmpu = ev.efficiency_30_70_kmpu !== undefined && ev.efficiency_30_70_kmpu !== null ? Number(ev.efficiency_30_70_kmpu) : (realefficiency1 * 0.3 + realefficiency2 * 0.7);
      const efficiency_20_80_kmpu = ev.efficiency_20_80_kmpu !== undefined && ev.efficiency_20_80_kmpu !== null ? Number(ev.efficiency_20_80_kmpu) : (realefficiency1 * 0.2 + realefficiency2 * 0.8);
      const efficiency_10_90_kmpu = ev.efficiency_10_90_kmpu !== undefined && ev.efficiency_10_90_kmpu !== null ? Number(ev.efficiency_10_90_kmpu) : (realefficiency1 * 0.1 + realefficiency2 * 0.9);
      const efficiency_0_100_kmpu = ev.efficiency_0_100_kmpu !== undefined && ev.efficiency_0_100_kmpu !== null ? Number(ev.efficiency_0_100_kmpu) : realefficiency2;

      // Calculations for the split ranges
      const range_100_0_km = ev.range_100_0_km ? Number(ev.range_100_0_km) : Math.round(efficiency_100_0_kmpu * batteryCapacity);
      const range_90_10_km = ev.range_90_10_km ? Number(ev.range_90_10_km) : Math.round(efficiency_90_10_kmpu * batteryCapacity);
      const range_80_20_km = ev.range_80_20_km ? Number(ev.range_80_20_km) : Math.round(efficiency_80_20_kmpu * batteryCapacity);
      const range_70_30_km = ev.range_70_30_km ? Number(ev.range_70_30_km) : Math.round(efficiency_70_30_kmpu * batteryCapacity);
      const range_60_40_km = ev.range_60_40_km ? Number(ev.range_60_40_km) : Math.round(efficiency_60_40_kmpu * batteryCapacity);
      const range_50_50_km = ev.range_50_50_km ? Number(ev.range_50_50_km) : Math.round(efficiency_50_50_kmpu * batteryCapacity);
      const range_40_60_km = ev.range_40_60_km ? Number(ev.range_40_60_km) : Math.round(efficiency_40_60_kmpu * batteryCapacity);
      const range_30_70_km = ev.range_30_70_km ? Number(ev.range_30_70_km) : Math.round(efficiency_30_70_kmpu * batteryCapacity);
      const range_20_80_km = ev.range_20_80_km ? Number(ev.range_20_80_km) : Math.round(efficiency_20_80_kmpu * batteryCapacity);
      const range_10_90_km = ev.range_10_90_km ? Number(ev.range_10_90_km) : Math.round(efficiency_10_90_kmpu * batteryCapacity);
      const range_0_100_km = ev.range_0_100_km ? Number(ev.range_0_100_km) : Math.round(efficiency_0_100_kmpu * batteryCapacity);

      // Calculations for costs per KM
      const home_cost_100_0_per_km = ev.home_cost_100_0_per_km !== undefined && ev.home_cost_100_0_per_km !== null ? Number(ev.home_cost_100_0_per_km) : (home_charging_cost_per_unit_rs / (efficiency_100_0_kmpu || 1));
      const home_cost_90_10_per_km = ev.home_cost_90_10_per_km !== undefined && ev.home_cost_90_10_per_km !== null ? Number(ev.home_cost_90_10_per_km) : (home_charging_cost_per_unit_rs / (efficiency_90_10_kmpu || 1));
      const home_cost_80_20_per_km = ev.home_cost_80_20_per_km !== undefined && ev.home_cost_80_20_per_km !== null ? Number(ev.home_cost_80_20_per_km) : (home_charging_cost_per_unit_rs / (efficiency_80_20_kmpu || 1));
      const home_cost_70_30_per_km = ev.home_cost_70_30_per_km !== undefined && ev.home_cost_70_30_per_km !== null ? Number(ev.home_cost_70_30_per_km) : (home_charging_cost_per_unit_rs / (efficiency_70_30_kmpu || 1));
      const home_cost_60_40_per_km = ev.home_cost_60_40_per_km !== undefined && ev.home_cost_60_40_per_km !== null ? Number(ev.home_cost_60_40_per_km) : (home_charging_cost_per_unit_rs / (efficiency_60_40_kmpu || 1));
      const home_cost_50_50_per_km = ev.home_cost_50_50_per_km !== undefined && ev.home_cost_50_50_per_km !== null ? Number(ev.home_cost_50_50_per_km) : (home_charging_cost_per_unit_rs / (efficiency_50_50_kmpu || 1));
      const home_cost_40_60_per_km = ev.home_cost_40_60_per_km !== undefined && ev.home_cost_40_60_per_km !== null ? Number(ev.home_cost_40_60_per_km) : (home_charging_cost_per_unit_rs / (efficiency_40_60_kmpu || 1));
      const home_cost_30_70_per_km = ev.home_cost_30_70_per_km !== undefined && ev.home_cost_30_70_per_km !== null ? Number(ev.home_cost_30_70_per_km) : (home_charging_cost_per_unit_rs / (efficiency_30_70_kmpu || 1));
      const home_cost_20_80_per_km = ev.home_cost_20_80_per_km !== undefined && ev.home_cost_20_80_per_km !== null ? Number(ev.home_cost_20_80_per_km) : (home_charging_cost_per_unit_rs / (efficiency_20_80_kmpu || 1));
      const home_cost_10_90_per_km = ev.home_cost_10_90_per_km !== undefined && ev.home_cost_10_90_per_km !== null ? Number(ev.home_cost_10_90_per_km) : (home_charging_cost_per_unit_rs / (efficiency_10_90_kmpu || 1));
      const home_cost_0_100_per_km = ev.home_cost_0_100_per_km !== undefined && ev.home_cost_0_100_per_km !== null ? Number(ev.home_cost_0_100_per_km) : (home_charging_cost_per_unit_rs / (efficiency_0_100_kmpu || 1));

      const public_cost_100_0_per_km = ev.public_cost_100_0_per_km !== undefined && ev.public_cost_100_0_per_km !== null ? Number(ev.public_cost_100_0_per_km) : (public_charging_cost_per_unit_rs / (efficiency_100_0_kmpu || 1));
      const public_cost_90_10_per_km = ev.public_cost_90_10_per_km !== undefined && ev.public_cost_90_10_per_km !== null ? Number(ev.public_cost_90_10_per_km) : (public_charging_cost_per_unit_rs / (efficiency_90_10_kmpu || 1));
      const public_cost_80_20_per_km = ev.public_cost_80_20_per_km !== undefined && ev.public_cost_80_20_per_km !== null ? Number(ev.public_cost_80_20_per_km) : (public_charging_cost_per_unit_rs / (efficiency_80_20_kmpu || 1));
      const public_cost_70_30_per_km = ev.public_cost_70_30_per_km !== undefined && ev.public_cost_70_30_per_km !== null ? Number(ev.public_cost_70_30_per_km) : (public_charging_cost_per_unit_rs / (efficiency_70_30_kmpu || 1));
      const public_cost_60_40_per_km = ev.public_cost_60_40_per_km !== undefined && ev.public_cost_60_40_per_km !== null ? Number(ev.public_cost_60_40_per_km) : (public_charging_cost_per_unit_rs / (efficiency_60_40_kmpu || 1));
      const public_cost_50_50_per_km = ev.public_cost_50_50_per_km !== undefined && ev.public_cost_50_50_per_km !== null ? Number(ev.public_cost_50_50_per_km) : (public_charging_cost_per_unit_rs / (efficiency_50_50_kmpu || 1));
      const public_cost_40_60_per_km = ev.public_cost_40_60_per_km !== undefined && ev.public_cost_40_60_per_km !== null ? Number(ev.public_cost_40_60_per_km) : (public_charging_cost_per_unit_rs / (efficiency_40_60_kmpu || 1));
      const public_cost_30_70_per_km = ev.public_cost_30_70_per_km !== undefined && ev.public_cost_30_70_per_km !== null ? Number(ev.public_cost_30_70_per_km) : (public_charging_cost_per_unit_rs / (efficiency_30_70_kmpu || 1));
      const public_cost_20_80_per_km = ev.public_cost_20_80_per_km !== undefined && ev.public_cost_20_80_per_km !== null ? Number(ev.public_cost_20_80_per_km) : (public_charging_cost_per_unit_rs / (efficiency_20_80_kmpu || 1));
      const public_cost_10_90_per_km = ev.public_cost_10_90_per_km !== undefined && ev.public_cost_10_90_per_km !== null ? Number(ev.public_cost_10_90_per_km) : (public_charging_cost_per_unit_rs / (efficiency_10_90_kmpu || 1));
      const public_cost_0_100_per_km = ev.public_cost_0_100_per_km !== undefined && ev.public_cost_0_100_per_km !== null ? Number(ev.public_cost_0_100_per_km) : (public_charging_cost_per_unit_rs / (efficiency_0_100_kmpu || 1));

      const sanitizeUrlSlug = (text: string): string => {
        return text
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-+|-+$/g, "");
      };

      const urlSlug = sanitizeUrlSlug(`${fullVehicleName}-ev-real-city-highway-range-test`);

      let content = `<b>Author:</b> Navneet\n\n`;
      content += `<b>URL:</b>\n${urlSlug}\n\n`;
      content += `<b>Meta Title:</b>\n${fullVehicleName} EV Actual City, Highway Range Test\n\n`;
      content += `<h1 style="font-size: 20pt; font-weight: normal; margin: 0 0 10px 0;">${fullVehicleName} Actual Range Test - Real-World City & Highway Plus Cost</h1>\n\n`;
      content += `<b>Meta:</b>\nWe have driven the ${fullVehicleName} in city and highway conditions to find out what actual range you can expect in city driving and highway.\n\n`;
      content += `<b>Image:</b>\n${fullVehicleName}\n\n`;
      content += `<b>Caption:</b>\n${fullVehicleName}\n\nReal-World Range City, Hwy Mileage Test\n\n`;

      content += `<p style="font-size: 11pt; font-weight: bold; margin: 0 0 8px 0;">Intro:</p>\n\n`;
      content += `In this article, we'll present the data based on V3Cars' range test and inform you about what real-world range you can expect from the ${fullVehicleName} electric car in city and highway driving conditions. We'll also find out how much the range numbers deviate from the manufacturer-claimed range figures. The information presented in this article will also help you learn about the range differences you can expect when driving in the city vs driving on the highway.\n\n`;

      content += `<p style="font-size: 11pt; font-weight: bold; margin: 0 0 8px 0;">Testing Method</p>\n\n`;
      content += `<p style="font-style: italic; font-size: 11pt; margin: 0 0 8px 0;">Before we provide the actual mileage of the ${fullVehicleName}, let's briefly explain our testing process so that you can decide if it matches your preferences, style and conditions for driving.\n\n <p style="font-style: italic; font-size: 11pt; margin: 0 0 8px 0;">We use the charge-to-similar-charge method for our real-world electric range tests. First, we charge the car to over 80 percent, reset the trip meter, and then begin our 100km city drive in Delhi NCR traffic. The test is conducted on the same route during weekdays to simulate realistic city driving conditions, while maintaining the same load to keep the results consistent. We also maintain the cabin temperature between ${min_ac_temp}°C and ${max_ac_temp}°C during the test.\n\n <p style="font-style: italic; font-size: 11pt; margin: 0 0 8px 0;"> For the city run, we use the highest regenerative braking setting available and enable one-pedal driving if the EV offers the feature. During the highway run, we select the adaptive or auto regenerative braking mode, where available, as it offers a more natural and relaxed cruising experience without requiring the driver to constantly manage regeneration levels for maximum efficiency. Across both city and highway tests, the drive mode is kept in Normal mode, since our goal is not to extract the highest possible efficiency figures, but to evaluate how the EV is likely to perform for most drivers in everyday driving situations.\n\n <p style="font-style: italic; font-size: 11pt; margin: 0 0 8px 0;"> Once the city run is complete, we note the drop in battery percentage and reset the trip metre before starting the highway range test. For the highway run, we use the stretch around Sohna on the Delhi-Mumbai Expressway and drive the car for around ~100km. After completing both runs, we recharge the battery back to the same level from where the test began and note the total units consumed. We then use the battery percentage drop recorded during the city and highway runs, along with the units charged, to calculate the car's real-world range in both driving conditions.</p>\n\n`;

      content += `<h3 style="font-size: 14pt; font-weight: normal; margin: 15px 0 10px 0;">What Is The Actual City Range Of ${make} ${model}?</h3>\n\n`;
      content += `Starting with a battery charge of ${battery_percentage} per cent, we drove the ${model} in the city traffic for ${city_distance_km}km. In our real-world city range test of ${model}, the battery percentage dropped by ${city_battery_level_drop_percentage}%. The displayed efficiency at the end of the run was ${city_displayed_kmpu.toFixed(2)}kmpu.\n\n`;

      let cityTableHtml = `<div class="workshop-table-container">`;
      cityTableHtml += `<table ${s.table} cellpadding="0" cellspacing="0">`;
      cityTableHtml += `<thead>`;
      cityTableHtml += `<tr><th colspan="2" style="border: 1px solid #000000; padding: 8px 10px; font-weight: bold; text-align: center; vertical-align: middle; font-size: 11pt;"><b>${make.toUpperCase()} ${model.toUpperCase()} RANGE TEST | CITY EFFICIENCY REPORT</b></th></tr>`;
      cityTableHtml += `</thead>`;
      cityTableHtml += `<tbody>`;
      cityTableHtml += `<tr><td ${s.thTd}>Battery Level Drop</td><td ${s.td}>${city_battery_level_drop_percentage}%</td></tr>`;
      cityTableHtml += `<tr><td ${s.thTd}>Displayed Efficiency</td><td ${s.td}>${city_displayed_kmpu.toFixed(2)}kmpu</td></tr>`;
      cityTableHtml += `</tbody>`;
      cityTableHtml += `</table>`;
      cityTableHtml += `</div>`;
      content += cityTableHtml + `\n\n`;
      

      content += `<h3 style="font-size: 14pt; font-weight: normal; margin: 15px 0 10px 0;">What Is The Real Highway Range Of ${make} ${model}?</h3>\n\n`;
      content += `We headed out on a ${highway_distance_km}km run on the Delhi-Mumbai expressway to test the highway range of the ${model}. During the highway run, our average speed was ${avg_highway_speed_kmph}kmph. In our real-world highway range test of ${model}, the displayed efficiency at the end of the run was ${highway_displayed_kmpu.toFixed(2)}kmpu. After the drive, we recharged the ${model} to ${battery_percentage} per cent, using ${charging_units_consumed} units of electricity and incurred a bill of Rs. ${Math.round(charging_units_consumed * public_charging_cost_per_unit_rs)} with a charging cost of Rs. ${public_charging_cost_per_unit_rs} pu in Gurgaon, Haryana.\n\n`;

      let highwayTableHtml = `<div class="workshop-table-container">`;
      highwayTableHtml += `<table ${s.table} cellpadding="0" cellspacing="0">`;
      highwayTableHtml += `<thead>`;
      highwayTableHtml += `<tr><th colspan="2" style="border: 1px solid #000000; padding: 10px 8px; font-weight: bold; text-align: center; vertical-align: middle; font-size: 11pt;"><b>${make.toUpperCase()} ${model.toUpperCase()} RANGE TEST | HIGHWAY EFFICIENCY REPORT</b></th></tr>`;
      highwayTableHtml += `</thead>`;
      highwayTableHtml += `<tbody>`;
      highwayTableHtml += `<tr><td ${s.thTd}>Battery Level Drop</td><td ${s.td}>${highway_battery_level_drop_percentage}%</td></tr>`;
      highwayTableHtml += `<tr><td ${s.thTd}>Displayed Efficiency</td><td ${s.td}>${highway_displayed_kmpu.toFixed(2)}kmpu</td></tr>`;
      highwayTableHtml += `</tbody>`;
      highwayTableHtml += `</table>`;
      highwayTableHtml += `</div>`;
      content += highwayTableHtml + `\n\n`;

      content += `<p ${s.p}><b>Note:</b> If you want to buy a new car, <a href="https://www.v3cars.com/car-loan-emi-calculator"><u><i>Calculate Car Loan EMI</i></u></a> with <b>V3Cars</b>.</p>\n\n`;

      content += `<h3 style="font-size: 14pt; font-weight: normal; margin: 15px 0 10px 0;">Claimed Electric Range Vs Actual Highway/City Range Of ${make} ${model} — What's The Difference?</h3>\n\n`;

      content += `Based on our range test, the ${model} gave us a city range of ${range_100_0_km}km. On the highways, we saw the range drop to ${range_0_100_km}km.\n\n`;

      const battery_drop_difference = highway_battery_level_drop_percentage - city_battery_level_drop_percentage;
      let b_diff_str = "-";
      if (battery_drop_difference > 0) {
        b_diff_str = `${battery_drop_difference}%`;
      } else if (battery_drop_difference < 0) {
        b_diff_str = `${battery_drop_difference}%`;
      }

      const efficiency_difference = highway_displayed_kmpu - city_displayed_kmpu;
      let eff_diff_str = "0kmpu";
      if (efficiency_difference > 0) {
        eff_diff_str = `${efficiency_difference.toFixed(2)}kmpu`;
      } else if (efficiency_difference < 0) {
        eff_diff_str = `${Math.abs(efficiency_difference).toFixed(2)}kmpu`;
      }
// Added range difference calculation and string formatting
      const distance_difference = highway_distance_km - city_distance_km;
      let distance_difference_str = "0km";
      if (distance_difference > 0) {
        distance_difference_str = `${distance_difference.toFixed(1)}km`;
      } else if (distance_difference < 0) {
        distance_difference_str = `${Math.abs(distance_difference).toFixed(1)}km`;
      }

      const real_eff_diff = realefficiency2 - realefficiency1;
      const real_eff_diff_str = real_eff_diff > 0 ? `${real_eff_diff.toFixed(2)}kmpu` : real_eff_diff < 0 ? `${Math.abs(real_eff_diff).toFixed(2)}kmpu` : "0kmpu";

      const city_diff = city_displayed_kmpu - realefficiency1;
      const city_diff_str = city_diff > 0 ? `+${city_diff.toFixed(2)}kmpu` : city_diff < 0 ? `-${Math.abs(city_diff).toFixed(2)}kmpu` : "0kmpu";

      const highway_diff = highway_displayed_kmpu - realefficiency2;
      const highway_diff_str = highway_diff > 0 ? `+${highway_diff.toFixed(2)}kmpu` : highway_diff < 0 ? `-${Math.abs(highway_diff).toFixed(2)}kmpu` : "0kmpu";

      const diff_of_diffs = highway_diff - city_diff;
      const diff_of_diffs_str = diff_of_diffs > 0 ? `+${diff_of_diffs.toFixed(2)}kmpu` : diff_of_diffs < 0 ? `-${Math.abs(diff_of_diffs).toFixed(2)}kmpu` : "0kmpu";

      let compTableHtml = `<div class="workshop-table-container">`;
      compTableHtml += `<table ${s.table} cellpadding="0" cellspacing="0">`;
      compTableHtml += `<thead>`;
      compTableHtml += `<tr><th colspan="4" style="border: 1px solid #000000; padding: 10px 8px; font-weight: bold; text-align: center; vertical-align: middle; font-size: 11pt;"><b>${make.toUpperCase()} ${model.toUpperCase()} RANGE TEST | EFFICIENCY REPORT</b></th></tr>`;
      compTableHtml += `<tr>`;
      compTableHtml += `<th ${s.thTd}></th>`;
      compTableHtml += `<th ${s.thTd}><b>City</b></th>`;
      compTableHtml += `<th ${s.thTd}><b>Difference</b></th>`;
      compTableHtml += `<th ${s.thTd}><b>Highway</b></th>`;
      compTableHtml += `</tr>`;
      compTableHtml += `</thead>`;
      compTableHtml += `<tbody>`;
      compTableHtml += `<tr>`;
      compTableHtml += `<td ${s.thTd}>Distance</td>`;
      compTableHtml += `<td ${s.td}>${city_distance_km}km</td>`;
      compTableHtml += `<td ${s.td}>${distance_difference_str}</td>`;
      compTableHtml += `<td ${s.td}>${highway_distance_km}km</td>`;
      compTableHtml += `</tr>`;
      compTableHtml += `<tr>`;
      compTableHtml += `<td ${s.thTd}>Battery Level Drop</td>`;
      compTableHtml += `<td ${s.td}>${city_battery_level_drop_percentage}%</td>`;
      compTableHtml += `<td ${s.td}>${b_diff_str}</td>`;
      compTableHtml += `<td ${s.td}>${highway_battery_level_drop_percentage}%</td>`;
      compTableHtml += `</tr>`;
      compTableHtml += `<tr>`;
      compTableHtml += `<td ${s.thTd}>Displayed Efficiency</td>`;
      compTableHtml += `<td ${s.td}>${city_displayed_kmpu.toFixed(2)}kmpu</td>`;
      compTableHtml += `<td ${s.td}>${eff_diff_str}</td>`;
      compTableHtml += `<td ${s.td}>${highway_displayed_kmpu.toFixed(2)}kmpu</td>`;
      compTableHtml += `</tr>`;
      compTableHtml += `<tr>`;
      compTableHtml += `<td ${s.thTd}>Difference</td>`;
      compTableHtml += `<td ${s.td}>${city_diff_str}</td>`;
      compTableHtml += `<td ${s.td}>${diff_of_diffs_str}</td>`;
      compTableHtml += `<td ${s.td}>${highway_diff_str}</td>`;
      compTableHtml += `</tr>`;
      compTableHtml += `<tr>`;
      compTableHtml += `<td ${s.thTd}>Real Efficiency</td>`;
      compTableHtml += `<td ${s.td}>${realefficiency1.toFixed(2)}kmpu</td>`;
      compTableHtml += `<td ${s.td}>${real_eff_diff_str}</td>`;
      compTableHtml += `<td ${s.td}>${realefficiency2.toFixed(2)}kmpu</td>`;
      compTableHtml += `</tr>`;
      compTableHtml += `</tbody>`;
      compTableHtml += `</table>`;
      compTableHtml += `</div>`;
      content += compTableHtml + `\n\n`;

      const city_range = range_100_0_km;
      const highway_range = range_0_100_km;

      const city_deviation = claimedRange > 0 ? ((claimedRange - city_range) / claimedRange) * 100 : 0;
      const highway_deviation = claimedRange > 0 ? ((claimedRange - highway_range) / claimedRange) * 100 : 0;

      const claimed_efficiency = batteryCapacity > 0 ? claimedRange / batteryCapacity : 0;
      const city_efficiency_diff = realefficiency1 - claimed_efficiency;
      const city_more_less = city_efficiency_diff >= 0 ? "more" : "less";

      content += `Compared to the official claimed range figure of the ${model}, its city efficiency turned out to be ${Math.abs(city_efficiency_diff).toFixed(2)}kmpu ${city_more_less} efficient. Thus, showing a ${Math.abs(city_deviation).toFixed(2)}% deviation from the claimed figure.\n\n`;

      const city_deviation_val = claimedRange > 0 ? `${city_deviation.toFixed(2)}%` : "Data not available";
      const highway_deviation_val = claimedRange > 0 ? `${highway_deviation.toFixed(2)}%` : "Data not available";

      let deviationTableHtml = `<div class="workshop-table-container">`;
      deviationTableHtml += `<table ${s.table} cellpadding="0" cellspacing="0">`;
      deviationTableHtml += `<thead>`;
      deviationTableHtml += `<tr><th colspan="2" style="border: 1px solid #000000; padding: 10px 8px; font-weight: bold; text-align: center; vertical-align: middle; font-size: 11pt;"><b>${make.toUpperCase()} ${model.toUpperCase()}<br/>CLAIMED VS REAL RANGE COMPARISON</b></th></tr>`;
      deviationTableHtml += `</thead>`;
      deviationTableHtml += `<tbody>`;
      deviationTableHtml += `<tr><td ${s.thTd}><b>City Deviation</b></td><td ${s.td}>${city_deviation_val}</td></tr>`;
      deviationTableHtml += `<tr><td ${s.thTd}><b>City Range</b></td><td ${s.td}>${city_range ? `${city_range}km` : "Data not available"}</td></tr>`;
      deviationTableHtml += `<tr><td ${s.thTd}><b><u>Claimed Range</u></b></td><td ${s.td}>${claimedRange ? `${claimedRange}km` : "Data not available"}</td></tr>`;
      deviationTableHtml += `<tr><td ${s.thTd}><b>Highway Range</b></td><td ${s.td}>${highway_range ? `${highway_range}km` : "Data not available"}</td></tr>`;
      deviationTableHtml += `<tr><td ${s.thTd}><b>Highway Deviation</b></td><td ${s.td}>${highway_deviation_val}</td></tr>`;
      deviationTableHtml += `</tbody>`;
      deviationTableHtml += `</table>`;
      deviationTableHtml += `</div>`;
      content += deviationTableHtml + `\n\n`;

      content += `In terms of highway efficiency, we achieved a figure of ${realefficiency2.toFixed(2)}kmpu with the ${model} we drove. Thus, the deviation in the highway efficiency of ${model} is about ${Math.abs(highway_deviation).toFixed(2)}%.\n\n`;

      content += `<h3 style="font-size: 14pt; font-weight: normal; margin: 15px 0 10px 0;">${make} ${model} — Actual City vs Highway EV Range, Custom Real Range Comparison</h3>\n\n`;

      content += `If your driving happens entirely on the highways or just within the city, then you know what efficiency you can expect from the ${make} ${model}. However, for those who have a mixed usage, we have compiled combinations of effective range of ${model} based on the variations of city-highway driving ratio.\n\n`;
      content += `Using these customised city-highway combinations, you can better gauge what realistic efficiency and range on a full charge you can expect from the ${model}.\n\n`;

      let mixedTableHtml = `<div class="workshop-table-container">`;
      mixedTableHtml += `<table ${s.table} cellpadding="0" cellspacing="0">`;
      mixedTableHtml += `<thead>`;
      mixedTableHtml += `<tr><th colspan="4" style="border: 1px solid #000000; padding: 10px 8px; font-weight: bold; text-align: center; vertical-align: middle; font-size: 11pt;"><b>${make.toUpperCase()} ${model.toUpperCase()} — CUSTOM REAL RANGE ESTIMATE</b></th></tr>`;
      mixedTableHtml += `<tr>`;
      mixedTableHtml += `<th ${s.thTd}><b>City(%)</b></th>`;
      mixedTableHtml += `<th ${s.thTd}><b>Highway(%)</b></th>`;
      mixedTableHtml += `<th ${s.thTd}><b>Mixed Real Efficiency (kmpu)</b></th>`;
      mixedTableHtml += `<th ${s.thTd}><b>Actual Range (km)</b></th>`;
      mixedTableHtml += `</tr>`;
      mixedTableHtml += `</thead>`;
      mixedTableHtml += `<tbody>`;
      mixedTableHtml += `<tr><td ${s.td}>100</td><td ${s.td}>0</td><td ${s.td}>${Number(efficiency_100_0_kmpu).toFixed(2)}</td><td ${s.td}>${range_100_0_km}km</td></tr>`;
      mixedTableHtml += `<tr><td ${s.td}>70</td><td ${s.td}>30</td><td ${s.td}>${Number(efficiency_70_30_kmpu).toFixed(2)}</td><td ${s.td}>${range_70_30_km}km</td></tr>`;
      mixedTableHtml += `<tr><td ${s.td}>50</td><td ${s.td}>50</td><td ${s.td}>${Number(efficiency_50_50_kmpu).toFixed(2)}</td><td ${s.td}>${range_50_50_km}km</td></tr>`;
      mixedTableHtml += `<tr><td ${s.td}>30</td><td ${s.td}>70</td><td ${s.td}>${Number(efficiency_30_70_kmpu).toFixed(2)}</td><td ${s.td}>${range_30_70_km}km</td></tr>`;
      mixedTableHtml += `<tr><td ${s.td}>0</td><td ${s.td}>100</td><td ${s.td}>${Number(efficiency_0_100_kmpu).toFixed(2)}</td><td ${s.td}>${range_0_100_km}km</td></tr>`;
      mixedTableHtml += `</tbody>`;
      mixedTableHtml += `</table>`;
      mixedTableHtml += `</div>`;
      content += mixedTableHtml + `\n\n`;

      content += `<p style="font-style: italic; font-size: 10pt; line-height: 1.15; margin: 0; padding: 0;">*City efficiency: ${realefficiency1.toFixed(2)}kmpu; Highway efficiency: ${realefficiency2.toFixed(2)}kmpu</p>\n\n`;

      content += `Based on these combinations, for a 70% city and 30% highway usage, you can expect a real world efficiency of ${Number(efficiency_70_30_kmpu).toFixed(2)}kmpu. With a flipped combination, where you drive the ${model} 70% on the highways and 30% in the city, you should expect your real-world efficiency figure to hover around ${Number(efficiency_30_70_kmpu).toFixed(2)}kmpu.\n\n`;
      content += `For an even split of 50% city and 50% highway usage, your real efficiency with the ${model} is likely to be closer to ${Number(efficiency_50_50_kmpu).toFixed(2)}kmpu.\n\n`;

      content += `<h3 style="font-size: 14pt; font-weight: normal; margin: 15px 0 10px 0;">Real Driving Range (Per Full Charge) and Driving Cost Of ${make} ${model} For Your Driving Requirements</h3>\n\n`;

      content += `The ${make} ${model} comes with a ${batteryCapacity}-kWh battery pack. With this capacity and the real-world efficiency estimates, you can expect to get a range of ${range_0_100_km}km to ${range_100_0_km}km depending on whether your driving is entirely within the city or on the highways.\n\n`;

      content += `With a 70-30 driving split in favour of city usage, you can expect a range of ${range_70_30_km}km from the ${model}. However, if you flip the driving condition to 30-70 in favour of highway, then you should expect a range of ${range_30_70_km}km on a full charge. On an even split of 50% city driving and 50% highway driving, you will have a range of ${range_50_50_km}km.\n\n`;

      let realisticRangeTableHtml = `<div class="workshop-table-container">`;
      realisticRangeTableHtml += `<table ${s.table} cellpadding="0" cellspacing="0">`;
      realisticRangeTableHtml += `<thead>`;
      realisticRangeTableHtml += `<tr><th colspan="2" style="border: 1px solid #000000; padding: 10px 8px; font-weight: bold; text-align: center; vertical-align: middle; font-size: 11pt;"><b>${make.toUpperCase()} ${model.toUpperCase()}<br/>CUSTOM REALISTIC RANGE ON FULL CHARGE</b></th></tr>`;
      realisticRangeTableHtml += `<tr>`;
      realisticRangeTableHtml += `<th ${s.thTd}><b>City-Hwy Usage (% Split)</b></th>`;
      realisticRangeTableHtml += `<th ${s.thTd}><b>Estimated Real Range</b></th>`;
      realisticRangeTableHtml += `</tr>`;
      realisticRangeTableHtml += `</thead>`;
      realisticRangeTableHtml += `<tbody>`;
      realisticRangeTableHtml += `<tr><td ${s.td}>0-100%</td><td ${s.td}>${range_0_100_km}km</td></tr>`;
      realisticRangeTableHtml += `<tr><td ${s.td}>10-90%</td><td ${s.td}>${range_10_90_km}km</td></tr>`;
      realisticRangeTableHtml += `<tr><td ${s.td}>20-80%</td><td ${s.td}>${range_20_80_km}km</td></tr>`;
      realisticRangeTableHtml += `<tr><td ${s.td}>30-70%</td><td ${s.td}>${range_30_70_km}km</td></tr>`;
      realisticRangeTableHtml += `<tr><td ${s.td}>40-60%</td><td ${s.td}>${range_40_60_km}km</td></tr>`;
      realisticRangeTableHtml += `<tr><td ${s.td}>50-50%</td><td ${s.td}>${range_50_50_km}km</td></tr>`;
      realisticRangeTableHtml += `<tr><td ${s.td}>60-40%</td><td ${s.td}>${range_60_40_km}km</td></tr>`;
      realisticRangeTableHtml += `<tr><td ${s.td}>70-30%</td><td ${s.td}>${range_70_30_km}km</td></tr>`;
      realisticRangeTableHtml += `<tr><td ${s.td}>80-20%</td><td ${s.td}>${range_80_20_km}km</td></tr>`;
      realisticRangeTableHtml += `<tr><td ${s.td}>90-10%</td><td ${s.td}>${range_10_90_km}km</td></tr>`;
      realisticRangeTableHtml += `<tr><td ${s.td}>100-0%</td><td ${s.td}>${range_100_0_km}km</td></tr>`;
      realisticRangeTableHtml += `</tbody>`;
      realisticRangeTableHtml += `</table>`;
      realisticRangeTableHtml += `</div>`;
      content += realisticRangeTableHtml + `\n\n`;

      content += `To calculate how much it will cost you to drive the ${make} ${model}, we have to make some assumptions. First, if you predominantly charge your EV at home, we are assuming a per unit cost of Rs. ${home_charging_cost_per_unit_rs} - this can of course change based on your location, local tariff structure, overall electricity consumption and more, but we are taking an average of home electricity charges across India.\n\n`;
      content += `Second, if you charge at a public charger, the per unit cost will vary depending on the charger operator and the charging speed offered - we are using an average cost of Rs. ${public_charging_cost_per_unit_rs} pu for the following chart.\n\n`;

      let costTableHtml = `<div class="workshop-table-container">`;
      costTableHtml += `<table ${s.table} cellpadding="0" cellspacing="0">`;
      costTableHtml += `<thead>`;
      costTableHtml += `<tr><th colspan="4" style="border: 1px solid #000000; padding: 10px 8px; font-weight: bold; text-align: center; vertical-align: middle; font-size: 11pt;"><b>${make.toUpperCase()} ${model.toUpperCase()}<br/>RUNNING COST ESTIMATION</b></th></tr>`;
      costTableHtml += `<tr>`;
      costTableHtml += `<th ${s.thTd}><b>City-Hwy Usage (% Split)</b></th>`;
      costTableHtml += `<th ${s.thTd}><b>Mixed Real Efficiency (kmpu)</b></th>`;
      costTableHtml += `<th ${s.thTd}><b>Cost per KM (Home Charging @ Rs. ${home_charging_cost_per_unit_rs} pu)</b></th>`;
      costTableHtml += `<th ${s.thTd}><b>Cost per KM (Public Charging @ Rs. ${public_charging_cost_per_unit_rs} pu)</b></th>`;
      costTableHtml += `</tr>`;
      costTableHtml += `</thead>`;
      costTableHtml += `<tbody>`;
      costTableHtml += `<tr><td ${s.td}>0-100%</td><td ${s.td}>${Number(efficiency_0_100_kmpu).toFixed(2)}</td><td ${s.td}>Rs. ${Number(home_cost_0_100_per_km).toFixed(3)}</td><td ${s.td}>Rs. ${Number(public_cost_0_100_per_km).toFixed(3)}</td></tr>`;
      costTableHtml += `<tr><td ${s.td}>10-90%</td><td ${s.td}>${Number(efficiency_10_90_kmpu).toFixed(2)}</td><td ${s.td}>Rs. ${Number(home_cost_10_90_per_km).toFixed(3)}</td><td ${s.td}>Rs. ${Number(public_cost_10_90_per_km).toFixed(3)}</td></tr>`;
      costTableHtml += `<tr><td ${s.td}>20-80%</td><td ${s.td}>${Number(efficiency_20_80_kmpu).toFixed(2)}</td><td ${s.td}>Rs. ${Number(home_cost_20_80_per_km).toFixed(3)}</td><td ${s.td}>Rs. ${Number(public_cost_20_80_per_km).toFixed(3)}</td></tr>`;
      costTableHtml += `<tr><td ${s.td}>30-70%</td><td ${s.td}>${Number(efficiency_30_70_kmpu).toFixed(2)}</td><td ${s.td}>Rs. ${Number(home_cost_30_70_per_km).toFixed(3)}</td><td ${s.td}>Rs. ${Number(public_cost_30_70_per_km).toFixed(3)}</td></tr>`;
      costTableHtml += `<tr><td ${s.td}>40-60%</td><td ${s.td}>${Number(efficiency_40_60_kmpu).toFixed(2)}</td><td ${s.td}>Rs. ${Number(home_cost_40_60_per_km).toFixed(3)}</td><td ${s.td}>Rs. ${Number(public_cost_40_60_per_km).toFixed(3)}</td></tr>`;
      costTableHtml += `<tr><td ${s.td}>50-50%</td><td ${s.td}>${Number(efficiency_50_50_kmpu).toFixed(2)}</td><td ${s.td}>Rs. ${Number(home_cost_50_50_per_km).toFixed(3)}</td><td ${s.td}>Rs. ${Number(public_cost_50_50_per_km).toFixed(3)}</td></tr>`;
      costTableHtml += `<tr><td ${s.td}>60-40%</td><td ${s.td}>${Number(efficiency_60_40_kmpu).toFixed(2)}</td><td ${s.td}>Rs. ${Number(home_cost_60_40_per_km).toFixed(3)}</td><td ${s.td}>Rs. ${Number(public_cost_60_40_per_km).toFixed(3)}</td></tr>`;
      costTableHtml += `<tr><td ${s.td}>70-30%</td><td ${s.td}>${Number(efficiency_70_30_kmpu).toFixed(2)}</td><td ${s.td}>Rs. ${Number(home_cost_70_30_per_km).toFixed(3)}</td><td ${s.td}>Rs. ${Number(public_cost_70_30_per_km).toFixed(3)}</td></tr>`;
      costTableHtml += `<tr><td ${s.td}>80-20%</td><td ${s.td}>${Number(efficiency_80_20_kmpu).toFixed(2)}</td><td ${s.td}>Rs. ${Number(home_cost_80_20_per_km).toFixed(3)}</td><td ${s.td}>Rs. ${Number(public_cost_80_20_per_km).toFixed(3)}</td></tr>`;
      costTableHtml += `<tr><td ${s.td}>90-10%</td><td ${s.td}>${Number(efficiency_90_10_kmpu).toFixed(2)}</td><td ${s.td}>Rs. ${Number(home_cost_90_10_per_km).toFixed(3)}</td><td ${s.td}>Rs. ${Number(public_cost_90_10_per_km).toFixed(3)}</td></tr>`;
      costTableHtml += `<tr><td ${s.td}>100-0%</td><td ${s.td}>${Number(efficiency_100_0_kmpu).toFixed(2)}</td><td ${s.td}>Rs. ${Number(home_cost_100_0_per_km).toFixed(3)}</td><td ${s.td}>Rs. ${Number(public_cost_100_0_per_km).toFixed(3)}</td></tr>`;
      costTableHtml += `</tbody>`;
      costTableHtml += `</table>`;
      costTableHtml += `</div>`;
      content += costTableHtml + `\n\n`;

      content += `Per our calculations, depending on where you charge the ${make} ${model}, the per km cost of driving it in the city can range from Rs. ${home_cost_100_0_per_km.toFixed(2)} to Rs. ${public_cost_100_0_per_km.toFixed(2)}.\n\n`;
      content += `If your driving situation is completely on the highway instead, you will end up spending anywhere from Rs. ${home_cost_0_100_per_km.toFixed(3)}per km to Rs. ${public_cost_0_100_per_km.toFixed(3)}per km instead.\n\n`;

      const ev_lower_higher_str = ((city_range + highway_range) / 2) < claimedRange ? "lower" : "higher";
      content += `<h3>Conclusion:</h3>\n\n`;
      content += `<p ${s.p}>The ${make} ${model} delivered a real-world range of ${city_range}km in city driving and ${highway_range}km on highways, which is ${ev_lower_higher_str} than its claimed range of ${claimedRange}km. For most users with mixed driving conditions, a practical full-charge range of around ${range_50_50_km}km can be expected. Despite the difference from the claimed figures, the ${make} ${model} remains an efficient EV with low running costs, making it a viable option for daily commuting and long-distance travel.</p>\n\n`;

      content += `<p ${s.p}>Find out how the complete list of real-world range of EVs tested by V3Cars:</p>\n\n`;
      content += `<p ${s.p}><b><i><a href="https://www.v3cars.com/news/ev-real-world-claimed-range-comparison">All V3Cars-Tested EV Cars Real-World Vs Claimed Range Comparison</a></b></i></p>\n\n`;

      setArticle(content);

      const artId = slugify(`${make}-${model}-ev-range-test`);
      await setDoc(doc(db, "articles", artId), {
        articleType: "ev-range",
        brandName: make,
        modelName: model,
        content,
        updatedAt: serverTimestamp()
      }, { merge: true });

      setIsGenerating(false);
    } catch (err: any) {
      console.error(err);
      setIsGenerating(false);
    }
  };

  // GENERATE FUEL EFFICIENCY TEST ARTICLE
  const generateFuelEfficiencyArticle = async () => {
    if (!selectedEvId) return;
    setIsGenerating(true);
    try {
      const ev = evModels.find(e => e.id === selectedEvId);
      if (!ev) {
        setIsGenerating(false);
        return;
      }

      const checkVal = (v: any, fallback: string = "Data not available") => {
        if (v === null || v === undefined || v === "") return fallback;
        return String(v).trim();
      };

      const checkNum = (v: any, fallback: number = 0) => {
        if (v === null || v === undefined || isNaN(Number(v)) || String(v).trim() === "") return fallback;
        return Number(v);
      };

      const brand = checkVal(ev.brand);
      const model = checkVal(ev.model);
      const variant = checkVal(ev.variant, "");
      const fuel_type = checkVal(ev.fuel_type);
      const transmission = checkVal(ev.transmission);
      const test_year = checkVal(ev.test_year);

      const fuel_tank_capacity_l = checkNum(ev.fuel_tank_capacity_l);
      const fuel_price_per_litre = checkNum(ev.fuel_price_per_litre);
      const claimed_mileage_kmpl = checkNum(ev.claimed_mileage_kmpl);
      const real_mileage_kmpl = checkNum(ev.real_mileage_kmpl);

      const city_distance_km = checkNum(ev.city_distance_km, 100);
      const city_time_hours = checkVal(ev.city_time_hours);
      const city_avg_speed_kmph = checkNum(ev.city_avg_speed_kmph || ev.avg_city_speed_kmph);
      const city_fuel_consumed_l = checkNum(ev.city_fuel_consumed_l);
      const city_efficiency_kmpl = checkNum(ev.city_efficiency_kmpl);
      const city_displayed_efficiency_kmpl = checkNum(ev.city_displayed_efficiency_kmpl);

      const highway_distance_km = checkNum(ev.highway_distance_km, 100);
      const highway_time_hours = checkVal(ev.highway_time_hours);
      const highway_avg_speed_kmph = checkNum(ev.highway_avg_speed_kmph || ev.avg_highway_speed_kmph);
      const highway_fuel_consumed_l = checkNum(ev.highway_fuel_consumed_l);
      const highway_efficiency_kmpl = checkNum(ev.highway_efficiency_kmpl);
      const highway_displayed_efficiency_kmpl = checkNum(ev.highway_displayed_efficiency_kmpl);

      const city_deviation_percentage = checkNum(ev.city_deviation_percentage);
      const highway_deviation_percentage = checkNum(ev.highway_deviation_percentage);

      // --- CRITICAL DATA FORMATTING RULES ---
      const formatTimeVal = (val: any): string => {
        const str = String(val || "").trim();
        if (!str) return "Data not available";
        if (str.includes(":")) {
          const parts = str.split(":");
          const h = parseInt(parts[0], 10) || 0;
          const m = parseInt(parts[1], 10) || 0;
          if (h === 0) return `${m}mins`;
          return `${h}${h > 1 ? "hrs" : "hr"} ${String(m).padStart(2, '0')}mins`;
        }
        const num = Number(str);
        if (!isNaN(num)) {
          // Handle colon-stripped times like 130 (1:30) or 400 (4:00)
          if (num >= 100 && num <= 2400 && Number.isInteger(num)) {
            const h = Math.floor(num / 100);
            const m = num % 100;
            if (h === 0) return `${m}mins`;
            return `${h}${h > 1 ? "hrs" : "hr"} ${String(m).padStart(2, '0')}mins`;
          }
          const h = Math.floor(num);
          const m = Math.round((num - h) * 60);
          if (h === 0) return `${m}mins`;
          return `${h}${h > 1 ? "hrs" : "hr"} ${String(m).padStart(2, '0')}mins`;
        }
        return str;
      };

      const formatDistanceVal = (val: number): string => {
        return `${val}km`;
      };

      const formatSpeedVal = (val: number): string => {
        return `${val}kmph`;
      };

      const formatMileageVal = (val: number): string => {
        return `${val.toFixed(2)}kmpl`;
      };

      const formatFuelQty = (val: number): string => {
        return `${val.toFixed(2)} litres`;
      };

      // Table formatting styling dictionary
      const s = {
        table: 'style="border-collapse: collapse; width: 100%; border: 1px solid #000; margin: 10px 0; font-family: Arial, sans-serif; background: #fff; line-height: 1.15; font-size: 10pt;"',
        thTd: 'style="border: 1px solid #000; padding: 10px 8px; text-align: center; font-size: 10pt; vertical-align: middle; line-height: 1.15; color: #000; font-weight: normal;"',
        td: 'style="border: 1px solid #000; padding: 10px 8px; text-align: center; vertical-align: middle; background-color: #ffffff; font-size: 10pt; line-height: 1.15;"',
        p: 'style="line-height: 1.15; margin: 0; padding: 0;"'
      };

      // Resolve weighted efficiencies for splits
      const getEffVal = (dbVal: any, cityWeight: number, hwyWeight: number) => {
        if (dbVal !== undefined && dbVal !== null && dbVal !== 0 && !isNaN(Number(dbVal))) {
          return Number(dbVal);
        }
        return (city_efficiency_kmpl * cityWeight + highway_efficiency_kmpl * hwyWeight);
      };

      const efficiency_0_100_kmpl = getEffVal(ev.efficiency_0_100_kmpl, 0, 1.0);
      const efficiency_10_90_kmpl = getEffVal(ev.efficiency_10_90_kmpl, 0.1, 0.9);
      const efficiency_20_80_kmpl = getEffVal(ev.efficiency_20_80_kmpl, 0.2, 0.8);
      const efficiency_30_70_kmpl = getEffVal(ev.efficiency_30_70_kmpl, 0.3, 0.7);
      const efficiency_40_60_kmpl = getEffVal(ev.efficiency_40_60_kmpl, 0.4, 0.6);
      const efficiency_50_50_kmpl = getEffVal(ev.efficiency_50_50_kmpl, 0.5, 0.5);
      const efficiency_60_40_kmpl = getEffVal(ev.efficiency_60_40_kmpl, 0.6, 0.4);
      const efficiency_70_30_kmpl = getEffVal(ev.efficiency_70_30_kmpl, 0.7, 0.3);
      const efficiency_80_20_kmpl = getEffVal(ev.efficiency_80_20_kmpl, 0.8, 0.2);
      const efficiency_90_10_kmpl = getEffVal(ev.efficiency_90_10_kmpl, 0.9, 0.1);
      const efficiency_100_0_kmpl = getEffVal(ev.efficiency_100_0_kmpl, 1.0, 0);

      const getCostVal = (dbVal: any, efficiency: number) => {
        if (dbVal !== undefined && dbVal !== null && dbVal !== 0 && !isNaN(Number(dbVal))) {
          return Number(dbVal);
        }
        return efficiency > 0 ? (fuel_price_per_litre / efficiency) : 0;
      };

      const cost_0_100_per_km = getCostVal(ev.cost_0_100_per_km, efficiency_0_100_kmpl);
      const cost_10_90_per_km = getCostVal(ev.cost_10_90_per_km, efficiency_10_90_kmpl);
      const cost_20_80_per_km = getCostVal(ev.cost_20_80_per_km, efficiency_20_80_kmpl);
      const cost_30_70_per_km = getCostVal(ev.cost_30_70_per_km, efficiency_30_70_kmpl);
      const cost_40_60_per_km = getCostVal(ev.cost_40_60_per_km, efficiency_40_60_kmpl);
      const cost_50_50_per_km = getCostVal(ev.cost_50_50_per_km, efficiency_50_50_kmpl);
      const cost_60_40_per_km = getCostVal(ev.cost_60_40_per_km, efficiency_60_40_kmpl);
      const cost_70_30_per_km = getCostVal(ev.cost_70_30_per_km, efficiency_70_30_kmpl);
      const cost_80_20_per_km = getCostVal(ev.cost_80_20_per_km, efficiency_80_20_kmpl);
      const cost_90_10_per_km = getCostVal(ev.cost_90_10_per_km, efficiency_90_10_kmpl);
      const cost_100_0_per_km = getCostVal(ev.cost_100_0_per_km, efficiency_100_0_kmpl);

      const getRangeVal = (dbVal: any, efficiency: number) => {
        if (dbVal !== undefined && dbVal !== null && dbVal !== 0 && !isNaN(Number(dbVal))) {
          return Math.round(Number(dbVal));
        }
        return Math.round(0.9 * fuel_tank_capacity_l * efficiency);
      };

      const range_0_100_km = getRangeVal(ev.range_0_100_km, efficiency_0_100_kmpl);
      const range_10_90_km = getRangeVal(ev.range_10_90_km, efficiency_10_90_kmpl);
      const range_20_80_km = getRangeVal(ev.range_20_80_km, efficiency_20_80_kmpl);
      const range_30_70_km = getRangeVal(ev.range_30_70_km, efficiency_30_70_kmpl);
      const range_40_60_km = getRangeVal(ev.range_40_60_km, efficiency_40_60_kmpl);
      const range_50_50_km = getRangeVal(ev.range_50_50_km, efficiency_50_50_kmpl);
      const range_60_40_km = getRangeVal(ev.range_60_40_km, efficiency_60_40_kmpl);
      const range_70_30_km = getRangeVal(ev.range_70_30_km, efficiency_70_30_kmpl);
      const range_80_20_km = getRangeVal(ev.range_80_20_km, efficiency_80_20_kmpl);
      const range_90_10_km = getRangeVal(ev.range_90_10_km, efficiency_90_10_kmpl);
      const range_100_0_km = getRangeVal(ev.range_100_0_km, efficiency_100_0_kmpl);

      const range_min_km = ev.range_min_km ? Number(ev.range_min_km) : Math.min(range_100_0_km, range_0_100_km);
      const range_max_km = ev.range_max_km ? Number(ev.range_max_km) : Math.max(range_100_0_km, range_0_100_km);
      
      // Strict generation for range_display using range_min_km + " - " + range_max_km + " km"
      const range_display = (ev.range_display && String(ev.range_display).trim()) ? String(ev.range_display) : `${range_min_km} - ${range_max_km} km`;

      const powertrain0 = `${fuel_type} ${transmission}`;
      const hwy_to_city_diff_pct = city_efficiency_kmpl > 0 ? ((highway_efficiency_kmpl - city_efficiency_kmpl) / city_efficiency_kmpl) * 100 : 0;
      const jumpOrDropText = hwy_to_city_diff_pct >= 0 ? "jump up" : "drop down";
      const city_diff_kmpl = Math.abs(city_efficiency_kmpl - claimed_mileage_kmpl);
      const cityEfficiencyComparison = city_efficiency_kmpl < claimed_mileage_kmpl ? "less efficient" : "more efficient";

      const cityDevSignStr = city_deviation_percentage < 0 ? "lower" : "higher";
      const cityDevTypeStr = city_deviation_percentage < 0 ? "drop" : "increase";
      const cityDevEfficiencyStr = city_deviation_percentage < 0 ? "less efficient" : "more efficient";

      const highwayDevSignStr = highway_deviation_percentage < 0 ? "lower" : "higher";
      const highwayDevTypeStr = highway_deviation_percentage < 0 ? "drop" : "increase";
      const highwayDevEfficiencyStr = highway_deviation_percentage < 0 ? "less efficient" : "more efficient";

      const highway_diff_kmpl = Math.abs(highway_efficiency_kmpl - claimed_mileage_kmpl);
      const highwayEfficiencyComparison = highway_efficiency_kmpl < claimed_mileage_kmpl ? "less" : "more";
      const highwayDevSideWord = highway_deviation_percentage >= 0 ? "positive" : "negative";

      // Extract min / max AC temp from string "23 to 25"
      const acTempRaw = ev.ac_temperature_between || "23 to 25";
      let min_ac_temp = "23";
      let max_ac_temp = "25";
      const parts = acTempRaw.split(/\s*to\s*|\s*-\s*/i);
      if (parts.length >= 2) {
        min_ac_temp = parts[0].trim();
        max_ac_temp = parts[1].trim();
      } else if (parts.length === 1 && parts[0]) {
        min_ac_temp = parts[0].trim();
        max_ac_temp = parts[0].trim();
      }

      let content = `<b>Author:</b> Navneet\n\n`;
      content += `<b>URL:</b> ${slugify(`${brand}-${model}-${powertrain0}-real-city-highway-mileage-test`)}\n\n`;
      content += `<b>Meta Title:</b> ${brand} ${model} ${powertrain0} Actual City, Highway Mileage Test\n\n`;
      content += `<h1 style="font-size: 20pt; font-weight: normal; margin: 15px 0 10px 0;">${brand} ${model} ${powertrain0} Mileage Test: Real City, Highway Fuel Efficiency </h1>\n\n`;
      content += `<b>Meta:</b> We have driven the ${brand} ${model} with the ${powertrain0} in city and highway conditions to find out what actual mileage you can expect in city driving and highway.\n\n`;
      content += `<b>Image:</b> ${brand} ${model}\n\n`;
      content += `<b>Caption:</b><br/>${powertrain0}<br/>City, Hwy Mileage Test<br/>\n\n`;

      content += `<p style="font-size: 11pt; font-weight: bold; margin: 0 0 8px 0;">Intro:</p>\n\n`;
      content += `In this article, we’ll present the data based on V3Cars mileage test and inform you about what real-world fuel efficiency you can expect from the ${brand} ${model} ${powertrain0} in city and highway driving conditions. We’ll also find out how much the mileage numbers deviate from the manufacturer-claimed fuel efficiency figures. The information presented in this article will also help you learn about the mileage differences you can expect when driving in the city vs driving on the highway.\n\n`;

      content += `<h2 style="font-size: 14pt; font-weight: normal; margin: 0 0 8px 0;">Testing Method</h2>\n\n`;
      content += `<p style="font-style: italic; font-size: 11pt; margin: 0 0 8px 0;">Before we provide the actual mileage of the ${brand} ${model} ${powertrain0}, let's briefly explain our testing process so that you can decide if it matches your preferences, style and conditions for driving.\n\n <p style="font-style: italic; font-size: 11pt; margin: 0 0 8px 0;">We use the tank-full-to-tank-full method for our real-world fuel efficiency tests. First, we fill the fuel tank to the brim, reset the trip metre, and then begin our ~100km city drive in Delhi NCR traffic. The test is conducted on the same route during weekdays to simulate realistic city driving conditions, while maintaining the same load to keep the results consistent.\n\n <p style="font-style: italic; font-size: 11pt; margin: 0 0 8px 0;">For both city and highway runs, the vehicle is driven in its Normal drive mode, where available, since our goal is not to extract the highest possible fuel efficiency figures, but to evaluate how the car is likely to perform for most drivers in everyday driving situations.\n\n <p style="font-style: italic; font-size: 11pt; margin: 0 0 8px 0;">Once the city run is complete, we return to the fuel station, refill the tank to the same level and note the fuel consumed to calculate the city mileage. We then reset the trip metre before starting the highway mileage test. For the highway run, we use the stretch around Sohna on the Delhi-Mumbai Expressway and drive the car for around 100km at highway speeds representative of real-world usage. After completing the run, we once again refill the fuel tank to the same level and record the fuel consumed to calculate the highway mileage figure.</p>\n\n`;

      content += `<h2 style="font-size: 16pt; font-weight: normal; margin: 15px 0 10px 0;">What Is The Actual City Mileage Of ${brand} ${model} ${powertrain0}?</h2>\n\n`;
      content += `After driving the ${model} in the city traffic for about ${formatTimeVal(city_time_hours)}, we drove back to the fuel station. We covered ${formatDistanceVal(city_distance_km)} with an average speed of ${formatSpeedVal(city_avg_speed_kmph)}. During refuelling, we were able to fill up ${formatFuelQty(city_fuel_consumed_l)} of ${fuel_type} in the ${model} at a per litre ${fuel_type} price of Rs. ${fuel_price_per_litre.toFixed(2)}. Thus, the total bill stood at Rs. ${(city_fuel_consumed_l * fuel_price_per_litre).toFixed(2)} and in our real-world city mileage test of ${model} ${powertrain0}, we got a final fuel efficiency figure ${formatMileageVal(city_efficiency_kmpl)}.\n\n`;

      content += `<h2 style="font-size: 16pt; font-weight: normal; margin: 15px 0 10px 0;">What Is The Real Highway Mileage Of ${brand} ${model} ${powertrain0}?</h2>\n\n`;
      content += `With the tank filled to the brim once again, we headed out on the Delhi-Mumbai expressway to test the highway mileage of the ${model} ${powertrain0}. During the highway run, we cruised at 100kmph and managed to complete our ${formatDistanceVal(highway_distance_km)} drive in about ${formatTimeVal(highway_time_hours)}. So, our average speed during the highway mileage test of the ${model} was ${formatSpeedVal(highway_avg_speed_kmph)}. After the drive, we managed to fill up ${formatFuelQty(highway_fuel_consumed_l)} of ${fuel_type} in our ${model} and incurred a bill of Rs. ${(highway_fuel_consumed_l * fuel_price_per_litre).toFixed(2)} with a fuel price of Rs. ${fuel_price_per_litre.toFixed(2)} per litre in Gurgaon, Haryana. During our highway run of the ${brand} ${model} with the ${powertrain0} powertrain, we achieved a highway mileage of ${formatMileageVal(highway_efficiency_kmpl)}.\n\n`;

      content += `<p ${s.p}><b>Note:</b> If you want to buy a new car, <a href="https://www.v3cars.com/car-loan-emi-calculator"><u><i>Calculate Car Loan EMI</i></u></a> with <b>V3Cars</b>.</p>\n\n`;

      content += `<h2 style="font-size: 16pt; font-weight: normal; margin: 15px 0 10px 0;">Claimed Mileage Vs Actual Highway/City Mileage Of ${brand} ${model} Powertrain — What’s The Difference?</h3>\n\n`;
      content += `Based on our mileage test, the ${model} ${powertrain0} gave us a city mileage of ${formatMileageVal(city_efficiency_kmpl)}. On the highways, you can expect this figure to ${jumpOrDropText} by ${Math.abs(hwy_to_city_diff_pct).toFixed(2)}% to ${formatMileageVal(highway_efficiency_kmpl)}, as we saw in our ${model} mileage test.\n\n`;

      content += `Compared to the official claimed mileage figure of the ${model} ${powertrain0}, our ${model} ${powertrain0} city mileage turned out to be ${formatMileageVal(city_diff_kmpl)} ${cityEfficiencyComparison}. Thus, showing a ${Math.abs(city_deviation_percentage).toFixed(2)}% deviation from the claimed figure. With this fuel efficiency, you can expect to incur a per kilometre fuel cost of Rs. ${cost_100_0_per_km.toFixed(2)} if you drive mostly in the city traffic with a fuel cost of Rs. ${fuel_price_per_litre.toFixed(2)}.\n\n`;

      // CLAIMED VS REAL MILEAGE COMPARISON TABLE
      let comparisonTableHtml = `<div class="workshop-table-container">`;
      comparisonTableHtml += `<table ${s.table} cellpadding="0" cellspacing="0">`;
      comparisonTableHtml += `<thead>`;
      comparisonTableHtml += `<tr><th colspan="2" style="border: 1px solid #000000; padding: 10px 8px; font-weight: bold; text-align: center; vertical-align: middle; font-size: 11pt;"><b>${brand.toUpperCase()} ${model.toUpperCase()} ${powertrain0.toUpperCase()}<br/>CLAIMED VS REAL MILEAGE COMPARISON</b></th></tr>`;
      comparisonTableHtml += `<tr>`;
      comparisonTableHtml += `<th ${s.thTd}><b>Parameter</b></th>`;
      comparisonTableHtml += `<th ${s.thTd}><b>Values</b></th>`;
      comparisonTableHtml += `</tr>`;
      comparisonTableHtml += `</thead>`;
      comparisonTableHtml += `<tbody>`;
      comparisonTableHtml += `<tr><td ${s.td}><b>City Fuel Cost (per km)</b></td><td ${s.td}>Rs. ${cost_100_0_per_km.toFixed(2)}</td></tr>`;
      comparisonTableHtml += `<tr><td ${s.td}><b>City Deviation</b></td><td ${s.td}>${Math.abs(city_deviation_percentage).toFixed(2)}%</td></tr>`;
      comparisonTableHtml += `<tr><td ${s.td}><b>City Mileage</b></td><td ${s.td}>${formatMileageVal(city_efficiency_kmpl)}</td></tr>`;
      comparisonTableHtml += `<tr><td ${s.td}><b>Difference</b></td><td ${s.td}>${formatMileageVal(city_diff_kmpl)} ${cityEfficiencyComparison}</td></tr>`;
      comparisonTableHtml += `<tr><td ${s.td}><b><u>Claimed Mileage</u></b></td><td ${s.td}>${formatMileageVal(claimed_mileage_kmpl)}</td></tr>`;
      comparisonTableHtml += `<tr><td ${s.td}><b>Difference</b></td><td ${s.td}>${formatMileageVal(highway_diff_kmpl)} ${highway_efficiency_kmpl < claimed_mileage_kmpl ? "less efficient" : "more efficient"}</td></tr>`;
      comparisonTableHtml += `<tr><td ${s.td}><b>Highway Mileage</b></td><td ${s.td}>${formatMileageVal(highway_efficiency_kmpl)}</td></tr>`;
      comparisonTableHtml += `<tr><td ${s.td}><b>Highway Deviation</b></td><td ${s.td}>${Math.abs(highway_deviation_percentage).toFixed(2)}%</td></tr>`;
      comparisonTableHtml += `<tr><td ${s.td}><b>Hwy Fuel Cost (per km)</b></td><td ${s.td}>Rs. ${cost_0_100_per_km.toFixed(2)}</td></tr>`;
      comparisonTableHtml += `</tbody>`;
      comparisonTableHtml += `</table>`;
      comparisonTableHtml += `</div>`;

      content += comparisonTableHtml + `\n\n`;

      content += `In terms of highway mileage, we achieved a figure of ${formatMileageVal(highway_efficiency_kmpl)} with the ${model} we drove. This number of ${formatMileageVal(highway_diff_kmpl)} is ${highwayEfficiencyComparison} than the claimed mileage figure. Thus, the deviation in the highway mileage of ${model} ${powertrain0} is about ${Math.abs(highway_deviation_percentage).toFixed(2)}% on the positive side. At this rate, you can expect to spend Rs. ${cost_0_100_per_km.toFixed(2)} per kilometre for predominantly highway driving during the ownership.\n\n`;

      content += `<h3 style="font-size: 14pt; font-weight: normal; margin: 15px 0 10px 0;">${brand} ${model} ${powertrain0} — Actual City vs Highway Mileage, Custom Real Mileage, Fuel Cost Comparison</h3>\n\n`;
      content += `If your driving happens entirely on the highways or just within the city, then you know what mileage you can expect from the ${brand} ${model} ${powertrain0}. However, for those who have a mixed usage, we have compiled combinations of effective mileage of ${model} ${powertrain0} based on the variations of city-highway driving ratio.\n\n`;
      content += `Using this customised city-highway combinations, you can better gauge what fuel costs and realistic fuel efficiency you can expect from the ${model} with the ${powertrain0} powertrain.\n\n`;

      let customMileageTableHtml = `<div class="workshop-table-container">`;
      customMileageTableHtml += `<table ${s.table} cellpadding="0" cellspacing="0">`;
      customMileageTableHtml += `<thead>`;
      customMileageTableHtml += `<tr><th colspan="3" style="border: 1px solid #000000; padding: 10px 8px; font-weight: bold; text-align: center; vertical-align: middle; font-size: 11pt;"><b>${brand.toUpperCase()} ${model.toUpperCase()} ${powertrain0.toUpperCase()} — CUSTOM REAL MILEAGE ESTIMATE</b></th></tr>`;
      customMileageTableHtml += `<tr>`;
      customMileageTableHtml += `<th ${s.thTd}><b>City-Hwy Usage (% Split)</b></th>`;
      customMileageTableHtml += `<th ${s.thTd}><b>Effective Mileage</b></th>`;
      customMileageTableHtml += `<th ${s.thTd}><b>Per KM Fuel Cost</b></th>`;
      customMileageTableHtml += `</tr>`;
      customMileageTableHtml += `</thead>`;
      customMileageTableHtml += `<tbody>`;

      const mileageRows = [
        { split: "0-100%", eff: efficiency_0_100_kmpl, cost: cost_0_100_per_km },
        { split: "10-90%", eff: efficiency_10_90_kmpl, cost: cost_10_90_per_km },
        { split: "20-80%", eff: efficiency_20_80_kmpl, cost: cost_20_80_per_km },
        { split: "30-70%", eff: efficiency_30_70_kmpl, cost: cost_30_70_per_km },
        { split: "40-60%", eff: efficiency_40_60_kmpl, cost: cost_40_60_per_km },
        { split: "50-50%", eff: efficiency_50_50_kmpl, cost: cost_50_50_per_km },
        { split: "60-40%", eff: efficiency_60_40_kmpl, cost: cost_60_40_per_km },
        { split: "70-30%", eff: efficiency_70_30_kmpl, cost: cost_70_30_per_km },
        { split: "80-20%", eff: efficiency_80_20_kmpl, cost: cost_80_20_per_km },
        { split: "90-10%", eff: efficiency_90_10_kmpl, cost: cost_90_10_per_km },
        { split: "100-0%", eff: efficiency_100_0_kmpl, cost: cost_100_0_per_km }
      ];

      mileageRows.forEach(r => {
        customMileageTableHtml += `<tr>`;
        customMileageTableHtml += `<td ${s.td}>${r.split}</td>`;
        customMileageTableHtml += `<td ${s.td}>${formatMileageVal(r.eff)}</td>`;
        customMileageTableHtml += `<td ${s.td}>Rs. ${r.cost.toFixed(2)}</td>`;
        customMileageTableHtml += `</tr>`;
      });
      customMileageTableHtml += `</tbody>`;
      customMileageTableHtml += `</table>`;
      customMileageTableHtml += `</div>`;

      content += customMileageTableHtml + `\n\n`;

      content += `<p style="font-style: italic; font-size: 10pt; line-height: 1.15; margin: 0; padding: 0;">*City mileage: ${formatMileageVal(city_efficiency_kmpl)}; Highway mileage: ${formatMileageVal(highway_efficiency_kmpl)}; fuel cost in Gurgaon at the time of testing: Rs. ${fuel_price_per_litre.toFixed(2)}</p>\n\n`;

      content += `Based on these combinations, for a 70% city and 30% highway usage, you can expect a real world mileage of ${formatMileageVal(efficiency_70_30_kmpl)} and a per kilometre fuel cost of Rs. ${cost_70_30_per_km.toFixed(2)} from the ${model}. With a flipped combination, where you drive the ${model} 70% on the highways and 30% in the city, you can should expect your real-world mileage figure to hover around ${formatMileageVal(efficiency_30_70_kmpl)} with fuel costs around Rs. ${cost_30_70_per_km.toFixed(2)}.\n\n`;

      content += `For an even split of city and highway usage, your real fuel efficiency with the ${model} ${powertrain0} powertrain, your effective real mileage is likely to be closer to ${formatMileageVal(efficiency_50_50_kmpl)}. Thus, your per kilometre fuel costs could be around Rs. ${cost_50_50_per_km.toFixed(2)}.\n\n`;

      content += `<h3 style="font-size: 14pt; font-weight: normal; margin: 15px 0 10px 0;">Real Driving Range (Full Tank Driving) Of ${brand} ${model} Powertrain For Your Driving Requirements</h3>\n\n`;
      content += `The ${brand} ${model} with the ${powertrain0} powertrain comes with a ${fuel_tank_capacity_l}-litre fuel tank. With this capacity and our realisting mileage estimates, you can expect to get a range of ${range_display} depending on whether your driving is entirely within the city or on the highways.\n\n`;

      content += `With a 70-30 driving split in favour of city usage, you can expect a full tank range of ${formatDistanceVal(range_70_30_km)} from the ${model}. However, if you flip the driving condition split to 30-70 in favour of highway, then you should expect a range ${formatDistanceVal(range_30_70_km)} with a full tank of fuel. On an even split of 50% city driving and 50% highway driving, you will have to refuel about every ${formatDistanceVal(range_50_50_km)}.\n\n`;

      let customRangeTableHtml = `<div class="workshop-table-container">`;
      customRangeTableHtml += `<table ${s.table} cellpadding="0" cellspacing="0">`;
      customRangeTableHtml += `<thead>`;
      customRangeTableHtml += `<tr><th colspan="2" style="border: 1px solid #000000; padding: 10px 8px; font-weight: bold; text-align: center; vertical-align: middle; font-size: 11pt;"><b>${brand.toUpperCase()} ${model.toUpperCase()} ${powertrain0.toUpperCase()}<br/>CUSTOM REALISTIC RANGE ON FULL TANK</b></th></tr>`;
      customRangeTableHtml += `<tr>`;
      customRangeTableHtml += `<th ${s.thTd}><b>City-Hwy Usage (% Split)</b></th>`;
      customRangeTableHtml += `<th ${s.thTd}><b>Effective Range</b></th>`;
      customRangeTableHtml += `</tr>`;
      customRangeTableHtml += `</thead>`;
      customRangeTableHtml += `<tbody>`;

      const rangeRows = [
        { split: "0-100%", range: range_0_100_km },
        { split: "10-90%", range: range_10_90_km },
        { range: range_20_80_km, split: "20-80%" },
        { range: range_30_70_km, split: "30-70%" },
        { range: range_40_60_km, split: "40-60%" },
        { range: range_50_50_km, split: "50-50%" },
        { range: range_60_40_km, split: "60-40%" },
        { range: range_70_30_km, split: "70-30%" },
        { range: range_80_20_km, split: "80-20%" },
        { range: range_90_10_km, split: "90-10%" },
        { range: range_100_0_km, split: "100-0%" }
      ];

      rangeRows.forEach(r => {
        customRangeTableHtml += `<tr>`;
        customRangeTableHtml += `<td ${s.td}>${r.split}</td>`;
        customRangeTableHtml += `<td ${s.td}>${formatDistanceVal(r.range)}</td>`;
        customRangeTableHtml += `</tr>`;
      });
      customRangeTableHtml += `</tbody>`;
      customRangeTableHtml += `</table>`;
      customRangeTableHtml += `</div>`;

      content += customRangeTableHtml + `\n\n`;

      content += `<p style="font-style: italic; font-size: 10pt; line-height: 1.15; margin: 0; padding: 0;">*Tank range estimated based on 90% fuel usage with 10% remaining in reserve</p>\n\n`;
      content += `At the time of testing the ${brand} ${model} ${powertrain0}, each refuelling will cost you Rs. ${(0.9 * fuel_tank_capacity_l * fuel_price_per_litre).toFixed(2)} if you fill up 90%. This is assuming the fuel cost of Rs. ${fuel_price_per_litre.toFixed(2)} as of ${test_year} in Gurgaon, Haryana.\n\n`;

      content += `<p style="font-size: 11pt; font-weight: bold;" ${s.p}>Also Read:</p>\n\n`;
      content += `<p ${s.p}>Find out how you can get the best mileage or fuel efficiency from your car:</p>\n\n`;
      content += `<p ${s.p}><a href="https://www.v3cars.com/car-guide/10-tips-to-get-better-mileage-from-your-petrol-diesel-or-cng-car"><b><i>10 Tips To Get Better Mileage From Your Petrol, Diesel Or CNG Car</i></b></a></p>\n\n`;
      setArticle(content);

      const artId = slugify(`${brand}-${model}-${fuel_type}-${transmission}-mileage-test`);
      await setDoc(doc(db, "articles", artId), {
        articleType: "fuel-efficiency",
        brandName: brand,
        modelName: model,
        content,
        updatedAt: serverTimestamp()
      }, { merge: true });

      setIsGenerating(false);
    } catch (err: any) {
      console.error(err);
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

    const element = document.getElementById('article-preview-content');
    if (!element) return;

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

  const handleGenerateClick = () => {
    if (articleType === "service-cost") {
      generateArticle();
    } else if (articleType === "ev-range") {
      generateEvRangeArticle();
    } else {
      generateFuelEfficiencyArticle();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-20"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-200/80 pb-6">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse shadow-sm shadow-yellow-400/50" />
          <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-zinc-400">Content Processing Engine</span>
        </div>

        {/* Selection Tabs */}
        <div className="flex bg-zinc-100 p-1.5 rounded-2xl border border-zinc-200/80 shadow-inner">
          <button
            onClick={() => { setArticleType("service-cost"); setArticle(null); setSelectedEvId(""); }}
            className={cn(
              "px-5 py-2.5 text-[10px] font-extrabold uppercase tracking-widest rounded-xl transition-all duration-200",
              articleType === "service-cost"
                ? "bg-black text-white shadow-lg active:scale-95"
                : "text-zinc-500 hover:text-zinc-900"
            )}
          >
            Periodic Service
          </button>
          <button
            onClick={() => { setArticleType("ev-range"); setArticle(null); setSelectedEvId(""); }}
            className={cn(
              "px-5 py-2.5 text-[10px] font-extrabold uppercase tracking-widest rounded-xl transition-all duration-200 flex items-center gap-1.5",
              articleType === "ev-range"
                ? "bg-black text-white shadow-lg active:scale-95"
                : "text-zinc-500 hover:text-zinc-900"
            )}
          >
            <Database size={12} className={cn(articleType === "ev-range" ? "text-yellow-400" : "text-zinc-400")} />
            EV Range Test
          </button>
          <button
            onClick={() => { setArticleType("fuel-efficiency"); setArticle(null); setSelectedEvId(""); }}
            className={cn(
              "px-5 py-2.5 text-[10px] font-extrabold uppercase tracking-widest rounded-xl transition-all duration-200 flex items-center gap-1.5",
              articleType === "fuel-efficiency"
                ? "bg-black text-white shadow-lg active:scale-95"
                : "text-zinc-500 hover:text-zinc-900"
            )}
          >
            <Database size={12} className={cn(articleType === "fuel-efficiency" ? "text-yellow-400" : "text-zinc-400")} />
            Fuel Efficiency
          </button>
        </div>
      </div>

      {/* FILTER CONTROLS GRID */}
      <div className="bg-white border border-zinc-200/80 rounded-[24px] p-6 md:p-8 shadow-xl shadow-zinc-200/30 transition-all duration-300 hover:shadow-2xl hover:shadow-zinc-200/40 space-y-6">
        {articleType === "service-cost" ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block mb-1">Select Brand</label>
              <select
                value={selectedBrand}
                onChange={(e) => handleBrandChange(e.target.value)}
                className="w-full h-12 bg-zinc-50 hover:bg-zinc-100/70 focus:bg-white border border-zinc-200/80 focus:border-black/80 px-4 text-xs font-semibold uppercase tracking-wider focus:outline-none rounded-xl transition-all duration-200 shadow-sm focus:ring-2 focus:ring-black/5"
              >
                <option value="">Choose Brand...</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block mb-1">Select Model</label>
              <select
                value={selectedModel}
                onChange={(e) => handleModelChange(e.target.value)}
                disabled={!selectedBrand}
                className="w-full h-12 bg-zinc-50 hover:bg-zinc-100/70 focus:bg-white border border-zinc-200/80 focus:border-black/80 px-4 text-xs font-semibold uppercase tracking-wider focus:outline-none rounded-xl transition-all duration-200 shadow-sm focus:ring-2 focus:ring-black/5 disabled:opacity-40"
              >
                <option value="">Choose Model...</option>
                {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block mb-1">Service Overview</label>
              <div className="w-full h-12 bg-zinc-50 border border-zinc-200/80 px-4 text-xs font-bold uppercase text-zinc-600 rounded-xl flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-2">
                  <TableIcon size={14} className="text-yellow-500" />
                  <span>Configured Powertrains</span>
                </div>
                <span className="bg-black text-white text-[10px] px-2.5 py-0.5 rounded font-extrabold">{powertrains.length}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block mb-1">
                {articleType === "ev-range" ? "Select EV Model (Live Google Sheets Sync database)" : "Select Fuel Model (Live Google Sheets Sync database)"}
              </label>
              <select
                value={selectedEvId}
                onChange={(e) => { setSelectedEvId(e.target.value); setArticle(null); }}
                className="w-full h-12 bg-zinc-50 hover:bg-zinc-100/70 focus:bg-white border border-zinc-200/80 focus:border-black/80 px-4 text-xs font-semibold uppercase tracking-wider focus:outline-none rounded-xl transition-all duration-200 shadow-sm focus:ring-2 focus:ring-black/5 text-zinc-800"
              >
                <option value="">
                  {articleType === "ev-range" ? "Choose EV Vehicle Model..." : "Choose Fuel Vehicle Model..."}
                </option>
                {evModels
                  .filter(e => {
                    if (articleType === "ev-range") {
                      return e.sheetType === "ev" || (!e.sheetType && !e.fuel_type);
                    } else {
                      return e.sheetType === "fuel-efficiency" || e.fuel_type !== undefined;
                    }
                  })
                  .map(e => (
                    <option key={e.id} value={e.id}>
                      {e.brand.toUpperCase()} {e.model.toUpperCase()} {e.variant ? `(${e.variant.toUpperCase()})` : ""} ({articleType === "ev-range" ? `Claimed: ${e.claimed_range_km}km, Real: ${e.real_range_km}km` : `Claimed: ${e.claimed_mileage_kmpl}kmpl, Real: ${e.real_mileage_kmpl}kmpl`})
                    </option>
                  ))}
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-center pt-2">
        {isAdmin ? (
          <button
            onClick={handleGenerateClick}
            disabled={
              (articleType === "service-cost" && !selectedModel) ||
              ((articleType === "ev-range" || articleType === "fuel-efficiency") && !selectedEvId) ||
              isGenerating
            }
            className="group flex items-center justify-center gap-3 px-16 h-14 bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold text-xs uppercase tracking-[0.25em] disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-yellow-400 transition-all duration-200 shadow-lg shadow-yellow-400/10 hover:shadow-xl hover:shadow-yellow-400/20 active:scale-95 rounded-2xl cursor-pointer"
          >
            {isGenerating ? (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-black animate-ping" />
                <span>Compiling Report...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span>Generate Article</span>
                <span className="text-[10px] group-hover:translate-x-1 transition-transform">→</span>
              </div>
            )}
          </button>
        ) : (
          <div className="p-4 bg-zinc-50 border border-zinc-200 text-zinc-500 text-xs font-semibold uppercase tracking-widest text-center max-w-md w-full shadow-sm rounded-2xl">
            Article generation is restricted to administrators.
          </div>
        )}
      </div>

      <AnimatePresence>
        {article && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-zinc-200/80 rounded-[24px] overflow-hidden shadow-2xl shadow-zinc-200/50"
          >
            <div className="p-5 bg-black text-white flex flex-col sm:flex-row justify-between items-center gap-4 sticky top-0 z-10 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-yellow-400 flex items-center justify-center text-black font-extrabold shrink-0">
                  <FileText size={15} />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest block text-zinc-400 leading-none">Output Reader</span>
                  <span className="text-xs font-bold text-white mt-1 block">Article Preview (Navneet Template)</span>
                </div>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  onClick={copyToClipboard}
                  className="flex-1 sm:flex-initial h-10 px-5 hover:bg-zinc-800 rounded-xl flex items-center justify-center gap-2 text-[10px] font-extrabold uppercase tracking-wider transition-colors border border-zinc-800 text-zinc-300 hover:text-white"
                >
                  {copied ? <Check size={13} className="text-yellow-400" /> : <Copy size={13} className="text-yellow-400" />}
                  {copied ? "Copied" : "Copy MD"}
                </button>
                <button
                  onClick={copyAsRichText}
                  className="flex-1 sm:flex-initial h-10 px-5 bg-zinc-100 hover:bg-white text-black rounded-xl flex items-center justify-center gap-2 text-[10px] font-extrabold uppercase tracking-wider transition-all shadow-md active:scale-95 duration-200 hover:shadow-lg"
                >
                  <ExternalLink size={13} className="text-zinc-600" /> {copied ? "Done" : "Copy for GDocs"}
                </button>
              </div>
            </div>

            <div id="article-preview-content" className="p-6 md:p-12 prose prose-zinc max-w-none 
              prose-h1:text-[20px] prose-h1:font-bold prose-h1:leading-tight
              prose-h3:text-[11px] prose-h3:font-bold prose-h3:leading-none
              prose-h4:text-[14px] prose-h4:font-bold prose-h4:mt-4 prose-h4:mb-2 prose-h4:text-black
              prose-p:leading-[1.15] prose-p:my-0
            ">
              <Markdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
              >
                {article}
              </Markdown>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}