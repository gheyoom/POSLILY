// src/pages/InvoicesOrdersPage.jsx

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { generateThermalInvoice } from "../utils/thermalInvoicePdf";
import { generateThermalReceiptPDF } from "../utils/thermalReceipt58";




function InvoicesOrdersPage() {
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("success");

  const [rows, setRows] = useState([]);
  const [florists, setFlorists] = useState([]);
  const [sources, setSources] = useState([]);

  // filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [floristFilter, setFloristFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [search, setSearch] = useState("");

  // ==== load data ====
  const loadData = async () => {
    setLoading(true);
    setStatusMessage("");

    try {
      // 1) sales
      const { data: sales, error: salesError } = await supabase
        .from("sales")
        .select(
          `
          invoice_no,
          sale_date,
          sale_time,
          net_amount,
          vat_amount,
          gross_amount,
          bouquet_price,
          delivery_fee,
          florist_id,
          order_source_id,
          order_type_id,
          description
        `
        )
        .order("sale_date", { ascending: false })
        .order("sale_time", { ascending: false })
        .limit(200);

      if (salesError) throw salesError;
      if (!sales || sales.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const invoiceNos = sales.map((s) => s.invoice_no);

      // 2) customers (per invoice)
      const { data: customers, error: customersError } = await supabase
        .from("customers")
        .select("invoice_no, customer_name, customer_phone")
        .in("invoice_no", invoiceNos);

      if (customersError) throw customersError;

      const customerByInvoice = new Map();
      (customers || []).forEach((c) =>
        customerByInvoice.set(c.invoice_no, c)
      );

      // 3) deliveries (location / delivery_type)
      const { data: deliveries, error: deliveriesError } = await supabase
        .from("deliveries")
        .select(
          "invoice_no, delivery_fee, location, delivery_notes, delivery_type_id"
        )
        .in("invoice_no", invoiceNos);

      if (deliveriesError) throw deliveriesError;

      const deliveryByInvoice = new Map();
      (deliveries || []).forEach((d) =>
        deliveryByInvoice.set(d.invoice_no, d)
      );

      // 4) florists
      const { data: floristsData, error: floristsError } = await supabase
        .from("florists")
        .select("id, full_name, name")
        .order("full_name", { nullsFirst: false });

      if (floristsError) throw floristsError;
      setFlorists(floristsData || []);
      const floristById = new Map(
        (floristsData || []).map((f) => [
          f.id,
          f.full_name || f.name || `Florist ${f.id}`,
        ])
      );

      // 5) order sources
      const { data: sourcesData, error: sourcesError } = await supabase
        .from("order_sources")
        .select("id, name")
        .order("name");

      if (sourcesError) throw sourcesError;
      setSources(sourcesData || []);
      const sourceById = new Map(
        (sourcesData || []).map((s) => [s.id, s.name])
      );

      // 6) delivery types
      const { data: deliveryTypes, error: deliveryTypesError } =
        await supabase
          .from("delivery_types")
          .select("id, name")
          .order("name");

      if (deliveryTypesError) throw deliveryTypesError;
      const deliveryTypeById = new Map(
        (deliveryTypes || []).map((t) => [t.id, t.name])
      );

      // 7) order types
      const { data: orderTypes, error: orderTypesError } = await supabase
        .from("order_types")
        .select("id, name")
        .order("name");

      if (orderTypesError) throw orderTypesError;
      const orderTypeById = new Map(
        (orderTypes || []).map((t) => [t.id, t.name])
      );

      // 8) emails من customer_profiles (حسب رقم الجوال)
      const phones = Array.from(
        new Set(
          (customers || [])
            .map((c) => c.customer_phone)
            .filter((p) => !!p)
        )
      );

      let profilesByPhone = new Map();
      if (phones.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from("customer_profiles")
          .select("phone, email")
          .in("phone", phones);

        if (profilesError) {
          console.warn(
            "Could not load customer_profiles emails",
            profilesError
          );
        } else {
          profilesByPhone = new Map(
            (profiles || []).map((p) => [p.phone, p.email])
          );
        }
      }

      // build rows
      const merged = sales.map((s) => {
        const cust = customerByInvoice.get(s.invoice_no);
        const del = deliveryByInvoice.get(s.invoice_no);

        const phone = cust?.customer_phone || "";
        const email = phone ? profilesByPhone.get(phone) || "" : "";

        const floristName = s.florist_id
          ? floristById.get(s.florist_id) || `Florist ${s.florist_id}`
          : "";
        const sourceName = s.order_source_id
          ? sourceById.get(s.order_source_id) || `Source ${s.order_source_id}`
          : "";
        const deliveryTypeName = del?.delivery_type_id
          ? deliveryTypeById.get(del.delivery_type_id) ||
            `Type ${del.delivery_type_id}`
          : "";
        const orderTypeName = s.order_type_id
          ? orderTypeById.get(s.order_type_id) || ""
          : "";

        return {
          ...s,
          customer_name: cust?.customer_name || "",
          customer_phone: phone,
          customer_email: email,
          florist_name: floristName,
          source_name: sourceName,
          order_type_name: orderTypeName,
          delivery_location: del?.location || "",
          delivery_notes: del?.delivery_notes || "",
          delivery_type_name: deliveryTypeName,
          delivery_fee_from_delivery: del?.delivery_fee ?? null,
        };
      });

      setRows(merged);
    } catch (err) {
      console.error("Error loading invoices/orders:", err);
      setStatusType("error");
      setStatusMessage(
        "Could not load invoices:\n" + (err?.message || "Unknown error")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ==== helpers: filters ====
  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setFloristFilter("all");
    setSourceFilter("all");
    setSearch("");
  };

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // date range
      if (dateFrom && row.sale_date < dateFrom) return false;
      if (dateTo && row.sale_date > dateTo) return false;

      // florist
      if (
        floristFilter !== "all" &&
        String(row.florist_id) !== floristFilter
      ) {
        return false;
      }

      // source
      if (
        sourceFilter !== "all" &&
        String(row.order_source_id) !== sourceFilter
      ) {
        return false;
      }

      // search (invoice / name / phone)
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay =
          `${row.invoice_no || ""} ${
            row.customer_name || ""
          } ${row.customer_phone || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [rows, dateFrom, dateTo, floristFilter, sourceFilter, search]);

  // ==== summary cards (based on filteredRows) ====
  const summary = useMemo(() => {
    let net = 0;
    let vat = 0;
    let gross = 0;

    filteredRows.forEach((r) => {
      net += Number(r.net_amount) || 0;
      vat += Number(r.vat_amount) || 0;
      gross += Number(r.gross_amount) || 0;
    });

    return { totalCount: filteredRows.length, net, vat, gross };
  }, [filteredRows]);

  const formatAmount = (val) =>
    (Number(val) || 0).toLocaleString("en-AE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // ==== build text / actions ====
  const buildInvoiceText = (row) => {
    return (
      `Invoice: ${row.invoice_no}\n` +
      `Date: ${row.sale_date || ""} ${row.sale_time || ""}\n` +
      (row.source_name ? `Source: ${row.source_name}\n` : "") +
      (row.florist_name ? `Florist: ${row.florist_name}\n` : "") +
      (row.customer_name ? `Customer: ${row.customer_name}\n` : "") +
      (row.customer_phone ? `Phone: ${row.customer_phone}\n` : "") +
      (row.order_type_name ? `Order type: ${row.order_type_name}\n` : "") +
      (row.description ? `Description: ${row.description}\n` : "") +
      (row.delivery_type_name
        ? `Delivery: ${row.delivery_type_name} ${
            row.delivery_location ? `- ${row.delivery_location}` : ""
          }\n`
        : row.delivery_location
        ? `Delivery location: ${row.delivery_location}\n`
        : "") +
      (row.delivery_notes ? `Delivery notes: ${row.delivery_notes}\n` : "") +
      (row.bouquet_price
        ? `Bouquet: ${formatAmount(row.bouquet_price)} AED\n`
        : "") +
      (row.delivery_fee_from_delivery != null
        ? `Delivery fee: ${formatAmount(
            row.delivery_fee_from_delivery
          )} AED\n`
        : row.delivery_fee != null
        ? `Delivery fee: ${formatAmount(row.delivery_fee)} AED\n`
        : "") +
      (row.vat_amount
        ? `VAT (5% on bouquet): ${formatAmount(row.vat_amount)} AED\n`
        : "") +
      (row.gross_amount
        ? `Total: ${formatAmount(row.gross_amount)} AED\n`
        : "")
    );
  };

  const handleSendWhatsApp = (row) => {
    if (!row.customer_phone) {
      setStatusType("error");
      setStatusMessage(
        `No phone number for invoice ${row.invoice_no}.`
      );
      return;
    }
    const phoneDigits = row.customer_phone.replace(/[^0-9]/g, "");
    const text = encodeURIComponent(buildInvoiceText(row));
    const url = `https://wa.me/${phoneDigits}?text=${text}`;
    window.open(url, "_blank");
  };

  const handleSendEmail = (row) => {
    if (!row.customer_email) {
      setStatusType("error");
      setStatusMessage(
        `No email found for invoice ${row.invoice_no}.`
      );
      return;
    }
    const subject = encodeURIComponent(
      `Invoice ${row.invoice_no} from Flower Shop`
    );
    const body = encodeURIComponent(buildInvoiceText(row));
    const url = `mailto:${row.customer_email}?subject=${subject}&body=${body}`;
    window.location.href = url;
  };

  const handlePrint = (row) => {
    const text = buildInvoiceText(row);
    const html = `
      <html>
        <head>
          <title>Invoice ${row.invoice_no}</title>
          <style>
            body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; }
            h1 { font-size: 20px; margin-bottom: 8px; }
            pre { white-space: pre-wrap; font-size: 14px; }
          </style>
        </head>
        <body>
          <h1>Invoice ${row.invoice_no}</h1>
          <pre>${text}</pre>
          <script>window.print()</script>
        </body>
      </html>
    `;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  // تبسيط: نبني نص الفاتورة من الصف
const buildInvoiceTextFromRow = (row) => {
  if (!row) return "";

  const source = row.order_source_name || "";
  const florist = row.florist_name || "";
  const orderType = row.order_type_name || "";
  const customer = row.customer_name || "";
  const phone = row.customer_phone || "";

  const net = Number(row.net_amount || 0).toFixed(2);
  const vat = Number(row.vat_amount || 0).toFixed(2);
  const gross = Number(row.gross_amount || 0).toFixed(2);
  const bouquet = Number(row.bouquet_price || 0).toFixed(2);
  const delivery = Number(row.delivery_fee || 0).toFixed(2);
const handleViewPdf = (row) => {
  generateThermalInvoice(row, "view");
};

const handlePrintInvoice58 = (row) => {
  generateThermalInvoice(row, "print");
};

const handleDownloadPdf = (row) => {
  generateThermalInvoice(row, "download");
};

  return (
    `Invoice: ${row.invoice_no}\n` +
    `Date: ${row.sale_date || ""} ${row.sale_time || ""}\n` +
    (source ? `Source: ${source}\n` : "") +
    (florist ? `Florist: ${florist}\n` : "") +
    (customer ? `Customer: ${customer}\n` : "") +
    (phone ? `Phone: ${phone}\n` : "") +
    (orderType ? `Order type: ${orderType}\n` : "") +
    (row.description ? `Description: ${row.description}\n` : "") +
    `Bouquet: ${bouquet} AED\n` +
    (Number(row.delivery_fee || 0)
      ? `Delivery: ${delivery} AED\n`
      : "") +
    `Net: ${net} AED\n` +
    `VAT (5%): ${vat} AED\n` +
    `Total: ${gross} AED\n`
  );
};



// إرسال واتساب (نص فقط، مع إمكانية إرفاق الـ PDF يدوياً)
const handleSendWhatsAppFromRow = (row) => {
  if (!row || !row.customer_phone) return;

  const phoneDigits = String(row.customer_phone).replace(/[^0-9]/g, "");
  const text = encodeURIComponent(buildInvoiceTextFromRow(row));
  const url = `https://wa.me/${phoneDigits}?text=${text}`;
  window.open(url, "_blank");
};

// إرسال عبر الإيميل (يفتح برنامج الإيميل مع النص جاهز)
const handleSendEmailFromRow = (row) => {
  if (!row || !row.customer_email) {
    // لو ما عندنا إيميل محفوظ للفاتورة، نقدر نضيفه لاحقاً في الداتا
    alert("No customer email stored for this invoice.");
    return;
  }

  const subject = encodeURIComponent(
    `Invoice ${row.invoice_no} from Flower Shop`
  );
  const body = encodeURIComponent(buildInvoiceTextFromRow(row));

  const mailtoUrl = `mailto:${row.customer_email}?subject=${subject}&body=${body}`;
  window.location.href = mailtoUrl;
};

  // طباعة حرارية مباشرة (يفتح PDF صغير ويحاول يطبع)
  const handlePrintInvoice58 = (row) => {
    generateThermalReceiptPDF(row, "print");
  };

  // عرض الفاتورة كـ PDF في تبويب جديد
  const handleViewPdf = (row) => {
    generateThermalReceiptPDF(row, "view");
  };

  // تحميل الفاتورة كملف PDF
  const handleDownloadPdf = (row) => {
    generateThermalReceiptPDF(row, "download");
  };


  // ==== UI ====
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {statusMessage && (
        <div
          className={`rounded-xl px-4 py-3 text-sm border whitespace-pre-line ${
            statusType === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {statusMessage}
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">
            Invoices &amp; Orders
          </h2>
          <p className="text-sm text-stone-500">
            Review recent invoices for WhatsApp and in-store orders.
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-700 text-amber-50 text-sm font-semibold shadow-sm hover:bg-amber-800"
        >
          ⟳ Refresh
        </button>
      </header>

      {/* summary cards */}
      <section className="grid md:grid-cols-4 gap-4">
        <div className="bg-amber-50/80 border border-amber-100 rounded-2xl px-4 py-3">
          <p className="text-xs text-stone-500">
            Total invoices (filtered)
          </p>
          <p className="mt-2 text-3xl font-semibold text-stone-900">
            {summary.totalCount}
          </p>
        </div>
        <div className="bg-white border border-amber-100 rounded-2xl px-4 py-3">
          <p className="text-xs text-stone-500">Net amount</p>
          <p className="mt-2 text-xl font-semibold text-stone-900">
            {formatAmount(summary.net)} AED
          </p>
        </div>
        <div className="bg-white border border-amber-100 rounded-2xl px-4 py-3">
          <p className="text-xs text-stone-500">VAT total</p>
          <p className="mt-2 text-xl font-semibold text-stone-900">
            {formatAmount(summary.vat)} AED
          </p>
        </div>
        <div className="bg-white border border-amber-100 rounded-2xl px-4 py-3">
          <p className="text-xs text-stone-500">Gross amount</p>
          <p className="mt-2 text-xl font-semibold text-stone-900">
            {formatAmount(summary.gross)} AED
          </p>
        </div>
      </section>

      {/* Filters */}
      <section className="bg-white border border-amber-100 rounded-2xl shadow-sm p-4 space-y-3">
        <h3 className="text-sm font-semibold text-stone-800">Filters</h3>
        <div className="grid md:grid-cols-5 gap-3">
          <div className="flex flex-col">
            <label className="text-xs text-stone-600 mb-1">
              Date from
            </label>
            <input
              type="date"
              className="h-10 border border-stone-300 rounded-lg px-3 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-stone-600 mb-1">
              Date to
            </label>
            <input
              type="date"
              className="h-10 border border-stone-300 rounded-lg px-3 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-stone-600 mb-1">
              Florist
            </label>
            <select
              className="h-10 border border-stone-300 rounded-lg px-3 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
              value={floristFilter}
              onChange={(e) => setFloristFilter(e.target.value)}
            >
              <option value="all">All florists</option>
              {florists.map((f) => (
                <option key={f.id} value={String(f.id)}>
                  {(f.full_name || f.name) ?? `Florist ${f.id}`}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-stone-600 mb-1">
              Order source
            </label>
            <select
              className="h-10 border border-stone-300 rounded-lg px-3 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
            >
              <option value="all">All sources</option>
              {sources.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-stone-600 mb-1">
              Search
            </label>
            <input
              className="h-10 border border-stone-300 rounded-lg px-3 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="Invoice, customer, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={clearFilters}
            className="px-3 py-1.5 rounded-lg border border-stone-300 text-xs text-stone-700 bg-white hover:bg-stone-50"
          >
            Clear filters
          </button>
        </div>
      </section>

      {/* Table */}
      <section className="bg-white border border-amber-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-amber-100 text-xs text-stone-500">
          <span>Recent invoices</span>
          <span>
            Showing {filteredRows.length} of {rows.length} loaded
            invoices
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs md:text-sm">
            <thead className="bg-amber-50/70 text-stone-700">
              <tr>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Invoice</th>
                <th className="px-4 py-2 text-left">Customer</th>
                <th className="px-4 py-2 text-left">Source / Florist</th>
                <th className="px-4 py-2 text-left">Order &amp; Delivery</th>
                <th className="px-4 py-2 text-right">Net</th>
                <th className="px-4 py-2 text-right">VAT</th>
                <th className="px-4 py-2 text-right">Gross</th>
                <th className="px-4 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
  {filteredRows.length === 0 && !loading && (
    <tr>
      <td
        colSpan={9}
        className="px-4 py-6 text-center text-stone-400"
      >
        No invoices found for current filters.
      </td>
    </tr>
  )}

  {filteredRows.map((row) => (
    <tr
      key={row.invoice_no}
      className="border-t border-stone-100 hover:bg-amber-50/40 align-top"
    >
      {/* Date */}
      <td className="px-4 py-2 whitespace-nowrap">
        <div className="text-stone-800">
          {row.sale_date || "—"}
        </div>
        <div className="text-[11px] text-stone-400">
          {row.sale_time || ""}
        </div>
      </td>

      {/* Invoice */}
      <td className="px-4 py-2">
        <div className="font-semibold text-stone-900">
          {row.invoice_no}
        </div>
        <div className="text-[11px] text-stone-500">
          {row.payment_method_label || ""}
        </div>
      </td>

      {/* Customer */}
      <td className="px-4 py-2">
        <div className="text-stone-900">
          {row.customer_name || "—"}
        </div>
        <div className="text-[11px] text-stone-500">
          {row.customer_phone || ""}
        </div>
      </td>

      {/* Source / Florist */}
      <td className="px-4 py-2">
        <div className="text-[11px] text-stone-500">
          {row.source_name ? `Source` : ""}{" "}
        </div>
        <div className="text-stone-900">
          {row.source_name || "—"}
        </div>
        <div className="mt-1 text-[11px] text-stone-500">
          {row.florist_name ? `Florist: ${row.florist_name}` : ""}
        </div>
      </td>

      {/* Order & delivery */}
      <td className="px-4 py-2">
        <div className="text-[11px] text-stone-500">
          {row.order_type_name ? `Order` : ""}
        </div>
        <div className="text-stone-900">
          {row.order_type_name || ""}
        </div>
        {row.description && (
          <div className="text-[11px] text-stone-500 mt-1 line-clamp-2">
            {row.description}
          </div>
        )}
        {(row.delivery_type_name ||
          row.delivery_location ||
          row.delivery_fee_from_delivery != null) && (
          <div className="mt-1 text-[11px] text-stone-600">
            Delivery{" "}
            {row.delivery_type_name
              ? `- ${row.delivery_type_name}`
              : ""}
            {row.delivery_location
              ? ` · ${row.delivery_location}`
              : ""}
            {row.delivery_fee_from_delivery != null && (
              <> · {formatAmount(row.delivery_fee_from_delivery)} AED</>
            )}
          </div>
        )}
      </td>

      {/* Net */}
      <td className="px-4 py-2 text-right text-stone-800 whitespace-nowrap">
        {formatAmount(row.net_amount)} AED
      </td>

      {/* VAT */}
      <td className="px-4 py-2 text-right text-stone-800 whitespace-nowrap">
        {formatAmount(row.vat_amount)} AED
      </td>

      {/* Gross */}
      <td className="px-4 py-2 text-right text-stone-900 font-semibold whitespace-nowrap">
        {formatAmount(row.gross_amount)} AED
      </td>

   {/* Actions */}
<td className="px-4 py-2">
  <div className="flex flex-col gap-1 items-stretch">
    <button
      type="button"
      onClick={() => handlePrintInvoice58(row)}
      className="px-2 py-1 rounded-lg border border-stone-300 text-[11px] text-stone-800 bg-white hover:bg-stone-50"
    >
      Print 58mm
    </button>

    <button
      type="button"
      onClick={() => handleViewPdf(row)}
      className="px-2 py-1 rounded-lg border border-stone-300 text-[11px] text-stone-800 bg-white hover:bg-stone-50"
    >
      View PDF
    </button>

    <button
      type="button"
      onClick={() => handleDownloadPdf(row)}
      className="px-2 py-1 rounded-lg border border-stone-300 text-[11px] text-stone-800 bg-white hover:bg-stone-50"
    >
      Download PDF
    </button>

    <button
      type="button"
      onClick={() => handleSendWhatsAppFromRow(row)}
      disabled={!row.customer_phone}
      className="px-2 py-1 rounded-lg border border-emerald-300 text-[11px] text-emerald-800 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"
    >
      WhatsApp
    </button>

    <button
      type="button"
      onClick={() => handleSendEmailFromRow(row)}
      disabled={!row.customer_email}
      className="px-2 py-1 rounded-lg border border-sky-300 text-[11px] text-sky-800 bg-sky-50 hover:bg-sky-100 disabled:opacity-50"
    >
      Email
    </button>
  </div>
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

export default InvoicesOrdersPage;
