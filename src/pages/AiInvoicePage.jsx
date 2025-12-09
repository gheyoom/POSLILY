// src/pages/AiInvoicePage.jsx
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import Tesseract from "tesseract.js";

// pdf.js (متوافق مع Vite / React)
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/* =========================================================
   1) دوال مساعدة عامة
   ========================================================= */

function cropBoxFromCanvas(canvas, box) {
  const [x1, y1, x2, y2] = box;
  const W = canvas.width;
  const H = canvas.height;

  const sx = x1 * W;
  const sy = y1 * H;
  const sw = (x2 - x1) * W;
  const sh = (y2 - y1) * H;

  const outCanvas = document.createElement("canvas");
  outCanvas.width = sw;
  outCanvas.height = sh;
  const outCtx = outCanvas.getContext("2d");
  outCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

  return outCanvas;
}

// (باقي موجودة لو أحببنا استخدامها لاحقاً لمربعات معينة)
async function readFieldFromBox(canvas, box) {
  const fieldCanvas = cropBoxFromCanvas(canvas, box);
  const { data } = await Tesseract.recognize(fieldCanvas, "eng+ara");
  return (data.text || "").trim();
}

function textToLines(text) {
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/* =========================================================
   2) تحليل جدول الأصناف من منطقة الجدول
   ========================================================= */
// قصّ الجزء الخاص بالجدول من النص الكامل للصفحة
// قصّ الجزء الخاص بالجدول من النص الكامل للصفحة
function extractTableTextFromFullPage(fullText) {
  const lines = textToLines(fullText);

  let startIdx = -1;
  let endIdx = lines.length;

  // نعتبر أول سطر من شكل: رقم + كود صنف (F123456) هو بداية الجدول
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\d+\s+[A-Z]\d{4,}/.test(lines[i])) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) {
    console.log("TABLE START NOT FOUND");
    return "";
  }

  // نوقف عند "Amount in words" أو Driver Name أو Terms & Conditions
  for (let i = startIdx + 1; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (
      lower.includes("amount in words") ||
      lower.includes("ameant in iwords") ||
      lower.includes("amount in iwords") ||
      lower.includes("driver name") ||
      lower.includes("terms & conditions")
    ) {
      endIdx = i;
      break;
    }
  }

  const tableText = lines.slice(startIdx, endIdx).join("\n");
  console.log("==== TABLE TEXT ====");
  console.log(tableText);
  return tableText;
}


// تحليل جدول الأصناف من نص الجدول (من النص الكامل للصفحة)
function parseItemsTableText(tableText) {
  const lines = textToLines(tableText);
  const items = [];
  let lastItem = null;

  for (let rawLine of lines) {
    const line0 = rawLine.trim();

    // تجاهل سطر العناوين
    if (
      /S\.?\s*No/i.test(line0) ||
      /STOCK\s*CODE/i.test(line0) ||
      /DESCRIPTION/i.test(line0) ||
      /QTY/i.test(line0)
    ) {
      continue;
    }

    // لو السطر لا يشبه "رقم + كود صنف" لكنه بعد صنف سابق → نعتبره تكملة للوصف
    if (!/^\d+\s+[A-Z]\d{4,}/.test(line0) && lastItem) {
      lastItem.description = (lastItem.description + " " + line0).trim();
      continue;
    }

    // لازم يبدأ بـ رقم سطر + كود صنف
    if (!/^\d+\s+[A-Z]\d{4,}/.test(line0)) continue;

    // نشيل | إذا ظهرت من الجدول
    let line = line0.replace(/\|/g, " ");

    // 1   F121924   باقي السطر...
    const m = line.match(/^\s*(\d+)\s+([A-Z]\d{4,})\s+(.*)$/);
    if (!m) continue;

    const s_no = m[1];
    const stock_code = m[2];
    let rest = m[3];

    // كل الأرقام في آخر السطر (QTY, Rate, Discount, Taxable, VAT, Tax, Total)
    const numMatches = rest.match(/-?\d+(?:\.\d+)?/g) || [];
    if (numMatches.length < 5) {
      // سطر ناقص أرقام
      continue;
    }

    const nums = numMatches.map((x) => x.replace(/[^\d.]/g, ""));

    const total_amount = nums[nums.length - 1] || "";
    const tax_amount = nums[nums.length - 2] || "";
    const taxable_amount = nums[nums.length - 3] || "";
    const discount_amount = nums[nums.length - 4] || "";
    const rate = nums[nums.length - 5] || "";
    const qty = nums.length >= 6 ? nums[nums.length - 6] : "";

    // الوصف = كل شيء قبل أول رقم في rest
    const firstNumIdx = rest.search(/-?\d+(?:\.\d+)?/);
    let description =
      firstNumIdx === -1 ? rest.trim() : rest.slice(0, firstNumIdx).trim();

    const item = {
      s_no,
      stock_code,
      description,
      qty,
      rate,
      discount_amount,
      taxable_amount,
      vat_percent: "5%",
      tax_amount,
      line_total: total_amount,
    };

    items.push(item);
    lastItem = item;
  }

  return items;
}


