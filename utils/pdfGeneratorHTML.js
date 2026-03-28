import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ARABIC_FONT_PATH = path.join(__dirname, '../fonts/NotoNaskhArabic-Regular.ttf');

// ============= Shared Helpers =============

const registerArabicFont = (doc) => {
  try {
    if (fs.existsSync(ARABIC_FONT_PATH)) {
      doc.registerFont('Arabic', ARABIC_FONT_PATH);
      doc.font('Arabic');
    } else {
      console.warn('Arabic font not found, using Helvetica');
      doc.font('Helvetica');
    }
  } catch (error) {
    console.error('Error loading Arabic font:', error);
    doc.font('Helvetica');
  }
};

const formatAmount = (n) => (n || 0).toLocaleString('ar-MA', { minimumFractionDigits: 2 });

const getDate = () => new Date().toLocaleDateString('ar-MA', { year: 'numeric', month: 'long', day: 'numeric' });

/**
 * Build a PDF buffer from a callback that populates the PDFDocument.
 * @param {object} docOptions - Options for PDFDocument constructor
 * @param {function} drawFn - (doc) => void — draw content onto the doc
 * @returns {Promise<Buffer>}
 */
const buildPdf = (docOptions, drawFn) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, ...docOptions });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    registerArabicFont(doc);
    try {
      drawFn(doc);
    } catch (err) {
      reject(err);
      return;
    }
    doc.end();
  });
};

/**
 * Draw a simple table.
 * @param {PDFDocument} doc
 * @param {string[]} headers - column header labels
 * @param {Array<string[]>} rows - each row is an array of cell values
 * @param {object} opts - { x, colWidths, headerBg, fontSize, amountColumns, totalRows }
 */
const drawTable = (doc, headers, rows, opts = {}) => {
  const {
    x = 50,
    colWidths = null,
    headerBg = '#4472C4',
    fontSize = 10,
    amountColumns = [],
    totalRows = [],
    maxWidth = null,
  } = opts;

  const pageWidth = maxWidth || (doc.page.width - doc.page.margins.left - doc.page.margins.right);
  const defaultColWidth = pageWidth / headers.length;
  const widths = colWidths || headers.map(() => defaultColWidth);

  // Header row
  let curX = x;
  const headerY = doc.y;
  const headerHeight = 22;

  headers.forEach((h, i) => {
    doc.save()
      .rect(curX, headerY, widths[i], headerHeight)
      .fill(headerBg);
    doc.restore();
    doc.fillColor('#FFFFFF').fontSize(fontSize).font('Arabic');
    doc.text(h, curX + 4, headerY + 5, { width: widths[i] - 8, align: 'center' });
    curX += widths[i];
  });

  doc.fillColor('#000000');
  doc.y = headerY + headerHeight + 2;

  // Data rows
  rows.forEach((row, rowIdx) => {
    const isTotal = totalRows.includes(rowIdx);
    const rowHeight = 20;

    // Check page break
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom - 30) {
      doc.addPage();
      registerArabicFont(doc);
    }

    const rowY = doc.y;
    curX = x;

    if (isTotal) {
      doc.save()
        .rect(curX, rowY, widths.reduce((a, b) => a + b, 0), rowHeight)
        .fill('#FFF2CC');
      doc.restore();
      doc.fillColor('#000000');
    }

    row.forEach((cell, i) => {
      const isAmount = amountColumns.includes(i);
      doc.fontSize(fontSize - 1).font('Arabic');
      doc.text(cell ?? '', curX + 4, rowY + 4, {
        width: widths[i] - 8,
        align: isAmount ? 'right' : 'center',
      });
      curX += widths[i];
    });

    // thin bottom border
    doc.save()
      .moveTo(x, rowY + rowHeight)
      .lineTo(x + widths.reduce((a, b) => a + b, 0), rowY + rowHeight)
      .strokeColor('#CCCCCC')
      .stroke();
    doc.restore();

    doc.y = rowY + rowHeight;
  });

  doc.y += 8;
};

