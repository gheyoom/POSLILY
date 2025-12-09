// src/pages/StockPage.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

const CATEGORY_OPTIONS = [
  { value: "flower", label: "Flower" },
  { value: "vase", label: "Vase" },
  { value: "wrapping", label: "Wrapping paper" },
  { value: "accessory", label: "Accessory" },
  { value: "other", label: "Other" },
];

function StockPage() {


  const [items, setItems] = useState([]);
  const [supplierLinks, setSupplierLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("success");

  // filters
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");

  // new / edit item
  const [form, setForm] = useState({
    id: null,
    code: "",
    name: "",
    category: "flower",
    unit: "stem",
    current_qty: "",
    min_qty: "",
    photo_url: "",
    notes: "",
  });

  // قائمة الموردين من Supabase
const [suppliers, setSuppliers] = useState([]);

// أسعار الموردين لهذا المنتج
const [supplierPrices, setSupplierPrices] = useState([
  { supplierId: "", purchasePrice: "", supplierInvoice: "" },
]);

// فورم إضافة مورد جديد من نفس الشاشة
const [showNewSupplierForm, setShowNewSupplierForm] = useState(false);
const [newSupplier, setNewSupplier] = useState({
  name: "",
  company_name: "",
  trn: "",
  phone: "",
});
// نهاية فورم إضافة مورد جديد
const loadSuppliers = async () => {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name")
    .order("name");

  if (!error && data) {
    setSuppliers(data);
  } else if (error) {
    console.error("Error loading suppliers", error);
  }
};

useEffect(() => {
  loadSuppliers();
}, []);
// نهاية قائمة الموردين من Supabase
const addSupplierRow = () => {
  setSupplierPrices((prev) => [
    ...prev,
    { supplierId: "", purchasePrice: "", supplierInvoice: "" },
  ]);
};

const updateSupplierRow = (index, field, value) => {
  setSupplierPrices((prev) =>
    prev.map((row, i) =>
      i === index ? { ...row, [field]: value } : row
    )
  );
};

const removeSupplierRow = (index) => {
  setSupplierPrices((prev) => prev.filter((_, i) => i !== index));
};
//
  
  const [uploadingImage, setUploadingImage] = useState(false);

  const resetForm = () => {
    setForm({
      id: null,
      code: "",
      name: "",
      category: "flower",
      unit: "stem",
      current_qty: "",
      min_qty: "",
      photo_url: "",
      notes: "",
    });
   setSupplierPrices([
    { supplierId: "", purchasePrice: "", supplierInvoice: "" },
]);
  };

  const updateField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

const handleAddNewSupplier = async () => {
  const name = newSupplier.name.trim();
  if (!name) {
    setStatusType("error");
    setStatus("Please enter supplier name.");
    return;
  }

  try {
    const { data, error } = await supabase
      .from("suppliers")
      .insert([
        {
          name: newSupplier.name,
          company_name: newSupplier.company_name || null,
          trn: newSupplier.trn || null,
          phone: newSupplier.phone || null,
        },
      ])
      .select("id, name")
      .single();

    if (error) throw error;

    // add to dropdown list
    setSuppliers((prev) => [...prev, data]);

    // attach new supplier to last row in the table
    setSupplierPrices((prev) => {
      if (prev.length === 0) {
        return [
          {
            supplierId: data.id,
            purchasePrice: "",
            supplierInvoice: "",
          },
        ];
      }
      const clone = [...prev];
      clone[clone.length - 1] = {
        ...clone[clone.length - 1],
        supplierId: data.id,
      };
      return clone;
    });

    setNewSupplier({
      name: "",
      company_name: "",
      trn: "",
      phone: "",
    });
    setShowNewSupplierForm(false);

    setStatusType("success");
    setStatus("Supplier added successfully.");
  } catch (err) {
    console.error("Error adding supplier", err);
    setStatusType("error");
    setStatus(
      "Could not add supplier:\n" + (err?.message || "Unknown error")
    );
  }
};

  // ==== تحميل البيانات ====
  const loadStock = async () => {
    setLoading(true);
    setStatus("");

    try {
      const { data: itemsData, error: itemsError } = await supabase
        .from("stock_items")
        .select(
          "id, code, name, category, unit, current_qty, min_qty, photo_url, notes"
        )
        .order("category")
        .order("name");

      if (itemsError) throw itemsError;

      const { data: linksData, error: linksError } = await supabase
        .from("stock_item_suppliers")
        .select(
          "id, stock_item_id, supplier_name, purchase_price, currency"
        );

      if (linksError) throw linksError;

      setItems(itemsData || []);
      setSupplierLinks(linksData || []);
    } catch (err) {
      console.error("Error loading stock:", err);
      setStatusType("error");
      setStatus(
        "Could not load stock items:\n" + (err?.message || "Unknown error")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStock();
  }, []);

  // ==== فلترة / ملخص ====
  const itemsWithSuppliers = useMemo(() => {
    const byItem = new Map();
    supplierLinks.forEach((link) => {
      const arr = byItem.get(link.stock_item_id) || [];
      arr.push(link);
      byItem.set(link.stock_item_id, arr);
    });

    return items.map((item) => {
      const suppliers = byItem.get(item.id) || [];
      const cheapest = suppliers.length
        ? Math.min(...suppliers.map((s) => Number(s.purchase_price) || 0))
        : null;
      return { ...item, suppliers, cheapestPrice: cheapest };
    });
  }, [items, supplierLinks]);

  const filteredItems = useMemo(() => {
    return itemsWithSuppliers.filter((item) => {
      if (
        categoryFilter !== "all" &&
        item.category !== categoryFilter
      ) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${item.code} ${item.name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [itemsWithSuppliers, categoryFilter, search]);

  const lowStockCount = useMemo(
    () =>
      filteredItems.filter(
        (i) =>
          i.min_qty != null &&
          Number(i.min_qty) > 0 &&
          Number(i.current_qty || 0) <= Number(i.min_qty)
      ).length,
    [filteredItems]
  );

  // ==== رفع صورة (مناسب للجوال) ====
  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      const ext = file.name.split(".").pop();
      const fileName = `item-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

      const { data, error } = await supabase.storage
        .from("product-images") // تأكدي أن البكت اسمه product-images
        .upload(fileName, file);

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage
        .from("product-images")
        .getPublicUrl(data.path);

      updateField("photo_url", publicUrl);
    } catch (err) {
      console.error("Image upload error:", err);
      setStatusType("error");
      setStatus(
        "Could not upload image:\n" + (err?.message || "Unknown error")
      );
    } finally {
      setUploadingImage(false);
    }
  };

  // ==== إنشاء كود بسيط تلقائيًا (F-0001 / V-0001 ...) ====
  const suggestCode = () => {
    const prefix =
      form.category === "flower"
        ? "F"
        : form.category === "vase"
        ? "V"
        : form.category === "wrapping"
        ? "W"
        : form.category === "accessory"
        ? "A"
        : "P";

    const sameCat = items.filter((i) => i.category === form.category);
    const nums = sameCat
      .map((i) => {
        const part = (i.code || "").split("-")[1];
        return Number(part) || 0;
      })
      .filter((n) => n > 0);
    const next = (nums.length ? Math.max(...nums) + 1 : 1)
      .toString()
      .padStart(3, "0");

    updateField("code", `${prefix}-${next}`);
  };

  // ==== حفظ صنف جديد + الموردين ====
  const handleSave = async (e) => {
    e.preventDefault();
    setStatus("");

    if (!form.name.trim()) {
      setStatusType("error");
      setStatus("Please enter item name.");
      return;
    }

    try {
      // لو ما حطينا كود، نقترحه
      let code = form.code?.trim();
      if (!code) {
        const prefix =
          form.category === "flower"
            ? "F"
            : form.category === "vase"
            ? "V"
            : form.category === "wrapping"
            ? "W"
            : form.category === "accessory"
            ? "A"
            : "P";
        code = `${prefix}-${Date.now().toString().slice(-4)}`;
      }

      // 1) insert into stock_items
      const { data: item, error: itemError } = await supabase
        .from("stock_items")
        .insert([
          {
            code,
            name: form.name.trim(),
            category: form.category,
            unit: form.unit || "piece",
            current_qty:
              form.current_qty === ""
                ? 0
                : Number(form.current_qty) || 0,
            min_qty:
              form.min_qty === ""
                ? 0
                : Number(form.min_qty) || 0,
            photo_url: form.photo_url || null,
            notes: form.notes || null,
          },
        ])
        .select("id, code, name, category, unit, current_qty, min_qty, photo_url, notes")
        .single();

      if (itemError) throw itemError;

      // 2) insert suppliers (الأسطر اللي فيها اسم وسعر)
      // ✅ NEW – use supplierPrices from the UI table
const suppliersToInsert = supplierPrices
  .filter(
    (row) =>
      row.supplierId &&
      row.purchasePrice !== "" &&
      !isNaN(Number(row.purchasePrice))
  )
  .map((row) => ({
    stock_item_id: item.id,
    supplier_id: row.supplierId,
    supplier_invoice: row.supplierInvoice || null,
    purchase_price: Number(row.purchasePrice),
    currency: "AED", // optional, only if your table has this column
  }));


      if (suppliersToInsert.length > 0) {
        const { error: supError } = await supabase
          .from("stock_item_suppliers")
          .insert(suppliersToInsert);

        if (supError) throw supError;
      }

      setStatusType("success");
      setStatus("Item saved successfully.");
      resetForm();
      await loadStock();
    } catch (err) {
      console.error("Error saving item:", err);
      setStatusType("error");
      setStatus(
        "Could not save item:\n" + (err?.message || "Unknown error")
      );
    }
  };

  const formatNumber = (n) =>
    (Number(n) || 0).toLocaleString("en-US", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });

  // ==== UI ====
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

      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">
            Stock &amp; Products
          </h2>
          <p className="text-sm text-stone-500">
            Track all flowers, vases, wrapping and accessories in your
            stock.
          </p>
        </div>
      </header>

      {/* Summary */}
      <section className="grid md:grid-cols-4 gap-4">
        <div className="bg-amber-50/80 border border-amber-100 rounded-2xl px-4 py-3">
          <p className="text-xs text-stone-500">Total items</p>
          <p className="mt-2 text-2xl font-semibold text-stone-900">
            {filteredItems.length}
          </p>
        </div>
        <div className="bg-white border border-amber-100 rounded-2xl px-4 py-3">
          <p className="text-xs text-stone-500">Low stock items</p>
          <p className="mt-2 text-2xl font-semibold text-rose-700">
            {lowStockCount}
          </p>
        </div>
      </section>

      {/* Filters + quick add */}
      <section className="bg-white border border-amber-100 rounded-2xl shadow-sm p-4 space-y-4">
        <div className="grid md:grid-cols-3 gap-3">
          <div className="flex flex-col">
            <label className="text-xs text-stone-600 mb-1">
              Category
            </label>
            <select
              className="h-10 border border-stone-300 rounded-lg px-3 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All categories</option>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-stone-600 mb-1">Search</label>
            <input
              className="h-10 border border-stone-300 rounded-lg px-3 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="Code or name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Quick add form */}
        <form
          onSubmit={handleSave}
          className="mt-4 border-t border-amber-100 pt-4 space-y-4"
        >
          <h3 className="text-sm font-semibold text-stone-800">
            Quick add new item
          </h3>
          <div className="grid md:grid-cols-4 gap-3">
            <div className="flex flex-col">
              <label className="text-xs text-stone-600 mb-1">
                Category
              </label>
              <select
                className="h-10 border border-stone-300 rounded-lg px-3 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={form.category}
                onChange={(e) => updateField("category", e.target.value)}
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col md:col-span-2">
              <label className="text-xs text-stone-600 mb-1">
                Name (e.g. White Rose 60cm)
              </label>
              <input
                className="h-10 border border-stone-300 rounded-lg px-3 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
              />
            </div>

            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-stone-600">
                  Code
                </label>
                <button
                  type="button"
                  className="text-[11px] text-amber-700"
                  onClick={suggestCode}
                >
                  Suggest
                </button>
              </div>
              <input
                className="h-10 border border-stone-300 rounded-lg px-3 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={form.code}
                onChange={(e) => updateField("code", e.target.value)}
                placeholder="F-0001, V-0001..."
              />
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-3">
            <div className="flex flex-col">
              <label className="text-xs text-stone-600 mb-1">
                Unit
              </label>
              <select
                className="h-10 border border-stone-300 rounded-lg px-3 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={form.unit}
                onChange={(e) => updateField("unit", e.target.value)}
              >
                <option value="stem">Stem</option>
                <option value="bunch">Bunch</option>
                <option value="piece">Piece</option>
                <option value="box">Box</option>
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-stone-600 mb-1">
                In stock
              </label>
              <input
                type="number"
                className="h-10 border border-stone-300 rounded-lg px-3 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={form.current_qty}
                onChange={(e) =>
                  updateField("current_qty", e.target.value)
                }
                placeholder="e.g. 120"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-stone-600 mb-1">
                Min. stock
              </label>
              <input
                type="number"
                className="h-10 border border-stone-300 rounded-lg px-3 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={form.min_qty}
                onChange={(e) => updateField("min_qty", e.target.value)}
                placeholder="e.g. 40"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-stone-600 mb-1">
                Photo
              </label>
              <input
                type="file"
                accept="image/*"
                capture="environment" // ✅ يفتح كاميرا الجوال مباشرة
                className="text-xs"
                onChange={handleImageChange}
              />
              {uploadingImage && (
                <span className="text-[11px] text-stone-500 mt-1">
                  Uploading…
                </span>
              )}
              {form.photo_url && (
                <img
                  src={form.photo_url}
                  alt="preview"
                  className="mt-1 h-12 w-12 object-cover rounded-lg border"
                />
              )}
            </div>
          </div>

          {/* Suppliers prices */}
          <div className="space-y-2">
            
<section className="bg-white border border-amber-100 rounded-2xl shadow-sm p-5 space-y-4 mt-4">
  <div className="flex items-center justify-between gap-3">
    <div>
      <h3 className="text-lg font-semibold text-stone-800">
        Suppliers &amp; purchase prices
      </h3>
      <p className="text-xs text-stone-500">
        Link this flower / item to one or more suppliers, and store the purchase price per supplier.
      </p>
    </div>
    <button
      type="button"
      onClick={addSupplierRow}
      className="px-3 py-1.5 rounded-lg bg-amber-700 text-amber-50 text-xs font-semibold hover:bg-amber-800"
    >
      + Add supplier price
    </button>
  </div>

  {/* جدول الموردين و الأسعار */}
  <div className="overflow-x-auto">
    <table className="min-w-full text-xs md:text-sm">
      <thead className="bg-amber-50/70 text-stone-700">
        <tr>
          <th className="px-3 py-2 text-left">Supplier</th>
          <th className="px-3 py-2 text-left">Supplier invoice</th>
          <th className="px-3 py-2 text-right">Purchase price (AED)</th>
          <th className="px-3 py-2 text-center">Actions</th>
        </tr>
      </thead>
      <tbody>
        {supplierPrices.length === 0 && (
          <tr>
            <td
              colSpan={4}
              className="px-3 py-4 text-center text-stone-400"
            >
              No supplier prices yet. Click &ldquo;Add supplier
              price&rdquo; to start.
            </td>
          </tr>
        )}

        {supplierPrices.map((row, index) => (
          <tr
            key={index}
            className="border-t border-stone-100 align-middle"
          >
            {/* Supplier dropdown */}
            <td className="px-3 py-2">
              <div className="flex gap-2 items-center">
                <select
                  className="flex-1 h-9 border border-stone-300 rounded-lg px-2 text-xs bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  value={row.supplierId}
                  onChange={(e) =>
                    updateSupplierRow(
                      index,
                      "supplierId",
                      e.target.value
                    )
                  }
                >
                  <option value="">Select supplier…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="px-2 py-1 rounded-lg border border-amber-300 text-[11px] text-amber-800 bg-amber-50 hover:bg-amber-100"
                  onClick={() =>
                    setShowNewSupplierForm((prev) => !prev)
                  }
                >
                  + New
                </button>
              </div>
            </td>

            {/* Supplier invoice no */}
            <td className="px-3 py-2">
              <input
                className="w-full h-9 border border-stone-300 rounded-lg px-2 text-xs bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                placeholder="Supplier invoice no."
                value={row.supplierInvoice}
                onChange={(e) =>
                  updateSupplierRow(
                    index,
                    "supplierInvoice",
                    e.target.value
                  )
                }
              />
            </td>

            {/* Purchase price */}
            <td className="px-3 py-2 text-right">
              <input
                type="number"
                className="w-28 h-9 border border-stone-300 rounded-lg px-2 text-xs text-right bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                placeholder="0.00"
                value={row.purchasePrice}
                onChange={(e) =>
                  updateSupplierRow(
                    index,
                    "purchasePrice",
                    e.target.value
                  )
                }
              />
            </td>

            {/* Actions */}
            <td className="px-3 py-2 text-center">
              <button
                type="button"
                onClick={() => removeSupplierRow(index)}
                className="px-2 py-1 rounded-lg border border-rose-200 text-[11px] text-rose-700 bg-rose-50 hover:bg-rose-100"
              >
                Remove
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>

  {/* نموذج إضافة مورد جديد من نفس الصفحة */}
  {showNewSupplierForm && (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4 space-y-3">
      <p className="text-xs font-medium text-stone-700">
        Add new supplier
      </p>
      <div className="grid md:grid-cols-4 gap-3">
        <div className="flex flex-col">
          <label className="text-[11px] text-stone-600 mb-1">
            Supplier name
          </label>
          <input
            className="h-9 border border-stone-300 rounded-lg px-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            value={newSupplier.name}
            onChange={(e) =>
              setNewSupplier((prev) => ({
                ...prev,
                name: e.target.value,
              }))
            }
            placeholder="e.g. Golden Rose Trading"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-[11px] text-stone-600 mb-1">
            Company name
          </label>
          <input
            className="h-9 border border-stone-300 rounded-lg px-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            value={newSupplier.company_name}
            onChange={(e) =>
              setNewSupplier((prev) => ({
                ...prev,
                company_name: e.target.value,
              }))
            }
            placeholder="Registered company name"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-[11px] text-stone-600 mb-1">
            TRN
          </label>
          <input
            className="h-9 border border-stone-300 rounded-lg px-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            value={newSupplier.trn}
            onChange={(e) =>
              setNewSupplier((prev) => ({
                ...prev,
                trn: e.target.value,
              }))
            }
            placeholder="Tax registration number"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-[11px] text-stone-600 mb-1">
            Phone
          </label>
          <input
            className="h-9 border border-stone-300 rounded-lg px-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            value={newSupplier.phone}
            onChange={(e) =>
              setNewSupplier((prev) => ({
                ...prev,
                phone: e.target.value,
              }))
            }
            placeholder="05x xxx xxxx"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-2">
        <button
          type="button"
          onClick={handleAddNewSupplier}
          className="px-4 py-1.5 rounded-lg bg-amber-700 text-amber-50 text-xs font-semibold hover:bg-amber-800"
        >
          Save supplier
        </button>
        <button
          type="button"
          onClick={() => setShowNewSupplierForm(false)}
          className="px-3 py-1.5 rounded-lg border border-stone-300 text-xs text-stone-700 bg-white hover:bg-stone-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )}
</section>

            
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-1.5 rounded-lg border border-stone-300 text-xs text-stone-700 bg-white hover:bg-stone-50"
            >
              Clear
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-amber-700 text-amber-50 text-xs font-semibold hover:bg-amber-800"
            >
              Save item
            </button>
          </div>
        </form>
      </section>

      {/* Table of items */}
      <section className="bg-white border border-amber-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-amber-100 text-xs text-stone-500">
          <span>Stock items</span>
          <span>
            Showing {filteredItems.length} of {items.length} items
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs md:text-sm">
            <thead className="bg-amber-50/70 text-stone-700">
              <tr>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-right">In stock</th>
                <th className="px-3 py-2 text-right">Min</th>
                <th className="px-3 py-2 text-left">Suppliers</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-stone-400"
                  >
                    No items found.
                  </td>
                </tr>
              )}

              {filteredItems.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-stone-100 hover:bg-amber-50/40"
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {item.photo_url && (
                        <img
                          src={item.photo_url}
                          alt={item.name}
                          className="h-8 w-8 rounded-lg object-cover border"
                        />
                      )}
                      <div>
                        <div className="font-medium text-stone-900">
                          {item.name}
                        </div>
                        <div className="text-[11px] text-stone-500">
                          {item.code} · {item.unit}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-[11px] uppercase text-stone-600">
                      {item.category}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={
                        item.min_qty &&
                        Number(item.current_qty || 0) <=
                          Number(item.min_qty)
                          ? "text-rose-600 font-semibold"
                          : "text-stone-900"
                      }
                    >
                      {formatNumber(item.current_qty)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-stone-500">
                    {formatNumber(item.min_qty)}
                  </td>
                  <td className="px-3 py-2">
                    {item.suppliers.length === 0 && (
                      <span className="text-[11px] text-stone-400">
                        No suppliers yet
                      </span>
                    )}
                    {item.suppliers.length > 0 && (
                      <div className="space-y-0.5">
                        {item.suppliers.slice(0, 2).map((s) => (
                          <div
                            key={s.id}
                            className="text-[11px] text-stone-700"
                          >
                            {s.supplier_name}:{" "}
                            {formatNumber(s.purchase_price)} AED
                          </div>
                        ))}
                        {item.suppliers.length > 2 && (
                          <div className="text-[11px] text-stone-400">
                            +{item.suppliers.length - 2} more…
                          </div>
                        )}
                      </div>
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

export default StockPage;