/* =========================================================
   3) استخراج رقم الفاتورة / التاريخ / الإجماليات من نص الصفحة
   ========================================================= */

function extractHeaderAndTotalsFromText(fullText) {
  const lines = textToLines(fullText);

  let invNo = "";
  let invDate = "";
  let salesman = "";
  let totalTaxable = "";
  let totalTax = "";
  let totalAmount = "";

  // ====== المرور على الأسطر مرة واحدة لاستخراج رقم الفاتورة + السيلزمان ======
  for (const line of lines) {
    const lower = line.toLowerCase();

    // رقم الفاتورة (إن وجد نص inv no / invoice no)
    if (!invNo && /(inv\s*no|invoice\s*no)/.test(lower)) {
      const m =
        line.match(/(?:inv\s*no\.?\s*[:\-]?\s*)([A-Za-z0-9\/\-]+)/i) ||
        line.match(/(?:invoice\s*no\.?\s*[:\-]?\s*)([A-Za-z0-9\/\-]+)/i);
      if (m) {
        invNo = m[1].trim();
      } else {
        invNo = line
          .replace(/.*(inv\s*no|invoice\s*no)[^A-Za-z0-9\/\-]*/i, "")
          .trim();
      }
      continue;
    }

    // Salesman
    if (!salesman && /salesman/i.test(lower)) {
      const m = line.match(/salesman\s*[:\-]?\s*(.+)$/i);
      if (m) salesman = m[1].trim();
      continue;
    }
  }

  // ====== التاريخ: نبحث مباشرة في كل النص عن شكل 01-OCT-2025 أو مشابه ======
  if (!invDate) {
    const m =
      fullText.match(/(\d{1,2}-[A-Z]{3}-\d{2,4})/i) || // 01-OCT-2025
      fullText.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/) || // 01/10/2025
      fullText.match(/(\d{4}-\d{2}-\d{2})/); // 2025-10-01

    if (m) {
      invDate = m[1].trim();
    }
  }

  // ====== أولاً: نحاول نلقط سطر "Amount in words" (حتى لو مكتوب غلط) ======
  let amountLine = null;
  for (const line of lines) {
    const lower = line.toLowerCase();
    // الـ OCR كتبها "Ameant in iwords" في مثال برشلونه
    if (
      (lower.includes("amount") || lower.includes("ameant")) &&
      (lower.includes("words") || lower.includes("iwords"))
    ) {
      amountLine = line;
    }
  }

  if (amountLine) {
    const nums = amountLine.match(/\d{1,5}\.\d{2}/g);
    if (nums && nums.length >= 3) {
      const last3 = nums.slice(-3); // [taxable, tax, total]
      totalTaxable = last3[0];
      totalTax = last3[1];
      totalAmount = last3[2];
    }
  }

  // ====== احتياطي: لو ما لقينا من سطر Amount in words، ناخذ آخر سطر فيه 3 أرقام ======
  if (!totalTaxable || !totalTax || !totalAmount) {
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      const nums = line.match(/\d{1,5}\.\d{2}/g);
      if (!nums || nums.length < 3) continue;

      const last3 = nums.slice(-3);
      if (!totalTaxable) totalTaxable = last3[0];
      if (!totalTax) totalTax = last3[1];
      if (!totalAmount) totalAmount = last3[2];
      break;
    }
  }

  return {
    invNo,
    invDate,
    salesman,
    totalTaxable,
    totalTax,
    totalAmount,
  };
}

/* =========================================================
   4) قراءة صفحة واحدة (OCR كامل للصفحة + جدول الأصناف)
   ========================================================= */

