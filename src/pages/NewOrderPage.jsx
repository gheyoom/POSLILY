import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import VoiceInputField from "../components/VoiceInputField.jsx";

function NewOrderPage() {
  const [loading, setLoading] = useState(false);
  const [loadingInvoice, setLoadingInvoice] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("success"); // "success" | "error"
  const [postSaveOptionsVisible, setPostSaveOptionsVisible] =
    useState(false);

  // رقم الفاتورة + التاريخ + الوقت
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [invoiceTime, setInvoiceTime] = useState("");

  // lookup data
  const [florists, setFlorists] = useState([]);
  const [orderSources, setOrderSources] = useState([]);
  const [deliveryTypes, setDeliveryTypes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [orderTypes, setOrderTypes] = useState([]);

  // customer profile
  const [customerProfileId, setCustomerProfileId] = useState(null);
  const [customerStatus, setCustomerStatus] = useState("");

  // add-new UI states
  const [showNewLocationForm, setShowNewLocationForm] = useState(false);
  const [newLocation, setNewLocation] = useState({ name: "", fee: "" });

  const [showNewDeliveryTypeForm, setShowNewDeliveryTypeForm] =
    useState(false);
  const [newDeliveryType, setNewDeliveryType] = useState({ name: "" });

  const [showNewOrderTypeForm, setShowNewOrderTypeForm] = useState(false);
  const [newOrderTypeName, setNewOrderTypeName] = useState("");

  const [showNewOrderSourceForm, setShowNewOrderSourceForm] =
    useState(false);
  const [newOrderSourceName, setNewOrderSourceName] = useState("");

const [occasions, setOccasions] = useState([]);
const [showNewOccasionForm, setShowNewOccasionForm] = useState(false);
const [newOccasionName, setNewOccasionName] = useState("");

  // main form state (موحّد للواتساب + المحل)
  const [form, setForm] = useState({
    floristId: "",
    orderSourceId: "", // من جدول order_sources
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    customerNotes: "",
    orderTypeId: "",
    description: "",
    occasion: "",
    orderNotes: "",
    bouquetPrice: "",
    deliveryTypeId: "",
    deliveryLocation: "",
    deliveryNotes: "",
    deliveryFee: "",
    netAmount: 0,
    vatAmount: 0,
    paymentMethod: "cash", // cash / pos / bank
  });

  const updateField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // ==== حساب net + VAT + gross (VAT 5% على سعر الباقة فقط) ====
  const bouquet = Number(form.bouquetPrice) || 0;
  const deliveryFee = Number(form.deliveryFee) || 0;
  const net = bouquet + deliveryFee;
  const vat = bouquet * 0.05;
  const gross = net + vat;

  // نحافظ على netAmount و vatAmount في الفورم عشان تروح لقاعدة البيانات
  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      netAmount: net,
      vatAmount: vat,
    }));
  }, [net, vat]);

  // ==== توليد رقم الفاتورة بصيغة INV-LIV-YYYY-MMSSS ====
  // مثال: INV-LIV-2025-11001 (السنة + الشهر + تسلسل 3 أرقام)
  const generateNextInvoiceNo = async () => {
    setLoadingInvoice(true);
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0"); // "01".."12"

      const prefix = `INV-LIV-${year}-${month}`;

      const { data, error } = await supabase
        .from("sales")
        .select("invoice_no")
        .like("invoice_no", `${prefix}%`)
        .order("invoice_no", { ascending: false })
        .limit(1);

      let nextSeq = 1;

      if (!error && data && data.length > 0 && data[0].invoice_no) {
        const lastInvoiceNo = data[0].invoice_no; // e.g. "INV-LIV-2025-11003"
        const lastSuffix = lastInvoiceNo.slice(-3); // "003"
        const lastSeq = Number(lastSuffix) || 0;
        nextSeq = lastSeq + 1;
      }

      const seqStr = String(nextSeq).padStart(3, "0");
      const newInvoiceNo = `${prefix}${seqStr}`; // "INV-LIV-2025-11001"

      setInvoiceNo(newInvoiceNo);
      setInvoiceDate(now.toISOString().slice(0, 10)); // YYYY-MM-DD
      setInvoiceTime(now.toTimeString().slice(0, 8)); // HH:MM:SS
    } finally {
      setLoadingInvoice(false);
    }
  };

  // ==== تحميل بيانات lookup من Supabase ====
  useEffect(() => {
    const loadLookups = async () => {
      try {
        // florists
        const { data: floristsData, error: floristsError } =
          await supabase
            .from("florists")
            .select("id, full_name, name, is_active")
            .order("full_name", { nullsFirst: false });

        if (!floristsError && floristsData) {
          setFlorists(floristsData);
        }

        // order sources
        const { data: sourcesData, error: sourcesError } = await supabase
          .from("order_sources")
          .select("id, name")
          .order("name");

        if (sourcesError) {
          console.error("Error loading order_sources", sourcesError);
        } else if (sourcesData) {
          setOrderSources(sourcesData);
        }

        // delivery types
        const { data: typesData, error: typesError } = await supabase
          .from("delivery_types")
          .select("id, name")
          .order("name");

        if (!typesError && typesData) {
          setDeliveryTypes(typesData);
        } else if (typesError) {
          console.warn(
            "Could not load delivery_types (table may not exist yet)",
            typesError
          );
        }
// occasions
const { data: occasionsData, error: occasionsError } = await supabase
  .from("occasions")
  .select("id, name")
  .order("name");

if (!occasionsError && occasionsData) {
  setOccasions(occasionsData);
} else if (occasionsError) {
  console.warn(
    "Could not load occasions (table may not exist yet)",
    occasionsError
  );
}

        // delivery locations
        const { data: locationsData, error: locationsError } =
          await supabase
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

        // order types (نوع الطلب: bouquet / box / bag ...)
        const { data: orderTypesData, error: orderTypesError } =
          await supabase
            .from("order_types")
            .select("id, name")
            .order("name");

        if (!orderTypesError && orderTypesData) {
          setOrderTypes(orderTypesData);
        } else if (orderTypesError) {
          console.warn(
            "Could not load order_types (table may not exist yet)",
            orderTypesError
          );
        }
      } catch (err) {
        console.error("Unexpected error loading lookups", err);
      }
    };

    loadLookups();
    generateNextInvoiceNo();
  }, []);

  // ==== تغيير سعر الباقة / التوصيل (نترك الحسبة للأعلى) ====
  const handleBouquetPriceChange = (value) => {
    updateField("bouquetPrice", value);
  };

  const handleDeliveryFeeChange = (value) => {
    updateField("deliveryFee", value);
  };

  // ==== تغيير اللوكيشن يحدد سعر التوصيل تلقائيًا ====
  const handleLocationChange = (locationName, feeFromNew) => {
    setForm((prev) => {
      // لو جايين من موقع جديد (من Save) نستخدم الـ fee اللي رجع من Supabase
      let newDeliveryFee =
        feeFromNew !== undefined && feeFromNew !== null
          ? Number(feeFromNew) || 0
          : 0;

      // لو الاختيار من القائمة العادية (ما فيه feeFromNew) نجيب الرسوم من locations
      if (feeFromNew === undefined || feeFromNew === null) {
        const loc = locations.find((l) => l.name === locationName);
        newDeliveryFee = loc ? Number(loc.fee) || 0 : 0;
      }

      return {
        ...prev,
        deliveryLocation: locationName,
        deliveryFee: newDeliveryFee,
      };
    });
  };

  // ==== إضافة مصدر طلب جديد ====
  const handleAddOrderSource = async () => {
    const name = newOrderSourceName.trim();
    if (!name) return;

    try {
      const { data, error } = await supabase
        .from("order_sources")
        .insert([{ name }])
        .select("id, name")
        .single();

      if (error) throw error;

      setOrderSources((prev) => [...prev, data]);
      updateField("orderSourceId", data.id);
      setNewOrderSourceName("");
      setShowNewOrderSourceForm(false);
      setStatusType("success");
      setStatusMessage(
        `Order source "${data.name}" added successfully.`
      );
    } catch (err) {
      console.error("Error adding order source", err);
      setStatusType("error");
      setStatusMessage(
        "Could not add order source:\n" + (err?.message || "Unknown error")
      );
    }
  };