/**
 * Draw a centered title block.
 */
const drawHeader = (doc, title, subtitle, date) => {
  doc.fontSize(18).text(title, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(12).text(subtitle, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(10).text(date, { align: 'center' });
  doc.moveDown(1.5);
};

// ============= Exported generators =============

/**
 * Generate PDF from raw HTML string — REPLACED with PDFKit data-based renderer.
 * Now accepts a plain-text data object instead of HTML.
 * For backward-compat, the generic annex export calls this indirectly.
 */
export const htmlToPdf = async (dataEntries, landscape = false) => {
  // dataEntries: { title, subtitle, rows: [{ key, value }] }
  return buildPdf({ layout: landscape ? 'landscape' : 'portrait' }, (doc) => {
    drawHeader(doc, dataEntries.title || '', dataEntries.subtitle || '', getDate());

    if (dataEntries.rows && dataEntries.rows.length > 0) {
      drawTable(doc,
        ['الحقل', 'القيمة'],
        dataEntries.rows.map(r => [r.key, r.value]),
        { colWidths: [200, 280] }
      );
    }
  });
};

/**
 * Generate Management Account (Annex 4) PDF
 */
export const generateManagementAccountHTML = async (data, residenceInfo, fiscalYear) => {
  return buildPdf({}, (doc) => {
    drawHeader(
      doc,
      'حساب التسيير المحاسبي - الملحق 4',
      `${residenceInfo.name || 'العقار'} — السنة المالية ${fiscalYear}`,
      getDate()
    );

    // Revenues section
    doc.fontSize(14).text('العائدات (REVENUES)', { align: 'right', underline: true });
    doc.moveDown(0.5);

    let totalRevenues = 0;
    const revenueRows = (data.revenues || []).map(r => {
      totalRevenues += r.amount || 0;
      return [r.accountCode || '', r.accountName || r.description || '', `${formatAmount(r.amount)} د.م`];
    });
    revenueRows.push(['', 'المجموع الإجمالي', `${formatAmount(totalRevenues)} د.م`]);

    drawTable(doc,
      ['رمز الحساب', 'اسم الحساب', 'المبلغ'],
      revenueRows,
      { colWidths: [120, 230, 130], amountColumns: [2], totalRows: [revenueRows.length - 1] }
    );

    doc.moveDown(0.5);

    // Expenses section
    doc.fontSize(14).text('المصروفات (EXPENSES)', { align: 'right', underline: true });
    doc.moveDown(0.5);

    let totalExpenses = 0;
    const expenseRows = (data.expenses || []).map(e => {
      totalExpenses += e.amount || 0;
      return [e.accountCode || '', e.accountName || e.description || '', `${formatAmount(e.amount)} د.م`];
    });
    expenseRows.push(['', 'المجموع الإجمالي', `${formatAmount(totalExpenses)} د.م`]);

    drawTable(doc,
      ['رمز الحساب', 'اسم الحساب', 'المبلغ'],
      expenseRows,
      { colWidths: [120, 230, 130], amountColumns: [2], totalRows: [expenseRows.length - 1] }
    );

    doc.moveDown(1);

    // Summary
    const net = totalRevenues - totalExpenses;
    doc.fontSize(14).text('ملخص (SUMMARY)', { align: 'right', underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`إجمالي العائدات: ${formatAmount(totalRevenues)} د.م`, { align: 'right' });
    doc.text(`إجمالي المصروفات: ${formatAmount(totalExpenses)} د.م`, { align: 'right' });
    const netLabel = net >= 0 ? 'الفائض (Surplus)' : 'العجز (Deficit)';
    doc.text(`${netLabel}: ${formatAmount(Math.abs(net))} د.م`, { align: 'right' });

    // Footer
    doc.moveDown(3);
    doc.fontSize(8).text('وفقاً للقانون 18.00 المتعلق بالملكية المشتركة', { align: 'center' });
  });
};

/**
 * Generate Balance Sheet (Annex 3) PDF
 */
export const generateBalanceSheetHTML = async (data, residenceInfo, fiscalYear) => {
  return buildPdf({}, (doc) => {
    drawHeader(
      doc,
      'الحصيلة - الملحق 3',
      `${residenceInfo.name || 'العقار'} — السنة المالية ${fiscalYear}`,
      getDate()
    );

    const fmtBalance = (items) => (items || []).map(i => [
      i.accountName || i.accountCode || '',
      `${formatAmount(Math.abs(i.balance || 0))} د.م`,
    ]);

    // Current Assets
    doc.fontSize(14).text('الأصول المتداولة', { align: 'right', underline: true });
    doc.moveDown(0.3);
    drawTable(doc, ['الحساب', 'المبلغ'],
      fmtBalance(data.assets?.currentAssets),
      { colWidths: [300, 180], amountColumns: [1] }
    );

    // Fixed Assets
    doc.fontSize(14).text('الأصول الثابتة', { align: 'right', underline: true });
    doc.moveDown(0.3);
    drawTable(doc, ['الحساب', 'المبلغ'],
      fmtBalance(data.assets?.fixedAssets),
      { colWidths: [300, 180], amountColumns: [1] }
    );

    doc.fontSize(12).text(`مجموع الأصول: ${formatAmount(data.assets?.total || 0)} د.م`, { align: 'right' });
    doc.moveDown(1);

    // Current Liabilities
    doc.fontSize(14).text('الخصوم المتداولة', { align: 'right', underline: true });
    doc.moveDown(0.3);
    drawTable(doc, ['الحساب', 'المبلغ'],
      fmtBalance(data.liabilities?.currentLiabilities),
      { colWidths: [300, 180], amountColumns: [1] }
    );

    // Equity
    doc.fontSize(14).text('الأموال الخاصة', { align: 'right', underline: true });
    doc.moveDown(0.3);
    drawTable(doc, ['الحساب', 'المبلغ'],
      fmtBalance(data.liabilities?.equity),
      { colWidths: [300, 180], amountColumns: [1] }
    );

    doc.fontSize(12).text(`مجموع الخصوم: ${formatAmount(data.liabilities?.total || 0)} د.م`, { align: 'right' });
    doc.moveDown(1);

    // Balance check
    const totalAssets = data.assets?.total || 0;
    const totalLiabilities = data.liabilities?.total || 0;
    const diff = Math.abs(totalAssets - totalLiabilities);
    if (diff < 0.01) {
      doc.fillColor('green').fontSize(11).text('✓ الحصيلة متوازنة', { align: 'center' });
    } else {
      doc.fillColor('red').fontSize(11).text(`⚠ فرق: ${formatAmount(diff)} د.م`, { align: 'center' });
    }
    doc.fillColor('#000000');

    doc.moveDown(2);
    doc.fontSize(8).text('وفقاً للقانون 18.00 المتعلق بالملكية المشتركة', { align: 'center' });
  });
};

/**
 * Generate Owner Contributions (Annex 10) PDF
 */
export const generateOwnerContributionsHTML = async (data, residenceInfo, fiscalYear) => {
  return buildPdf({ layout: 'landscape' }, (doc) => {
    drawHeader(
      doc,
      'تتبع إسهامات المالكين - الملحق 10',
      `${residenceInfo.name || 'العقار'} — السنة المالية ${fiscalYear}`,
      getDate()
    );

    let totalRequired = 0, totalPaid = 0, totalBalance = 0;
    const rows = (data.owners || []).map(o => {
      const required = o.requiredAmount || o.annualContribution || 0;
      const paid = o.paidAmount || 0;
      const balance = required - paid;
      totalRequired += required;
      totalPaid += paid;
      totalBalance += balance;
      const statusAr = balance <= 0 ? 'مدفوع' : 'متأخر';
      return [
        o.unitNumber || o.apartmentNumber || '',
        o.ownerName || '',
        `${(o.sharePercentage || 0).toFixed(2)}%`,
        `${formatAmount(required)} د.م`,
        `${formatAmount(paid)} د.م`,
        `${formatAmount(Math.max(0, balance))} د.م`,
        statusAr,
      ];
    });

    // Add totals row
    rows.push([
      '', 'المجموع', '',
      `${formatAmount(totalRequired)} د.م`,
      `${formatAmount(totalPaid)} د.م`,
      `${formatAmount(Math.max(0, totalBalance))} د.م`,
      '',
    ]);

    const headers = ['رقم الوحدة', 'اسم المالك', 'الحصة %', 'المستحق', 'المدفوع', 'الرصيد', 'الحالة'];
    // landscape A4 usable width ~ 742
    const colWidths = [80, 140, 70, 120, 120, 120, 80];

    drawTable(doc, headers, rows, {
      colWidths,
      amountColumns: [3, 4, 5],
      totalRows: [rows.length - 1],
    });

    doc.moveDown(2);
    doc.fontSize(8).text('وفقاً للقانون 18.00 المتعلق بالملكية المشتركة', { align: 'center' });
  });
};

/**
 * Generate General Assembly Report PDF
 */
export const generateGeneralAssemblyReportHTML = async (data, residenceInfo, fiscalYear) => {
  return buildPdf({}, (doc) => {
    drawHeader(
      doc,
      'التقرير المحاسبي السنوي',
      `${residenceInfo.name || 'العقار'} — ${residenceInfo.address || ''}`,
      getDate()
    );

    doc.fontSize(14).text(`السنة المالية ${fiscalYear}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`المستوى المحاسبي: المستوى ${data.accountingLevel || 1}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`مجموع العائدات السنوية: ${formatAmount(data.totalRevenue || 0)} د.م`, { align: 'center' });

    if (data.levelDescription) {
      doc.moveDown(0.5);
      doc.fontSize(10).text(`التصنيف: ${data.levelDescription}`, { align: 'center' });
    }

    doc.moveDown(1.5);
    doc.fontSize(14).text('الملاحق المطلوبة:', { align: 'right', underline: true });
    doc.moveDown(0.5);
    const annexes = data.requiredAnnexes || [];
    if (annexes.length > 0) {
      annexes.forEach(a => {
        doc.fontSize(11).text(`✓ ${a}`, { align: 'right' });
      });
    } else {
      doc.fontSize(11).text('لا توجد ملاحق محددة', { align: 'right' });
    }

    doc.moveDown(3);
    doc.fontSize(8).text('وفقاً للقانون 18.00 المتعلق بنظام الملكية المشتركة للعقارات المبنية', { align: 'center' });
  });
};

/**
 * Generate Legal/Court Report PDF
 */
export const generateLegalReportHTML = async (data, residenceInfo, fiscalYear) => {
  return buildPdf({}, (doc) => {
    doc.fontSize(18).text('المملكة المغربية', { align: 'center' });
    doc.fontSize(12).text('وزارة العدل', { align: 'center' });
    doc.moveDown(1.5);

    doc.fontSize(16).text('تقرير محاسبي قانوني', { align: 'center', underline: true });
    doc.moveDown(1.5);

    doc.fontSize(12);
    doc.text(`اسم العقار: ${residenceInfo.name || ''}`, { align: 'right' });
    doc.text(`العنوان: ${residenceInfo.address || 'غير محدد'}`, { align: 'right' });
    doc.text(`رقم التسجيل: ${residenceInfo.registrationNumber || 'غير محدد'}`, { align: 'right' });
    doc.text(`السنة المالية: ${fiscalYear}`, { align: 'right' });
    doc.text(`المستوى المحاسبي: المستوى ${data.accountingLevel || 1}`, { align: 'right' });
    doc.moveDown(1.5);

    doc.fontSize(14).text('إقرار الامتثال القانوني', { align: 'right', underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).text(
      'نشهد بأن هذا التقرير المحاسبي معد وفقاً لأحكام القانون رقم 18.00 المتعلق بنظام الملكية المشتركة للعقارات المبنية، وأن جميع المعلومات الواردة فيه صحيحة ودقيقة.',
      { align: 'right' }
    );
    doc.moveDown(1.5);

    doc.fontSize(14).text('الملخص المالي', { align: 'right', underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`مجموع العائدات السنوية: ${formatAmount(data.totalRevenue || 0)} د.م`, { align: 'right' });
    if (data.levelDescription) {
      doc.text(`التصنيف المحاسبي: ${data.levelDescription}`, { align: 'right' });
    }
    doc.moveDown(1.5);

    doc.fontSize(14).text('المرفقات المطلوبة', { align: 'right', underline: true });
    doc.moveDown(0.5);
    const annexes = data.requiredAnnexes || [];
    if (annexes.length > 0) {
      annexes.forEach((a, i) => {
        doc.fontSize(11).text(`${i + 1}. ${a}`, { align: 'right' });
      });
    }
    doc.moveDown(2);

    doc.fontSize(12).text('التوقيع والختم', { align: 'right', underline: true });
    doc.moveDown(0.5);
    doc.text('اسم وكيل الاتحاد: _____________________', { align: 'right' });
    doc.moveDown(0.5);
    doc.text('التوقيع: _____________________', { align: 'right' });
    doc.moveDown(0.5);
    doc.text(`التاريخ: ${getDate()}`, { align: 'right' });

    doc.moveDown(3);
    doc.fontSize(8).text('هذه الوثيقة صالحة للاستخدام القانوني والمحاكم', { align: 'center' });
  });
};

/**
 * Generate a generic annex PDF from stored annex data.
 * Used by the catch-all route in exportController.
 * @param {object} annexData - the annex.data object from MongoDB
 * @param {string} annexName - display name
 * @param {string} buildingName
 * @param {number} fiscalYear
 * @returns {Promise<Buffer>}
 */
export const generateGenericAnnexPdf = async (annexData, annexName, buildingName, fiscalYear) => {
  const isObjectId = (val) => typeof val === 'string' && /^[a-f0-9]{24}$/.test(val);
  const fmt = (val) => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'number') return val.toLocaleString('ar-MA');
    if (typeof val === 'boolean') return val ? 'نعم' : 'لا';
    if (Array.isArray(val)) return val.length > 0 ? `[${val.length} عنصر]` : '-';
    if (typeof val === 'object') return JSON.stringify(val).substring(0, 60);
    return String(val);
  };

  return buildPdf({}, (doc) => {
    drawHeader(doc, annexName || 'ملحق', `${buildingName} — السنة المالية ${fiscalYear}`, getDate());

    const data = annexData || {};
    const summaryRows = [];

    for (const [key, val] of Object.entries(data)) {
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
        // Section header
        doc.fontSize(13).text(key, { align: 'right', underline: true });
        doc.moveDown(0.3);

        const allKeys = [...new Set(val.flatMap(item => Object.keys(item)))];
        const colKeys = allKeys.filter(k => {
          if (k === '__v') return false;
          const sample = val[0][k];
          if (k === '_id' && isObjectId(String(sample ?? ''))) return false;
          return true;
        });

        if (colKeys.length > 0) {
          const colWidth = Math.min(120, (doc.page.width - 100) / colKeys.length);
          const widths = colKeys.map(() => colWidth);

          const tableRows = val.map(item => colKeys.map(k => fmt(item[k])));
          drawTable(doc, colKeys, tableRows, { colWidths: widths, fontSize: 8 });
        }
        doc.moveDown(0.5);
      } else if (!Array.isArray(val) && typeof val !== 'object') {
        summaryRows.push([key, fmt(val)]);
      }
    }

    // Summary section
    if (summaryRows.length > 0) {
      doc.fontSize(13).text('ملخص', { align: 'right', underline: true });
      doc.moveDown(0.3);
      drawTable(doc, ['الحقل', 'القيمة'], summaryRows, { colWidths: [250, 230] });
    }

    doc.moveDown(1);
    doc.fontSize(8).text('وفقاً للقانون 18.00 المتعلق بالملكية المشتركة', { align: 'center' });
  });
};
