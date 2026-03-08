/**
 * Large Data Seed Script for i9amati
 * Seeds: 1 Building, 20 Apartments, 20 Owners, 1 Union Agent,
 *        Accounts (Moroccan chart), Journal Entries, General Ledger,
 *        Budget, AnnualRevenue, Contributions, Payments,
 *        Posts, Meetings, Alerts, Services, Visitors
 *
 * Run: node seed-large.js
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

// Models
import User from './models/User.js';
import Building from './models/Building.js';
import Apartment from './models/Apartment.js';
import Account from './models/Account.js';
import JournalEntry from './models/JournalEntry.js';
import JournalLine from './models/JournalLine.js';
import GeneralLedger from './models/GeneralLedger.js';
import Budget from './models/Budget.js';
import AnnualRevenue from './models/AnnualRevenue.js';
import Contribution from './models/Contribution.js';
import Payment from './models/Payment.js';
import Post from './models/Post.js';
import Meeting from './models/Meeting.js';
import Alert from './models/Alert.js';
import Service from './models/Service.js';
import Visitor from './models/Visitor.js';
import Annex from './models/Annex.js';

const FISCAL_YEAR = 2026;
const PREV_YEAR = 2025;

// ─── Fake Data Helpers ──────────────────────────────────────────────────────

const moroccanFirstNames = ['محمد', 'أحمد', 'يوسف', 'عمر', 'كريم', 'إبراهيم', 'عبدالله', 'علي', 'حسن', 'مصطفى', 'فاطمة', 'خديجة', 'مريم', 'زينب', 'سارة', 'هند', 'نادية', 'إيمان', 'سلمى', 'رجاء'];
const moroccanLastNames  = ['بنعلي', 'العمراني', 'الحسني', 'بوزيد', 'الإدريسي', 'التازي', 'القادري', 'بنسالم', 'الرحماني', 'مزيان', 'الناصر', 'بركات', 'الحمداوي', 'مسعود', 'الزيتون', 'بوشتى', 'بلحسن', 'السوسي', 'الياسمين', 'الشرقاوي'];

const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rndInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const rndFloat = (min, max, decimals = 2) => parseFloat((Math.random() * (max - min) + min).toFixed(decimals));

// ─── Moroccan Chart of Accounts ─────────────────────────────────────────────

const ACCOUNTS = [
  // Class 1 - Equity
  { number: '1111', name: 'رأس المال - حصص الملكية', type: 'equity',    class: 1, normalBalance: 'credit' },
  { number: '1191', name: 'احتياطيات قانونية',         type: 'equity',    class: 1, normalBalance: 'credit' },
  { number: '1192', name: 'احتياطيات صيانة',           type: 'equity',    class: 1, normalBalance: 'credit' },
  { number: '1195', name: 'فائض / عجز سنوات سابقة',   type: 'equity',    class: 1, normalBalance: 'credit' },
  // Class 2 - Fixed Assets
  { number: '2210', name: 'مبنى (الأجزاء المشتركة)',   type: 'asset',     class: 2, normalBalance: 'debit' },
  { number: '2350', name: 'معدات تقنية',               type: 'asset',     class: 2, normalBalance: 'debit' },
  { number: '2440', name: 'أثاث وتجهيزات',             type: 'asset',     class: 2, normalBalance: 'debit' },
  { number: '2839', name: 'إهتلاك المعدات',            type: 'asset',     class: 2, normalBalance: 'credit' },
  // Class 3 - Current Assets
  { number: '3421', name: 'ديون على المالكين',         type: 'asset',     class: 3, normalBalance: 'debit' },
  { number: '3491', name: 'ديون مشكوك في تحصيلها',    type: 'asset',     class: 3, normalBalance: 'debit' },
  // Class 4 - Liabilities
  { number: '4411', name: 'موردون - خدمات الصيانة',   type: 'liability', class: 4, normalBalance: 'credit' },
  { number: '4413', name: 'موردون - التنظيف',          type: 'liability', class: 4, normalBalance: 'credit' },
  { number: '4417', name: 'موردون - الكهرباء',         type: 'liability', class: 4, normalBalance: 'credit' },
  { number: '4491', name: 'دائنون متنوعون',            type: 'liability', class: 4, normalBalance: 'credit' },
  // Class 5 - Treasury
  { number: '5141', name: 'حساب بنكي جاري',           type: 'treasury', class: 5, normalBalance: 'debit' },
  { number: '5161', name: 'صندوق نقدي',               type: 'treasury', class: 5, normalBalance: 'debit' },
  // Class 6 - Expenses
  { number: '6111', name: 'مصاريف الصيانة الجارية',    type: 'expense',   class: 6, normalBalance: 'debit' },
  { number: '6112', name: 'مصاريف الإصلاحات الكبرى',  type: 'expense',   class: 6, normalBalance: 'debit' },
  { number: '6121', name: 'مصاريف نظافة المشتركات',   type: 'expense',   class: 6, normalBalance: 'debit' },
  { number: '6131', name: 'مصاريف الكهرباء المشتركة', type: 'expense',   class: 6, normalBalance: 'debit' },
  { number: '6141', name: 'مصاريف الحراسة والأمن',    type: 'expense',   class: 6, normalBalance: 'debit' },
  { number: '6191', name: 'مصاريف إدارية متنوعة',     type: 'expense',   class: 6, normalBalance: 'debit' },
  { number: '6661', name: 'مخصصات إهتلاك المعدات',    type: 'expense',   class: 6, normalBalance: 'debit' },
  // Class 7 - Revenues
  { number: '7111', name: 'مساهمات العمليات الجارية', type: 'revenue',   class: 7, normalBalance: 'credit' },
  { number: '7112', name: 'مساهمات أشغال خارج الميزانية', type: 'revenue', class: 7, normalBalance: 'credit' },
  { number: '7113', name: 'مساهمات صندوق الاحتياط',  type: 'revenue',   class: 7, normalBalance: 'credit' },
  { number: '7191', name: 'إيرادات متنوعة',           type: 'revenue',   class: 7, normalBalance: 'credit' },
];

// ─── Monthly expense templates ───────────────────────────────────────────────

const MONTHLY_EXPENSES = [
  { account: '6121', description: 'مصاريف نظافة المشتركات', minAmt: 800,  maxAmt: 1200 },
  { account: '6131', description: 'فاتورة كهرباء المشتركات', minAmt: 500,  maxAmt: 900  },
  { account: '6141', description: 'أتعاب الحراسة',           minAmt: 1500, maxAmt: 2000 },
  { account: '6111', description: 'صيانة جارية',             minAmt: 200,  maxAmt: 600  },
  { account: '6191', description: 'مصاريف إدارية',           minAmt: 100,  maxAmt: 300  },
];

// ─── Main Seed ───────────────────────────────────────────────────────────────

async function seed() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/iqamati';
  console.log('🔌 Connecting to MongoDB…');
  await mongoose.connect(uri);
  console.log('✅ Connected\n');

  // ── 1. Clear existing data ─────────────────────────────────────────────────
  console.log('🗑  Clearing old seed data…');
  await Promise.all([
    User.deleteMany({}),
    Building.deleteMany({}),
    Apartment.deleteMany({}),
    Account.deleteMany({}),
    JournalEntry.deleteMany({}),
    JournalLine.deleteMany({}),
    GeneralLedger.deleteMany({}),
    Budget.deleteMany({}),
    AnnualRevenue.deleteMany({}),
    Contribution.deleteMany({}),
    Payment.deleteMany({}),
    Post.deleteMany({}),
    Meeting.deleteMany({}),
    Alert.deleteMany({}),
    Service.deleteMany({}),
    Visitor.deleteMany({}),
    Annex.deleteMany({}),
  ]);
  console.log('✅ Cleared\n');

  // ── 2. Accounts ────────────────────────────────────────────────────────────
  console.log('📒 Seeding accounts…');
  const accounts = await Account.insertMany(ACCOUNTS.map(a => ({ ...a, isSystem: true, isActive: true })));
  const acctMap = {};
  accounts.forEach(a => { acctMap[a.number] = a; });
  console.log(`   ✓ ${accounts.length} accounts\n`);

  // ── 3. Union Agent user ────────────────────────────────────────────────────
  console.log('👤 Seeding union agent…');
  const agentPwd = await bcrypt.hash('agent123', 10);
  const agentUser = await User.create({
    name: 'وكيل الاتحاد محمد الأمين',
    email: 'agent@iqamati.ma',
    password_hash: agentPwd,
    nationalId: 'AB123456',
    role: 'union_agent',
    status: 'ACTIVE',
  });
  console.log(`   ✓ agent@iqamati.ma / agent123\n`);

  // ── 4. Building ────────────────────────────────────────────────────────────
  console.log('🏢 Seeding building…');
  const building = await Building.create({
    building_code: 'RES-CASABLANCA-01',
    building_name: 'عمارة النخيل - الحي المحمدي',
    building_address: 'شارع محمد الخامس، الحي المحمدي، الدار البيضاء',
    land_area_sqm: 1200,
    total_units: 20,
    number_of_blocks: 2,
    avg_units_per_block: 10,
    avg_floors_per_block: 5,
    original_title_number: 'TF/123456/C',
    propertyPlanNumber: 'PP-78901',
    has_garage: true,
    has_pool: false,
    hasElevator: true,
    has_elevator: true,
    has_shared_parts_with_other_buildings: false,
    description: 'عمارة حديثة مكونة من بلوكين تتضمن 20 شقة سكنية مع مرآب ومصعد',
    agent: agentUser._id,
    apartments: [],
  });
  console.log(`   ✓ Building: ${building.building_name}\n`);

  // ── 5. Apartments + Owner Users ────────────────────────────────────────────
  console.log('🏠 Seeding 20 apartments and owners…');
  const ownerUsers = [];
  const apartments = [];
  const sharePerUnit = 5; // 100% / 20 units

  for (let i = 1; i <= 20; i++) {
    const firstName = moroccanFirstNames[i - 1];
    const lastName  = moroccanLastNames[i - 1];
    const cin       = `MA${String(100000 + i).padStart(6, '0')}`;
    const email     = `owner${i}@iqamati.ma`;
    const ownerPwd  = await bcrypt.hash(cin, 10);

    const ownerUser = await User.create({
      name: `${firstName} ${lastName}`,
      email,
      password_hash: ownerPwd,
      nationalId: cin,
      role: 'property_owner',
      status: 'ACTIVE',
    });

    const floor = Math.ceil(i / 4);
    const apt = await Apartment.create({
      unit_code: `APT-${String(i).padStart(2, '0')}`,
      main_plot_number: `PP-78901-${String(i).padStart(3, '0')}`,
      division_number: i,
      area_sqm: rndInt(65, 130),
      floor,
      usage_type: 'residential',
      unit_type: i % 5 === 0 ? 'F4' : i % 3 === 0 ? 'F3' : 'F2',
      percentage_of_apartment: sharePerUnit,
      building: building._id,
      agent: agentUser._id,
      owners: [{
        firstName,
        lastName,
        nationalId: cin,
        email,
        phone: `+212 6${rndInt(10, 99)} ${rndInt(100, 999)} ${rndInt(100, 999)}`,
        isRepresentative: true,
      }],
      representativeUser: ownerUser._id,
    });

    ownerUser.apartments = [apt._id];
    await ownerUser.save();

    ownerUsers.push(ownerUser);
    apartments.push(apt);
  }

  // Link apartments to building
  building.apartments = apartments.map(a => a._id);
  await building.save();
  console.log(`   ✓ 20 apartments, 20 owner users\n`);

  // ── 6. Contributions ───────────────────────────────────────────────────────
  console.log('💰 Seeding contributions (2025 + 2026)…');
  const annualContrib = 1200; // MAD per unit per year
  const contributions = [];

  for (const [idx, apt] of apartments.entries()) {
    const owner = ownerUsers[idx];

    for (const yr of [PREV_YEAR, FISCAL_YEAR]) {
      // Monthly contribution (regular)
      const due = annualContrib;
      let paid = 0;
      let status = 'unpaid';

      if (yr === PREV_YEAR) {
        paid = due; status = 'paid';  // all paid in 2025
      } else {
        // 2026: some paid fully, some partial, some unpaid
        if (idx < 10)      { paid = due;     status = 'paid';    }
        else if (idx < 15) { paid = due / 2; status = 'partial'; }
        else               { paid = 0;       status = 'unpaid';  }
      }

      const contrib = await Contribution.create({
        owner: owner._id,
        unit:  apt._id,
        year:  yr,
        contributionType: 'regular',
        dueAmount: due,
        paidAmount: paid,
        remaining: due - paid,
        status,
      });
      contributions.push(contrib);
    }
  }
  console.log(`   ✓ ${contributions.length} contributions\n`);

  // ── 7. Journal Entries + General Ledger ───────────────────────────────────
  console.log('📓 Seeding journal entries & general ledger for 12 months…');

  let jeCount = 0;
  let glLineCount = 0;
  let totalRevenue7111 = 0;
  let totalExpenses = 0;

  const mockJournalEntry = async (date, description, lines, type = 'general') => {
    const je = await JournalEntry.create({ date, description, type, status: 'active', reference: `REF-${Date.now()}-${Math.random().toString(36).substr(2,4)}` });

    const createdLines = [];
    for (const line of lines) {
      const jl = await JournalLine.create({
        journalEntry: je._id,
        accountNumber: line.accountNumber,
        description: line.description || description,
        debit: line.debit || 0,
        credit: line.credit || 0,
      });
      createdLines.push(jl);
    }

    je.lines = createdLines.map(l => l._id);
    await je.save();

    // Write to General Ledger
    let runningBalance = 0;
    for (const line of lines) {
      runningBalance += (line.debit || 0) - (line.credit || 0);
      await GeneralLedger.create({
        residence_id: building._id,
        accountNumber: line.accountNumber,
        journalEntry: je._id,
        date,
        reference: je.reference,
        description: line.description || description,
        debit: line.debit || 0,
        credit: line.credit || 0,
        balance: runningBalance,
        fiscalYear: date.getFullYear(),
        fiscalPeriod: date.getMonth() + 1,
      });
      glLineCount++;
    }

    jeCount++;
    return je;
  };

  // For each month Jan-March 2026 (current year data so far)
  for (let month = 1; month <= 3; month++) {
    const monthDate = new Date(FISCAL_YEAR, month - 1, 5);

    // Revenue: owner contributions received (credit 7111, debit 5141)
    const monthlyRevTotal = apartments.length * 100; // 100 MAD/month per unit
    totalRevenue7111 += monthlyRevTotal;

    await mockJournalEntry(monthDate, `تحصيل مساهمات شهر ${month}/${FISCAL_YEAR}`, [
      { accountNumber: '5141', description: 'تحصيل مساهمات', debit: monthlyRevTotal, credit: 0 },
      { accountNumber: '7111', description: 'مساهمات العمليات الجارية', debit: 0, credit: monthlyRevTotal },
    ], 'bank');

    // Monthly expenses
    for (const exp of MONTHLY_EXPENSES) {
      const amt = rndInt(exp.minAmt, exp.maxAmt);
      totalExpenses += amt;

      await mockJournalEntry(new Date(FISCAL_YEAR, month - 1, rndInt(8, 25)),
        exp.description, [
          { accountNumber: exp.account, description: exp.description, debit: amt, credit: 0 },
          { accountNumber: '5141', description: `دفع ${exp.description}`, debit: 0, credit: amt },
        ]);
    }
  }

  // Previous year 2025 - 12 full months
  for (let month = 1; month <= 12; month++) {
    const monthDate2025 = new Date(PREV_YEAR, month - 1, 5);
    const revTotal2025 = apartments.length * 100;

    await mockJournalEntry(monthDate2025, `تحصيل مساهمات شهر ${month}/${PREV_YEAR}`, [
      { accountNumber: '5141', debit: revTotal2025, credit: 0 },
      { accountNumber: '7111', debit: 0, credit: revTotal2025 },
    ], 'bank');

    for (const exp of MONTHLY_EXPENSES) {
      const amt = rndInt(exp.minAmt, exp.maxAmt);
      await mockJournalEntry(new Date(PREV_YEAR, month - 1, rndInt(8, 25)),
        exp.description, [
          { accountNumber: exp.account, debit: amt, credit: 0 },
          { accountNumber: '5141', debit: 0, credit: amt },
        ]);
    }
  }

  // Opening balances - fixed assets
  const openingDate = new Date(FISCAL_YEAR, 0, 1);
  await mockJournalEntry(openingDate, 'رصيد افتتاحي - معدات مشتركة', [
    { accountNumber: '2350', debit: 45000, credit: 0 },
    { accountNumber: '2440', debit: 12000, credit: 0 },
    { accountNumber: '1111', debit: 0, credit: 57000 },
  ]);

  // Reserve fund contribution
  await mockJournalEntry(new Date(FISCAL_YEAR, 0, 15), 'تغذية صندوق الاحتياط', [
    { accountNumber: '5141', debit: 5000, credit: 0 },
    { accountNumber: '7113', debit: 0, credit: 5000 },
  ], 'bank');

  // One big repair expense
  await mockJournalEntry(new Date(FISCAL_YEAR, 1, 20), 'إصلاح المصعد - شركة تكنولفت', [
    { accountNumber: '6112', debit: 8500, credit: 0 },
    { accountNumber: '4411', debit: 0, credit: 8500 },
  ]);
  await mockJournalEntry(new Date(FISCAL_YEAR, 2, 1), 'تسوية فاتورة إصلاح المصعد', [
    { accountNumber: '4411', debit: 8500, credit: 0 },
    { accountNumber: '5141', debit: 0, credit: 8500 },
  ], 'bank');

  console.log(`   ✓ ${jeCount} journal entries, ${glLineCount} GL lines\n`);

  // ── 8. Budget ──────────────────────────────────────────────────────────────
  console.log('📊 Seeding budget (2025 actual, 2026 budget, 2027 next)…');

  const budgetAccounts = [
    { accountNumber: '7111', amounts: { actual: 24000, budget: 26000, next_budget: 28000 } },
    { accountNumber: '7113', amounts: { actual: 5000,  budget: 6000,  next_budget: 7000  } },
    { accountNumber: '6111', amounts: { actual: 4800,  budget: 5200,  next_budget: 5500  } },
    { accountNumber: '6121', amounts: { actual: 10800, budget: 11000, next_budget: 11500 } },
    { accountNumber: '6131', amounts: { actual: 7200,  budget: 7500,  next_budget: 8000  } },
    { accountNumber: '6141', amounts: { actual: 19800, budget: 21000, next_budget: 22000 } },
    { accountNumber: '6191', amounts: { actual: 2400,  budget: 2600,  next_budget: 2800  } },
    { accountNumber: '6112', amounts: { actual: 8500,  budget: 5000,  next_budget: 5000  } },
  ];

  const budgetDocs = [];
  for (const ba of budgetAccounts) {
    for (const [budgetType, amount] of Object.entries(ba.amounts)) {
      const yr = budgetType === 'actual' ? PREV_YEAR : budgetType === 'budget' ? FISCAL_YEAR : FISCAL_YEAR + 1;
      budgetDocs.push({
        residence_id: building._id,
        year: yr,
        budgetType,
        accountNumber: ba.accountNumber,
        amount,
        approvedAt: new Date(yr, 0, 15),
      });
    }
  }
  await Budget.insertMany(budgetDocs);
  console.log(`   ✓ ${budgetDocs.length} budget lines\n`);

  // ── 9. Annual Revenue ─────────────────────────────────────────────────────
  console.log('📈 Seeding annual revenue…');

  for (const yr of [PREV_YEAR, FISCAL_YEAR]) {
    const revAmt = yr === PREV_YEAR ? 24000 : totalRevenue7111 + 5000;
    const level = revAmt > 200000 ? 4 : revAmt > 50000 ? 3 : revAmt > 15000 ? 2 : 1;

    await AnnualRevenue.create({
      residence_id: building._id,
      fiscalYear: yr,
      revenues: {
        currentOperations: revAmt * 0.85,
        reserveFund: revAmt * 0.1,
        specialWorks: revAmt * 0.05,
        miscellaneous: 0,
      },
      totalRevenue: revAmt,
      accountingLevel: level,
      levelDescription: level === 1 ? 'المستوى الأول - أقل من 15,000 د.م' : level === 2 ? 'المستوى الثاني - بين 15,000 و50,000 د.م' : 'المستوى الثالث',
      requiredAnnexes: level >= 2 ? ['الملحق 3', 'الملحق 4', 'الملحق 10'] : ['الملحق 10'],
      calculatedAt: new Date(),
    });
  }
  console.log(`   ✓ 2 annual revenue records\n`);

  // ── 10. Payments ──────────────────────────────────────────────────────────
  console.log('💳 Seeding payments…');
  const paymentMethods = ['cash', 'cheque', 'bank', 'transfer'];
  const payments = [];

  for (let i = 0; i < 10; i++) {
    const owner = ownerUsers[i]; // first 10 owners paid
    payments.push({
      owner: owner._id,
      date: new Date(FISCAL_YEAR, rndInt(0, 2), rndInt(5, 28)),
      totalAmount: annualContrib,
      method: rnd(paymentMethods),
      payment_type: 'manual',
      reference: `CHQ-2026-${String(i + 1).padStart(3, '0')}`,
      status: 'confirmed',
    });
  }
  await Payment.insertMany(payments);
  console.log(`   ✓ ${payments.length} payments\n`);

  // ── 11. Posts / Community Feed ────────────────────────────────────────────
  console.log('📢 Seeding posts…');
  const postTemplates = [
    'يُعلم جميع المالكين بانعقاد الجمعية العامة يوم السبت 15 مارس 2026 الساعة 10 صباحاً في القاعة المشتركة.',
    'سيتوقف المصعد يومي الثلاثاء والأربعاء لأعمال الصيانة الدورية. نعتذر عن الإزعاج.',
    'نذكّر جميع المقيمين بضرورة احترام مواعيد وضع النفايات. الشكر لتعاونكم.',
    'تذكير: كل مالك له مكان محدد في المرآب. يُمنع احتلال أماكن الآخرين.',
    'تم دفع فاتورة الكهرباء لشهر فبراير 2026. المبلغ الإجمالي 750 درهم.',
    'نرحب بالعائلة الجديدة في الشقة رقم 15. أهلاً وسهلاً في عائلة النخيل!',
    'تم إصلاح تسرب المياه في الطابق الثالث بنجاح. نشكر شركة السباكة.',
    'تم تجديد عقد شركة الحراسة لسنة 2026 بنفس الشروط مع تحسين ساعات العمل.',
  ];

  const postDocs = postTemplates.map((content, i) => ({
    residence_id: building._id,
    user_id: i % 3 === 0 ? agentUser._id : ownerUsers[i % 5]._id,
    content,
    created_at: new Date(FISCAL_YEAR, rndInt(0, 2), rndInt(1, 28)),
  }));
  await Post.insertMany(postDocs);
  console.log(`   ✓ ${postDocs.length} posts\n`);

  // ── 12. Meetings ──────────────────────────────────────────────────────────
  console.log('📅 Seeding meetings…');
  const meetingDocs = [
    {
      residence_id: building._id,
      type: 'ORDINARY',
      agenda: 'المصادقة على محضر الاجتماع السابق | عرض التقرير المالي 2025 | المصادقة على ميزانية 2026 | نقط متفرقة',
      scheduled_at: new Date(2026, 2, 15, 10, 0),
      status: 'PLANNED',
    },
    {
      residence_id: building._id,
      type: 'EXTRAORDINARY',
      agenda: 'التداول في تمويل إصلاح الشبكة الكهربائية وإقرار التمويل الاستثنائي',
      scheduled_at: new Date(2026, 0, 20, 18, 0),
      status: 'COMPLETED',
    },
    {
      residence_id: building._id,
      type: 'ORDINARY',
      agenda: 'متابعة أشغال الصيانة وتقييم العروض المقدمة من شركات الصيانة',
      scheduled_at: new Date(2026, 3, 5, 16, 0),
      status: 'PLANNED',
    },
  ];
  await Meeting.insertMany(meetingDocs);
  console.log(`   ✓ ${meetingDocs.length} meetings\n`);

  // ── 13. Alerts ────────────────────────────────────────────────────────────
  console.log('🔔 Seeding alerts…');
  const alertDocs = [
    { residence_id: building._id, title: 'تأخر في دفع المساهمة', message: 'يرجى تسوية مساهمتك السنوية لسنة 2026', category: 'FINANCIAL',    priority: 'high',     status: 'NEW',      isRead: false },
    { residence_id: building._id, title: 'فاتورة الكهرباء مستحقة', message: 'فاتورة الكهرباء المشتركة لشهر مارس مستحقة الدفع', category: 'FINANCIAL', priority: 'medium', status: 'NEW',      isRead: false },
    { residence_id: building._id, title: 'عطل في المصعد', message: 'تم الإبلاغ عن عطل في المصعد الرئيسي - جارٍ التدخل', category: 'MAINTENANCE', priority: 'critical', status: 'NEW',      isRead: false },
    { residence_id: building._id, title: 'تجديد عقد النظافة', message: 'عقد شركة النظافة ينتهي نهاية الشهر القادم', category: 'MAINTENANCE', priority: 'low',    status: 'RESOLVED', isRead: true  },
    { residence_id: building._id, title: 'تذكير الجمعية العامة', message: 'الجمعية العامة السنوية بعد 7 أيام - 15 مارس 2026', category: 'SOCIAL',       priority: 'medium', status: 'NEW',      isRead: false },
  ];
  await Alert.insertMany(alertDocs);
  console.log(`   ✓ ${alertDocs.length} alerts\n`);

  // ── 14. Services ─────────────────────────────────────────────────────────
  console.log('🔧 Seeding services…');
  const serviceDocs = [
    {
      residence_id: building._id,
      title: 'عقد النظافة السنوي 2026',
      type: 'CLEANING',
      provider: { name: 'شركة ألفا للنظافة', phone: '+212 522 123 456', email: 'alfa@clean.ma' },
      contract: { startDate: new Date(2026, 0, 1), endDate: new Date(2026, 11, 31), value: 11000 },
      status: 'ACTIVE',
    },
    {
      residence_id: building._id,
      title: 'صيانة المصعد السنوية',
      type: 'MAINTENANCE',
      provider: { name: 'شركة تكنولفت للمصاعد', phone: '+212 522 987 654', email: 'technolift@ma.com' },
      contract: { startDate: new Date(2026, 0, 1), endDate: new Date(2026, 11, 31), value: 4800 },
      status: 'ACTIVE',
    },
    {
      residence_id: building._id,
      title: 'خدمة الحراسة والأمن 2026',
      type: 'SECURITY',
      provider: { name: 'شركة الأمان للحراسة', phone: '+212 522 456 789', email: 'security@aman.ma' },
      contract: { startDate: new Date(2026, 0, 1), endDate: new Date(2026, 11, 31), value: 21000 },
      status: 'ACTIVE',
    },
  ];
  await Service.insertMany(serviceDocs);
  console.log(`   ✓ ${serviceDocs.length} services\n`);

  // ── 15. Visitors ──────────────────────────────────────────────────────────
  console.log('👥 Seeding visitors…');
  const visitorDocs = [];
  for (let i = 0; i < 15; i++) {
    visitorDocs.push({
      residence_id: building._id,
      name: `${rnd(moroccanFirstNames)} ${rnd(moroccanLastNames)}`,
      id_number: `V${rndInt(100000, 999999)}`,
      purpose: rnd(['زيارة عائلية', 'صيانة', 'توصيل طرد', 'زيارة صديق']),
      check_in: new Date(FISCAL_YEAR, rndInt(0, 2), rndInt(1, 28), rndInt(9, 18), 0),
    });
  }
  await Visitor.insertMany(visitorDocs);
  console.log(`   ✓ ${visitorDocs.length} visitors\n`);

  // ── 16. Print Summary ─────────────────────────────────────────────────────
  console.log('═'.repeat(60));
  console.log('✅ SEED COMPLETE\n');
  console.log('🔑 LOGIN CREDENTIALS:');
  console.log('   Union Agent  →  agent@iqamati.ma   /  agent123');
  console.log('   Owners       →  owner1@iqamati.ma  ..  owner20@iqamati.ma');
  console.log('   Owner pwd    →  their CIN (MA100001 .. MA100020)\n');
  console.log(`🏢 Building:   ${building.building_name}`);
  console.log(`🏠 Units:      20 apartments`);
  console.log(`💰 Fiscal yr:  2026 (3 months data) + 2025 (12 months data)`);
  console.log(`📒 GL Lines:   ${glLineCount}`);
  console.log(`📊 Budgets:    ${budgetDocs.length} lines (3 years)`);
  console.log('═'.repeat(60));

  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  mongoose.disconnect();
  process.exit(1);
});
