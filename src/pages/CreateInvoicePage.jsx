// src/pages/NewOrderPage.jsx

import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import VoiceInputField from "../components/VoiceInputField.jsx";

function NewOrderPage() {
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("success"); // "success" | "error"

  // main form state
  const [form, setForm] = useState({
    floristId: "",
    orderSourceId: "",
    customerName: "",
    customerPhone: "",
    customerNotes: "",
    description: "",
    occasion: "",
    orderNotes: "",
    bouquetPrice: 0,
    deliveryTypeId: "",
    deliveryLocation: "",
    deliveryNotes: "",
    deliveryFee: 0,
    netAmount: 0,
    vatAmount: 0,
    paymentMethod: "cash", // cash / pos / bank
  });

  // lookup data
  const [florists, setFlorists] = useState([]);
  const [deliveryTypes, setDeliveryTypes] = useState([]);
  const [locations, setLocations] = useState([]);

  // add-new-location UI state
  const [showNewLocationForm, setShowNewLocationForm] = useState(false);
  const [newLocation, setNewLocation] = useState({ name: "", fee: "" });

  // add-new-delivery-type UI state
  const [showNewDeliveryTypeForm, setShowNewDeliveryTypeForm] =
    useState(false);
  const [newDeliveryType, setNewDeliveryType] = useState({ name: "" });

  const updateField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // recalculates net amount when bouquet or delivery fee change
  const recalcNetFromBouquetAndDelivery = (
    bouquetValue,
    deliveryValue,
    prevForm
  ) => {
    const bouquet = Number(bouquetValue ?? prevForm.bouquetPrice) || 0;
    const delivery = Number(deliveryValue ?? prevForm.deliveryFee) || 0;
    return bouquet + delivery;
  };

  const handleBouquetPriceChange = (value) => {
    setForm((prev) => ({
      ...prev,
      bouquetPrice: value,
      netAmount: recalcNetFromBouquetAndDelivery(value, null, prev),
    }));
  };

  const handleDeliveryFeeChange = (value) => {
    setForm((prev) => ({
      ...prev,
      deliveryFee: value,
      netAmount: recalcNetFromBouquetAndDelivery(null, value, prev),
    }));
  };

  const calculateTotals = () => {
    const net = Number(form.netAmount) || 0;
    const vat = Number(form.vatAmount) || 0;
    const gross = net + vat;
    return { net, vat, gross };
  };

  const { gross } = calculateTotals();

  const generateInvoiceNo = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const t =
      String(now.getHours()).padStart(2, "0") +
      String(now.getMinutes()).padStart(2, "0") +
      String(now.getSeconds()).padStart(2, "0");
    const random = Math.floor(Math.random() * 1000);
    return `FS-${y}${m}${d}-${t}-${random}`;
  };

  // load lookups
  useEffect(() => {
    const loadLookups = async () => {
      try {
        // florists
        const { data: floristsData, error: floristsError } = await supabase
          .from("florists")
          .select("id, full_name, name, is_active")
          .order("full_name", { nullsFirst: false });

        console.log("Florists loaded:", floristsData, floristsError);
        if (!floristsError && floristsData) {
          setFlorists(floristsData);
        }

        // delivery types
const { data: typesData, error: typesError } = await supabase
  .from("delivery_types")
  .select("id, name")          // 👈 ما نطلب is_active عشان نتفادى أي اختلاف
  .order("name");

if (!typesError && typesData) {
  setDeliveryTypes(typesData);
} else if (typesError) {
  console.warn(
    "Could not load delivery_types (table may not exist yet)",
    typesError
  );
}


        // delivery locations
        const { data: locationsData, error: locationsError } = await supabase
          .from("delivery_locations")
          .select("id, name, fee, is_active")
          .order("name");

        if (!locationsError && locationsData) {
          setLocations(locationsData);
        } else if (locationsError) {
          console.warn(
            "Could not load delivery_locations (table may not exist yet)",
            locationsError
          );
        }
      } catch (err) {
        console.error("Unexpected error loading lookups", err);
      }
    };

    loadLookups();
  }, []);

  const handleLocationChange = (locationName) => {
    setForm((prev) => {
      const loc = locations.find((l) => l.name === locationName);
      const deliveryFee = loc ? loc.fee : 0;
      return {
        ...prev,
        deliveryLocation: locationName,
        deliveryFee,
        netAmount: recalcNetFromBouquetAndDelivery(
          prev.bouquetPrice,
          deliveryFee,
          prev
        ),
      };
    });
  };

  const handleAddLocation = async () => {
    if (!newLocation.name || !newLocation.fee) return;

    try {
      const { data, error } = await supabase
        .from("delivery_locations")
        .insert([
          {
            name: newLocation.name,
            fee: Number(newLocation.fee),
          },
        ])
        .select("id, name, fee")
        .single();

      if (error) throw error;

      setLocations((prev) => [...prev, data]);
      handleLocationChange(data.name);
      setNewLocation({ name: "", fee: "" });
      setShowNewLocationForm(false);
    } catch (err) {
      console.error("Error adding location", err);
    }
  };

  const handleAddDeliveryType = async () => {
    if (!newDeliveryType.name.trim()) return;

    try {
      const { data, error } = await supabase
        .from("delivery_types")
        .insert([{ name: newDeliveryType.name.trim() }])
        .select("id, name, is_active")
        .single();

      if (error) throw error;

      setDeliveryTypes((prev) => [...prev, data]);
      updateField("deliveryTypeId", data.id);
      setNewDeliveryType({ name: "" });
      setShowNewDeliveryTypeForm(false);
    } catch (err) {
      console.error("Error adding delivery type", err);
    }
  };

  const validateForm = () => {
    const errors = [];

    // required selections
    if (!form.floristId) {
      errors.push("Florist is required");
    }

    // customer info
    if (!form.customerName.trim()) {
      errors.push("Customer name is required");
    }
    if (!form.customerPhone.trim()) {
      errors.push("Customer phone is required");
    }

    // order details
    if (!form.description.trim()) {
      errors.push("Arrangement description is required");
    }

    // bouquet price / delivery / net
    if (form.bouquetPrice === "" || isNaN(Number(form.bouquetPrice))) {
      errors.push("Bouquet price must be a number");
    }
    if (form.deliveryFee === "" || isNaN(Number(form.deliveryFee))) {
      errors.push("Delivery fee must be a number");
    }
    if (form.netAmount === "" || isNaN(Number(form.netAmount))) {
      errors.push("Net amount must be a number");
    }

    // delivery details
    if (!form.deliveryTypeId) {
      errors.push("Delivery type is required");
    }
    if (!form.deliveryLocation.trim()) {
      errors.push("Delivery location is required");
    }

    return errors;
  };


    const handleConfirmAndCreateInvoice = async (e) => {
    e.preventDefault();
    setStatusMessage("");

    // 1) validation قبل الاتصال بـ Supabase
    const validationErrors = validateForm();

    if (validationErrors.length > 0) {
      setStatusType("error");
      setStatusMessage(
        "Please fix these fields:\n• " + validationErrors.join("\n• ")
      );
      return; // لا نكمل الحفظ
    }

    setLoading(true);

    try {
      const { net, vat, gross } = calculateTotals();
      const invoiceNo = generateInvoiceNo();
      const now = new Date();
      const saleDate = now.toISOString().slice(0, 10); // YYYY-MM-DD
      const saleTime = now.toTimeString().slice(0, 8); // HH:MM:SS

      const cash_sale =
        form.paymentMethod === "cash" ? gross : 0;
      const pos_sale =
        form.paymentMethod === "pos" ? gross : 0;
      const bank_transfer =
        form.paymentMethod === "bank" ? gross : 0;

      // 1) Insert into sales
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
            net_amount: net,
            gross_amount: gross,
            vat_amount: vat,
            vat_net_amount: net,
            vat_gross_amount: gross,
            florist_id: form.floristId
              ? Number(form.floristId)
              : null,
            order_source_id: form.orderSourceId
              ? Number(form.orderSourceId)
              : null,
            description: form.description,
            bouquet_price: Number(form.bouquetPrice) || 0,
          },
        ]);

      if (salesError) throw salesError;

      // 2) Insert into customers
      const { error: customerError } = await supabase
        .from("customers")
        .insert([
          {
            invoice_no: invoiceNo,
            customer_name: form.customerName,
            customer_phone: form.customerPhone,
            notes: form.customerNotes,
          },
        ]);

      if (customerError) throw customerError;

      // 3) Insert into deliveries
      const { error: deliveryError } = await supabase
        .from("deliveries")
        .insert([
          {
            invoice_no: invoiceNo,
            delivery_type_id: form.deliveryTypeId
              ? Number(form.deliveryTypeId)
              : null,
            delivery_fee: Number(form.deliveryFee) || 0,
            location: form.deliveryLocation,
            delivery_notes: form.deliveryNotes,
          },
        ]);

      if (deliveryError) throw deliveryError;

      setStatusType("success");
      setStatusMessage(
        `Invoice created successfully. Invoice No: ${invoiceNo}`
      );
    } catch (err) {
      console.error("Supabase error:", err);

      // نعرض رسالة أوضح من Supabase
      const extra =
        err?.message ||
        err?.details ||
        "Unknown error from Supabase.";

      setStatusType("error");
      setStatusMessage(
        "Something went wrong while creating the invoice:\n" + extra
      );
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {statusMessage && (
        <div
          className={`rounded-xl px-4 py-3 text-sm border ${
            statusType === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {statusMessage}
        </div>
      )}

      <form
        onSubmit={handleConfirmAndCreateInvoice}
        className="space-y-6"
      >
        {/* General info */}
        <section className="bg-amber-50/70 border border-amber-100 rounded-2xl shadow-sm p-5 space-y-4">
          <h3 className="text-lg font-semibold text-stone-800">
            General information
          </h3>
          <p className="text-xs text-stone-500">
            Connect this order to a florist and source (e.g. WhatsApp), and choose the payment method.
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            {/* Florist dropdown */}
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

            {/* Order source ID */}
            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Order source ID
              </label>
              <input
                type="number"
                className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                placeholder="e.g. WhatsApp source id"
                value={form.orderSourceId}
                onChange={(e) =>
                  updateField("orderSourceId", e.target.value)
                }
              />
            </div>

            {/* Payment method */}
            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Payment method
              </label>
              <select
                className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
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

        {/* Customer info */}
        <section className="bg-white border border-amber-100 rounded-2xl shadow-sm p-5 space-y-4">
          <h3 className="text-lg font-semibold text-stone-800">
            Customer details
          </h3>
          <div className="grid md:grid-cols-3 gap-4">
            <VoiceInputField
              label="Customer name"
              value={form.customerName}
              onChange={(v) => updateField("customerName", v)}
              placeholder="Type or use voice input"
            />
            <VoiceInputField
              label="Phone number"
              value={form.customerPhone}
              onChange={(v) => updateField("customerPhone", v)}
              placeholder="e.g. 0500000000"
            />
            <VoiceInputField
              label="Customer notes"
              value={form.customerNotes}
              onChange={(v) => updateField("customerNotes", v)}
              placeholder="VIP, repeat customer, etc."
            />
          </div>
        </section>

        {/* Order details */}
        <section className="bg-white border border-amber-100 rounded-2xl shadow-sm p-5 space-y-4">
          <h3 className="text-lg font-semibold text-stone-800">
            Order details
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <VoiceInputField
              label="Arrangement description"
              value={form.description}
              onChange={(v) => updateField("description", v)}
              placeholder="e.g. Medium white bouquet with a soft pink touch..."
              multiline
            />

            <div className="space-y-3">
              <div className="flex flex-col">
                <label className="text-sm text-stone-700 mb-1">
                  Occasion
                </label>
                <input
                  className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  value={form.occasion}
                  onChange={(e) =>
                    updateField("occasion", e.target.value)
                  }
                  placeholder="Graduation, Birthday, Romantic..."
                />
              </div>

              <div className="flex flex-col">
                <label className="text-sm text-stone-700 mb-1">
                  Bouquet price (AED)
                </label>
                <input
                  type="number"
                  className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  value={form.bouquetPrice}
                  onChange={(e) =>
                    handleBouquetPriceChange(e.target.value)
                  }
                  placeholder="e.g. 250"
                />
                <span className="text-xs text-stone-400 mt-1">
                  Net amount will be calculated as bouquet price + delivery fee (you can still adjust it manually).
                </span>
              </div>

              <VoiceInputField
                label="Extra notes"
                value={form.orderNotes}
                onChange={(v) => updateField("orderNotes", v)}
                placeholder="Do not mention sender name, special request..."
                multiline
              />
            </div>
          </div>
        </section>

        {/* Delivery */}
        <section className="bg-white border border-amber-100 rounded-2xl shadow-sm p-5 space-y-4">
          <h3 className="text-lg font-semibold text-stone-800">
            Delivery details
          </h3>
          <div className="grid md:grid-cols-3 gap-4">
            {/* Delivery type dropdown + new */}
            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Delivery type
              </label>
              <div className="flex gap-2">
                <select
                  className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  value={form.deliveryTypeId}
                  onChange={(e) =>
                    updateField("deliveryTypeId", e.target.value)
                  }
                >
                  <option value="">Select…</option>
                  {deliveryTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg border border-amber-300 text-xs text-amber-800 bg-amber-50 hover:bg-amber-100"
                  onClick={() =>
                    setShowNewDeliveryTypeForm((v) => !v)
                  }
                >
                  + New
                </button>
              </div>
            </div>

            {/* Location dropdown + new */}
            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Location / area
              </label>
              <div className="flex gap-2">
                <select
                  className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  value={form.deliveryLocation}
                  onChange={(e) =>
                    handleLocationChange(e.target.value)
                  }
                >
                  <option value="">Select location…</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.name}>
                      {loc.name}{" "}
                      {loc.fee ? `(${loc.fee} AED)` : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg border border-amber-300 text-xs text-amber-800 bg-amber-50 hover:bg-amber-100"
                  onClick={() =>
                    setShowNewLocationForm((v) => !v)
                  }
                >
                  + New
                </button>
              </div>
            </div>

            {/* Delivery notes */}
            <VoiceInputField
              label="Delivery notes"
              value={form.deliveryNotes}
              onChange={(v) => updateField("deliveryNotes", v)}
              placeholder="Deliver to reception, call before arrival..."
            />
          </div>

          {/* New delivery type form (no nested form!) */}
          {showNewDeliveryTypeForm && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
              <p className="text-xs text-stone-700 font-medium">
                Add new delivery type
              </p>
              <div className="grid md:grid-cols-3 gap-3 items-end">
                <div className="flex flex-col md:col-span-2">
                  <label className="text-xs text-stone-700 mb-1">
                    Type name
                  </label>
                  <input
                    className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white/90 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={newDeliveryType.name}
                    onChange={(e) =>
                      setNewDeliveryType({ name: e.target.value })
                    }
                    placeholder="e.g. Delivery, Pickup, Courier"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg bg-amber-700 text-amber-50 text-xs font-semibold hover:bg-amber-800"
                    onClick={handleAddDeliveryType}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg border border-stone-300 text-xs text-stone-700 bg-white hover:bg-stone-50"
                    onClick={() =>
                      setShowNewDeliveryTypeForm(false)
                    }
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* New location form (no nested form!) */}
          {showNewLocationForm && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
              <p className="text-xs text-stone-700 font-medium">
                Add new delivery location
              </p>
              <div className="grid md:grid-cols-3 gap-3">
                <div className="flex flex-col">
                  <label className="text-xs text-stone-700 mb-1">
                    Location name
                  </label>
                  <input
                    className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white/90 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={newLocation.name}
                    onChange={(e) =>
                      setNewLocation((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    placeholder="e.g. Abu Dhabi - New Area"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-stone-700 mb-1">
                    Delivery fee (AED)
                  </label>
                  <input
                    type="number"
                    className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white/90 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={newLocation.fee}
                    onChange={(e) =>
                      setNewLocation((prev) => ({
                        ...prev,
                        fee: e.target.value,
                      }))
                    }
                    placeholder="e.g. 20"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg bg-amber-700 text-amber-50 text-xs font-semibold hover:bg-amber-800"
                    onClick={handleAddLocation}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg border border-stone-300 text-xs text-stone-700 bg-white hover:bg-stone-50"
                    onClick={() =>
                      setShowNewLocationForm(false)
                    }
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delivery fee */}
          <div className="w-40 ml-auto mt-4">
            <label className="text-sm text-stone-700 mb-1">
              Delivery fee
            </label>
            <input
              type="number"
              className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-amber-400"
              value={form.deliveryFee}
              onChange={(e) =>
                handleDeliveryFeeChange(e.target.value)
              }
            />
          </div>
        </section>

        {/* Amounts */}
        <section className="bg-white border border-amber-100 rounded-2xl shadow-sm p-5 space-y-4">
          <h3 className="text-lg font-semibold text-stone-800">
            Amount & VAT
          </h3>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Net amount (before VAT)
              </label>
              <input
                type="number"
                className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={form.netAmount}
                onChange={(e) =>
                  updateField("netAmount", e.target.value)
                }
              />
            </div>

            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                VAT amount
              </label>
              <input
                type="number"
                className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={form.vatAmount}
                onChange={(e) =>
                  updateField("vatAmount", e.target.value)
                }
              />
            </div>

            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Gross amount (with VAT)
              </label>
              <input
                type="number"
                readOnly
                className="border border-stone-200 rounded-lg px-3 py-2 text-sm bg-stone-50 text-stone-700"
                value={gross}
              />
            </div>
          </div>
        </section>

        {/* Buttons */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="px-4 py-2 rounded-lg border border-stone-300 text-sm text-stone-700 bg-white hover:bg-amber-50 transition"
            onClick={() =>
              setStatusMessage(
                "Draft saving is not implemented yet (can be added later)."
              )
            }
          >
            Save as draft
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 rounded-lg bg-amber-700 text-amber-50 text-sm font-semibold shadow-sm hover:bg-amber-800 disabled:opacity-60 transition"
          >
            {loading
              ? "Creating invoice..."
              : "Confirm order & create invoice"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default NewOrderPage;
