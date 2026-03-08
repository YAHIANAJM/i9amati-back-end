import ExcelJS from 'exceljs';

/**
 * Generate Excel export for General Ledger
 */
export const generateGeneralLedgerExcel = async (ledgerData, residenceInfo, fiscalYear) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('General Ledger');

  // Set RTL for Arabic support
  worksheet.views = [{ rightToLeft: true }];

  // Header
  worksheet.mergeCells('A1:F1');
  worksheet.getCell('A1').value = `دفتر الأستاذ العام - ${residenceInfo.name}`;
  worksheet.getCell('A1').font = { bold: true, size: 16 };
  worksheet.getCell('A1').alignment = { horizontal: 'center' };

  worksheet.mergeCells('A2:F2');
  worksheet.getCell('A2').value = `السنة المالية: ${fiscalYear}`;
  worksheet.getCell('A2').alignment = { horizontal: 'center' };

  // Column headers
  worksheet.addRow([]);
  const headerRow = worksheet.addRow(['التاريخ', 'رقم الحساب', 'اسم الحساب', 'الوصف', 'مدين', 'دائن']);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center' };
  });

  // Data rows
  ledgerData.forEach((entry) => {
    worksheet.addRow([
      new Date(entry.date).toLocaleDateString('ar'),
      entry.accountCode,
      entry.accountName,
      entry.description,
      entry.debit || '',
      entry.credit || '',
    ]);
  });

  // Totals
  const totalDebit = ledgerData.reduce((sum, e) => sum + (e.debit || 0), 0);
  const totalCredit = ledgerData.reduce((sum, e) => sum + (e.credit || 0), 0);
  
  const totalRow = worksheet.addRow(['', '', '', 'المجموع', totalDebit, totalCredit]);
  totalRow.font = { bold: true };
  totalRow.getCell(5).numFmt = '#,##0.00';
  totalRow.getCell(6).numFmt = '#,##0.00';

  // Column widths
  worksheet.getColumn(1).width = 15;
  worksheet.getColumn(2).width = 15;
  worksheet.getColumn(3).width = 30;
  worksheet.getColumn(4).width = 40;
  worksheet.getColumn(5).width = 15;
  worksheet.getColumn(6).width = 15;

  return workbook;
};

/**
 * Generate Excel export for Balance Sheet (Annex 3)
 */
export const generateBalanceSheetExcel = async (balanceSheetData, residenceInfo, fiscalYear) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Balance Sheet');

  worksheet.views = [{ rightToLeft: true }];

  // Header
  worksheet.mergeCells('A1:D1');
  worksheet.getCell('A1').value = `الحصيلة - الملحق 3`;
  worksheet.getCell('A1').font = { bold: true, size: 16 };
  worksheet.getCell('A1').alignment = { horizontal: 'center' };

  worksheet.mergeCells('A2:D2');
  worksheet.getCell('A2').value = `${residenceInfo.name} - السنة المالية ${fiscalYear}`;
  worksheet.getCell('A2').alignment = { horizontal: 'center' };

  worksheet.addRow([]);

  // Assets section
  worksheet.addRow(['الأصول (ASSETS)', '', '', '']);
  worksheet.getCell('A4').font = { bold: true, size: 14 };
  worksheet.getCell('A4').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD9E1F2' },
  };

  worksheet.addRow(['رقم الحساب', 'اسم الحساب', 'المبلغ (MAD)', '']);
  worksheet.getRow(5).font = { bold: true };

  // Current Assets
  worksheet.addRow(['', 'الأصول المتداولة', '', '']);
  balanceSheetData.assets.currentAssets.forEach(asset => {
    worksheet.addRow([asset.accountCode, asset.accountName, Math.abs(asset.balance), '']);
  });

  // Fixed Assets
  worksheet.addRow(['', 'الأصول الثابتة', '', '']);
  balanceSheetData.assets.fixedAssets.forEach(asset => {
    worksheet.addRow([asset.accountCode, asset.accountName, Math.abs(asset.balance), '']);
  });

  const assetTotalRow = worksheet.addRow(['', 'مجموع الأصول', balanceSheetData.assets.total, '']);
  assetTotalRow.font = { bold: true };
  assetTotalRow.getCell(3).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFEB9C' },
  };

  worksheet.addRow([]);

  // Liabilities section
  const liabilitiesRow = worksheet.addRow(['الخصوم (LIABILITIES)', '', '', '']);
  liabilitiesRow.font = { bold: true, size: 14 };
  liabilitiesRow.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD9E1F2' },
  };

  worksheet.addRow(['رقم الحساب', 'اسم الحساب', 'المبلغ (MAD)', '']);

  // Current Liabilities
  worksheet.addRow(['', 'الخصوم المتداولة', '', '']);
  balanceSheetData.liabilities.currentLiabilities.forEach(liability => {
    worksheet.addRow([liability.accountCode, liability.accountName, Math.abs(liability.balance), '']);
  });

  // Long-term Liabilities
  worksheet.addRow(['', 'الخصوم طويلة الأجل', '', '']);
  balanceSheetData.liabilities.longTermLiabilities.forEach(liability => {
    worksheet.addRow([liability.accountCode, liability.accountName, Math.abs(liability.balance), '']);
  });

  const liabilityTotalRow = worksheet.addRow(['', 'مجموع الخصوم', balanceSheetData.liabilities.total, '']);
  liabilityTotalRow.font = { bold: true };
  liabilityTotalRow.getCell(3).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFEB9C' },
  };

  worksheet.addRow([]);

  // Equity section
  const equityRow = worksheet.addRow(['الأموال الخاصة (EQUITY)', '', '', '']);
  equityRow.font = { bold: true, size: 14 };
  equityRow.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD9E1F2' },
  };

  balanceSheetData.equity.reserves.forEach(reserve => {
    worksheet.addRow([reserve.accountCode, reserve.accountName, Math.abs(reserve.balance), '']);
  });

  const equityTotalRow = worksheet.addRow(['', 'مجموع الأموال الخاصة', balanceSheetData.equity.total, '']);
  equityTotalRow.font = { bold: true };
  equityTotalRow.getCell(3).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFEB9C' },
  };

  // Column formatting
  worksheet.getColumn(1).width = 15;
  worksheet.getColumn(2).width = 40;
  worksheet.getColumn(3).width = 20;
  worksheet.getColumn(3).numFmt = '#,##0.00';

  return workbook;
};

