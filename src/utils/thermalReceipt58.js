// src/utils/thermalReceipt58.js
import { jsPDF } from "jspdf";

// تنسيق مبلغ برقمين عشريين
const fmt = (n) => (Number(n) || 0).toFixed(2);

// دالة مساعدة لكتابة نص في المنتصف
function centerText(doc, text, y, size = 8, bold = false) {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  const pageWidth = doc.internal.pageSize.getWidth();
  const textWidth = doc.getTextWidth(text);
  const x = (pageWidth - textWidth) / 2;
  doc.text(text, x, y);
}

// دالة مساعدة لكتابة نص من اليسار
function leftText(doc, text, x, y, size = 8, bold = false) {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  doc.text(text, x, y);
}

/**
 * توليد فاتورة حرارية 58mm بصيغة PDF
 * @param {object} row  بيانات الفاتورة من جدول Invoices & Orders
 * @param {"download" | "view" | "print"} mode
 */
export function generateThermalReceiptPDF(row, mode = "download") {
  if (!row) return;

  const doc = new jsPDF({
    unit: "mm",
    format: [58, 200], // عرض 58mm
  });

  let y = 6;

  // ───── Header ─────
  centerText(doc, "LIL Y IV FLOWERS", y, 10, true);
  y += 5;
  centerText(doc, "TRN: 104073501900003", y, 7);
  y += 4;
  centerText(doc, "Al Sadirat Street, New Shahama", y, 7);
  y += 4;
  centerText(doc, "Abu Dhabi AZ", y, 7);
  y += 4;
  centerText(doc, "United Arab Emirates", y, 7);
  y += 6;

  centerText(doc, "TAX INVOICE", y, 9, true);
  y += 5;

  // ───── Invoice info ─────
  leftText(doc, `Invoice: ${row.invoice_no}`, 3, y, 7, true);
  y += 4;

  const dateStr = `${row.sale_date || ""} ${row.sale_time || ""}`.trim();
  if (dateStr) {
    leftText(doc, `Date:   ${dateStr}`, 3, y, 7);
    y += 4;
  }

  if (row.customer_name) {
    leftText(doc, `Customer: ${row.customer_name}`, 3, y, 7);
    y += 4;
  }
  if (row.customer_phone) {
    leftText(doc, `Phone:    ${row.customer_phone}`, 3, y, 7);
    y += 4;
  }

  if (row.florist_name) {
    leftText(doc, `Florist:  ${row.florist_name}`, 3, y, 7);
    y += 4;
  }

  y += 2;
  leftText(doc, "--------------------------------", 3, y, 6);
  y += 4;

  // ───── Order / Service details ─────
  if (row.order_type_name || row.description) {
    if (row.order_type_name) {
      leftText(doc, `Service: ${row.order_type_name}`, 3, y, 7, true);
      y += 4;
    }
    if (row.description) {
      const lines = doc.splitTextToSize(row.description, 50);
      lines.forEach((line) => {
        leftText(doc, line, 3, y, 7);
        y += 3;
      });
      y += 1;
    }
  }

  if (row.delivery_location || row.delivery_type_name) {
    const deliveryMeta = [row.delivery_type_name, row.delivery_location]
      .filter(Boolean)
      .join(" · ");
    if (deliveryMeta) {
      leftText(doc, `Delivery: ${deliveryMeta}`, 3, y, 7);
      y += 4;
    }
  }

  leftText(doc, "--------------------------------", 3, y, 6);
  y += 4;

  // ───── Amounts ─────
  const bouquet = row.bouquet_price ?? row.bouquet ?? 0;
  const delivery = row.delivery_fee ?? 0;
  const net = row.net_amount ?? bouquet + delivery;
  const vat = row.vat_amount ?? bouquet * 0.05;
  const gross = row.gross_amount ?? net + vat;

  leftText(
    doc,
    `Service before VAT:   AED ${fmt(bouquet)}`,
    3,
    y,
    7
  );
  y += 4;

  leftText(
    doc,
    `Delivery fee:         AED ${fmt(delivery)}`,
    3,
    y,
    7
  );
  y += 4;

  leftText(
    doc,
    `Net amount:           AED ${fmt(net)}`,
    3,
    y,
    7,
    true
  );
  y += 4;

  leftText(
    doc,
    `VAT 5% (service):     AED ${fmt(vat)}`,
    3,
    y,
    7
  );
  y += 4;

  leftText(doc, "--------------------------------", 3, y, 6);
  y += 4;

  leftText(
    doc,
    `Total incl. VAT:      AED ${fmt(gross)}`,
    3,
    y,
    8,
    true
  );
  y += 6;

  const payLabel =
    row.payment_method_label || row.payment_method || "";
  if (payLabel) {
    leftText(doc, `Payment method: ${payLabel}`, 3, y, 7);
    y += 5;
  }

  y += 2;
  centerText(doc, "Thank you for your purchase", y, 7);
  y += 4;
  centerText(doc, "Come again soon 🌸", y, 7);

  // نضبط طول الصفحة حسب آخر سطر
  const finalHeight = Math.max(y + 5, 60);
  doc.internal.pageSize.height = finalHeight;

  const fileName = `${row.invoice_no || "invoice"}.pdf`;

  if (mode === "download") {
    doc.save(fileName);
  } else {
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);

    if (mode === "view") {
      window.open(url, "_blank");
    } else if (mode === "print") {
      const w = window.open(url, "_blank");
      if (w) {
        w.addEventListener("load", () => {
          w.focus();
          w.print();
        });
      }
    }
  }
}