//=== occasion ===

const handleAddOccasion = async () => {
  const name = newOccasionName.trim();
  if (!name) return;

  try {
    const { data, error } = await supabase
      .from("occasions")
      .insert([{ name }])
      .select("id, name")
      .single();

    if (error) throw error;

    // add to local list
    setOccasions((prev) => [...prev, data]);
    // use it in the form
    updateField("occasion", data.name);

    setNewOccasionName("");
    setShowNewOccasionForm(false);
  } catch (err) {
    console.error("Error adding occasion", err);
    setStatusType("error");
    setStatusMessage(
      "Could not add occasion:\n" + (err?.message || "Unknown error")
    );
  }
};

  // ==== إضافة نوع توصيل جديد ====
  const handleAddDeliveryType = async () => {
    const name = newDeliveryType.name.trim();
    if (!name) return;

    try {
      const { data, error } = await supabase
        .from("delivery_types")
        .insert([{ name }])
        .select("id, name")
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

  // ==== إضافة موقع توصيل جديد ====
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

      // نضيف الموقع الجديد للـ state
      setLocations((prev) => [...prev, data]);

      // نحدّث الفورم مباشرة بالاسم + الرسوم الجديدة
      handleLocationChange(data.name, data.fee);

      // نرجّع فورم الإضافة للقيم الافتراضية
      setNewLocation({ name: "", fee: "" });
      setShowNewLocationForm(false);
    } catch (err) {
      console.error("Error adding location", err);
      setStatusType("error");
      setStatusMessage(
        "Could not add delivery location:\n" +
          (err?.message || "Unknown error")
      );
    }
  };

  // ==== إضافة نوع الطلب (bouquet / box / bag...) ====
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
      setShowNewOrderTypeForm(false);
    } catch (err) {
      console.error("Error adding order type", err);
    }
  };

  // ==== بحث عن العميل عن طريق رقم الجوال (customer_profiles) ====
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

  // ==== التحقق من المدخلات قبل الحفظ ====
  const validateForm = () => {
    const errors = [];

    if (!invoiceNo) errors.push("Invoice number is missing");
    if (!form.floristId) errors.push("Florist is required");
    if (!form.orderSourceId) errors.push("Order source is required");

    if (!form.customerPhone.trim())
      errors.push("Customer phone is required");
    if (!form.customerName.trim())
      errors.push("Customer name is required");

    if (!form.orderTypeId) errors.push("Order type is required");

    if (!form.description.trim())
      errors.push("Arrangement description is required");

    if (
      form.bouquetPrice === "" ||
      isNaN(Number(form.bouquetPrice))
    ) {
      errors.push("Bouquet price must be a number");
    }
    if (
      form.deliveryFee !== "" &&
      isNaN(Number(form.deliveryFee))
    ) {
      errors.push("Delivery fee must be a number");
    }

    // التوصيل: إذا النوع Pickup، لا نطلب location
    const selectedDeliveryType = deliveryTypes.find(
      (t) => t.id === Number(form.deliveryTypeId)
    );
    const isPickup =
      selectedDeliveryType &&
      selectedDeliveryType.name.toLowerCase().includes("pickup");

    if (!form.deliveryTypeId) {
      errors.push("Delivery type is required");
    }
    if (!isPickup && !form.deliveryLocation.trim()) {
      errors.push("Delivery location is required (for non-pickup)");
    }

    return errors;
  };

  // ==== إرسال الفاتورة (واتساب / إيميل / طباعة) ====
  const buildInvoiceText = () => {
    const source = orderSources.find(
      (s) => s.id === Number(form.orderSourceId)
    );
    const sourceName = source?.name || "";

    const orderType = orderTypes.find(
      (o) => o.id === Number(form.orderTypeId)
    )?.name;

    return (
      `Invoice: ${invoiceNo}\n` +
      `Date: ${invoiceDate} ${invoiceTime}\n` +
      (sourceName ? `Source: ${sourceName}\n` : "") +
      `Customer: ${form.customerName || ""}\n` +
      (form.customerPhone ? `Phone: ${form.customerPhone}\n` : "") +
      (orderType ? `Order type: ${orderType}\n` : "") +
      `Description: ${form.description || ""}\n` +
      `Bouquet: ${bouquet.toFixed(2)} AED\n` +
      (deliveryFee
        ? `Delivery: ${deliveryFee.toFixed(2)} AED\n`
        : "") +
      `VAT (5% on bouquet): ${vat.toFixed(2)} AED\n` +
      `Total: ${gross.toFixed(2)} AED`
    );
  };

