import htmlPdf from 'html-pdf-node';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPLATES_DIR = path.join(__dirname, '../templates');

/**
 * Render HTML template with data using simple placeholder replacement
 */
const renderTemplate = (templateName, data) => {
  const templatePath = path.join(TEMPLATES_DIR, `${templateName}.html`);
  let html = fs.readFileSync(templatePath, 'utf8');
  
  // Simple template rendering (Mustache-like syntax)
  // Replace {{variable}} with data values
  Object.keys(data).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    html = html.replace(regex, data[key] || '');
  });
  
  // Handle sections/arrays
  if (data.sections) {
    let sectionsHtml = '';
    data.sections.forEach(section => {
      let sectionTemplate = `
        <div class="section">
          <h2 class="section-title">${section.sectionTitle}</h2>
      `;
      
      if (section.hasSummary && section.summaryItems) {
        sectionTemplate += '<div class="summary-box">';
        section.summaryItems.forEach(item => {
          sectionTemplate += `
            <div class="summary-item">
              <span class="label">${item.label}</span>
              <span class="value ${item.class || ''}">${item.value} د.م</span>
            </div>
          `;
        });
        sectionTemplate += '</div>';
      }
      
      if (section.hasTable && section.headers && section.rows) {
        sectionTemplate += '<table><thead><tr>';
        section.headers.forEach(header => {
          sectionTemplate += `<th>${header}</th>`;
        });
        sectionTemplate += '</tr></thead><tbody>';
        
        section.rows.forEach(row => {
          sectionTemplate += `<tr ${row.isTotal ? 'class="total-row"' : ''}>`;
          row.cells.forEach((cell, idx) => {
            const isAmount = section.amountColumns && section.amountColumns.includes(idx);
            sectionTemplate += `<td ${isAmount ? 'class="amount"' : ''}>${cell}</td>`;
          });
          sectionTemplate += '</tr>';
        });
        
        sectionTemplate += '</tbody></table>';
      }
      
      sectionTemplate += '</div>';
      sectionsHtml += sectionTemplate;
    });
    
    html = html.replace('{{#sections}}', sectionsHtml);
    html = html.replace('{{/sections}}', '');
  }
  
  return html;
};

/**
 * Generate PDF from HTML template
 */
export const generatePDFFromTemplate = async (templateName, data) => {
  try {
    const html = renderTemplate(templateName, data);
    
    const options = {
      format: 'A4',
      printBackground: true,
      margin: { top: '2cm', right: '2cm', bottom: '2cm', left: '2cm' }
    };
    
    const file = { content: html };
    const pdfBuffer = await htmlPdf.generatePdf(file, options);
    
    return pdfBuffer;
  } catch (error) {
    console.error('Error generating PDF from template:', error);
    throw error;
  }
};

/**
 * Generate PDF from raw HTML string
 */
export const htmlToPdf = async (html, landscape = false) => {
  const options = {
    format: 'A4',
    landscape,
    printBackground: true,
    margin: { top: '1.5cm', right: '1.5cm', bottom: '1.5cm', left: '1.5cm' }
  };
  const file = { content: html };
  return await htmlPdf.generatePdf(file, options);
};

/**
 * Generate Management Account PDF using HTML template
 */
