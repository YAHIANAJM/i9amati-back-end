import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Arabic font path
const ARABIC_FONT_PATH = path.join(__dirname, '../fonts/NotoNaskhArabic-Regular.ttf');

/**
 * Reverse Arabic text for proper RTL rendering in PDFKit
 * PDFKit renders text LTR, so we need to manually reverse Arabic strings
 */
const reverseArabicText = (text) => {
  if (!text) return text;
  
  // Arabic Unicode range: 0600-06FF (Arabic), 0750-077F (Arabic Supplement)
  // 08A0-08FF (Arabic Extended-A), FB50-FDFF (Arabic Presentation Forms-A)
  // FE70-FEFF (Arabic Presentation Forms-B)
  const isArabic = (char) => {
    const code = char.charCodeAt(0);
    return (code >= 0x0600 && code <= 0x06FF) ||
           (code >= 0x0750 && code <= 0x077F) ||
           (code >= 0x08A0 && code <= 0x08FF) ||
           (code >= 0xFB50 && code <= 0xFDFF) ||
           (code >= 0xFE70 && code <= 0xFEFF);
  };
  
  const isNumber = (char) => /[0-9]/.test(char);
  const isLatinOrPunctuation = (char) => {
    const code = char.charCodeAt(0);
    return (code >= 0x0020 && code <= 0x007E) || // Basic Latin
           (code >= 0x00A0 && code <= 0x00FF);   // Latin-1 Supplement
  };
  
  // Split text into segments: Arabic vs non-Arabic
  const segments = [];
  let currentSegment = '';
  let currentType = null;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    let charType;
    
    if (isArabic(char)) {
      charType = 'arabic';
    } else if (isNumber(char)) {
      charType = 'number';
    } else if (isLatinOrPunctuation(char)) {
      charType = 'latin';
    } else {
      charType = 'other';
    }
    
    if (currentType === charType || currentType === null) {
      currentSegment += char;
      currentType = charType;
    } else {
      segments.push({ text: currentSegment, type: currentType });
      currentSegment = char;
      currentType = charType;
    }
  }
  
  if (currentSegment) {
    segments.push({ text: currentSegment, type: currentType });
  }
  
  // Reverse the order of segments (RTL)
  segments.reverse();
  
  // Reverse characters within Arabic segments only
  const result = segments.map(segment => {
    if (segment.type === 'arabic') {
      return segment.text.split('').reverse().join('');
    }
    return segment.text;
  }).join('');
  
  return result;
};

/**
 * Helper to register Arabic font with fallback
 */
const registerArabicFont = (doc) => {
  try {
    if (fs.existsSync(ARABIC_FONT_PATH)) {
      doc.registerFont('Arabic', ARABIC_FONT_PATH);
      doc.font('Arabic');
    } else {
      console.warn('Arabic font not found, using default font');
    }
  } catch (error) {
    console.error('Error loading Arabic font:', error);
  }
};

/**
 * Helper to add Arabic text with proper RTL rendering
 * @param {PDFDocument} doc - PDFKit document instance
 * @param {string} text - Text to add
 * @param {number} x - X coordinate (if null, uses current position)
 * @param {number} y - Y coordinate (if null, uses current position)
 * @param {object} options - Text options (align, width, etc.)
 */
const addArabicText = (doc, text, x = null, y = null, options = {}) => {
  const defaultOptions = {
    align: 'right',
    features: ['rtla'], // Enable RTL alternates
    ...options
  };
  
  // Reverse Arabic text for proper RTL rendering in PDFKit
  const processedText = reverseArabicText(text);
  
  if (x !== null && y !== null) {
    doc.text(processedText, x, y, defaultOptions);
  } else {
    doc.text(processedText, defaultOptions);
  }
};

/**
 * Helper to add bilingual text (Arabic + English)
 */
const addBilingualText = (doc, arabicText, englishText, options = {}) => {
  const { align = 'right', fontSize = 12 } = options;
  
  doc.fontSize(fontSize);
  
  // Arabic text on the right
  addArabicText(doc, arabicText, null, null, { align: 'right', continued: true });
  
  // English text on the left (same line)
  doc.font('Helvetica').text(` (${englishText})`, { align: 'left' });
  
  // Reset to Arabic font
  registerArabicFont(doc);
};

/**
 * Generate PDF for Balance Sheet (Annex 3)
 */
