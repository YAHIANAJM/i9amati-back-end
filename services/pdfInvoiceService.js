import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * PDF Invoice Generator Service
 * Generates official invoices and payment receipts with digital signature support
 */
class PDFInvoiceService {
  constructor() {
    this.invoicesDir = path.join(__dirname, '..', 'storage', 'invoices');
    this.receiptsDir = path.join(__dirname, '..', 'storage', 'receipts');
    
    // Create directories if they don't exist
    if (!fs.existsSync(this.invoicesDir)) {
      fs.mkdirSync(this.invoicesDir, { recursive: true });
    }
    if (!fs.existsSync(this.receiptsDir)) {
      fs.mkdirSync(this.receiptsDir, { recursive: true });
    }
  }

  /**
   * Generate official invoice PDF
   * @param {Object} invoiceData - Invoice information
   * @returns {Promise<string>} Path to generated PDF
   */
  async generateInvoice(invoiceData) {
    const {
      invoiceNumber,
      invoiceDate,
      dueDate,
      customer,
      building,
      items,
      subtotal,
      tax,
      total,
      currency = 'MAD',
      unionAgent,
      paymentTerms,
      notes
    } = invoiceData;

    const fileName = `invoice_${invoiceNumber}_${Date.now()}.pdf`;
    const filePath = path.join(this.invoicesDir, fileName);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const stream = fs.createWriteStream(filePath);

        doc.pipe(stream);

        // Header
        doc.fontSize(20).font('Helvetica-Bold').text('فاتورة رسمية', { align: 'right' });
        doc.fontSize(10).font('Helvetica').text('FACTURE OFFICIELLE', { align: 'right' });
        doc.moveDown();

        // Union Agent Info (Top Left)
        doc.fontSize(10).font('Helvetica-Bold').text(unionAgent.name || 'اسم الوكيل', 50, 100);
        doc.font('Helvetica').fontSize(9)
          .text(unionAgent.address || 'العنوان')
          .text(unionAgent.phone || 'الهاتف')
          .text(unionAgent.email || 'البريد الإلكتروني')
          .text(`ICE: ${unionAgent.ice || 'N/A'}`)
          .text(`RC: ${unionAgent.rc || 'N/A'}`);

        // Invoice Details (Top Right)
        doc.fontSize(10).font('Helvetica-Bold').text(`رقم الفاتورة: ${invoiceNumber}`, 350, 100, { align: 'right' });
        doc.font('Helvetica').fontSize(9)
          .text(`التاريخ: ${new Date(invoiceDate).toLocaleDateString('ar-MA')}`, { align: 'right' })
          .text(`تاريخ الاستحقاق: ${new Date(dueDate).toLocaleDateString('ar-MA')}`, { align: 'right' });

        doc.moveDown(2);

        // Customer Info
        doc.fontSize(10).font('Helvetica-Bold').text('معلومات العميل:', 50, 220);
        doc.font('Helvetica').fontSize(9)
          .text(`الاسم: ${customer.name}`)
          .text(`العمارة: ${building.name}`)
          .text(`الشقة: ${customer.apartmentNumber}`)
          .text(`الهاتف: ${customer.phone || 'N/A'}`)
          .text(`البريد: ${customer.email || 'N/A'}`);

        doc.moveDown(2);

        // Table Header
        const tableTop = 320;
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('الوصف', 50, tableTop);
        doc.text('الكمية', 250, tableTop);
        doc.text('السعر', 350, tableTop);
        doc.text('المجموع', 450, tableTop);

        // Draw line under header
        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

        // Table Items
        let yPosition = tableTop + 25;
        doc.font('Helvetica').fontSize(9);
        
        items.forEach((item, index) => {
          doc.text(item.description, 50, yPosition);
          doc.text(item.quantity.toString(), 250, yPosition);
          doc.text(`${item.unitPrice.toFixed(2)} ${currency}`, 350, yPosition);
          doc.text(`${item.total.toFixed(2)} ${currency}`, 450, yPosition);
          yPosition += 25;
        });

        // Draw line before totals
        doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
        yPosition += 15;

        // Totals
        doc.font('Helvetica-Bold');
        doc.text('المجموع الفرعي:', 350, yPosition);
        doc.text(`${subtotal.toFixed(2)} ${currency}`, 450, yPosition);
        yPosition += 20;

        if (tax && tax > 0) {
          doc.text('الضريبة (TVA):', 350, yPosition);
          doc.text(`${tax.toFixed(2)} ${currency}`, 450, yPosition);
          yPosition += 20;
        }

        doc.fontSize(12).font('Helvetica-Bold');
        doc.text('المجموع الإجمالي:', 350, yPosition);
        doc.text(`${total.toFixed(2)} ${currency}`, 450, yPosition);

        yPosition += 40;

        // Payment Terms
        if (paymentTerms) {
          doc.fontSize(9).font('Helvetica-Bold');
          doc.text('شروط الدفع:', 50, yPosition);
          doc.font('Helvetica').text(paymentTerms, 50, yPosition + 15);
          yPosition += 50;
        }

        // Notes
        if (notes) {
          doc.fontSize(9).font('Helvetica-Bold');
          doc.text('ملاحظات:', 50, yPosition);
          doc.font('Helvetica').text(notes, 50, yPosition + 15);
          yPosition += 50;
        }

        // Footer - Signature area
        yPosition = 700;
        doc.fontSize(9).font('Helvetica-Bold');
        doc.text('توقيع الوكيل:', 50, yPosition);
        doc.text('توقيع العميل:', 350, yPosition);
        
        // Signature lines
        doc.moveTo(50, yPosition + 40).lineTo(200, yPosition + 40).stroke();
        doc.moveTo(350, yPosition + 40).lineTo(500, yPosition + 40).stroke();

        // Digital signature placeholder
        doc.fontSize(7).font('Helvetica-Oblique');
        doc.text('هذا المستند قابل للتوقيع الإلكتروني', 50, yPosition + 60, { align: 'center', width: 500 });

        doc.end();

        stream.on('finish', () => {
          resolve(filePath);
        });

        stream.on('error', (error) => {
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate payment receipt PDF
   * @param {Object} receiptData - Receipt information
   * @returns {Promise<string>} Path to generated PDF
   */
  async generateReceipt(receiptData) {
    const {
      receiptNumber,
      paymentDate,
      customer,
      building,
      amount,
      currency = 'MAD',
      paymentMethod,
      paymentReference,
      invoiceNumber,
      unionAgent,
      journalReference
    } = receiptData;

    const fileName = `receipt_${receiptNumber}_${Date.now()}.pdf`;
    const filePath = path.join(this.receiptsDir, fileName);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const stream = fs.createWriteStream(filePath);

        doc.pipe(stream);

        // Header
        doc.fontSize(24).font('Helvetica-Bold').text('وصل دفع', { align: 'center' });
        doc.fontSize(12).font('Helvetica').text('REÇU DE PAIEMENT', { align: 'center' });
        doc.moveDown(2);

        // Receipt Box
        doc.rect(50, 120, 495, 400).stroke();

        // Receipt Number (Large and Centered)
        doc.fontSize(16).font('Helvetica-Bold')
          .text(`رقم الوصل: ${receiptNumber}`, { align: 'center' });
        doc.fontSize(10).font('Helvetica')
          .text(`Numéro de reçu: ${receiptNumber}`, { align: 'center' });
        doc.moveDown(2);

        // Payment Details
        const startY = 200;
        let currentY = startY;

        doc.fontSize(11).font('Helvetica-Bold');
        
        // Date
        doc.text('التاريخ:', 70, currentY);
        doc.font('Helvetica').text(new Date(paymentDate).toLocaleDateString('ar-MA'), 200, currentY);
        currentY += 25;

        // Customer Name
        doc.font('Helvetica-Bold').text('اسم العميل:', 70, currentY);
        doc.font('Helvetica').text(customer.name, 200, currentY);
        currentY += 25;

        // Building
        doc.font('Helvetica-Bold').text('العمارة:', 70, currentY);
        doc.font('Helvetica').text(building.name, 200, currentY);
        currentY += 25;

        // Apartment
        doc.font('Helvetica-Bold').text('الشقة:', 70, currentY);
        doc.font('Helvetica').text(customer.apartmentNumber, 200, currentY);
        currentY += 25;

        // Amount (Highlighted)
        doc.fontSize(14).font('Helvetica-Bold').text('المبلغ المدفوع:', 70, currentY);
        doc.fillColor('green').fontSize(16).text(`${amount.toFixed(2)} ${currency}`, 200, currentY);
        doc.fillColor('black');
        currentY += 35;

        // Payment Method
        doc.fontSize(11).font('Helvetica-Bold').text('طريقة الدفع:', 70, currentY);
        doc.font('Helvetica').text(this.getPaymentMethodLabel(paymentMethod), 200, currentY);
        currentY += 25;

        // Payment Reference
        if (paymentReference) {
          doc.font('Helvetica-Bold').text('المرجع:', 70, currentY);
          doc.font('Helvetica').text(paymentReference, 200, currentY);
          currentY += 25;
        }

        // Invoice Number
        if (invoiceNumber) {
          doc.font('Helvetica-Bold').text('رقم الفاتورة:', 70, currentY);
          doc.font('Helvetica').text(invoiceNumber, 200, currentY);
          currentY += 25;
        }

        // Journal Reference (Accounting)
        if (journalReference) {
          doc.font('Helvetica-Bold').text('المرجع المحاسبي:', 70, currentY);
          doc.font('Helvetica').text(journalReference, 200, currentY);
          currentY += 25;
        }

        // Union Agent Info (Bottom)
        currentY = 550;
        doc.fontSize(9).font('Helvetica-Bold');
        doc.text('معلومات الوكيل:', 70, currentY);
        doc.font('Helvetica')
          .text(unionAgent.name || 'اسم الوكيل')
          .text(unionAgent.address || 'العنوان')
          .text(unionAgent.phone || 'الهاتف');

        // Signature
        doc.fontSize(9).font('Helvetica-Bold');
        doc.text('التوقيع والختم:', 350, currentY);
        doc.moveTo(350, currentY + 40).lineTo(500, currentY + 40).stroke();

        // Footer
        doc.fontSize(7).font('Helvetica-Oblique');
        doc.text('وصل دفع رسمي صادر عن نظام إقامتي', 50, 750, { align: 'center', width: 500 });
        doc.text(`تاريخ الإصدار: ${new Date().toLocaleString('ar-MA')}`, { align: 'center' });

        doc.end();

        stream.on('finish', () => {
          resolve(filePath);
        });

        stream.on('error', (error) => {
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get payment method label in Arabic
   */
  getPaymentMethodLabel(method) {
    const labels = {
      'cash': 'نقداً',
      'cheque': 'شيك',
      'bank': 'تحويل بنكي',
      'card': 'بطاقة',
      'cmi': 'بوابة الدفع CMI',
      'direct_debit': 'سحب أوتوماتيكي'
    };
    return labels[method] || method;
  }

  /**
   * Delete invoice/receipt file
   */
  async deleteFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting PDF file:', error);
      return false;
    }
  }
}

export default new PDFInvoiceService();