export const generateManagementAccountPDFHTML = async (managementData, residenceInfo, fiscalYear) => {
  const currentDate = new Date().toLocaleDateString('ar-MA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const data = {
    title: 'حساب التسيير المحاسبي - الملحق 4',
    subtitle: `السنة المالية ${fiscalYear}`,
    buildingName: residenceInfo.name || 'العقار',
    date: currentDate,
    sections: []
  };

  // Revenues section
  const revenuesSection = {
    sectionTitle: 'العائدات (REVENUES)',
    hasTable: true,
    headers: ['رمز الحساب', 'اسم الحساب', 'المبلغ'],
    amountColumns: [2],
    rows: []
  };

  let totalRevenues = 0;
  managementData.revenues.forEach(rev => {
    revenuesSection.rows.push({
      cells: [
        rev.accountCode,
        rev.accountName || rev.description || '',
        rev.amount.toLocaleString('ar-MA', { minimumFractionDigits: 2 })
      ]
    });
    totalRevenues += rev.amount;
  });

  revenuesSection.rows.push({
    isTotal: true,
    cells: ['', 'المجموع الإجمالي', totalRevenues.toLocaleString('ar-MA', { minimumFractionDigits: 2 })]
  });

  data.sections.push(revenuesSection);

  // Expenses section
  const expensesSection = {
    sectionTitle: 'المصروفات (EXPENSES)',
    hasTable: true,
    headers: ['رمز الحساب', 'اسم الحساب', 'المبلغ'],
    amountColumns: [2],
    rows: []
  };

  let totalExpenses = 0;
  managementData.expenses.forEach(exp => {
    expensesSection.rows.push({
      cells: [
        exp.accountCode,
        exp.accountName || exp.description || '',
        exp.amount.toLocaleString('ar-MA', { minimumFractionDigits: 2 })
      ]
    });
    totalExpenses += exp.amount;
  });

  expensesSection.rows.push({
    isTotal: true,
    cells: ['', 'المجموع الإجمالي', totalExpenses.toLocaleString('ar-MA', { minimumFractionDigits: 2 })]
  });

  data.sections.push(expensesSection);

  // Summary section
  const netResult = totalRevenues - totalExpenses;
  const summarySection = {
    sectionTitle: 'ملخص (SUMMARY)',
    hasSummary: true,
    summaryItems: [
      { label: 'إجمالي العائدات', value: totalRevenues.toLocaleString('ar-MA', { minimumFractionDigits: 2 }), class: 'positive' },
      { label: 'إجمالي المصروفات', value: totalExpenses.toLocaleString('ar-MA', { minimumFractionDigits: 2 }), class: 'negative' },
      { 
        label: netResult >= 0 ? 'الفائض (Surplus)' : 'العجز (Deficit)', 
        value: Math.abs(netResult).toLocaleString('ar-MA', { minimumFractionDigits: 2 }), 
        class: netResult >= 0 ? 'positive' : 'negative' 
      }
    ]
  };

  data.sections.push(summarySection);

  return await generatePDFFromTemplate('management-report', data);
};

/**
 * Generate Balance Sheet PDF using HTML template
 */
