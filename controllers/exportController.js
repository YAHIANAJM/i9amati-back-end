import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import GeneralLedger from '../models/GeneralLedger.js';
import Budget from '../models/Budget.js';
import Building from '../models/Building.js';
import AnnualRevenue from '../models/AnnualRevenue.js';
import Annex from '../models/Annex.js';
import * as excelGenerator from '../utils/excelGenerator.js';
import * as pdfGeneratorHTML from '../utils/pdfGeneratorHTML.js';

// ============= EXCEL EXPORTS =============

/**
 * Export General Ledger to Excel
 */
export const exportGeneralLedgerExcel = async (req, res) => {
  try {
    const { residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    const ledgerData = await GeneralLedger.find({
      residence_id: residenceId,
      fiscalYear: fiscalYear,
    }).sort({ date: 1, accountCode: 1 });

    const residence = await Building.findById(residenceId);
    if (!residence) {
      return res.status(404).json({ error: 'Residence not found' });
    }

    const workbook = await excelGenerator.generateGeneralLedgerExcel(
      ledgerData,
      { name: residence.building_name, address: residence.building_address },
      fiscalYear
    );

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="General-Ledger-${fiscalYear}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting general ledger:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Export Balance Sheet (Annex 3) to Excel
 */
export const exportBalanceSheetExcel = async (req, res) => {
  try {
    const { residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    const annex = await Annex.findOne({
      residence_id: residenceId,
      fiscalYear: fiscalYear,
      annexNumber: 'Annex 3',
    });

    if (!annex || !annex.data) {
      return res.status(404).json({ error: 'Balance sheet not generated yet. Please generate Annex 3 first.' });
    }

    const residence = await Building.findById(residenceId);

    const workbook = await excelGenerator.generateBalanceSheetExcel(
      annex.data,
      { name: residence.building_name, address: residence.building_address },
      fiscalYear
    );

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Balance-Sheet-${fiscalYear}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting balance sheet:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Export Management Account (Annex 4) to Excel
 */
export const exportManagementAccountExcel = async (req, res) => {
  try {
    const { residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    const annex = await Annex.findOne({
      residence_id: residenceId,
      fiscalYear: fiscalYear,
      annexNumber: 'Annex 4',
    });

    if (!annex || !annex.data) {
      return res.status(404).json({ error: 'Management account not generated yet. Please generate Annex 4 first.' });
    }

    const residence = await Building.findById(residenceId);

    const workbook = await excelGenerator.generateManagementAccountExcel(
      annex.data,
      { name: residence.building_name, address: residence.building_address },
      fiscalYear
    );

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Management-Account-${fiscalYear}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting management account:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Export Owner Contributions (Annex 10) to Excel
 */
export const exportOwnerContributionsExcel = async (req, res) => {
  try {
    const { residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    const annex = await Annex.findOne({
      residence_id: residenceId,
      fiscalYear: fiscalYear,
      annexNumber: 'Annex 10',
    });

    if (!annex || !annex.data) {
      return res.status(404).json({ error: 'Owner contributions not generated yet. Please generate Annex 10 first.' });
    }

    const residence = await Building.findById(residenceId);

    const workbook = await excelGenerator.generateOwnerContributionsExcel(
      annex.data,
      { name: residence.building_name, address: residence.building_address },
      fiscalYear
    );

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Owner-Contributions-${fiscalYear}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting owner contributions:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Export complete accounting package to Excel (multiple sheets)
 */
export const exportCompleteAccountingExcel = async (req, res) => {
  try {
    const { residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    const residence = await Building.findById(residenceId);
    const annualRevenue = await AnnualRevenue.findOne({
      residence_id: residenceId,
      fiscalYear: fiscalYear,
    });

    const allData = {
      accountingLevel: annualRevenue?.accountingLevel || 1,
      totalRevenue: annualRevenue?.totalRevenue || 0,
    };

    const workbook = await excelGenerator.generateCompleteAccountingExcel(
      allData,
      { name: residence.building_name, address: residence.building_address },
      fiscalYear
    );

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Complete-Accounting-${fiscalYear}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting complete accounting:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============= PDF EXPORTS =============

/**
 * Export Balance Sheet (Annex 3) to PDF
 */
export const exportBalanceSheetPDF = async (req, res) => {
  try {
    const { residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    const annex = await Annex.findOne({
      residence_id: residenceId,
      fiscalYear: fiscalYear,
      annexNumber: 'Annex 3',
    });

    if (!annex || !annex.data) {
      return res.status(404).json({ error: 'Balance sheet not generated yet. Please generate Annex 3 first.' });
    }

    const residence = await Building.findById(residenceId);

    const pdfBuffer = await pdfGeneratorHTML.generateBalanceSheetHTML(
      annex.data,
      { name: residence.building_name, address: residence.building_address },
      fiscalYear
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Balance-Sheet-${fiscalYear}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error exporting balance sheet PDF:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Export Management Account (Annex 4) to PDF
 */
export const exportManagementAccountPDF = async (req, res) => {
  try {
    const { residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    const annex = await Annex.findOne({
      residence_id: residenceId,
      fiscalYear: fiscalYear,
      annexNumber: 'Annex 4',
    });

    if (!annex || !annex.data) {
      return res.status(404).json({ error: 'Management account not generated yet. Please generate Annex 4 first.' });
    }

    const residence = await Building.findById(residenceId);

    const pdfBuffer = await pdfGeneratorHTML.generateManagementAccountHTML(
      annex.data,
      { name: residence.building_name, address: residence.building_address },
      fiscalYear
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Management-Account-${fiscalYear}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error exporting management account PDF:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Export Owner Contributions (Annex 10) to PDF
 */
export const exportOwnerContributionsPDF = async (req, res) => {
  try {
    const { residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    const annex = await Annex.findOne({
      residence_id: residenceId,
      fiscalYear: fiscalYear,
      annexNumber: 'Annex 10',
    });

    if (!annex || !annex.data) {
      return res.status(404).json({ error: 'Owner contributions not generated yet. Please generate Annex 10 first.' });
    }

    const residence = await Building.findById(residenceId);

    const pdfBuffer = await pdfGeneratorHTML.generateOwnerContributionsHTML(
      annex.data,
      { name: residence.building_name, address: residence.building_address },
      fiscalYear
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Owner-Contributions-${fiscalYear}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error exporting owner contributions PDF:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Export comprehensive report for General Assembly
 */
export const exportGeneralAssemblyReportPDF = async (req, res) => {
  try {
    const { residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    const residence = await Building.findById(residenceId);
    const annualRevenue = await AnnualRevenue.findOne({
      residence_id: residenceId,
      fiscalYear: fiscalYear,
    });

    const allData = {
      accountingLevel: annualRevenue?.accountingLevel || 1,
      totalRevenue: annualRevenue?.totalRevenue || 0,
      levelDescription: annualRevenue?.levelDescription || '',
      requiredAnnexes: annualRevenue?.requiredAnnexes || [],
    };

    const pdfBuffer = await pdfGeneratorHTML.generateGeneralAssemblyReportHTML(
      allData,
      { name: residence.building_name, address: residence.building_address },
      fiscalYear
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="General-Assembly-Report-${fiscalYear}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error exporting general assembly report:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Export legal/court report
 */
export const exportLegalReportPDF = async (req, res) => {
  try {
    const { residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    const residence = await Building.findById(residenceId);
    const annualRevenue = await AnnualRevenue.findOne({
      residence_id: residenceId,
      fiscalYear: fiscalYear,
    });

    const allData = {
      accountingLevel: annualRevenue?.accountingLevel || 1,
      totalRevenue: annualRevenue?.totalRevenue || 0,
      levelDescription: annualRevenue?.levelDescription || '',
      requiredAnnexes: annualRevenue?.requiredAnnexes || [],
    };

    const pdfBuffer = await pdfGeneratorHTML.generateLegalReportHTML(
      allData,
      { 
        name: residence.building_name, 
        address: residence.building_address,
        registrationNumber: residence.original_title_number 
      },
      fiscalYear
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Legal-Report-${fiscalYear}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error exporting legal report:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============= GENERIC ANNEX EXPORT (catch-all for remaining annex types) =============

const ANNEX_TYPE_MAP = {
  'budget': 'Annex 5',
  'off-budget-works': 'Annex 6',
  'reserves': 'Annex 7',
  'loans': 'Annex 8',
  'equipment-inventory': 'Annex 9',
  'consolidated-statements': 'Annex 11',
  'budget-comparison': 'Annex 12',
  'simplified-receipts': 'Annex 13',
  'owners-shares': 'Annex 13-bis',
  'auditor-report': 'Annex 14',
};

/**
 * Generic Excel export for any annex type using stored annex data
 */
export const exportAnnexGenericExcel = async (req, res) => {
  try {
    const { annexType, residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    const annexNumber = ANNEX_TYPE_MAP[annexType];
    if (!annexNumber) {
      return res.status(404).json({ error: `No export handler for type: ${annexType}` });
    }

    const annex = await Annex.findOne({ residence_id: residenceId, fiscalYear, annexNumber });
    if (!annex || annex.status === 'missing') {
      return res.status(404).json({ error: `Annex ${annexNumber} has not been generated yet` });
    }

    const residence = await Building.findById(residenceId);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(annexNumber.replace('/', '-'));
    worksheet.views = [{ rightToLeft: true }];

    // Field name translation map (English keys → Arabic labels)
    const FIELD_LABELS = {
      _id: 'رقم الحساب',
      total: 'المجموع',
      amount: 'المبلغ',
      accountNumber: 'رقم الحساب',
      accountName: 'اسم الحساب',
      totalReceipts: 'إجمالي التحصيلات',
      totalExpenses: 'إجمالي المصروفات',
      netBalance: 'الرصيد الصافي',
      balanceType: 'نوع الرصيد',
      receipts: 'التحصيلات (إيرادات)',
      expenses: 'المصروفات',
      revenues: 'الإيرادات',
      totalRevenues: 'إجمالي الإيرادات',
      totalExpensesForecasted: 'إجمالي المصروفات التقديرية',
      totalRevenuesForecasted: 'إجمالي الإيرادات التقديرية',
      forecastedResult: 'النتيجة التقديرية',
      revenuesForecasted: 'الإيرادات التقديرية',
      expensesForecasted: 'المصروفات التقديرية',
      netResult: 'النتيجة الصافية',
      resultType: 'نوع النتيجة',
      apartmentNumber: 'رقم الشقة',
      ownerName: 'اسم المالك',
      ownerEmail: 'البريد الإلكتروني',
      ownerPhone: 'الهاتف',
      share: 'الحصة',
      sharePercentage: 'نسبة الحصة (%)',
      contributionsDue: 'المساهمات المستحقة',
      paidAmount: 'المبلغ المدفوع',
      outstandingBalance: 'الرصيد المتبقي',
      overpayment: 'الدفع الزائد',
      totalContributions: 'إجمالي المساهمات',
      totalDue: 'الإجمالي المستحق',
      totalPaid: 'إجمالي المدفوع',
      totalOutstanding: 'إجمالي المتبقي',
      totalApartments: 'عدد الشقق',
      totalShares: 'إجمالي الحصص',
      collectionRate: 'نسبة التحصيل (%)',
      balance: 'الرصيد',
      debit: 'مدين',
      credit: 'دائن',
      principalAmount: 'مبلغ القرض',
      interestRate: 'معدل الفائدة',
      remainingBalance: 'الرصيد المتبقي',
      loanNumber: 'رقم القرض',
      lenderName: 'اسم المقرض',
      disbursementDate: 'تاريخ الصرف',
      termMonths: 'مدة القرض (أشهر)',
      status: 'الحالة',
      description: 'الوصف',
      approvedAt: 'تاريخ الاعتماد',
      specialist: 'المتخصص',
      fundName: 'اسم الصندوق',
      fundType: 'نوع الصندوق',
      currentBalance: 'الرصيد الحالي',
      targetAmount: 'المبلغ المستهدف',
      name: 'الاسم',
      category: 'الفئة',
      condition: 'الحالة',
      acquisitionDate: 'تاريخ الاقتناء',
      acquisitionCost: 'تكلفة الاقتناء',
      currentValue: 'القيمة الحالية',
      surplus: 'فائض',
      deficit: 'عجز',
    };

    const label = (key) => FIELD_LABELS[key] || key;
    const isObjectId = (val) => typeof val === 'string' && /^[a-f0-9]{24}$/.test(val);
    const fmt = (val) => {
      if (val === null || val === undefined) return '';
      if (typeof val === 'number') return val;
      if (isObjectId(String(val))) return String(val);
      return String(val);
    };

    const HEADER_STYLE = { bold: true, color: { argb: 'FFFFFFFF' } };
    const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    const SECTION_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    const TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };

    const applyStyle = (row, fill, bold = false) => {
      row.eachCell(cell => {
        cell.fill = fill;
        if (bold) cell.font = { bold: true };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
      });
    };

    // Title rows
    const totalCols = 4;
    worksheet.mergeCells(`A1:D1`);
    worksheet.getCell('A1').value = `${annex.annexName || annexNumber} — ${residence?.building_name || ''}`;
    worksheet.getCell('A1').font = { bold: true, size: 14 };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };
    worksheet.mergeCells('A2:D2');
    worksheet.getCell('A2').value = `السنة المالية: ${fiscalYear}`;
    worksheet.getCell('A2').alignment = { horizontal: 'center' };
    worksheet.addRow([]);

    const data = annex.data || {};
    const summaryRows = [];

    for (const [key, val] of Object.entries(data)) {
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
        // Section header
        const sectionRow = worksheet.addRow([label(key)]);
        sectionRow.getCell(1).font = { bold: true, size: 12 };
        applyStyle(sectionRow, SECTION_FILL, true);
        worksheet.mergeCells(`A${sectionRow.number}:D${sectionRow.number}`);

        // Determine columns — filter out _id when it's a Mongo ObjectId in first row
        const allKeys = [...new Set(val.flatMap(item => Object.keys(item)))];
        const colKeys = allKeys.filter(k => {
          if (k === '__v') return false;
          const sample = val[0][k];
          // Keep _id if it's an account number (non-ObjectId string or number)
          if (k === '_id' && !isObjectId(String(sample ?? ''))) return true;
          if (k === '_id' && isObjectId(String(sample ?? ''))) return false;
          return true;
        });

        const headerRow = worksheet.addRow(colKeys.map(k => label(k)));
        headerRow.eachCell(cell => {
          cell.fill = HEADER_FILL;
          cell.font = HEADER_STYLE;
        });

        val.forEach(item => {
          const dataRow = worksheet.addRow(colKeys.map(k => fmt(item[k])));
          dataRow.eachCell(cell => {
            if (typeof cell.value === 'number') {
              cell.numFmt = '#,##0.00';
              cell.alignment = { horizontal: 'right' };
            }
          });
        });

        worksheet.addRow([]);
      } else if (!Array.isArray(val) && typeof val !== 'object') {
        summaryRows.push([label(key), fmt(val)]);
      }
    }

    // Summary section at the bottom
    if (summaryRows.length > 0) {
      const sumHeaderRow = worksheet.addRow(['ملخص']);
      sumHeaderRow.getCell(1).font = { bold: true, size: 12 };
      applyStyle(sumHeaderRow, SECTION_FILL, true);
      worksheet.mergeCells(`A${sumHeaderRow.number}:D${sumHeaderRow.number}`);

      summaryRows.forEach(([k, v]) => {
        const r = worksheet.addRow([k, v]);
        r.getCell(1).font = { bold: true };
        if (typeof v === 'number') {
          r.getCell(2).numFmt = '#,##0.00';
          r.getCell(2).alignment = { horizontal: 'right' };
          applyStyle(r, TOTAL_FILL, false);
        }
      });
    }

    worksheet.columns = [
      { width: 35 }, { width: 20 }, { width: 20 }, { width: 20 }
    ];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${annexType}-${fiscalYear}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error in generic annex excel export:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Generic PDF export for any annex type using stored annex data
 */
export const exportAnnexGenericPDF = async (req, res) => {
  try {
    const { annexType, residenceId, year } = req.params;
    const fiscalYear = parseInt(year);

    const annexNumber = ANNEX_TYPE_MAP[annexType];
    if (!annexNumber) {
      return res.status(404).json({ error: `No export handler for type: ${annexType}` });
    }

    const annex = await Annex.findOne({ residence_id: residenceId, fiscalYear, annexNumber });
    if (!annex || annex.status === 'missing') {
      return res.status(404).json({ error: `Annex ${annexNumber} has not been generated yet` });
    }

    const residence = await Building.findById(residenceId);
    const buildingName = residence?.building_name || '';
    const buildingAddress = residence?.building_address || '';

    // ── Arabic field labels ──
    const FIELD_LABELS = {
      _id: 'رقم الحساب', total: 'المجموع', amount: 'المبلغ',
      accountNumber: 'رقم الحساب', accountName: 'اسم الحساب',
      totalReceipts: 'إجمالي التحصيلات', totalExpenses: 'إجمالي المصروفات',
      netBalance: 'الرصيد الصافي', balanceType: 'نوع الرصيد',
      receipts: 'التحصيلات (إيرادات)', expenses: 'المصروفات',
      revenues: 'الإيرادات', totalRevenues: 'إجمالي الإيرادات',
      totalExpensesForecasted: 'إجمالي المصروفات التقديرية',
      totalRevenuesForecasted: 'إجمالي الإيرادات التقديرية',
      forecastedResult: 'النتيجة التقديرية',
      revenuesForecasted: 'الإيرادات التقديرية',
      expensesForecasted: 'المصروفات التقديرية',
      netResult: 'النتيجة الصافية', resultType: 'نوع النتيجة',
      apartmentNumber: 'رقم الشقة', ownerName: 'اسم المالك',
      ownerEmail: 'البريد الإلكتروني', ownerPhone: 'الهاتف',
      share: 'الحصة', sharePercentage: 'نسبة الحصة (%)',
      contributionsDue: 'المساهمات المستحقة', paidAmount: 'المبلغ المدفوع',
      outstandingBalance: 'الرصيد المتبقي', overpayment: 'الدفع الزائد',
      totalContributions: 'إجمالي المساهمات', totalDue: 'الإجمالي المستحق',
      totalPaid: 'إجمالي المدفوع', totalOutstanding: 'إجمالي المتبقي',
      totalApartments: 'عدد الشقق', totalShares: 'إجمالي الحصص',
      collectionRate: 'نسبة التحصيل (%)', balance: 'الرصيد',
      debit: 'مدين', credit: 'دائن',
      principalAmount: 'مبلغ القرض', interestRate: 'معدل الفائدة',
      remainingBalance: 'الرصيد المتبقي', loanNumber: 'رقم القرض',
      lenderName: 'اسم المقرض', disbursementDate: 'تاريخ الصرف',
      termMonths: 'مدة القرض (أشهر)', status: 'الحالة',
      description: 'الوصف', approvedAt: 'تاريخ الاعتماد',
      specialist: 'المتخصص', fundName: 'اسم الصندوق',
      fundType: 'نوع الصندوق', currentBalance: 'الرصيد الحالي',
      targetAmount: 'المبلغ المستهدف', name: 'الاسم',
      category: 'الفئة', condition: 'الحالة',
      acquisitionDate: 'تاريخ الاقتناء', acquisitionCost: 'تكلفة الاقتناء',
      currentValue: 'القيمة الحالية', surplus: 'فائض', deficit: 'عجز',
    };

    const lbl = (key) => FIELD_LABELS[key] || key;
    const isObjectId = (val) => typeof val === 'string' && /^[a-f0-9]{24}$/.test(val);
    const fmtNum = (n) => (typeof n === 'number') ? n.toLocaleString('ar-MA', { minimumFractionDigits: 2 }) : '-';
    const fmtVal = (val) => {
      if (val === null || val === undefined) return '-';
      if (typeof val === 'number') return fmtNum(val);
      if (typeof val === 'boolean') return val ? 'نعم' : 'لا';
      if (val === 'surplus') return 'فائض';
      if (val === 'deficit') return 'عجز';
      return String(val);
    };

    const data = annex.data || {};
    let sectionsHtml = '';
    const summaryItems = [];

    for (const [key, val] of Object.entries(data)) {
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
        const allKeys = [...new Set(val.flatMap(item => Object.keys(item)))];
        const colKeys = allKeys.filter(k => {
          if (k === '__v') return false;
          if (k === '_id' && isObjectId(String(val[0][k] ?? ''))) return false;
          return true;
        });

        const headerCells = colKeys.map(k => `<th>${lbl(k)}</th>`).join('');
        const bodyRows = val.map(item => {
          const cells = colKeys.map(k => {
            const v = item[k];
            const isNum = typeof v === 'number';
            return `<td class="${isNum ? 'amount' : ''}">${fmtVal(v)}</td>`;
          }).join('');
          return `<tr>${cells}</tr>`;
        }).join('');

        sectionsHtml += `
          <div class="section">
            <h2 class="section-title">${lbl(key)}</h2>
            <table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>
          </div>`;
      } else if (!Array.isArray(val) && typeof val !== 'object') {
        const isNeg = typeof val === 'number' && val < 0;
        const isPos = typeof val === 'number' && val > 0;
        summaryItems.push({ label: lbl(key), value: fmtVal(val), cls: isNeg ? 'neg' : isPos ? 'pos' : '' });
      }
    }

    let summaryHtml = '';
    if (summaryItems.length > 0) {
      const cards = summaryItems.map(s => `
        <div class="card">
          <div class="card-label">${s.label}</div>
          <div class="card-value ${s.cls}">${s.value}</div>
        </div>`).join('');
      summaryHtml = `<div class="section"><h2 class="section-title">ملخص</h2><div class="cards">${cards}</div></div>`;
    }

    const dateStr = new Date().toLocaleDateString('ar-MA', { year: 'numeric', month: 'long', day: 'numeric' });

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;600;700&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Noto Naskh Arabic','Segoe UI',Arial,sans-serif;direction:rtl;color:#1a1a2e;background:#fff}
  .hdr{background:linear-gradient(135deg,#1a3a5c,#2d6a9f);color:#fff;padding:28px 36px}
  .hdr h1{font-size:22px;text-align:center;margin-bottom:4px}
  .hdr .badge{display:block;text-align:center;margin:6px auto}
  .hdr .badge span{background:rgba(255,255,255,.2);padding:3px 16px;border-radius:20px;font-size:11px}
  .hdr-meta{display:flex;justify-content:space-between;margin-top:12px;font-size:11px;opacity:.9}
  .body{padding:24px 36px}
  .section{margin-bottom:22px}
  .section-title{font-size:14px;font-weight:700;color:#1a3a5c;padding:8px 14px;border-right:4px solid #2d6a9f;background:#f0f5fa;border-radius:0 6px 6px 0;margin-bottom:10px}
  table{width:100%;border-collapse:collapse;font-size:11.5px}
  thead tr{background:#2d6a9f}
  th{color:#fff;font-weight:600;padding:9px 10px;text-align:center;font-size:11px}
  td{padding:7px 10px;border-bottom:1px solid #e8ecf1;text-align:center}
  td.amount{font-weight:600;text-align:left;direction:ltr}
  tbody tr:nth-child(even){background:#f8fafc}
  .cards{display:flex;flex-wrap:wrap;gap:10px}
  .card{flex:1 1 180px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;text-align:center}
  .card-label{font-size:10px;color:#64748b;margin-bottom:5px;font-weight:600}
  .card-value{font-size:17px;font-weight:700;color:#1a3a5c}
  .card-value.pos{color:#16a34a}
  .card-value.neg{color:#dc2626}
  .ftr{margin-top:28px;padding:14px 36px;text-align:center;font-size:9px;color:#94a3b8;border-top:1px solid #e2e8f0}
</style></head>
<body>
<div class="hdr">
  <h1>${annex.annexName || annexNumber}</h1>
  <div class="badge"><span>${annexNumber}</span></div>
  <div class="hdr-meta"><span>${buildingName} — ${buildingAddress}</span><span>السنة المالية: ${fiscalYear}</span></div>
</div>
<div class="body">
  ${summaryHtml}
  ${sectionsHtml}
</div>
<div class="ftr">
  <div>تم الإنشاء بتاريخ ${dateStr}</div>
  <div>وفقاً للقانون 18.00 والمرسوم 2-23-700 المتعلق بالقواعد المحاسبية الخاصة باتحاد الملاك المشتركين</div>
</div>
</body></html>`;

    const pdfBuffer = await pdfGeneratorHTML.htmlToPdf(html, false);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${annexType}-${fiscalYear}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error in generic annex PDF export:', error);
    res.status(500).json({ error: error.message });
  }
};
