// src/pages/SupplierLedgerPage.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

function parseNumber(n) {
  if (n == null) return 0;
  const s = String(n).replace(/,/g, "");
  const num = Number(s);
  return Number.isNaN(num) ? 0 : num;
}

function formatMoney(n) {
  return parseNumber(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const emptyInvoiceForm = {
  id: null,
  date_issued: "",
  invoice_number: "",
  supplier: "",
  beneficiary_account_name: "",
  trn_no: "",
  item: "",
  payment_mode: "",
  date_paid: "",
  gross_amount: "",
  vat_amount: "",
  net_amount: "",
  paid_amount: "",
  balance_amount: "",
};

// خيارات ثابتة لطرق الدفع
const PAYMENT_MODES = [
  "Cash",
  "Card",
  "Bank",
  "Bank/Cash",
  "Bank Transfer",
  "Credit Card",
];

function SupplierLedgerPage() {
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [supplierAccounts, setSupplierAccounts] = useState([]); // <-- قائمة الموردين الرئيسية
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("success");

  // فلاتر
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");

  // فورم إضافة/تعديل فاتورة
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoiceForm);
  const [savingInvoice, setSavingInvoice] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setStatus("");

      // 1) فواتير الموردين
      const { data: invData, error: invErr } = await supabase
        .from("daily_suppliers")
        .select(
          "id, date_issued, invoice_number, supplier, beneficiary_account_name, trn_no, item, payment_mode, date_paid, gross_amount, vat_amount, net_amount, paid_amount, balance_amount"
        )
        .order("date_issued", { ascending: false });

      if (invErr) throw invErr;

      // 2) حسابات الموردين (supplier_accounts)
      let accData = [];
      try {
        const { data: sData, error: sErr } = await supabase
          .from("supplier_accounts")
          .select(
            "id, iban, beneficiary_account_name, nickname, trn, bank_name, pay, balance"
          )
          .order("nickname", { ascending: true });

        if (!sErr && sData) {
          accData = sData;
        } else if (sErr) {
          console.warn("supplier_accounts not available:", sErr);
        }
      } catch (innerErr) {
        console.warn("Error loading supplier_accounts:", innerErr);
      }

      // 3) المدفوعات (اختياري)
      let payData = [];
      try {
        const { data: pData, error: pErr } = await supabase
          .from("supplier_payments")
          .select(
            "id, date, supplier_name, invoice_no, amount, total_amount, payment_date, payment_mode, reference_number, credit_card_ref, payment_voucher"
          )
          .order("payment_date", { ascending: false });

        if (!pErr && pData) {
          payData = pData;
        } else if (pErr) {
          console.warn("supplier_payments not available (optional):", pErr);
        }
      } catch (innerErr) {
        console.warn("Error loading supplier_payments (optional):", innerErr);
      }

      setInvoices(invData || []);
      setSupplierAccounts(accData || []);
      setPayments(payData || []);
      setStatusType("success");
    } catch (err) {
      console.error("Error loading supplier ledger:", err);
      setStatusType("error");
      setStatus(
        "تعذر تحميل بيانات الموردين:\n" +
          (err?.message || "Unknown error")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // قائمة الموردين للفلاتر والفورم – نعتمد على supplier_accounts أولاً
  const supplierOptions = useMemo(() => {
    if (supplierAccounts.length > 0) {
      return supplierAccounts
        .map((s) => s.nickname)
        .filter(Boolean)
        .sort();
    }
    // fallback من الفواتير لو ما فيه جدول حسابات
    const set = new Set();
    invoices.forEach((inv) => {
      if (inv.supplier) set.add(inv.supplier);
    });
    return Array.from(set).sort();
  }, [supplierAccounts, invoices]);

  // خريطة لمعلومات المورد بحسب nickname (lowercase)
  const supplierMapByNickname = useMemo(() => {
    const map = new Map();
    supplierAccounts.forEach((s) => {
      const key = (s.nickname || "").trim().toLowerCase();
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, s);
      }
    });
    return map;
  }, [supplierAccounts]);

  // خريطة المدفوعات
  const paymentsByKey = useMemo(() => {
    const map = new Map();
    payments.forEach((p) => {
      const key = `${(p.supplier_name || "").trim().toLowerCase()}|${(
        p.invoice_no || ""
      )
        .trim()
        .toLowerCase()}`;
      const arr = map.get(key) || [];
      arr.push(p);
      map.set(key, arr);
    });
    return map;
  }, [payments]);

  // دمج الفواتير مع المدفوعات
  const rows = useMemo(() => {
    return invoices.map((inv) => {
      const key = `${(inv.supplier || "").trim().toLowerCase()}|${(
        inv.invoice_number || ""
      )
        .trim()
        .toLowerCase()}`;

      const pays = paymentsByKey.get(key) || [];

      const paidFromTracking = pays.reduce(
        (sum, p) => sum + parseNumber(p.amount || p.total_amount),
        0
      );

      const paidFromSheet = parseNumber(inv.paid_amount);
      const totalPaid = Math.max(paidFromTracking, paidFromSheet);

      const net = parseNumber(inv.net_amount);
      const balance =
        inv.balance_amount != null && inv.balance_amount !== ""
          ? parseNumber(inv.balance_amount)
          : Math.max(net - totalPaid, 0);

      const lastPayment = pays
        .map((p) => p.payment_date || p.date)
        .filter(Boolean)
        .sort()
        .slice(-1)[0] || inv.date_paid;

      const modesSet = new Set();
      if (inv.payment_mode) modesSet.add(inv.payment_mode);
      pays.forEach((p) => {
        if (p.payment_mode) modesSet.add(p.payment_mode);
      });
      const paymentModes = Array.from(modesSet).join(" + ") || "-";

      let status = "Unpaid";
      if (balance <= 0 && (totalPaid > 0 || net === 0)) status = "Paid";
      else if (totalPaid > 0 && balance > 0) status = "Partial";

      return {
        ...inv,
        totalPaid,
        balance,
        paymentModes,
        lastPayment,
        status,
      };
    });
  }, [invoices, paymentsByKey]);

  // تطبيق الفلاتر
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (supplierFilter !== "all" && row.supplier !== supplierFilter) {
        return false;
      }
      if (fromDate) {
        if (!row.date_issued || row.date_issued < fromDate) return false;
      }
      if (toDate) {
        if (!row.date_issued || row.date_issued > toDate) return false;
      }
      return true;
    });
  }, [rows, supplierFilter, fromDate, toDate]);

  // ملخص
  const summary = useMemo(() => {
    let invoiceCount = filteredRows.length;
    let grossTotal = 0;
    let vatTotal = 0;
    let netTotal = 0;
    let paidTotal = 0;
    let balanceTotal = 0;

    filteredRows.forEach((r) => {
      grossTotal += parseNumber(r.gross_amount);
      vatTotal += parseNumber(r.vat_amount);
      netTotal += parseNumber(r.net_amount);
      paidTotal += parseNumber(r.totalPaid);
      balanceTotal += parseNumber(r.balance);
    });

    return {
      invoiceCount,
      grossTotal,
      vatTotal,
      netTotal,
      paidTotal,
      balanceTotal,
    };
  }, [filteredRows]);

  // === فورم الفاتورة ===
  const handleInvoiceFormChange = (field, value) => {
    // لو تغيّر اسم المورد → نحاول نجيب بياناته من جدول supplier_accounts
    if (field === "supplier") {
      const nickname = value.trim().toLowerCase();
      const acc = supplierMapByNickname.get(nickname);

      if (acc) {
        setInvoiceForm((prev) => ({
          ...prev,
          supplier: value,
          beneficiary_account_name:
            acc.beneficiary_account_name || prev.beneficiary_account_name,
          trn_no: acc.trn || prev.trn_no,
          payment_mode:
            prev.payment_mode || // لو فيه قيمة قديمة نتركها
            (acc.pay && acc.pay > 0 ? "Card" : "") || // تقدير بسيط
            prev.payment_mode,
        }));
        return;
      }
    }

    setInvoiceForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditInvoice = (row) => {
    setInvoiceForm({
      id: row.id,
      date_issued: row.date_issued || "",
      invoice_number: row.invoice_number || "",
      supplier: row.supplier || "",
      beneficiary_account_name: row.beneficiary_account_name || "",
      trn_no: row.trn_no || "",
      item: row.item || "",
      payment_mode: row.payment_mode || "",
      date_paid: row.date_paid || "",
      gross_amount: row.gross_amount ?? "",
      vat_amount: row.vat_amount ?? "",
      net_amount: row.net_amount ?? "",
      paid_amount: row.paid_amount ?? "",
      balance_amount: row.balance_amount ?? "",
    });
  };

  const handleResetForm = () => {
    setInvoiceForm(emptyInvoiceForm);
  };

  const handleSaveInvoice = async () => {
    if (!invoiceForm.date_issued || !invoiceForm.invoice_number || !invoiceForm.supplier) {
      setStatusType("error");
      setStatus("تاريخ الفاتورة، رقم الفاتورة واسم المورد حقول أساسية.");
      return;
    }

    try {
      setSavingInvoice(true);
      setStatus("");

      const payload = {
        date_issued: invoiceForm.date_issued,
        invoice_number: invoiceForm.invoice_number,
        supplier: invoiceForm.supplier,
        beneficiary_account_name: invoiceForm.beneficiary_account_name || null,
        trn_no: invoiceForm.trn_no || null,
        item: invoiceForm.item || null,
        payment_mode: invoiceForm.payment_mode || null,
        date_paid: invoiceForm.date_paid || null,
        gross_amount: invoiceForm.gross_amount === "" ? 0 : Number(invoiceForm.gross_amount),
        vat_amount: invoiceForm.vat_amount === "" ? 0 : Number(invoiceForm.vat_amount),
        net_amount: invoiceForm.net_amount === "" ? 0 : Number(invoiceForm.net_amount),
        paid_amount: invoiceForm.paid_amount === "" ? 0 : Number(invoiceForm.paid_amount),
        balance_amount:
          invoiceForm.balance_amount === "" ? 0 : Number(invoiceForm.balance_amount),
      };

      if (invoiceForm.id) {
        const { error } = await supabase
          .from("daily_suppliers")
          .update(payload)
          .eq("id", invoiceForm.id);

        if (error) throw error;
        setStatusType("success");
        setStatus("تم تحديث الفاتورة بنجاح.");
      } else {
        const { error } = await supabase
          .from("daily_suppliers")
          .insert([payload]);

        if (error) throw error;
        setStatusType("success");
        setStatus("تم إضافة الفاتورة بنجاح.");
      }

      await loadData();
      setInvoiceForm(emptyInvoiceForm);
    } catch (err) {
      console.error("Save invoice error:", err);
      setStatusType("error");
      setStatus("تعذر حفظ الفاتورة:\n" + (err?.message || "Unknown error"));
    } finally {
      setSavingInvoice(false);
    }
  };

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
          Supplier Ledger &amp; VAT
        </h2>
        <p className="text-sm text-stone-500">
          تتبع فواتير الموردين، المدفوعات، وإضافة/تحديث الفواتير اليومية مع
          حساب إجمالي ضريبة القيمة المضافة (VAT) لأي فترة.
        </p>
      </header>

      {/* 1) الفلاتر */}
      <section className="bg-white border border-amber-100 rounded-2xl shadow-sm p-4 space-y-3">
        <h3 className="text-sm font-semibold text-stone-800">
          1) الفلاتر (الفترة والمورد)
        </h3>
        <div className="grid md:grid-cols-4 gap-3">
          <div className="flex flex-col">
            <label className="text-[11px] text-stone-600 mb-1">
              From date (تاريخ من)
            </label>
            <input
              type="date"
              className="h-9 border border-stone-300 rounded-lg px-2 text-xs bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[11px] text-stone-600 mb-1">
              To date (تاريخ إلى)
            </label>
            <input
              type="date"
              className="h-9 border border-stone-300 rounded-lg px-2 text-xs bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col md:col-span-2">
            <label className="text-[11px] text-stone-600 mb-1">
              Supplier (المورد)
            </label>
            <select
              className="h-9 border border-stone-300 rounded-lg px-2 text-xs bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
            >
              <option value="all">جميع الموردين</option>
              {supplierOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* 2) إضافة / تعديل فاتورة */}
      <section className="bg-white border border-amber-100 rounded-2xl shadow-sm p-4 space-y-3">
        <h3 className="text-sm font-semibold text-stone-800">
          2) إضافة / تعديل فاتورة مورد يومية
        </h3>
        <p className="text-[11px] text-stone-500">
          اختاري المورد من القائمة، وسيتم تعبئة TRN و Beneficiary Account Name
          تلقائيًا حسب جدول الموردين. بعدها أضيفي أرقام الفاتورة والمبالغ.
        </p>

        <div className="grid md:grid-cols-4 gap-3">
          <div className="flex flex-col">
            <label className="text-[11px] text-stone-600 mb-1">
              Date issued
            </label>
            <input
              type="date"
              className="h-9 border border-stone-300 rounded-lg px-2 text-xs"
              value={invoiceForm.date_issued}
              onChange={(e) =>
                handleInvoiceFormChange("date_issued", e.target.value)
              }
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[11px] text-stone-600 mb-1">
              Invoice number
            </label>
            <input
              className="h-9 border border-stone-300 rounded-lg px-2 text-xs"
              value={invoiceForm.invoice_number}
              onChange={(e) =>
                handleInvoiceFormChange("invoice_number", e.target.value)
              }
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[11px] text-stone-600 mb-1">
              Supplier (nickname)
            </label>
            <input
              list="suppliers-list"
              className="h-9 border border-stone-300 rounded-lg px-2 text-xs"
              placeholder="Barcellona, Black Tulip, Eastern..."
              value={invoiceForm.supplier}
              onChange={(e) =>
                handleInvoiceFormChange("supplier", e.target.value)
              }
            />
            <datalist id="suppliers-list">
              {supplierOptions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col">
            <label className="text-[11px] text-stone-600 mb-1">
              TRN No
            </label>
            <input
              className="h-9 border border-stone-300 rounded-lg px-2 text-xs"
              value={invoiceForm.trn_no}
              onChange={(e) =>
                handleInvoiceFormChange("trn_no", e.target.value)
              }
            />
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-3">
          <div className="flex flex-col md:col-span-2">
            <label className="text-[11px] text-stone-600 mb-1">
              Beneficiary account name
            </label>
            <input
              className="h-9 border border-stone-300 rounded-lg px-2 text-xs"
              value={invoiceForm.beneficiary_account_name}
              onChange={(e) =>
                handleInvoiceFormChange(
                  "beneficiary_account_name",
                  e.target.value
                )
              }
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[11px] text-stone-600 mb-1">
              Item (type)
            </label>
            <input
              className="h-9 border border-stone-300 rounded-lg px-2 text-xs"
              value={invoiceForm.item}
              onChange={(e) =>
                handleInvoiceFormChange("item", e.target.value)
              }
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[11px] text-stone-600 mb-1">
              Payment mode
            </label>
            <select
              className="h-9 border border-stone-300 rounded-lg px-2 text-xs"
              value={invoiceForm.payment_mode}
              onChange={(e) =>
                handleInvoiceFormChange("payment_mode", e.target.value)
              }
            >
              <option value="">-- اختر --</option>
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-3">
          <div className="flex flex-col">
            <label className="text-[11px] text-stone-600 mb-1">
              Gross amount
            </label>
            <input
              type="number"
              step="0.01"
              className="h-9 border border-stone-300 rounded-lg px-2 text-xs text-right"
              value={invoiceForm.gross_amount}
              onChange={(e) =>
                handleInvoiceFormChange("gross_amount", e.target.value)
              }
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[11px] text-stone-600 mb-1">
              VAT amount
            </label>
            <input
              type="number"
              step="0.01"
              className="h-9 border border-stone-300 rounded-lg px-2 text-xs text-right"
              value={invoiceForm.vat_amount}
              onChange={(e) =>
                handleInvoiceFormChange("vat_amount", e.target.value)
              }
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[11px] text-stone-600 mb-1">
              Net amount
            </label>
            <input
              type="number"
              step="0.01"
              className="h-9 border border-stone-300 rounded-lg px-2 text-xs text-right"
              value={invoiceForm.net_amount}
              onChange={(e) =>
                handleInvoiceFormChange("net_amount", e.target.value)
              }
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[11px] text-stone-600 mb-1">
              Date paid (اختياري)
            </label>
            <input
              type="date"
              className="h-9 border border-stone-300 rounded-lg px-2 text-xs"
              value={invoiceForm.date_paid}
              onChange={(e) =>
                handleInvoiceFormChange("date_paid", e.target.value)
              }
            />
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <div className="flex flex-col">
            <label className="text-[11px] text-stone-600 mb-1">
              Paid amount
            </label>
            <input
              type="number"
              step="0.01"
              className="h-9 border border-stone-300 rounded-lg px-2 text-xs text-right"
              value={invoiceForm.paid_amount}
              onChange={(e) =>
                handleInvoiceFormChange("paid_amount", e.target.value)
              }
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[11px] text-stone-600 mb-1">
              Balance amount
            </label>
            <input
              type="number"
              step="0.01"
              className="h-9 border border-stone-300 rounded-lg px-2 text-xs text-right"
              value={invoiceForm.balance_amount}
              onChange={(e) =>
                handleInvoiceFormChange("balance_amount", e.target.value)
              }
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={handleSaveInvoice}
              disabled={savingInvoice}
              className="px-4 py-2 rounded-lg bg-amber-700 text-amber-50 text-xs font-semibold hover:bg-amber-800 disabled:opacity-50"
            >
              {invoiceForm.id
                ? savingInvoice
                  ? "جاري تحديث الفاتورة..."
                  : "تحديث الفاتورة"
                : savingInvoice
                ? "جاري إضافة الفاتورة..."
                : "إضافة الفاتورة"}
            </button>
            <button
              type="button"
              onClick={handleResetForm}
              className="px-3 py-2 rounded-lg border border-stone-300 text-xs text-stone-700 bg-white hover:bg-stone-50"
            >
              جديد / إلغاء التعديل
            </button>
          </div>
        </div>
      </section>

      {/* 3) ملخص */}
      <section className="grid md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-amber-50/80 border border-amber-100 rounded-2xl px-4 py-3">
          <p className="text-[11px] text-stone-500"># Invoices</p>
          <p className="mt-2 text-xl font-semibold text-stone-900">
            {summary.invoiceCount}
          </p>
        </div>
        <div className="bg-white border border-amber-100 rounded-2xl px-4 py-3">
          <p className="text-[11px] text-stone-500">Gross Total</p>
          <p className="mt-2 text-xl font-semibold text-stone-900">
            {formatMoney(summary.grossTotal)}
          </p>
        </div>
        <div className="bg-white border border-amber-100 rounded-2xl px-4 py-3">
          <p className="text-[11px] text-stone-500">Total VAT</p>
          <p className="mt-2 text-xl font-semibold text-stone-900">
            {formatMoney(summary.vatTotal)}
          </p>
        </div>
        <div className="bg-white border border-amber-100 rounded-2xl px-4 py-3">
          <p className="text-[11px] text-stone-500">Net Total</p>
          <p className="mt-2 text-xl font-semibold text-stone-900">
            {formatMoney(summary.netTotal)}
          </p>
        </div>
        <div className="bg-emerald-50/80 border border-emerald-100 rounded-2xl px-4 py-3">
          <p className="text-[11px] text-stone-500">Total Paid</p>
          <p className="mt-2 text-xl font-semibold text-emerald-800">
            {formatMoney(summary.paidTotal)}
          </p>
        </div>
        <div className="bg-rose-50/80 border border-rose-100 rounded-2xl px-4 py-3">
          <p className="text-[11px] text-stone-500">Outstanding (Balance)</p>
          <p className="mt-2 text-xl font-semibold text-rose-700">
            {formatMoney(summary.balanceTotal)}
          </p>
        </div>
      </section>

      {/* 4) جدول الفواتير */}
      <section className="bg-white border border-amber-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-amber-100 text-xs text-stone-500">
          <span>Supplier invoices</span>
          <span>
            Showing {filteredRows.length} of {rows.length} invoices
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-[11px] md:text-xs">
            <thead className="bg-amber-50/70 text-stone-700">
              <tr>
                <th className="px-2 py-2 text-left">Date</th>
                <th className="px-2 py-2 text-left">Invoice #</th>
                <th className="px-2 py-2 text-left">Supplier</th>
                <th className="px-2 py-2 text-right">Gross</th>
                <th className="px-2 py-2 text-right">VAT</th>
                <th className="px-2 py-2 text-right">Net</th>
                <th className="px-2 py-2 text-right">Paid</th>
                <th className="px-2 py-2 text-right">Balance</th>
                <th className="px-2 py-2 text-left">Status</th>
                <th className="px-2 py-2 text-left">Last payment</th>
                <th className="px-2 py-2 text-left">Mode</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={11}
                    className="px-4 py-6 text-center text-stone-400"
                  >
                    لا يوجد فواتير في الفترة/المورد المحدد.
                  </td>
                </tr>
              )}

              {filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-stone-100 hover:bg-amber-50/40 cursor-pointer"
                  onClick={() => handleEditInvoice(row)}
                  title="اضغطي لتحرير هذه الفاتورة في الفورم بالأعلى"
                >
                  <td className="px-2 py-1">
                    {row.date_issued || "-"}
                  </td>
                  <td className="px-2 py-1">
                    {row.invoice_number}
                  </td>
                  <td className="px-2 py-1">
                    {row.supplier}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {formatMoney(row.gross_amount)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {formatMoney(row.vat_amount)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {formatMoney(row.net_amount)}
                  </td>
                  <td className="px-2 py-1 text-right text-emerald-800">
                    {formatMoney(row.totalPaid)}
                  </td>
                  <td className="px-2 py-1 text-right text-rose-700">
                    {formatMoney(row.balance)}
                  </td>
                  <td className="px-2 py-1">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        row.status === "Paid"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : row.status === "Partial"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-2 py-1">
                    {row.lastPayment || "-"}
                  </td>
                  <td className="px-2 py-1">
                    {row.paymentModes}
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

export default SupplierLedgerPage;