export const generateBalanceSheetPDF = async (balanceSheetData, residenceInfo, fiscalYear) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Register Arabic font
    registerArabicFont(doc);

    // Header with RTL alignment
    doc.fontSize(20);
    addArabicText(doc, 'الحصيلة - الملحق 3', null, null, { align: 'center' });
    
    doc.fontSize(14);
    addArabicText(doc, residenceInfo.name || 'العقار', null, null, { align: 'center' });
    
    doc.fontSize(12);
    addArabicText(doc, `السنة المالية: ${fiscalYear}`, null, null, { align: 'center' });
    doc.moveDown(2);

    // Assets Section
    doc.fontSize(16);
    addBilingualText(doc, 'الأصول', 'ASSETS', { fontSize: 16 });
    doc.moveDown();

    doc.fontSize(12);
    addArabicText(doc, 'الأصول المتداولة:', null, null, { underline: true });
    balanceSheetData.assets.currentAssets.forEach(asset => {
      addArabicText(doc, `${asset.accountName || asset.accountCode}: ${Math.abs(asset.balance).toLocaleString()} د.م`);
    });
    doc.moveDown();

    addArabicText(doc, 'الأصول الثابتة:', null, null, { underline: true });
    balanceSheetData.assets.fixedAssets.forEach(asset => {
      addArabicText(doc, `${asset.accountName || asset.accountCode}: ${Math.abs(asset.balance).toLocaleString()} د.م`);
    });
    doc.moveDown();

    doc.fontSize(14);
    addArabicText(doc, `مجموع الأصول: ${balanceSheetData.assets.total.toLocaleString()} د.م`);
    doc.moveDown(2);

    // Liabilities Section
    doc.fontSize(16);
    addBilingualText(doc, 'الخصوم', 'LIABILITIES', { fontSize: 16 });
    doc.moveDown();

    doc.fontSize(12);
    addArabicText(doc, 'الخصوم المتداولة:', null, null, { underline: true });
    balanceSheetData.liabilities.currentLiabilities.forEach(liability => {
      addArabicText(doc, `${liability.accountName || liability.accountCode}: ${Math.abs(liability.balance).toLocaleString()} د.م`);
    });
    doc.moveDown();

    addArabicText(doc, 'الخصوم طويلة الأجل:', null, null, { underline: true });
    balanceSheetData.liabilities.longTermLiabilities.forEach(liability => {
      addArabicText(doc, `${liability.accountName || liability.accountCode}: ${Math.abs(liability.balance).toLocaleString()} د.م`);
    });
    doc.moveDown();

    doc.fontSize(14);
    addArabicText(doc, `مجموع الخصوم: ${balanceSheetData.liabilities.total.toLocaleString()} د.م`);
    doc.moveDown(2);

    // Equity Section
    doc.fontSize(16);
    addBilingualText(doc, 'الأموال الخاصة', 'EQUITY', { fontSize: 16 });
    doc.moveDown();

    doc.fontSize(12);
    balanceSheetData.equity.reserves.forEach(reserve => {
      addArabicText(doc, `${reserve.accountName || reserve.accountCode}: ${Math.abs(reserve.balance).toLocaleString()} د.م`);
    });
    doc.moveDown();

    doc.fontSize(14);
    addArabicText(doc, `مجموع الأموال الخاصة: ${balanceSheetData.equity.total.toLocaleString()} د.م`);

    // Footer
    doc.moveDown(3);
    doc.fontSize(10);
    addArabicText(doc, `تاريخ الإنشاء: ${new Date().toLocaleDateString('ar-MA')}`, null, null, { align: 'center' });
    addArabicText(doc, 'وفقاً للقانون 18.00 المتعلق بالملكية المشتركة', null, null, { align: 'center' });

    doc.end();
  });
};

/**
 * Generate PDF for Management Account (Annex 4)
 */