export const generateBalanceSheetPDFHTML = async (balanceSheetData, residenceInfo, fiscalYear) => {
  const currentDate = new Date().toLocaleDateString('ar-MA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Build current assets HTML
  let currentAssetsHTML = '';
  balanceSheetData.assets.currentAssets.forEach(asset => {
    const amount = Math.abs(asset.balance).toLocaleString('ar-MA', { minimumFractionDigits: 2 });
    currentAssetsHTML += `
      <div class="line-item">
        <span class="item-label">${asset.accountName || asset.accountCode}</span>
        <span class="item-value">${amount} د.م</span>
      </div>
    `;
  });

  // Build fixed assets HTML
  let fixedAssetsHTML = '';
  balanceSheetData.assets.fixedAssets.forEach(asset => {
    const amount = Math.abs(asset.balance).toLocaleString('ar-MA', { minimumFractionDigits: 2 });
    fixedAssetsHTML += `
      <div class="line-item">
        <span class="item-label">${asset.accountName || asset.accountCode}</span>
        <span class="item-value">${amount} د.م</span>
      </div>
    `;
  });

  // Build current liabilities HTML
  let currentLiabilitiesHTML = '';
  balanceSheetData.liabilities.currentLiabilities.forEach(liability => {
    const amount = Math.abs(liability.balance).toLocaleString('ar-MA', { minimumFractionDigits: 2 });
    currentLiabilitiesHTML += `
      <div class="line-item">
        <span class="item-label">${liability.accountName || liability.accountCode}</span>
        <span class="item-value">${amount} د.م</span>
      </div>
    `;
  });

  // Build equity HTML
  let equityHTML = '';
  balanceSheetData.liabilities.equity.forEach(eq => {
    const amount = Math.abs(eq.balance).toLocaleString('ar-MA', { minimumFractionDigits: 2 });
    equityHTML += `
      <div class="line-item">
        <span class="item-label">${eq.accountName || eq.accountCode}</span>
        <span class="item-value">${amount} د.م</span>
      </div>
    `;
  });

  const totalAssets = balanceSheetData.assets.total.toLocaleString('ar-MA', { minimumFractionDigits: 2 });
  const totalLiabilities = balanceSheetData.liabilities.total.toLocaleString('ar-MA', { minimumFractionDigits: 2 });
  const isBalanced = Math.abs(balanceSheetData.assets.total - balanceSheetData.liabilities.total) < 0.01;
  const difference = Math.abs(balanceSheetData.assets.total - balanceSheetData.liabilities.total).toLocaleString('ar-MA', { minimumFractionDigits: 2 });

  const data = {
    buildingName: residenceInfo.name || 'العقار',
    fiscalYear: fiscalYear,
    date: currentDate,
    currentAssets: currentAssetsHTML,
    fixedAssets: fixedAssetsHTML,
    currentLiabilities: currentLiabilitiesHTML,
    equity: equityHTML,
    totalAssets: totalAssets,
    totalLiabilities: totalLiabilities,
    isBalanced: isBalanced,
    difference: difference
  };

  let html = fs.readFileSync(path.join(TEMPLATES_DIR, 'balance-sheet.html'), 'utf8');
  
  // Replace placeholders
  Object.keys(data).forEach(key => {
    if (key !== 'isBalanced') {
      const regex = new RegExp(`{{${key}}}`, 'g');
      html = html.replace(regex, data[key] || '');
    }
  });
  
  // Handle conditional rendering
  if (data.isBalanced) {
    html = html.replace(/{{#isBalanced}}([\s\S]*?){{\/isBalanced}}/g, '$1');
    html = html.replace(/{{[^}]*isBalanced}}[\s\S]*?{{\/[^}]*isBalanced}}/g, '');
  } else {
    html = html.replace(/{{#isBalanced}}[\s\S]*?{{\/isBalanced}}/g, '');
    html = html.replace(/{{[^}]*isBalanced}}([\s\S]*?){{\/[^}]*isBalanced}}/g, '$1');
  }

  const options = {
    format: 'A4',
    printBackground: true,
    margin: { top: '2cm', right: '2cm', bottom: '2cm', left: '2cm' }
  };
  
  const file = { content: html };
  const pdfBuffer = await htmlPdf.generatePdf(file, options);
  
  return pdfBuffer;
};

/**
 * Shared helper to load and fill a template
 */
const fillTemplate = (templateName, data, pdfOptions = {}) => {
  let html = fs.readFileSync(path.join(TEMPLATES_DIR, `${templateName}.html`), 'utf8');
  Object.keys(data).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    html = html.replace(regex, data[key] !== undefined ? data[key] : '');
  });
  return html;
};


const formatAmount = (n) => (n || 0).toLocaleString('ar-MA', { minimumFractionDigits: 2 });

const getDate = () => new Date().toLocaleDateString('ar-MA', { year: 'numeric', month: 'long', day: 'numeric' });

/**
 * Generate Management Account (Annex 4) PDF - HTML based
 */
export const generateManagementAccountHTML = async (data, residenceInfo, fiscalYear) => {
  let revenueRows = '';
  let totalRevenues = 0;
  (data.revenues || []).forEach(r => {
    totalRevenues += r.amount || 0;
    revenueRows += `<tr><td>${r.accountCode || ''}</td><td>${r.accountName || r.description || ''}</td><td class="amount">${formatAmount(r.amount)} د.م</td></tr>`;
  });

  let expenseRows = '';
  let totalExpenses = 0;
  (data.expenses || []).forEach(e => {
    totalExpenses += e.amount || 0;
    expenseRows += `<tr><td>${e.accountCode || ''}</td><td>${e.accountName || e.description || ''}</td><td class="amount">${formatAmount(e.amount)} د.م</td></tr>`;
  });

  const net = totalRevenues - totalExpenses;
  const html = fillTemplate('management-account', {
    buildingName: residenceInfo.name || '',
    fiscalYear,
    date: getDate(),
    revenueRows,
    expenseRows,
    totalRevenues: formatAmount(totalRevenues),
    totalExpenses: formatAmount(totalExpenses),
    netLabel: net >= 0 ? 'الفائض (Surplus)' : 'العجز (Deficit)',
    netValue: formatAmount(Math.abs(net)),
    netClass: net >= 0 ? 'positive' : 'negative'
  });
  return htmlToPdf(html);
};

/**
 * Generate Balance Sheet (Annex 3) PDF - HTML based
 */
export const generateBalanceSheetHTML = async (data, residenceInfo, fiscalYear) => {
  const makeRows = (items) => items.map(i =>
    `<div class="line-item"><span class="item-label">${i.accountName || i.accountCode}</span><span class="item-value">${formatAmount(Math.abs(i.balance))} د.م</span></div>`
  ).join('');

  const totalAssets = data.assets?.total || 0;
  const totalLiabilities = data.liabilities?.total || 0;
  const diff = Math.abs(totalAssets - totalLiabilities);
  const isBalanced = diff < 0.01;

  let html = fillTemplate('balance-sheet', {
    buildingName: residenceInfo.name || '',
    fiscalYear,
    date: getDate(),
    currentAssets: makeRows(data.assets?.currentAssets || []),
    fixedAssets: makeRows(data.assets?.fixedAssets || []),
    currentLiabilities: makeRows(data.liabilities?.currentLiabilities || []),
    equity: makeRows(data.liabilities?.equity || []),
    totalAssets: formatAmount(totalAssets),
    totalLiabilities: formatAmount(totalLiabilities),
    difference: formatAmount(diff)
  });

  if (isBalanced) {
    html = html.replace(/{{#isBalanced}}([\s\S]*?){{\/isBalanced}}/g, '$1');
    html = html.replace(/\{\{\^isBalanced\}\}[\s\S]*?\{\{\/isBalanced\}\}/g, '');
  } else {
    html = html.replace(/{{#isBalanced}}[\s\S]*?{{\/isBalanced}}/g, '');
    html = html.replace(/\{\{\^isBalanced\}\}([\s\S]*?)\{\{\/isBalanced\}\}/g, '$1');
  }

  return htmlToPdf(html);
};

/**
 * Generate Owner Contributions (Annex 10) PDF - HTML based
 */
export const generateOwnerContributionsHTML = async (data, residenceInfo, fiscalYear) => {
  let rows = '';
  let totalRequired = 0, totalPaid = 0, totalBalance = 0;

  (data.owners || []).forEach(o => {
    const required = o.requiredAmount || o.annualContribution || 0;
    const paid = o.paidAmount || 0;
    const balance = required - paid;
    totalRequired += required;
    totalPaid += paid;
    totalBalance += balance;
    const statusAr = balance <= 0 ? 'مدفوع' : 'متأخر';
    const statusClass = balance <= 0 ? 'paid' : 'unpaid';
    rows += `
      <tr>
        <td>${o.unitNumber || o.apartmentNumber || ''}</td>
        <td>${o.ownerName || ''}</td>
        <td>${(o.sharePercentage || 0).toFixed(2)}%</td>
        <td class="amount">${formatAmount(required)} د.م</td>
        <td class="amount">${formatAmount(paid)} د.م</td>
        <td class="amount ${balance > 0 ? 'unpaid' : 'paid'}">${formatAmount(Math.max(0, balance))} د.م</td>
        <td class="${statusClass}">${statusAr}</td>
      </tr>`;
  });

  const html = fillTemplate('owner-contributions', {
    buildingName: residenceInfo.name || '',
    fiscalYear,
    date: getDate(),
    contributionRows: rows,
    totalRequired: formatAmount(totalRequired),
    totalPaid: formatAmount(totalPaid),
    totalBalance: formatAmount(Math.max(0, totalBalance))
  });
  return htmlToPdf(html, true); // landscape
};

/**
 * Generate General Assembly Report PDF - HTML based
 */
export const generateGeneralAssemblyReportHTML = async (data, residenceInfo, fiscalYear) => {
  const annexesList = (data.requiredAnnexes || [])
    .map(a => `<div class="annex-item">✓ ${a}</div>`)
    .join('') || '<div class="annex-item">لا توجد ملاحق محددة</div>';

  const html = fillTemplate('general-assembly-report', {
    buildingName: residenceInfo.name || '',
    buildingAddress: residenceInfo.address || '',
    fiscalYear,
    date: getDate(),
    totalRevenue: formatAmount(data.totalRevenue || 0),
    accountingLevel: data.accountingLevel || 1,
    levelDescription: data.levelDescription || '',
    annexesList
  });
  return htmlToPdf(html);
};

/**
 * Generate Legal/Court Report PDF - HTML based
 */
export const generateLegalReportHTML = async (data, residenceInfo, fiscalYear) => {
  const annexesList = (data.requiredAnnexes || [])
    .map(a => `<div class="annex-line">✓ ${a}</div>`)
    .join('') || '<div class="annex-line">لا توجد ملاحق محددة</div>';

  const html = fillTemplate('legal-report', {
    buildingName: residenceInfo.name || '',
    buildingAddress: residenceInfo.address || '',
    registrationNumber: residenceInfo.registrationNumber || 'غير محدد',
    fiscalYear,
    date: getDate(),
    totalRevenue: formatAmount(data.totalRevenue || 0),
    accountingLevel: data.accountingLevel || 1,
    levelDescription: data.levelDescription || '',
    annexesList
  });
  return htmlToPdf(html);
};