// قراءة صفحة واحدة: نستخدم النص الكامل للصفحة
async function parsePageWithTemplate(canvas, template) {
  // نقرأ النص الكامل للصفحة مرة واحدة
  const { data } = await Tesseract.recognize(canvas, "eng+ara");
  const fullText = data.text || "";

  console.log("====== PAGE OCR DEBUG ======");
  console.log(fullText);

  // 1) نطلع بيانات الرأس + الإجماليات
  const ht = extractHeaderAndTotalsFromText(fullText);

  // 2) نقتطع نصّ الجدول ونحلّله
  const tableText = extractTableTextFromFullPage(fullText);
  const items = parseItemsTableText(tableText);

  console.log("PARSED PAGE (HEADER/TOTALS):", ht);
  console.log("PARSED ITEMS:", items);

  return {
    header: {
      inv_no: ht.invNo,
      inv_date: ht.invDate,
      salesman: ht.salesman,
    },
    totals: {
      total_taxable: ht.totalTaxable,
      total_tax: ht.totalTax,
      total_amount: ht.totalAmount,
    },
    items,
  };
}


/* =========================================================
   5) OCR لملف PDF كامل (عدة صفحات)
   ========================================================= */

async function ocrPdfFile(file, onProgress, template) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages = [];
  const totalPages = pdf.numPages;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    const parsed = await parsePageWithTemplate(canvas, template);

    pages.push({
      pageNumber: pageNum,
      header: parsed.header,
      items: parsed.items,
      totals: parsed.totals,
    });

    const overall = pageNum / totalPages;
    onProgress(Math.round(overall * 100));
  }

  onProgress(100);
  return pages;
}

// للصورة الواحدة (اختياري)
async function ocrImageFile(file, onProgress) {
  const { data } = await Tesseract.recognize(file, "eng+ara", {
    logger: (m) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  const text = data.text || "";
  const lines = textToLines(text);

  return [
    {
      pageNumber: 1,
      header: {
        inv_no: lines[0] || "",
        inv_date: "",
        salesman: "",
      },
      items: [],
      totals: {
        total_taxable: "",
        total_tax: "",
        total_amount: "",
      },
    },
  ];
}

function parseAmount(raw) {
  if (!raw) return null;
  const s = String(raw).replace(/[^0-9.,]/g, "").replace(/,/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

/* =========================================================
   6) قراءة CSV من MakeSense وتحويله إلى Template
   (حالياً نستخدمه فقط لمنطقة الجدول tableRegion)
   ========================================================= */

function parseTemplateCsv(csvText, templateId, templateName) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error("CSV ملف فارغ أو غير صحيح.");
  }

  const header = lines[0].split(",");
  const idx = {
    label: header.findIndex((h) => /label/i.test(h)),
    x: header.findIndex((h) => /bbox_x/i.test(h)),
    y: header.findIndex((h) => /bbox_y/i.test(h)),
    w: header.findIndex((h) => /bbox_width/i.test(h)),
    h: header.findIndex((h) => /bbox_height/i.test(h)),
    iw: header.findIndex((h) => /image_width/i.test(h)),
    ih: header.findIndex((h) => /image_height/i.test(h)),
  };

  if (
    idx.label === -1 ||
    idx.x === -1 ||
    idx.y === -1 ||
    idx.w === -1 ||
    idx.h === -1 ||
    idx.iw === -1 ||
    idx.ih === -1
  ) {
    throw new Error("لم يتم العثور على الأعمدة المتوقعة في CSV.");
  }

  const template = {
    id: templateId,
    name: templateName || templateId,
    headerFields: {}, // لم نعد نستخدمها لكن نتركها مستقبلاً
    tableRegion: null,
    totalFields: {}, // لم نعد نستخدمها لكن نتركها مستقبلاً
  };

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",");
    if (row.length < header.length) continue;

    const rawLabel = row[idx.label].trim();
    if (!rawLabel) continue;

    const labelKey = rawLabel.toLowerCase();

    const bbox_x = parseFloat(row[idx.x]);
    const bbox_y = parseFloat(row[idx.y]);
    const bbox_w = parseFloat(row[idx.w]);
    const bbox_h = parseFloat(row[idx.h]);
    const img_w = parseFloat(row[idx.iw]);
    const img_h = parseFloat(row[idx.ih]);

    if (
      [bbox_x, bbox_y, bbox_w, bbox_h, img_w, img_h].some((v) =>
        Number.isNaN(v)
      )
    ) {
      continue;
    }

    const x1 = bbox_x / img_w;
    const y1 = bbox_y / img_h;
    const x2 = (bbox_x + bbox_w) / img_w;
    const y2 = (bbox_y + bbox_h) / img_h;
    const box = [x1, y1, x2, y2];

    // حالياً نهتم فقط بـ table / items
    if (
      ["table", "items", "items table", "table region"].includes(labelKey)
    ) {
      template.tableRegion = { label: rawLabel, box };
    } else {
      console.log("IGNORED LABEL FROM CSV:", rawLabel);
    }
  }

  return template;
}