export const generateManagementAccountPDF = async (managementData, residenceInfo, fiscalYear) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    registerArabicFont(doc);

    // Header with RTL
    doc.fontSize(20);
    addArabicText(doc, 'حساب التسيير العام - الملحق 4', null, null, { align: 'center' });
    doc.fontSize(14);
    addArabicText(doc, residenceInfo.name || 'العقار', null, null, { align: 'center' });
    doc.fontSize(12);
    addArabicText(doc, `السنة المالية: ${fiscalYear}`, null, null, { align: 'center' });
    doc.moveDown(2);

    // Revenues
    doc.fontSize(16);
    addBilingualText(doc, 'العائدات', 'REVENUES', { fontSize: 16 });
    doc.moveDown();

    doc.fontSize(12);
    managementData.revenues.forEach(rev => {
      addArabicText(doc, `${rev.accountName || rev._id}: ${rev.total.toLocaleString()} د.م`);
    });
    doc.moveDown();

    doc.fontSize(14);
    addArabicText(doc, `مجموع العائدات: ${managementData.totalRevenues.toLocaleString()} د.م`);
    doc.moveDown(2);

    // Expenses
    doc.fontSize(16);
    addBilingualText(doc, 'المصروفات', 'EXPENSES', { fontSize: 16 });
    doc.moveDown();

    doc.fontSize(12);
    managementData.expenses.forEach(exp => {
      addArabicText(doc, `${exp.accountName || exp._id}: ${exp.total.toLocaleString()} د.م`);
    });
    doc.moveDown();

    doc.fontSize(14);
    addArabicText(doc, `مجموع المصروفات: ${managementData.totalExpenses.toLocaleString()} د.م`);
    doc.moveDown(2);

    // Result
    const resultText = managementData.resultType === 'surplus' ? 'الفائض' : 'العجز';
    const resultEng = managementData.resultType === 'surplus' ? 'SURPLUS' : 'DEFICIT';
    doc.fontSize(16).fillColor(managementData.resultType === 'surplus' ? 'green' : 'red');
    addBilingualText(doc, `${resultText}: ${managementData.netResult.toLocaleString()} د.م`, resultEng, { fontSize: 16 });

    // Footer
    doc.moveDown(3);
    doc.fillColor('black').fontSize(10);
    addArabicText(doc, `تاريخ الإنشاء: ${new Date().toLocaleDateString('ar-MA')}`, null, null, { align: 'center' });
    addArabicText(doc, 'وفقاً للقانون 18.00 المتعلق بالملكية المشتركة', null, null, { align: 'center' });

    doc.end();
  });
};

/**
 * Generate PDF for Owner Contributions (Annex 10)
 */
export const generateOwnerContributionsPDF = async (contributionsData, residenceInfo, fiscalYear) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, layout: 'landscape' });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    registerArabicFont(doc);

    // Header with RTL
    doc.fontSize(18);
    addArabicText(doc, 'تتبع إسهامات المالكين - الملحق 10', null, null, { align: 'center' });
    doc.fontSize(12).text(residenceInfo.name, { align: 'center' });
    doc.fontSize(10).text(`السنة المالية: ${fiscalYear}`, { align: 'center' });
    doc.moveDown(2);

    // Summary
    doc.fontSize(12).text('ملخص التحصيل:', { underline: true });
    doc.fontSize(10);
    doc.text(`عدد الشقق: ${contributionsData.summary.totalApartments}`);
    doc.text(`المبلغ المستحق: ${contributionsData.summary.totalDue.toLocaleString()} MAD`);
    doc.text(`المبلغ المحصل: ${contributionsData.summary.totalCollected.toLocaleString()} MAD`);
    doc.text(`المبلغ المتبقي: ${contributionsData.summary.totalOutstanding.toLocaleString()} MAD`);
    doc.text(`نسبة التحصيل: ${contributionsData.summary.collectionRate.toFixed(2)}%`);
    doc.moveDown(2);

    // Table header
    doc.fontSize(10);
    const tableTop = doc.y;
    const colWidths = [60, 150, 150, 60, 80, 80, 80, 60];
    const headers = ['رقم الشقة', 'اسم المالك', 'البريد', 'الحصة', 'المستحق', 'المدفوع', 'الرصيد', 'الحالة'];
    
    let x = 50;
    headers.forEach((header, i) => {
      doc.text(header, x, tableTop, { width: colWidths[i], align: 'center' });
      x += colWidths[i];
    });

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(750, doc.y).stroke();
    doc.moveDown(0.5);

    // Table rows
    contributionsData.contributions.forEach((contrib, index) => {
      if (doc.y > 500) {
        doc.addPage({ layout: 'landscape' });
        doc.fontSize(10);
      }

      x = 50;
      const rowData = [
        contrib.apartmentNumber,
        contrib.ownerName,
        contrib.ownerEmail,
        contrib.share.toString(),
        contrib.totalDue.toLocaleString(),
        contrib.totalPaid.toLocaleString(),
        contrib.balance.toLocaleString(),
        contrib.status === 'paid' ? 'مدفوع' : contrib.status === 'pending' ? 'معلق' : 'زيادة',
      ];

      rowData.forEach((data, i) => {
        doc.text(data, x, doc.y, { width: colWidths[i], align: 'center' });
        x += colWidths[i];
      });

      doc.moveDown(0.8);
    });

    // Footer
    doc.fontSize(8).text(`تاريخ الإنشاء: ${new Date().toLocaleDateString('ar')}`, 50, 550, { align: 'center' });
    doc.text('وفقاً للقانون 18.00 المتعلق بالملكية المشتركة', { align: 'center' });

    doc.end();
  });
};

/**
 * Generate comprehensive PDF report for General Assembly
 */
