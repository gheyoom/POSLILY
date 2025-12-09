// src/utils/thermalInvoicePdf.js
import jsPDF from "jspdf";

export function generateThermalInvoice(row, mode = "view") {
  if (!row) return;

  // 58mm عرض
  const doc = new jsPDF({
    orientation: "p",
    unit: "mm",
    format: [58, 200], // العرض 58mm، الطول نتركه كبير
  });

  const centerX = 29; // نصف الـ 58
  let y = 6;
  const lineGap = 4;

  const addLine = () => {
    doc.setFontSize(8);
    doc.text(
      "------------------------------",
      centerX,
      y,
      { align: "center" }
    );
    y += 3;
  };

  // ===== رأس الفاتورة (تقدري تعدلين النص لاحقاً) =====
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("LILY IV FLOWERS", centerX, y, { align: "center" });
  y += lineGap;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Al Sadirat Street, New Shahama", centerX, y, {
    align: "center",
  });
  y += 3;
  doc.text("Abu Dhabi, UAE", centerX, y, { align: "center" });
  y += 3;
  doc.text("TRN: 104073501900003", centerX, y, { align: "center" });
  y += lineGap;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("TAX INVOICE", centerX, y, { align: "center" });
  y += lineGap;

  addLine();

  // ===== تاريخ / وقت =====
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const dateStr = row.sale_date || "";
  const timeStr = row.sale_time || "";
  doc.text(`Date : ${dateStr} ${timeStr}`, 3, y);
  y += lineGap;

  // ===== بيانات العميل =====
  const customerName = row.customer_name || "";
  doc.setFont("helvetica", "bold");
  doc.text(customerName || "Customer", 3, y);
  y += lineGap;

  doc.setFont("helvetica", "normal");
  const phone = row.customer_phone || "";
  if (phone) {
    doc.text(`Phone : ${phone}`, 3, y);
    y += lineGap;
  }

  const billNo = row.invoice_no || "";
  doc.text(`Bill No : ${billNo}`, 3, y);
  y += lineGap;

  const paymentMode =
    row.payment_method_label || row.payment_method || "Cash";
  doc.text(`Payment Mode : ${paymentMode}`, 3, y);
  y += lineGap;

  addLine();

  // ===== عنوان الأعمدة =====
  doc.setFont("helvetica", "bold");
  doc.text("Item", 3, y);
  doc.text("Qty", 28, y);
  doc.text("Amt", 48, y, { align: "right" });
  y += 3;
  addLine();

  doc.setFont("helvetica", "normal");

  // الباقة
  const bouquetPrice = Number(
    row.bouquet_price ??
      row.net_amount ??
      0
  );
  doc.text("Bouquet", 3, y);
  doc.text("1", 28, y);
  doc.text(bouquetPrice.toFixed(2), 48, y, { align: "right" });
  y += lineGap;

  // التوصيل (إن وجد)
  const deliveryFee =
    Number(row.delivery_fee_from_delivery ?? row.delivery_fee ?? 0) || 0;
  if (deliveryFee > 0) {
    doc.text("Delivery", 3, y);
    doc.text("1", 28, y);
    doc.text(deliveryFee.toFixed(2), 48, y, { align: "right" });
    y += lineGap;
  }

  addLine();

  // ===== المبالغ والضريبة =====
  const net = Number(row.net_amount || 0);
  const vat = Number(row.vat_amount || 0);
  const gross = Number(row.gross_amount || 0);

  doc.text(`Sub Total`, 3, y);
  doc.text(net.toFixed(2), 48, y, { align: "right" });
  y += lineGap;

  doc.text(`VAT 5%`, 3, y);
  doc.text(vat.toFixed(2), 48, y, { align: "right" });
  y += lineGap;

  doc.setFont("helvetica", "bold");
  doc.text(`TOTAL`, 3, y);
  doc.text(gross.toFixed(2), 48, y, { align: "right" });
  y += lineGap;

  addLine();

  // ===== شكراً =====
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Thank you for your purchase!", centerX, y, {
    align: "center",
  });
  y += lineGap;

  // تصغير طول الصفحة حسب آخر سطر
  const finalHeight = Math.max(y + 5, 60);
  doc.internal.pageSize.height = finalHeight;

  const fileName = `${billNo || "invoice"}.pdf`;

  if (mode === "download") {
    // تحميل كملف
    doc.save(fileName);
  } else if (mode === "print") {
    // فتح مع أمر طباعة
    doc.autoPrint();
    const blobUrl = doc.output("bloburl");
    window.open(blobUrl, "_blank");
  } else {
    // "view" → عرض فقط في تبويب جديد
    const blobUrl = doc.output("bloburl");
    window.open(blobUrl, "_blank");
  }
}