/**
 * Generate Excel export for Management Account (Annex 4)
 */
export const generateManagementAccountExcel = async (managementData, residenceInfo, fiscalYear) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Management Account');

  worksheet.views = [{ rightToLeft: true }];

  // Header
  worksheet.mergeCells('A1:D1');
  worksheet.getCell('A1').value = `حساب التسيير العام - الملحق 4`;
  worksheet.getCell('A1').font = { bold: true, size: 16 };
  worksheet.getCell('A1').alignment = { horizontal: 'center' };

  worksheet.mergeCells('A2:D2');
  worksheet.getCell('A2').value = `${residenceInfo.name} - السنة المالية ${fiscalYear}`;
  worksheet.getCell('A2').alignment = { horizontal: 'center' };

  worksheet.addRow([]);

  // Revenues section
  const revenueHeader = worksheet.addRow(['العائدات (REVENUES)', '', 'المبلغ (MAD)', '']);
  revenueHeader.font = { bold: true, size: 14 };
  revenueHeader.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFC6E0B4' },
  };

  managementData.revenues.forEach(rev => {
    worksheet.addRow([rev._id, rev.accountName, rev.total, '']);
  });

  const revenueTotalRow = worksheet.addRow(['', 'مجموع العائدات', managementData.totalRevenues, '']);
  revenueTotalRow.font = { bold: true };
  revenueTotalRow.getCell(3).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFEB9C' },
  };

  worksheet.addRow([]);

  // Expenses section
  const expenseHeader = worksheet.addRow(['المصروفات (EXPENSES)', '', 'المبلغ (MAD)', '']);
  expenseHeader.font = { bold: true, size: 14 };
  expenseHeader.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF4B084' },
  };

  managementData.expenses.forEach(exp => {
    worksheet.addRow([exp._id, exp.accountName, exp.total, '']);
  });

  const expenseTotalRow = worksheet.addRow(['', 'مجموع المصروفات', managementData.totalExpenses, '']);
  expenseTotalRow.font = { bold: true };
  expenseTotalRow.getCell(3).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFEB9C' },
  };

  worksheet.addRow([]);

  // Net result
  const resultRow = worksheet.addRow([
    '',
    managementData.resultType === 'surplus' ? 'الفائض (SURPLUS)' : 'العجز (DEFICIT)',
    managementData.netResult,
    '',
  ]);
  resultRow.font = { bold: true, size: 14 };
  resultRow.getCell(3).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: managementData.resultType === 'surplus' ? 'FF92D050' : 'FFFF6961' },
  };

  // Column formatting
  worksheet.getColumn(1).width = 15;
  worksheet.getColumn(2).width = 40;
  worksheet.getColumn(3).width = 20;
  worksheet.getColumn(3).numFmt = '#,##0.00';

  return workbook;
};