export const generateGeneralAssemblyReportPDF = async (allData, residenceInfo, fiscalYear) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    registerArabicFont(doc);

    // Cover Page with RTL
    doc.fontSize(24);
    addArabicText(doc, 'التقرير المحاسبي السنوي', null, null, { align: 'center' });
    doc.moveDown();
    doc.fontSize(18).text(residenceInfo.name, { align: 'center' });
    doc.moveDown();
    doc.fontSize(16).text(`السنة المالية ${fiscalYear}`, { align: 'center' });
    doc.moveDown(3);

    doc.fontSize(14).text('مُعد للجمع العام', { align: 'center' });
    doc.text(`المستوى المحاسبي: المستوى ${allData.accountingLevel}`, { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(12).text(`مجموع العائدات السنوية: ${allData.totalRevenue?.toLocaleString()} MAD`, { align: 'center' });
    doc.moveDown();

    doc.fontSize(10).text(`تاريخ الإعداد: ${new Date().toLocaleDateString('ar')}`, { align: 'center' });
    doc.moveDown(5);

    doc.fontSize(10).text('وفقاً للقانون 18.00 المتعلق بنظام الملكية المشتركة للعقارات المبنية', { align: 'center' });

    // Add page break for content
    doc.addPage();

    // Table of Contents
    doc.fontSize(16).text('المحتويات', { underline: true });
    doc.moveDown();
    doc.fontSize(12);
    doc.text('1. الحصيلة (الملحق 3) ........................... 3');
    doc.text('2. حساب التسيير العام (الملحق 4) .......... 4');
    doc.text('3. الميزانية التقديرية (الملحق 5) ........... 5');
    doc.text('4. تتبع الحساب الاحتياطي (الملحق 7) ...... 6');
    doc.text('5. تتبع القروض (الملحق 8) .................. 7');
    doc.text('6. تتبع إسهامات المالكين (الملحق 10) ..... 8');

    // Footer
    doc.moveDown(10);
    doc.fontSize(8).text('هذا التقرير معتمد ومطابق للقانون المغربي 18.00', { align: 'center' });

    doc.end();
  });
};

/**
 * Generate PDF for Legal/Court submission
 */
export const generateLegalReportPDF = async (allData, residenceInfo, fiscalYear) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    registerArabicFont(doc);

    // Official Header with RTL
    doc.fontSize(18);
    addArabicText(doc, 'المملكة المغربية', null, null, { align: 'center' });
    doc.fontSize(12).text('وزارة العدل', { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(16).text('تقرير محاسبي قانوني', { align: 'center', underline: true });
    doc.moveDown(2);

    // Residence Information
    doc.fontSize(12);
    doc.text(`اسم العقار: ${residenceInfo.name}`);
    doc.text(`العنوان: ${residenceInfo.address || 'غير محدد'}`);
    doc.text(`رقم التسجيل: ${residenceInfo.registrationNumber || 'غير محدد'}`);
    doc.text(`السنة المالية: ${fiscalYear}`);
    doc.text(`المستوى المحاسبي: المستوى ${allData.accountingLevel}`);
    doc.moveDown(2);

    // Legal Compliance Statement
    doc.fontSize(14).text('إقرار الامتثال القانوني', { underline: true });
    doc.moveDown();
    doc.fontSize(11);
    doc.text('نشهد بأن هذا التقرير المحاسبي معد وفقاً لأحكام القانون رقم 18.00 المتعلق بنظام الملكية المشتركة للعقارات المبنية، وأن جميع المعلومات الواردة فيه صحيحة ودقيقة.');
    doc.moveDown(2);

    // Financial Summary
    doc.fontSize(14).text('الملخص المالي', { underline: true });
    doc.moveDown();
    doc.fontSize(11);
    doc.text(`مجموع العائدات السنوية: ${allData.totalRevenue?.toLocaleString()} MAD`);
    doc.text(`التصنيف المحاسبي: ${allData.levelDescription || ''}`);
    doc.moveDown(2);

    // Annexes List
    doc.fontSize(14).text('المرفقات المطلوبة', { underline: true });
    doc.moveDown();
    doc.fontSize(11);
    if (allData.requiredAnnexes) {
      allData.requiredAnnexes.forEach((annex, index) => {
        doc.text(`${index + 1}. ${annex}`);
      });
    }
    doc.moveDown(3);

    // Signature Section
    doc.fontSize(12).text('التوقيع والختم', { underline: true });
    doc.moveDown();
    doc.text('اسم وكيل الاتحاد: _____________________');
    doc.moveDown();
    doc.text('التوقيع: _____________________');
    doc.moveDown();
    doc.text(`التاريخ: ${new Date().toLocaleDateString('ar')}`);

    // Official Footer
    doc.moveDown(5);
    doc.fontSize(8).text('هذه الوثيقة صالحة للاستخدام القانوني والمحاكم', { align: 'center' });

    doc.end();
  });
};
