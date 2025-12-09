// src/pages/InStoreInvoicePage.jsx

import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import VoiceInputField from "../components/VoiceInputField.jsx";

function InStoreInvoicePage() {
  const [loadingInvoice, setLoadingInvoice] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("success");

  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [invoiceTime, setInvoiceTime] = useState("");

  const [orderTypes, setOrderTypes] = useState([]);
  const [showNewOrderType, setShowNewOrderType] = useState(false);
  const [newOrderTypeName, setNewOrderTypeName] = useState("");

  const [customerProfileId, setCustomerProfileId] = useState(null);
  const [customerStatus, setCustomerStatus] = useState("");

  // florists for "اسم المنسق"
  const [florists, setFlorists] = useState([]);

  const [form, setForm] = useState({
    floristId: "", // ربط الفاتورة بالمنسق
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    customerNotes: "",
    orderTypeId: "",
    customDescription: "",
    bouquetPrice: "",
    deliveryFee: "",
    paymentMethod: "cash", // cash / pos / bank
  });

  const updateField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // ==== totals ====
  const bouquet = Number(form.bouquetPrice) || 0;
  const deliveryFee = Number(form.deliveryFee) || 0;
  const vatAmount = bouquet * 0.05; // 5% on bouquet only
  const netAmount = bouquet + deliveryFee;
  const grossAmount = netAmount + vatAmount;

  // ==== load helpers ====
  const loadOrderTypes = async () => {
    const { data, error } = await supabase
      .from("order_types")
      .select("id, name")
      .order("name");

    if (!error && data) {
      setOrderTypes(data);
    } else if (error) {
      console.error("Error loading order types", error);
    }
  };

  const loadFlorists = async () => {
    try {
      const { data, error } = await supabase
        .from("florists")
        .select("id, full_name, name, is_active")
        .order("full_name", { nullsFirst: false });

      if (!error && data) {
        setFlorists(data);
      } else if (error) {
        console.error("Error loading florists", error);
      }
    } catch (err) {
      console.error("Unexpected error loading florists", err);
    }
  };

  // ==== توليد رقم الفاتورة بصيغة INV-LIV-2025-11001 ====
  // 2025 = السنة، 11 = الشهر، 001 = التسلسل في نفس الشهر
  const generateNextInvoiceNo = async () => {
    setLoadingInvoice(true);
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0"); // "11"

      // نجيب آخر فاتورة لنفس السنة والشهر من عمود invoice_no
      const { data, error } = await supabase
        .from("sales")
        .select("invoice_no")
        .like("invoice_no", `INV-LIV-${year}-${month}%`)
        .order("invoice_no", { ascending: false })
        .limit(1);

      if (error) {
        console.error("Error loading last invoice", error);
      }

      let nextSeq = 1;

      if (data && data.length > 0 && data[0].invoice_no) {
        const lastInvoiceNo = data[0].invoice_no; // مثال: "INV-LIV-2025-11001"
        const lastPart = lastInvoiceNo.split("-")[3]; // "11001"
        const lastSeq = Number(lastPart.slice(-3)) || 0; // "001" → 1
        nextSeq = lastSeq + 1;
      }

      // الجزء الأخير = الشهر + التسلسل (3 خانات)
      const suffix = `${month}${String(nextSeq).padStart(3, "0")}`; // "11" + "002" = "11002"
      const newInvoiceNo = `INV-LIV-${year}-${suffix}`;

      setInvoiceNo(newInvoiceNo);
      setInvoiceDate(now.toISOString().slice(0, 10)); // YYYY-MM-DD
      setInvoiceTime(now.toTimeString().slice(0, 8)); // HH:MM:SS
    } finally {
      setLoadingInvoice(false);
    }
  };

  useEffect(() => {
    loadOrderTypes();
    loadFlorists();
    generateNextInvoiceNo();
  }, []);

  // ==== customer lookup by phone ====
  const findCustomerByPhone = async () => {
    setCustomerStatus("");
    setCustomerProfileId(null);

    const phone = form.customerPhone.trim();
    if (!phone) return;

    const { data, error } = await supabase
      .from("customer_profiles")
      .select("*")
      .eq("phone", phone)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("Error finding customer", error);
      setCustomerStatus("Error while searching customer");
      return;
    }

    if (data) {
      setCustomerProfileId(data.id);
      setForm((prev) => ({
        ...prev,
        customerName: data.full_name || prev.customerName,
        customerEmail: data.email || prev.customerEmail,
        customerNotes: data.notes || prev.customerNotes,
      }));
      setCustomerStatus("Existing customer loaded");
    } else {
      setCustomerProfileId(null);
      setCustomerStatus("New customer (will be created)");
    }
  };

  const handlePhoneBlur = () => {
    if (form.customerPhone.trim()) {
      findCustomerByPhone();
    }
  };

  // ==== add new order type ====
  const handleAddOrderType = async () => {
    const name = newOrderTypeName.trim();
    if (!name) return;
    try {
      const { data, error } = await supabase
        .from("order_types")
        .insert([{ name }])
        .select("id, name")
        .single();

      if (error) throw error;

      setOrderTypes((prev) => [...prev, data]);
      updateField("orderTypeId", data.id);
      setNewOrderTypeName("");
      setShowNewOrderType(false);
    } catch (err) {
      console.error("Error adding order type", err);
    }
  };

  // ==== validation ====
  const validateForm = () => {
    const errors = [];

    if (!invoiceNo) errors.push("Invoice number is missing");
    if (!form.floristId) errors.push("Florist is required");
    if (!form.customerPhone.trim())
      errors.push("Customer phone is required");
    if (!form.customerName.trim())
      errors.push("Customer name is required");
    if (!form.orderTypeId)
      errors.push("Order type is required");
    if (!form.bouquetPrice || isNaN(Number(form.bouquetPrice)))
      errors.push("Bouquet price must be a valid number");
    if (form.deliveryFee && isNaN(Number(form.deliveryFee)))
      errors.push("Delivery fee must be a number");

    return errors;
  };

  // ==== save invoice ====
  const handleCreateInvoice = async (e) => {
    e.preventDefault();
    setStatusMessage("");

    const errors = validateForm();
    if (errors.length > 0) {
      setStatusType("error");
      setStatusMessage(
        "Please fix these fields:\n• " + errors.join("\n• ")
      );
      return;
    }

    setSaving(true);

    try {
      // 1) Ensure customer profile exists
      let profileId = customerProfileId;
      if (!profileId) {
        const { data: newProfile, error: profileError } =
          await supabase
            .from("customer_profiles")
            .insert([
              {
                full_name: form.customerName || null,
                phone: form.customerPhone,
                email: form.customerEmail || null,
                notes: form.customerNotes || null,
              },
            ])
            .select("id")
            .single();

        if (profileError) throw profileError;
        profileId = newProfile.id;
        setCustomerProfileId(profileId);
      }

      // 2) Insert into sales
      const saleDate = invoiceDate;
      const saleTime = invoiceTime;

      const cash_sale =
        form.paymentMethod === "cash" ? grossAmount : 0;
      const pos_sale =
        form.paymentMethod === "pos" ? grossAmount : 0;
      const bank_transfer =
        form.paymentMethod === "bank" ? grossAmount : 0;

      const { error: salesError } = await supabase
        .from("sales")
        .insert([
          {
            invoice_no: invoiceNo,
            sale_date: saleDate,
            sale_time: saleTime,
            cash_sale,
            pos_sale,
            bank_transfer,
            net_amount: netAmount,
            gross_amount: grossAmount,
            vat_amount: vatAmount,
            bouquet_price: bouquet,
            delivery_fee: deliveryFee,
            order_type_id: form.orderTypeId
              ? Number(form.orderTypeId)
              : null,
            florist_id: form.floristId
              ? Number(form.floristId)
              : null,
            description: form.customDescription,
          },
        ]);

      if (salesError) throw salesError;

      // 3) Insert into customers (per invoice)
      const { error: customerInvoiceError } = await supabase
        .from("customers")
        .insert([
          {
            invoice_no: invoiceNo,
            customer_name: form.customerName,
            customer_phone: form.customerPhone,
            notes: form.customerNotes,
          },
        ]);

      if (customerInvoiceError) throw customerInvoiceError;

      setStatusType("success");
      setStatusMessage(
        `Invoice ${invoiceNo} created successfully.`
      );

      // 🔁 توليد رقم الفاتورة التالية مباشرة
      await generateNextInvoiceNo();

      // (اختياري) تنظيف الفورم للفاتورة الجديدة
      setCustomerProfileId(null);
      setCustomerStatus("");
      setForm((prev) => ({
        ...prev,
        customerName: "",
        customerPhone: "",
        customerEmail: "",
        customerNotes: "",
        orderTypeId: "",
        customDescription: "",
        bouquetPrice: "",
        deliveryFee: "",
        // paymentMethod نخليه كما هو
      }));
    } catch (err) {
      console.error("Error creating in-store invoice", err);
      setStatusType("error");
      setStatusMessage(
        "Something went wrong while creating the invoice:\n" +
          (err?.message || "Unknown error. Check the logs.")
      );
    } finally {
      setSaving(false);
    }
  };

  // ==== helpers for sending ====
  const buildInvoiceText = () => {
    return (
      `Invoice: ${invoiceNo}\n` +
      `Date: ${invoiceDate} ${invoiceTime}\n` +
      `Customer: ${form.customerName || ""}\n` +
      `Order: ${
        orderTypes.find((o) => o.id === Number(form.orderTypeId))
          ?.name || ""
      }\n` +
      `Description: ${form.customDescription || ""}\n` +
      `Bouquet: ${bouquet.toFixed(2)} AED\n` +
      (deliveryFee
        ? `Delivery: ${deliveryFee.toFixed(2)} AED\n`
        : "") +
      `VAT (5% on bouquet): ${vatAmount.toFixed(2)} AED\n` +
      `Total: ${grossAmount.toFixed(2)} AED`
    );
  };

  const handleSendWhatsApp = () => {
    if (!form.customerPhone) return;
    const text = encodeURIComponent(buildInvoiceText());
    const phone = form.customerPhone.replace(/[^0-9]/g, ""); // intl
    const url = `https://wa.me/${phone}?text=${text}`;
    window.open(url, "_blank");
  };

  const handleSendEmail = () => {
    if (!form.customerEmail) return;
    const subject = encodeURIComponent(
      `Invoice ${invoiceNo} from Flower Shop`
    );
    const body = encodeURIComponent(buildInvoiceText());
    const url = `mailto:${form.customerEmail}?subject=${subject}&body=${body}`;
    window.location.href = url;
  };

  const handlePrint = () => {
    window.print();
  };

  // ==== UI ====
  return (
    <div className=" space-y-6">
      {/* Status message في الأعلى مثل NewOrderPage */}
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

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">
            In-store invoice
          </h2>
          <p className="text-sm text-stone-500">
            Create a walk-in customer invoice directly from the shop.
          </p>
        </div>

        <div className="flex flex-col items-end text-sm">
          <div className="flex items-center gap-2">
            <span className="text-stone-500">Invoice no.</span>
            <span className="font-semibold text-stone-900">
              {loadingInvoice ? "Loading..." : invoiceNo || "--"}
            </span>
          </div>
          <div className="text-xs text-stone-500">
            Date:{" "}
            <span className="font-medium">
              {invoiceDate || "--"}
            </span>{" "}
            · Time:{" "}
            <span className="font-medium">
              {invoiceTime || "--"}
            </span>
          </div>
        </div>
      </header>

      <form
        onSubmit={handleCreateInvoice}
        className="space-y-6 pb-6"
      >
        {/* General information */}
        <section className="bg-amber-50/70 border border-amber-100 rounded-2xl shadow-sm p-5 space-y-4">
          <h3 className="text-lg font-semibold text-stone-800">
            General information
          </h3>
          <p className="text-xs text-stone-500">
            Connect this invoice to a florist and review the invoice number, date and time.
          </p>

          <div className="grid md:grid-cols-4 gap-4">
            {/* Florist */}
            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Florist
              </label>
              <select
                className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={form.floristId}
                onChange={(e) =>
                  updateField("floristId", e.target.value)
                }
              >
                <option value="">Select florist…</option>
                {florists.map((f) => (
                  <option key={f.id} value={f.id}>
                    {(f.full_name || f.name) ?? `Florist ${f.id}`}
                  </option>
                ))}
              </select>
              <span className="text-xs text-stone-400 mt-1">
                Active florists loaded from Supabase.
              </span>
            </div>

            {/* Invoice number */}
            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Invoice number
              </label>
              <input
                readOnly
                className="border border-stone-200 rounded-lg px-3 py-2 text-sm bg-stone-50 text-stone-900"
                value={loadingInvoice ? "Loading..." : invoiceNo || ""}
              />
              <span className="text-xs text-stone-400 mt-1">
                Format: INV-LIV-YYYY-MSSS (year, month, sequence).
              </span>
            </div>

            {/* Date */}
            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Date
              </label>
              <input
                readOnly
                className="border border-stone-200 rounded-lg px-3 py-2 text-sm bg-stone-50 text-stone-700"
                value={invoiceDate}
              />
            </div>

            {/* Time */}
            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Time
              </label>
              <input
                readOnly
                className="border border-stone-200 rounded-lg px-3 py-2 text-sm bg-stone-50 text-stone-700"
                value={invoiceTime}
              />
            </div>
          </div>
        </section>

        {/* Customer section */}
        <section className="bg-white border border-amber-100 rounded-2xl shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-stone-800">
              Customer
            </h3>
            {customerStatus && (
              <span className="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                {customerStatus}
              </span>
            )}
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Phone number
              </label>
              <div className="flex gap-2">
                <input
                  className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="e.g. 9715xxxxxxxx"
                  value={form.customerPhone}
                  onChange={(e) =>
                    updateField("customerPhone", e.target.value)
                  }
                  onBlur={handlePhoneBlur}
                />
                <button
                  type="button"
                  onClick={findCustomerByPhone}
                  className="px-3 py-2 rounded-lg border border-amber-300 text-xs bg-amber-50 text-amber-800 hover:bg-amber-100"
                >
                  Lookup
                </button>
              </div>
              <span className="text-xs text-stone-400 mt-1">
                Type the phone and press Lookup to search an existing
                customer.
              </span>
            </div>

            <VoiceInputField
              label="Customer name"
              value={form.customerName}
              onChange={(v) => updateField("customerName", v)}
              placeholder="Walk-in customer name"
            />

            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Email (optional)
              </label>
              <input
                className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                placeholder="For sending invoice"
                value={form.customerEmail}
                onChange={(e) =>
                  updateField("customerEmail", e.target.value)
                }
              />
            </div>

            <VoiceInputField
              label="Customer notes"
              value={form.customerNotes}
              onChange={(v) => updateField("customerNotes", v)}
              placeholder="VIP, prefers white flowers, etc."
            />
          </div>
        </section>

        {/* Order details */}
        <section className="bg-amber-50/60 border border-amber-100 rounded-2xl shadow-sm p-5 space-y-4">
          <h3 className="text-lg font-semibold text-stone-800">
            Order details
          </h3>

          <div className="grid md:grid-cols-3 gap-4 items-start">
            {/* Order type */}
            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Order type
              </label>
              <div className="flex gap-2">
                <select
                  className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  value={form.orderTypeId}
                  onChange={(e) =>
                    updateField("orderTypeId", e.target.value)
                  }
                >
                  <option value="">
                    Select type (bouquet, bag, box…)
                  </option>
                  {orderTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg border border-amber-300 text-xs bg-amber-50 text-amber-800 hover:bg-amber-100"
                  onClick={() =>
                    setShowNewOrderType((v) => !v)
                  }
                >
                  + New
                </button>
              </div>
            </div>

            {/* Bouquet price */}
            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Bouquet price (AED)
              </label>
              <input
                type="number"
                className="border border-stone-300 rounded-lg px-3 py-3 text-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={form.bouquetPrice}
                onChange={(e) =>
                  updateField("bouquetPrice", e.target.value)
                }
                placeholder="e.g. 350"
              />
              <span className="text-xs text-stone-500 mt-1">
                VAT 5% will be calculated on this amount only (excluding delivery).
              </span>
            </div>

            {/* Delivery fee */}
            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Delivery fee (optional)
              </label>
              <input
                type="number"
                className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={form.deliveryFee}
                onChange={(e) =>
                  updateField("deliveryFee", e.target.value)
                }
                placeholder="0 if pickup"
              />
            </div>
          </div>

          {/* description */}
          <VoiceInputField
            label="Arrangement description"
            value={form.customDescription}
            onChange={(v) =>
              updateField("customDescription", v)
            }
            placeholder="White bouquet with gold wrapping, add ribbon, etc."
            multiline
          />

          {/* New order type mini form */}
          {showNewOrderType && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-white/70 p-3 flex flex-wrap gap-2 items-end">
              <div className="flex-1 flex flex-col min-w-[200px]">
                <label className="text-xs text-stone-700 mb-1">
                  New order type name
                </label>
                <input
                  className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="e.g. Bouquet in bag"
                  value={newOrderTypeName}
                  onChange={(e) =>
                    setNewOrderTypeName(e.target.value)
                  }
                />
              </div>
              <button
                type="button"
                onClick={handleAddOrderType}
                className="px-4 py-2 rounded-lg bg-amber-700 text-amber-50 text-xs font-semibold hover:bg-amber-800"
              >
                Save type
              </button>
              <button
                type="button"
                onClick={() => setShowNewOrderType(false)}
                className="px-3 py-2 rounded-lg border border-stone-300 text-xs bg-white text-stone-700 hover:bg-stone-50"
              >
                Cancel
              </button>
            </div>
          )}
        </section>

        {/* Totals & payment */}
        <section className="bg-white border border-amber-100 rounded-2xl shadow-sm p-5 space-y-4">
          <h3 className="text-lg font-semibold text-stone-800">
            Amount & payment
          </h3>

          <div className="grid md:grid-cols-4 gap-4 items-end">
            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Net amount (bouquet + delivery)
              </label>
              <input
                readOnly
                className="border border-stone-200 rounded-lg px-3 py-2 text-sm bg-stone-50 text-stone-700"
                value={netAmount.toFixed(2)}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                VAT amount (5% on bouquet)
              </label>
              <input
                readOnly
                className="border border-stone-200 rounded-lg px-3 py-2 text-sm bg-stone-50 text-stone-700"
                value={vatAmount.toFixed(2)}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Total (with VAT)
              </label>
              <input
                readOnly
                className="border border-stone-200 rounded-lg px-3 py-2 text-sm bg-stone-50 text-stone-900 font-semibold"
                value={grossAmount.toFixed(2)}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Payment method
              </label>
              <select
                className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={form.paymentMethod}
                onChange={(e) =>
                  updateField("paymentMethod", e.target.value)
                }
              >
                <option value="cash">Cash</option>
                <option value="pos">Card (POS)</option>
                <option value="bank">Bank transfer</option>
              </select>
            </div>
          </div>
        </section>

        {/* Actions */}
        <div className="flex flex-wrap justify-between gap-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSendWhatsApp}
              disabled={!invoiceNo || !form.customerPhone}
              className="px-4 py-2 rounded-lg border border-emerald-300 text-sm text-emerald-800 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"
            >
              Send via WhatsApp
            </button>
            <button
              type="button"
              onClick={handleSendEmail}
              disabled={!invoiceNo || !form.customerEmail}
              className="px-4 py-2 rounded-lg border border-sky-300 text-sm text-sky-800 bg-sky-50 hover:bg-sky-100 disabled:opacity-50"
            >
              Send via Email
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!invoiceNo}
              className="px-4 py-2 rounded-lg border border-stone-300 text-sm text-stone-800 bg-white hover:bg-stone-50 disabled:opacity-50"
            >
              Print invoice
            </button>
          </div>

          <button
            type="submit"
            disabled={saving || loadingInvoice}
            className="px-6 py-2 rounded-lg bg-amber-700 text-amber-50 text-sm font-semibold shadow-sm hover:bg-amber-800 disabled:opacity-60"
          >
            {saving ? "Saving invoice..." : "Create invoice"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default InStoreInvoicePage;