/**
 * Generate Excel export for Owner Contributions (Annex 10)
 */
export const generateOwnerContributionsExcel = async (contributionsData, residenceInfo, fiscalYear) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Owner Contributions');

  worksheet.views = [{ rightToLeft: true }];

  // Header
  worksheet.mergeCells('A1:H1');
  worksheet.getCell('A1').value = `تتبع إسهامات المالكين - الملحق 10`;
  worksheet.getCell('A1').font = { bold: true, size: 16 };
  worksheet.getCell('A1').alignment = { horizontal: 'center' };

  worksheet.mergeCells('A2:H2');
  worksheet.getCell('A2').value = `${residenceInfo.name} - السنة المالية ${fiscalYear}`;
  worksheet.getCell('A2').alignment = { horizontal: 'center' };

  worksheet.addRow([]);

  // Summary
  worksheet.addRow(['', 'ملخص التحصيل', '', '', '', '', '', '']);
  worksheet.addRow(['', 'عدد الشقق:', contributionsData.summary.totalApartments, '', '', '', '', '']);
  worksheet.addRow(['', 'المبلغ المستحق:', contributionsData.summary.totalDue, 'MAD', '', '', '', '']);
  worksheet.addRow(['', 'المبلغ المحصل:', contributionsData.summary.totalCollected, 'MAD', '', '', '', '']);
  worksheet.addRow(['', 'المبلغ المتبقي:', contributionsData.summary.totalOutstanding, 'MAD', '', '', '', '']);
  worksheet.addRow(['', 'نسبة التحصيل:', `${contributionsData.summary.collectionRate.toFixed(2)}%`, '', '', '', '', '']);

  worksheet.addRow([]);

  // Column headers
  const headerRow = worksheet.addRow([
    'رقم الشقة',
    'اسم المالك',
    'البريد الإلكتروني',
    'الحصة',
    'المستحق',
    'المدفوع',
    'الرصيد',
    'الحالة',
  ]);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center' };
  });

  // Data rows
  contributionsData.contributions.forEach((contrib) => {
    const row = worksheet.addRow([
      contrib.apartmentNumber,
      contrib.ownerName,
      contrib.ownerEmail,
      contrib.share,
      contrib.totalDue,
      contrib.totalPaid,
      contrib.balance,
      contrib.status === 'paid' ? 'مدفوع' : contrib.status === 'pending' ? 'معلق' : 'زيادة',
    ]);

    // Color code status
    const statusCell = row.getCell(8);
    if (contrib.status === 'paid') {
      statusCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF92D050' },
      };
    } else if (contrib.status === 'pending') {
      statusCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFEB9C' },
      };
    }
  });

  // Column widths
  worksheet.getColumn(1).width = 12;
  worksheet.getColumn(2).width = 25;
  worksheet.getColumn(3).width = 30;
  worksheet.getColumn(4).width = 10;
  worksheet.getColumn(5).width = 15;
  worksheet.getColumn(6).width = 15;
  worksheet.getColumn(7).width = 15;
  worksheet.getColumn(8).width = 12;

  // Number formatting
  [5, 6, 7].forEach(col => {
    worksheet.getColumn(col).numFmt = '#,##0.00';
  });

  return workbook;
};

/**
 * Generate comprehensive Excel workbook with multiple sheets
 */
export const generateCompleteAccountingExcel = async (allData, residenceInfo, fiscalYear) => {
  const workbook = new ExcelJS.Workbook();

  // Sheet 1: Dashboard Summary
  const dashboardSheet = workbook.addWorksheet('لوحة التحكم');
  dashboardSheet.views = [{ rightToLeft: true }];
  
  dashboardSheet.mergeCells('A1:D1');
  dashboardSheet.getCell('A1').value = `التقرير المحاسبي الشامل - ${residenceInfo.name}`;
  dashboardSheet.getCell('A1').font = { bold: true, size: 18 };
  dashboardSheet.getCell('A1').alignment = { horizontal: 'center' };

  dashboardSheet.addRow([]);
  dashboardSheet.addRow(['السنة المالية:', fiscalYear]);
  dashboardSheet.addRow(['المستوى المحاسبي:', `المستوى ${allData.accountingLevel}`]);
  dashboardSheet.addRow(['مجموع العائدات:', allData.totalRevenue, 'MAD']);
  dashboardSheet.addRow(['تاريخ الإنشاء:', new Date().toLocaleDateString('ar')]);

  return workbook;
};