/* =========================================================
   7) المكوّن الرئيسي AiInvoicePage
   ========================================================= */

function AiInvoicePage() {
  // القوالب (Barcellona, Tulip, ...) يتم تحميلها من CSV
  const [templates, setTemplates] = useState({});
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const [templateNameInput, setTemplateNameInput] = useState("");
  const [templateStatus, setTemplateStatus] = useState("");

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");

  const [pages, setPages] = useState([]); // [{pageNumber, header, items, totals}]
  const [loadingOcr, setLoadingOcr] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);

  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("success");

  const [invoices, setInvoices] = useState([]);

  const loadInvoices = async () => {
    const { data, error } = await supabase
      .from("purchase_invoices")
      .select(
        "id, invoice_number, invoice_date, salesman, total_amount, total_taxable_amount, total_tax_amount, status, file_url, page_number, supplier_template"
      )
      .order("created_at", { ascending: false });

    if (!error && data) setInvoices(data);
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  const handleTemplateCsvChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (!templateNameInput.trim()) {
      setTemplateStatus("اكتبي اسم المورد (مثال: Barcellona) قبل رفع CSV.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = String(ev.target.result || "");
        const id = templateNameInput.trim().toLowerCase().replace(/\s+/g, "_");
        const name = templateNameInput.trim();

        const tpl = parseTemplateCsv(text, id, name);

        if (!tpl.tableRegion) {
          setTemplateStatus(
            "تم إنشاء القالب، لكن لم يتم العثور على label لمنطقة الجدول (Table / Items)."
          );
        } else {
          setTemplateStatus(
            `تم إنشاء قالب "${name}" بنجاح من CSV. يمكنك الآن استخدامه لقراءة الفواتير.`
          );
        }

        setTemplates((prev) => ({ ...prev, [tpl.id]: tpl }));
        setSelectedTemplateId(tpl.id);
      } catch (err) {
        console.error("Template CSV parse error:", err);
        setTemplateStatus(
          "حصل خطأ أثناء قراءة ملف CSV:\n" + (err?.message || "Unknown error")
        );
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsText(f);
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setStatus("");
    setPages([]);
    setProgress(0);

    if (f.type.startsWith("image/")) {
      const url = URL.createObjectURL(f);
      setPreviewUrl(url);
    } else {
      setPreviewUrl("");
    }
  };

  const runOcr = async () => {
    if (!file) {
      setStatusType("error");
      setStatus("اختاري ملف فاتورة أولاً.");
      return;
    }

    if (!selectedTemplateId || !templates[selectedTemplateId]) {
      setStatusType("error");
      setStatus("اختاري قالب مورد (أو حمّلي ملف CSV من MakeSense أولاً).");
      return;
    }

    try {
      setLoadingOcr(true);
      setStatus("");
      setPages([]);
      setProgress(0);

      const template = templates[selectedTemplateId];

      let resultPages = [];
      if (file.type === "application/pdf") {
        resultPages = await ocrPdfFile(file, setProgress, template);
      } else {
        resultPages = await ocrImageFile(file, setProgress);
      }

      setPages(resultPages);

      setStatusType("success");
      setStatus(
        file.type === "application/pdf"
          ? `تم استخراج ${resultPages.length} فاتورة من هذا الملف. يمكنك مراجعة التفاصيل لكل صفحة.`
          : "تم استخراج بيانات الفاتورة من الصورة. يمكنك المراجعة."
      );
    } catch (err) {
      console.error("OCR error:", err);
      setStatusType("error");
      setStatus("حصل خطأ أثناء قراءة الفواتير.");
    } finally {
      setLoadingOcr(false);
    }
  };

  const updateHeaderField = (pageIndex, field, value) => {
    setPages((prev) =>
      prev.map((p, i) =>
        i === pageIndex ? { ...p, header: { ...p.header, [field]: value } } : p
      )
    );
  };

  const updateTotalField = (pageIndex, field, value) => {
    setPages((prev) =>
      prev.map((p, i) =>
        i === pageIndex ? { ...p, totals: { ...p.totals, [field]: value } } : p
      )
    );
  };

  const updateItemField = (pageIndex, itemIndex, field, value) => {
    setPages((prev) =>
      prev.map((p, i) => {
        if (i !== pageIndex) return p;
        const newItems = p.items.map((item, j) =>
          j === itemIndex ? { ...item, [field]: value } : item
        );
        return { ...p, items: newItems };
      })
    );
  };

  const handleSaveAll = async () => {
    if (!file) {
      setStatusType("error");
      setStatus("لا يوجد ملف لحفظ فواتيره.");
      return;
    }
    if (pages.length === 0) {
      setStatusType("error");
      setStatus("لم يتم استخراج أي فواتير من الملف.");
      return;
    }

    if (!selectedTemplateId) {
      setStatusType("error");
      setStatus("اختاري قالب المورد قبل الحفظ.");
      return;
    }

    try {
      setSaving(true);
      setStatus("");

      // 1) رفع الملف
      const ext = file.name.split(".").pop();
      const fileName = `invoice-batch-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("purchase-invoices")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage
        .from("purchase-invoices")
        .getPublicUrl(uploadData.path);

      // 2) تجهيز الصفوف
      const rows = pages.map((p) => {
        const h = p.header || {};
        const t = p.totals || {};

        return {
          supplier_template: selectedTemplateId,
          invoice_number: h.inv_no || null,
          invoice_date: h.inv_date || null,
          salesman: h.salesman || null,
          total_amount: parseAmount(t.total_amount),
          total_taxable_amount: parseAmount(t.total_taxable),
          total_tax_amount: parseAmount(t.total_tax),
          items_json: p.items && p.items.length ? p.items : null,
          file_url: publicUrl,
          page_number: p.pageNumber,
          status: "draft",
        };
      });

      const { error: insertError } = await supabase
        .from("purchase_invoices")
        .insert(rows);

      if (insertError) throw insertError;

      setStatusType("success");
      setStatus("تم حفظ جميع فواتير هذا الملف بنجاح في Supabase.");
      await loadInvoices();
    } catch (err) {
      console.error("Save invoices error:", err);
      setStatusType("error");
      setStatus(
        "تعذر حفظ الفواتير:\n" + (err?.message || "Unknown error")
      );
    } finally {
      setSaving(false);
    }
  };

  const templateList = Object.values(templates);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {status && (
        <div
          className={`rounded-xl px-4 py-3 text-sm border whitespace-pre-line ${
            statusType === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {status}
        </div>
      )}

      <header className="space-y-1">
        <h2 className="text-2xl font-bold text-stone-900">
          AI Purchase Invoices
        </h2>
        <p className="text-sm text-stone-500">
          لكل مورد، أنشئ قالب من MakeSense (CSV) يحدد فقط منطقة الجدول، ثم استخدمه
          لقراءة فواتير PDF تلقائياً. رقم الفاتورة والتاريخ والإجماليات تُستخرج
          آلياً من نص الفاتورة.
        </p>
      </header>

      {/* 1) إدارة القوالب (MakeSense CSV) */}
      <section className="bg-white border border-amber-100 rounded-2xl shadow-sm p-4 space-y-3">
        <h3 className="text-sm font-semibold text-stone-800">
          1) إعداد قالب لمورد جديد (MakeSense)
        </h3>
        <p className="text-[11px] text-stone-500">
          في MakeSense يكفي ترسمي بوكس واحد لمنطقة جدول الأصناف
          (label = Table أو Items). رقم الفاتورة والتاريخ والإجماليات سيُقرأون من
          نص الفاتورة مباشرة.
        </p>

        <div className="grid md:grid-cols-3 gap-3 items-end">
          <div className="flex flex-col">
            <label className="text-[11px] text-stone-600 mb-1">
              اسم المورد (للقالب)
            </label>
            <input
              className="h-9 border border-stone-300 rounded-lg px-2 text-xs bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="مثال: Barcellona أو Tulip"
              value={templateNameInput}
              onChange={(e) => setTemplateNameInput(e.target.value)}
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[11px] text-stone-600 mb-1">
              ملف CSV من MakeSense
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={handleTemplateCsvChange}
              className="text-xs"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[11px] text-stone-600 mb-1">
              القوالب المتوفّرة
            </label>
            <select
              className="h-9 border border-stone-300 rounded-lg px-2 text-xs bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
            >
              <option value="">-- اختاري قالباً --</option>
              {templateList.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {templateStatus && (
          <p className="text-[11px] text-stone-600 whitespace-pre-line">
            {templateStatus}
          </p>
        )}
      </section>

      {/* 2) رفع ملف الفواتير وتشغيل OCR */}
      <section className="bg-white border border-amber-100 rounded-2xl shadow-sm p-4 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* يسار: الملف + progress */}
          <div className="md:w-1/2 space-y-3">
            <h3 className="text-sm font-semibold text-stone-800">
              2) تحميل ملف الفواتير وتشغيل AI
            </h3>

            <div className="space-y-1">
              <p className="text-[11px] text-stone-600">
                ملف الفواتير (PDF يضم عدة صفحات أو صورة واحدة)
              </p>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFileChange}
                className="text-xs"
              />
            </div>

            {previewUrl && (
              <div className="border rounded-xl overflow-hidden bg-stone-50">
                <img
                  src={previewUrl}
                  alt="Invoice preview"
                  className="w-full max-h-80 object-contain"
                />
              </div>
            )}

            {file && file.type === "application/pdf" && (
              <p className="text-[11px] text-stone-500">
                ملف PDF مرفوع:{" "}
                <span className="font-semibold">{file.name}</span> — سيتم
                التعامل مع كل صفحة كفاتورة منفصلة باستخدام القالب:
                {" "}
                <span className="font-semibold">
                  {templates[selectedTemplateId]?.name || "غير محدد"}
                </span>
              </p>
            )}

            <button
              type="button"
              onClick={runOcr}
              disabled={!file || loadingOcr}
              className="mt-2 px-4 py-1.5 rounded-lg bg-amber-700 text-amber-50 text-xs font-semibold hover:bg-amber-800 disabled:opacity-50"
            >
              {loadingOcr ? "جاري قراءة الفواتير..." : "تشغيل AI واستخراج البيانات"}
            </button>

            {loadingOcr && (
              <div className="mt-3">
                <div className="w-full h-2 bg-stone-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 transition-[width] duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-stone-600">
                  جاري القراءة وتحويل الملف... {progress}%
                </p>
              </div>
            )}
          </div>

          {/* يمين: المعاينة */}
          <div className="md:w-1/2 space-y-3">
            <h3 className="text-sm font-semibold text-stone-800">
              3) مراجعة البيانات المستخرجة لكل فاتورة
            </h3>

            {pages.length === 0 && (
              <p className="text-[11px] text-stone-400">
                لم يتم استخراج أي فاتورة بعد. اختاري ملفاً وقالباً ثم اضغطي "تشغيل AI".
              </p>
            )}

            {pages.length > 0 && (
              <div className="space-y-3 max-h-80 overflow-auto pr-1">
                {pages.map((p, pageIndex) => (
                  <div
                    key={p.pageNumber}
                    className="border border-stone-200 rounded-xl p-3 bg-stone-50/60 space-y-2"
                  >
                    <p className="text-[11px] text-stone-500">
                      فاتورة من الصفحة رقم{" "}
                      <span className="font-semibold">{p.pageNumber}</span>
                    </p>

                    {/* الرأس */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div className="flex flex-col">
                        <label className="text-[11px] text-stone-600 mb-1">
                          INV No
                        </label>
                        <input
                          className="h-8 border border-stone-300 rounded-lg px-2 text-xs bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                          value={p.header.inv_no || ""}
                          onChange={(e) =>
                            updateHeaderField(
                              pageIndex,
                              "inv_no",
                              e.target.value
                            )
                          }
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[11px] text-stone-600 mb-1">
                          INV Date
                        </label>
                        <input
                          className="h-8 border border-stone-300 rounded-lg px-2 text-xs bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                          value={p.header.inv_date || ""}
                          onChange={(e) =>
                            updateHeaderField(
                              pageIndex,
                              "inv_date",
                              e.target.value
                            )
                          }
                          placeholder="مثال: 01-OCT-2025"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[11px] text-stone-600 mb-1">
                          Salesman
                        </label>
                        <input
                          className="h-8 border border-stone-300 rounded-lg px-2 text-xs bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                          value={p.header.salesman || ""}
                          onChange={(e) =>
                            updateHeaderField(
                              pageIndex,
                              "salesman",
                              e.target.value
                            )
                          }
                        />
                      </div>
                    </div>

                    {/* جدول الأصناف */}
                    <div className="mt-2 border border-stone-200 rounded-lg bg-white overflow-auto">
                      <table className="min-w-full text-[11px]">
                        <thead className="bg-amber-50/70 text-stone-700">
                          <tr>
                            <th className="px-2 py-1 text-left">S. No</th>
                            <th className="px-2 py-1 text-left">Stock Code</th>
                            <th className="px-2 py-1 text-left">
                              Description
                            </th>
                            <th className="px-2 py-1 text-right">QTY</th>
                            <th className="px-2 py-1 text-right">Rate</th>
                            <th className="px-2 py-1 text-right">
                              Discount
                            </th>
                            <th className="px-2 py-1 text-right">
                              Taxable Amt
                            </th>
                            <th className="px-2 py-1 text-right">
                              Tax Amt
                            </th>
                            <th className="px-2 py-1 text-right">
                              Line Total
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {p.items.length === 0 && (
                            <tr>
                              <td
                                colSpan={9}
                                className="px-3 py-2 text-center text-stone-400"
                              >
                                لم يتم قراءة أي أصناف من الجدول.
                              </td>
                            </tr>
                          )}

                          {p.items.map((item, itemIndex) => (
                            <tr
                              key={itemIndex}
                              className="border-t border-stone-100"
                            >
                              {/* S. No */}
                              <td className="px-2 py-1">
                                <input
                                  className="w-full border border-stone-200 rounded px-1 h-7"
                                  value={item.s_no}
                                  onChange={(e) =>
                                    updateItemField(
                                      pageIndex,
                                      itemIndex,
                                      "s_no",
                                      e.target.value
                                    )
                                  }
                                />
                              </td>

                              {/* Stock Code */}
                              <td className="px-2 py-1">
                                <input
                                  className="w-full border border-stone-200 rounded px-1 h-7"
                                  value={item.stock_code}
                                  onChange={(e) =>
                                    updateItemField(
                                      pageIndex,
                                      itemIndex,
                                      "stock_code",
                                      e.target.value
                                    )
                                  }
                                />
                              </td>

                              {/* Description */}
                              <td className="px-2 py-1">
                                <input
                                  className="w-full border border-stone-200 rounded px-1 h-7"
                                  value={item.description || ""}
                                  onChange={(e) =>
                                    updateItemField(
                                      pageIndex,
                                      itemIndex,
                                      "description",
                                      e.target.value
                                    )
                                  }
                                />
                              </td>

                              {/* QTY */}
                              <td className="px-2 py-1 text-right">
                                <input
                                  className="w-full border border-stone-200 rounded px-1 h-7 text-right"
                                  value={item.qty}
                                  onChange={(e) =>
                                    updateItemField(
                                      pageIndex,
                                      itemIndex,
                                      "qty",
                                      e.target.value
                                    )
                                  }
                                />
                              </td>

                              {/* Rate */}
                              <td className="px-2 py-1 text-right">
                                <input
                                  className="w-full border border-stone-200 rounded px-1 h-7 text-right"
                                  value={item.rate}
                                  onChange={(e) =>
                                    updateItemField(
                                      pageIndex,
                                      itemIndex,
                                      "rate",
                                      e.target.value
                                    )
                                  }
                                />
                              </td>

                              {/* Discount Amount */}
                              <td className="px-2 py-1 text-right">
                                <input
                                  className="w-full border border-stone-200 rounded px-1 h-7 text-right"
                                  value={item.discount_amount}
                                  onChange={(e) =>
                                    updateItemField(
                                      pageIndex,
                                      itemIndex,
                                      "discount_amount",
                                      e.target.value
                                    )
                                  }
                                />
                              </td>

                              {/* Taxable Amount */}
                              <td className="px-2 py-1 text-right">
                                <input
                                  className="w-full border border-stone-200 rounded px-1 h-7 text-right"
                                  value={item.taxable_amount}
                                  onChange={(e) =>
                                    updateItemField(
                                      pageIndex,
                                      itemIndex,
                                      "taxable_amount",
                                      e.target.value
                                    )
                                  }
                                />
                              </td>

                              {/* Tax Amount */}
                              <td className="px-2 py-1 text-right">
                                <input
                                  className="w-full border border-stone-200 rounded px-1 h-7 text-right"
                                  value={item.tax_amount}
                                  onChange={(e) =>
                                    updateItemField(
                                      pageIndex,
                                      itemIndex,
                                      "tax_amount",
                                      e.target.value
                                    )
                                  }
                                />
                              </td>

                              {/* Line Total / Total Amount */}
                              <td className="px-2 py-1 text-right">
                                <input
                                  className="w-full border border-stone-200 rounded px-1 h-7 text-right"
                                  value={item.line_total}
                                  onChange={(e) =>
                                    updateItemField(
                                      pageIndex,
                                      itemIndex,
                                      "line_total",
                                      e.target.value
                                    )
                                  }
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* الإجماليات */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                      <div className="flex flex-col">
                        <label className="text-[11px] text-stone-600 mb-1">
                          Total Taxable Amount
                        </label>
                        <input
                          className="h-8 border border-stone-300 rounded-lg px-2 text-xs text-right bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                          value={p.totals.total_taxable || ""}
                          onChange={(e) =>
                            updateTotalField(
                              pageIndex,
                              "total_taxable",
                              e.target.value
                            )
                          }
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[11px] text-stone-600 mb-1">
                          Total Tax Amount
                        </label>
                        <input
                          className="h-8 border border-stone-300 rounded-lg px-2 text-xs text-right bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                          value={p.totals.total_tax || ""}
                          onChange={(e) =>
                            updateTotalField(
                              pageIndex,
                              "total_tax",
                              e.target.value
                            )
                          }
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[11px] text-stone-600 mb-1">
                          Total Amount
                        </label>
                        <input
                          className="h-8 border border-stone-300 rounded-lg px-2 text-xs text-right bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                          value={p.totals.total_amount || ""}
                          onChange={(e) =>
                            updateTotalField(
                              pageIndex,
                              "total_amount",
                              e.target.value
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving || pages.length === 0}
              className="mt-3 px-4 py-1.5 rounded-lg bg-emerald-700 text-emerald-50 text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50"
            >
              {saving
                ? "جاري حفظ الفواتير..."
                : "حفظ جميع الفواتير في Supabase"}
            </button>
          </div>
        </div>
      </section>

      {/* جدول الفواتير المحفوظة */}
      <section className="bg-white border border-amber-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-amber-100 text-xs text-stone-500">
          <span>Saved purchase invoices</span>
          <span>Showing {invoices.length} invoices</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs md:text-sm">
            <thead className="bg-amber-50/70 text-stone-700">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Template</th>
                <th className="px-3 py-2 text-left">INV No</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Salesman</th>
                <th className="px-3 py-2 text-right">Total (AED)</th>
                <th className="px-3 py-2 text-right">Taxable</th>
                <th className="px-3 py-2 text-right">Tax</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">File / Page</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-6 text-center text-stone-400"
                  >
                    لا يوجد فواتير محفوظة بعد.
                  </td>
                </tr>
              )}

              {invoices.map((inv, idx) => (
                <tr
                  key={inv.id}
                  className="border-t border-stone-100 hover:bg-amber-50/40"
                >
                  <td className="px-3 py-2">{idx + 1}</td>
                  <td className="px-3 py-2">
                    {inv.supplier_template || "-"}
                  </td>
                  <td className="px-3 py-2">{inv.invoice_number}</td>
                  <td className="px-3 py-2">
                    {inv.invoice_date || "-"}
                  </td>
                  <td className="px-3 py-2">
                    {inv.salesman || "-"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {inv.total_amount ?? "-"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {inv.total_taxable_amount ?? "-"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {inv.total_tax_amount ?? "-"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {inv.status || "draft"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {inv.file_url && (
                      <a
                        href={inv.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-amber-700 underline"
                      >
                        فتح الملف
                      </a>
                    )}
                    {typeof inv.page_number === "number" && (
                      <span className="ml-1 text-[11px] text-stone-500">
                        (page {inv.page_number})
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default AiInvoicePage;