const [sendingWhatsApp, setSendingWhatsApp] = useState(false);

const handleSendWhatsApp = async () => {
  if (!form.customerPhone) {
    setStatusType("error");
    setStatusMessage("Customer phone is missing. Cannot send WhatsApp.");
    return;
  }

  try {
    setSendingWhatsApp(true);
    setStatusMessage("");

    const text = buildInvoiceText();
    const phoneDigits = form.customerPhone.replace(/[^0-9]/g, "");

    // 👈 تأكدي إن هذا هو رابط الفنكشن الصحيح من Supabase
    const functionUrl =
      "https://zemxpstodwyosevkdrkh.functions.supabase.co/send-whatsapp";

    const res = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: phoneDigits,
        text,
      }),
    });

    // نحاول نقرأ الـ JSON، ولو ما رجع نخلي data = {} بدل ما نكسر الكود
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("WhatsApp send error (HTTP):", data);
      setStatusType("error");
      setStatusMessage(
        "Server returned an error while sending WhatsApp.\n" +
          (data?.error || `Status: ${res.status}`)
      );
      return;
    }

    if (!data.success) {
      console.error("WhatsApp send error (payload):", data);
      setStatusType("error");
      setStatusMessage(
        "WhatsApp function did not confirm success.\n" +
          (data?.error || "Missing { success: true } in response.")
      );
      return;
    }

    // ✅ تم الإرسال من السيرفر بنجاح
    setStatusType("success");
    setStatusMessage(
      `WhatsApp message sent successfully to ${form.customerPhone}.`
    );
  } catch (err) {
    console.error("Error calling send-whatsapp function:", err);
    setStatusType("error");
    setStatusMessage(
      "Unexpected error while sending WhatsApp:\n" +
        (err?.message || String(err))
    );
  } finally {
    setSendingWhatsApp(false);
  }
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

  // ==== إعادة تهيئة لفاتورة جديدة ====
  const resetForNewInvoice = () => {
    setPostSaveOptionsVisible(false);
    setStatusMessage("");
    setCustomerProfileId(null);
    setCustomerStatus("");

    setForm((prev) => ({
      ...prev,
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      customerNotes: "",
      orderTypeId: "",
      description: "",
      occasion: "",
      orderNotes: "",
      bouquetPrice: "",
      deliveryTypeId: "",
      deliveryLocation: "",
      deliveryNotes: "",
      deliveryFee: "",
      // floristId, orderSourceId, paymentMethod يضلّون كما هم
    }));

    // نولّد رقم فاتورة جديدة للفاتورة التالية
    generateNextInvoiceNo();
  };

  // ==== مؤقّت ٥ دقائق بعد الحفظ لفتح فاتورة جديدة تلقائيًا ====
  useEffect(() => {
    if (!postSaveOptionsVisible) return;

    const timer = setTimeout(() => {
      resetForNewInvoice();
    }, 5 * 60 * 1000); // 5 دقائق

    return () => clearTimeout(timer);
  }, [postSaveOptionsVisible]);

  // ==== حفظ الفاتورة (موحد للواتساب + المحل) ====
  const handleConfirmAndCreateInvoice = async (e) => {
    e.preventDefault();
    setStatusMessage("");
    setPostSaveOptionsVisible(false); // نخفي أي Popup قديم

    const validationErrors = validateForm();

    if (validationErrors.length > 0) {
      setStatusType("error");
      setStatusMessage(
        "Please fix these fields:\n• " +
          validationErrors.join("\n• ")
      );
      return;
    }

    setLoading(true);

    try {
      // 1) تأكد من وجود / تحديث customer_profile
      let profileId = customerProfileId;

      if (!profileId) {
        // لا يوجد بروفايل → إنشاء جديد
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
      } else {
        // يوجد بروفايل → تحديثه
        const { error: updateError } = await supabase
          .from("customer_profiles")
          .update({
            full_name: form.customerName || null,
            phone: form.customerPhone || null,
            email: form.customerEmail || null,
            notes: form.customerNotes || null,
          })
          .eq("id", profileId);

        if (updateError) throw updateError;
      }

      const now = new Date();
      const saleDate = invoiceDate || now.toISOString().slice(0, 10);
      const saleTime = invoiceTime || now.toTimeString().slice(0, 8);

      const cash_sale =
        form.paymentMethod === "cash" ? gross : 0;
      const pos_sale =
        form.paymentMethod === "pos" ? gross : 0;
      const bank_transfer =
        form.paymentMethod === "bank" ? gross : 0;

      // 2) Insert into sales
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
            bouquet_price: bouquet,
            delivery_fee: deliveryFee,
            order_type_id: form.orderTypeId
              ? Number(form.orderTypeId)
              : null,
            description: form.description,
          },
        ]);

      if (salesError) throw salesError;

      // 3) Insert into customers (per invoice)
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

      // 4) Insert into deliveries
      const { error: deliveryError } = await supabase
        .from("deliveries")
        .insert([
          {
            invoice_no: invoiceNo,
            delivery_type_id: form.deliveryTypeId
              ? Number(form.deliveryTypeId)
              : null,
            delivery_fee: deliveryFee,
            location: form.deliveryLocation,
            delivery_notes: form.deliveryNotes,
          },
        ]);

      if (deliveryError) throw deliveryError;

      setStatusType("success");
      setStatusMessage(
        `Invoice created successfully. Invoice No: ${invoiceNo}`
      );

      // ✅ نظهر الـ Popup مع خيارات: WhatsApp / Email / Print / New invoice
      setPostSaveOptionsVisible(true);
      // ⚠️ لا نغيّر رقم الفاتورة ولا نصفر الفورم هنا
      // resetForNewInvoice سيعمل فقط عند الضغط أو بعد ٥ دقائق
    } catch (err) {
      console.error("Supabase error:", err);
      const extra =
        err?.message ||
        err?.details ||
        "Unknown error from Supabase.";

      setStatusType("error");
      setStatusMessage(
        "Something went wrong while creating the invoice:\n" +
          extra
      );
    } finally {
      setLoading(false);
    }
  };

  // === UI ===
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Status message */}
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

      {/* Header with invoice info */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">
            Create invoice
          </h2>
          <p className="text-sm text-stone-500">
            Use this screen for both WhatsApp and in-store orders.
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
        onSubmit={handleConfirmAndCreateInvoice}
        className="space-y-6"
      >
        {/* General info */}
        <section className="bg-amber-50/70 border border-amber-100 rounded-2xl shadow-sm p-5 space-y-4">
          <h3 className="text-lg font-semibold text-stone-800">
            General information
          </h3>
          <p className="text-xs text-stone-500">
            Connect this order to a florist and source (WhatsApp, in-store, Instagram…).
          </p>
          <div className="grid md:grid-cols-3 gap-4 items-end">
            {/* Florist dropdown */}
            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Florist
              </label>
              <select
                className="h-11 border border-stone-300 rounded-lg px-3 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
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

            {/* Order source */}
            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Order source
              </label>
              <div className="flex gap-2">
                <select
                  className="h-11 flex-1 border border-stone-300 rounded-lg px-3 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  value={form.orderSourceId}
                  onChange={(e) =>
                    updateField("orderSourceId", e.target.value)
                  }
                >
                  <option value="">
                    Select source (WhatsApp, in-store…)
                  </option>
                  {orderSources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="px-3 py-2 rounded-lg border border-amber-300 text-xs text-amber-800 bg-amber-50 hover:bg-amber-100"
                  onClick={() =>
                    setShowNewOrderSourceForm((v) => !v)
                  }
                >
                  + New
                </button>
              </div>
            </div>

            {/* Payment method */}
            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Payment method
              </label>
              <select
                className="h-11 border border-stone-300 rounded-lg px-3 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
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

          {/* New order source form */}
          {showNewOrderSourceForm && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
              <p className="text-xs text-stone-700 font-medium">
                Add new order source
              </p>
              <div className="grid md:grid-cols-3 gap-3 items-end">
                <div className="flex flex-col md:col-span-2">
                  <label className="text-xs text-stone-700 mb-1">
                    Source name
                  </label>
                  <input
                    className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white/90 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={newOrderSourceName}
                    onChange={(e) =>
                      setNewOrderSourceName(e.target.value)
                    }
                    placeholder="e.g. WhatsApp, In-store, Instagram"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg bg-amber-700 text-amber-50 text-xs font-semibold hover:bg-amber-800"
                    onClick={handleAddOrderSource}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg border border-stone-300 text-xs text-stone-700 bg-white hover:bg-stone-50"
                    onClick={() =>
                      setShowNewOrderSourceForm(false)
                    }
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Customer info */}
        <section className="bg-white border border-amber-100 rounded-2xl shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-stone-800">
              Customer details
            </h3>
            {customerStatus && (
              <span className="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                {customerStatus}
              </span>
            )}
          </div>
          <div className="grid md:grid-cols-4 gap-4 items-end">
            {/* Phone + lookup */}
            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Phone number
              </label>
              <div className="flex gap-2">
                <input
                  className="h-11 flex-1 border border-stone-300 rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
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
                  className="h-11 px-3 rounded-lg border border-amber-300 text-xs bg-amber-50 text-amber-800 hover:bg-amber-100"
                >
                  Lookup
                </button>
              </div>
              <span className="text-xs text-stone-400 mt-1">
                If the phone exists, profile will be loaded. If not, a new profile will be created.
              </span>
            </div>

            <VoiceInputField
              label="Customer name"
              value={form.customerName}
              onChange={(v) => updateField("customerName", v)}
              placeholder="Customer full name"
            />

            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Email (optional)
              </label>
              <input
                className="h-11 border border-stone-300 rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
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
              {/* Order type dropdown */}
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
                    className="px-3 py-2 rounded-lg border border-amber-300 text-xs text-amber-800 bg-amber-50 hover:bg-amber-100"
                    onClick={() =>
                      setShowNewOrderTypeForm((v) => !v)
                    }
                  >
                    + New
                  </button>
                </div>
              </div>

              {/* Occasion */}
              {showNewOccasionForm && (
  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
    <p className="text-xs text-stone-700 font-medium">
      Add new occasion
    </p>
    <div className="grid md:grid-cols-3 gap-3 items-end">
      <div className="flex flex-col md:col-span-2">
        <label className="text-xs text-stone-700 mb-1">
          Occasion name
        </label>
        <input
          className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white/90 focus:outline-none focus:ring-2 focus:ring-amber-400"
          value={newOccasionName}
          onChange={(e) => setNewOccasionName(e.target.value)}
          placeholder="e.g. Birthday, Graduation, Anniversary"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="px-4 py-2 rounded-lg bg-amber-700 text-amber-50 text-xs font-semibold hover:bg-amber-800"
          onClick={handleAddOccasion}
        >
          Save
        </button>
        <button
          type="button"
          className="px-3 py-2 rounded-lg border border-stone-300 text-xs text-stone-700 bg-white hover:bg-stone-50"
          onClick={() => setShowNewOccasionForm(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
)}

              <div className="flex flex-col">
  <label className="text-sm text-stone-700 mb-1">
    Occasion
  </label>
  <div className="flex gap-2">
    <select
      className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
      value={form.occasion}
      onChange={(e) => updateField("occasion", e.target.value)}
    >
      <option value="">Select occasion…</option>
      {occasions.map((o) => (
        <option key={o.id} value={o.name}>
          {o.name}
        </option>
      ))}
    </select>
    <button
      type="button"
      className="px-3 py-2 rounded-lg border border-amber-300 text-xs text-amber-800 bg-amber-50 hover:bg-amber-100"
      onClick={() => setShowNewOccasionForm((v) => !v)}
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
                  className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  value={form.bouquetPrice}
                  onChange={(e) =>
                    handleBouquetPriceChange(e.target.value)
                  }
                  placeholder="e.g. 250"
                />
                <span className="text-xs text-stone-400 mt-1">
                  VAT 5% will be calculated on this amount only (excluding delivery).
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

          {/* New order type form */}
          {showNewOrderTypeForm && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
              <p className="text-xs text-stone-700 font-medium">
                Add new order type
              </p>
              <div className="grid md:grid-cols-3 gap-3 items-end">
                <div className="flex flex-col md:col-span-2">
                  <label className="text-xs text-stone-700 mb-1">
                    Type name
                  </label>
                  <input
                    className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white/90 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={newOrderTypeName}
                    onChange={(e) =>
                      setNewOrderTypeName(e.target.value)
                    }
                    placeholder="e.g. Bouquet in bag"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg bg-amber-700 text-amber-50 text-xs font-semibold hover:bg-amber-800"
                    onClick={handleAddOrderType}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg border border-stone-300 text-xs text-stone-700 bg-white hover:bg-stone-50"
                    onClick={() =>
                      setShowNewOrderTypeForm(false)
                    }
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Delivery */}
        <section className="bg-white border border-amber-100 rounded-2xl shadow-sm p-5 space-y-4">
          <h3 className="text-lg font-semibold text-stone-800">
            Delivery details
          </h3>
          <div className="grid md:grid-cols-3 gap-4">
            {/* Delivery type */}
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

            {/* Location */}
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

          {/* New delivery type form */}
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

          {/* New location form */}
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

        {/* Amounts & VAT */}
        <section className="bg-white border border-amber-100 rounded-2xl shadow-sm p-5 space-y-4">
          <h3 className="text-lg font-semibold text-stone-800">
            Amount & VAT
          </h3>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Net amount (bouquet + delivery)
              </label>
              <input
                type="number"
                readOnly
                className="border border-stone-200 rounded-lg px-3 py-2 text-sm bg-stone-50 text-stone-700"
                value={net.toFixed(2)}
              />
            </div>
            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                VAT amount (5% on bouquet)
              </label>
              <input
                type="number"
                readOnly
                className="border border-stone-200 rounded-lg px-3 py-2 text-sm bg-stone-50 text-stone-700"
                value={vat.toFixed(2)}
              />
            </div>
            <div className="flex flex-col">
              <label className="text-sm text-stone-700 mb-1">
                Gross amount (with VAT)
              </label>
              <input
                type="number"
                readOnly
                className="border border-stone-200 rounded-lg px-3 py-2 text-sm bg-stone-50 text-stone-900 font-semibold"
                value={gross.toFixed(2)}
              />
            </div>
          </div>
        </section>

        {/* Actions (قبل الحفظ فقط) */}
        <div className="flex justify-end gap-3 mt-4">
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

      {/* Popup بعد حفظ الفاتورة */}
      {postSaveOptionsVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-stone-900">
                  Invoice saved
                </h3>
                <p className="text-xs text-stone-500 mt-1">
                  Choose how you want to share or continue. A new
                  invoice will open automatically in 5 minutes.
                </p>
              </div>
              <button
                type="button"
                onClick={resetForNewInvoice}
                className="text-stone-400 hover:text-stone-600 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="rounded-xl bg-amber-50/80 border border-amber-100 px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-stone-600">
                  Invoice number
                </span>
                <span className="font-semibold text-stone-900">
                  {invoiceNo || "--"}
                </span>
              </div>
              <div className="mt-1 text-xs text-stone-500">
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

            <div className="space-y-2">
              <p className="text-xs font-medium text-stone-600">
                Actions
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
  type="button"
  onClick={handleSendWhatsApp}
  disabled={!invoiceNo || !form.customerPhone || sendingWhatsApp}
  className="inline-flex items-center justify-center px-3 py-2 rounded-lg border border-emerald-300 text-sm text-emerald-800 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"
>
  {sendingWhatsApp ? "Sending..." : "Send via WhatsApp"}
</button>

                <button
                  type="button"
                  onClick={handleSendEmail}
                  disabled={!invoiceNo || !form.customerEmail}
                  className="inline-flex items-center justify-center px-3 py-2 rounded-lg border border-sky-300 text-sm text-sky-800 bg-sky-50 hover:bg-sky-100 disabled:opacity-50"
                >
                  Send via Email
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={!invoiceNo}
                  className="inline-flex items-center justify-center px-3 py-2 rounded-lg border border-stone-300 text-sm text-stone-800 bg-white hover:bg-stone-50 disabled:opacity-50"
                >
                  Print invoice
                </button>
                <button
                  type="button"
                  onClick={resetForNewInvoice}
                  className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-amber-700 text-amber-50 text-sm font-semibold hover:bg-amber-800"
                >
                  Create new invoice
                </button>
              </div>
            </div>

            <p className="text-[11px] text-stone-400 text-right">
              This window will close automatically after 5 minutes.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default NewOrderPage;
