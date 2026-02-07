import mongoose from 'mongoose';
import Account from '../models/Account.js';
import dotenv from 'dotenv';

dotenv.config();

// Moroccan Co-Ownership Accounting Plan based on Official Decree
const moroccanAccounts = [
  // CLASS 1: EQUITY & RESERVES
  { number: '111', name: 'فائض الإحتياطي / Réserve excédentaire / Reserve Surplus', type: 'equity', class: 1 },
  { number: '1111', name: 'احتياطيات لتغطية النفقات غير المتوقعة', type: 'equity', class: 1 },
  { number: '1112', name: 'احتياطيات لتغطية النفقات المقررة على المدى الطويل', type: 'equity', class: 1 },
  { number: '119', name: 'نتيجة / Résultat / Result', type: 'equity', class: 1 },
  { number: '1191', name: 'فائض / Excédent / Surplus', type: 'equity', class: 1 },
  { number: '1199', name: 'عجز / Déficit / Deficit', type: 'equity', class: 1 },
  { number: '131', name: 'إعانات محصل عليها / Subventions obtenues', type: 'equity', class: 1 },
  { number: '1311', name: 'إعانات محصل عليها / Subventions obtained', type: 'equity', class: 1 },
  { number: '151', name: 'مؤن / Provisions', type: 'equity', class: 1 },
  { number: '1511', name: 'مؤن عن أشغال مقررة / Provisions pour travaux votés', type: 'equity', class: 1 },

  // CLASS 3: ASSETS - RECEIVABLES
  { number: '341', name: 'موردون - مدينون / Fournisseurs - Débiteurs', type: 'asset', class: 3 },
  { number: '3411', name: 'تسبيقات وتوريدات مدفوعة للموردين', type: 'asset', class: 3 },
  { number: '3412', name: 'تسبيقات للموردين عن الأشغال', type: 'asset', class: 3 },
  { number: '3413', name: 'تسبيقات عن خدمات', type: 'asset', class: 3 },
  
  { number: '342', name: 'جماعة الملاك المشتركين / Collectivité des copropriétaires', type: 'asset', class: 3 },
  { number: '3421', name: 'مالك مشترك فرد - ميزانية تقديرية', type: 'asset', class: 3 },
  { number: '3422', name: 'مالك مشترك - أشغال وعمليات غير جارية', type: 'asset', class: 3 },
  { number: '3423', name: 'مالك مشترك - دائنيات مشكوك فيها', type: 'asset', class: 3 },
  { number: '3424', name: 'مالك مشترك - دائنيات مشكوك فيها', type: 'asset', class: 3 },
  
  { number: '345', name: 'الدولة وهيئات أخرى / État et organismes', type: 'asset', class: 3 },
  { number: '348', name: 'مدينون مختلفون / Autres débiteurs', type: 'asset', class: 3 },
  { number: '349', name: 'حسابات التسوية بالأصول / Comptes de régularisation-Actif', type: 'asset', class: 3 },
  { number: '3491', name: 'تكاليف معاينة مسبقا', type: 'asset', class: 3 },
  { number: '3497', name: 'حسابات انتقالية أو للانتظار - مدينة', type: 'asset', class: 3 },
  
  { number: '394', name: 'مؤن عن التدني / Provisions pour dépréciation', type: 'asset', class: 3 },
  { number: '3942', name: 'مؤن عن تدني حسابات الملاك المشتركين', type: 'asset', class: 3 },
  { number: '3943', name: 'مؤن عن تدني حسابات لغير الملاك المشتركين', type: 'asset', class: 3 },

  // CLASS 4: LIABILITIES
  { number: '441', name: 'موردون / Fournisseurs', type: 'liability', class: 4 },
  { number: '4411', name: 'موردون / Suppliers', type: 'liability', class: 4 },
  { number: '4412', name: 'موردون، فواتير لم تصل بعد', type: 'liability', class: 4 },
  { number: '4413', name: 'موردون آخرون', type: 'liability', class: 4 },
  
  { number: '442', name: 'جماعة الملاك المشتركين / Collectivité copropriétaires', type: 'liability', class: 4 },
  { number: '4421', name: 'مالك مشترك - تسبيقات', type: 'liability', class: 4 },
  
  { number: '443', name: 'مستخدمون / Personnel', type: 'liability', class: 4 },
  { number: '444', name: 'ضمان اجتماعي وهيئات اجتماعية أخرى', type: 'liability', class: 4 },
  { number: '445', name: 'الدولة / État', type: 'liability', class: 4 },
  { number: '448', name: 'دائنون آخرون / Autres créanciers', type: 'liability', class: 4 },
  { number: '4481', name: 'دائنون آخرون', type: 'liability', class: 4 },
  
  { number: '449', name: 'حسابات التسوية بالخصوم / Comptes régul.-Passif', type: 'liability', class: 4 },
  { number: '4491', name: 'حساب في انتظار - دائن', type: 'liability', class: 4 },
  { number: '4492', name: 'حساب عائدات محصلة مسبقا', type: 'liability', class: 4 },
  { number: '4497', name: 'حسابات انتقالية أو للانتظار - دائنة', type: 'liability', class: 4 },

  // CLASS 5: TREASURY
  { number: '511', name: 'الأموال الموظفة / Fonds placés', type: 'treasury', class: 5 },
  { number: '512', name: 'البنوك أو أموال متيسرة لدى البنك / Banques', type: 'treasury', class: 5 },
  { number: '5121', name: 'بنك / Bank', type: 'treasury', class: 5 },
  { number: '516', name: 'صندوق / Caisse', type: 'treasury', class: 5 },
  { number: '5161', name: 'صندوق / Cash', type: 'treasury', class: 5 },
  { number: '554', name: 'بنك (رصيد دائن) / Bank (overdraft)', type: 'treasury', class: 5 },

  // CLASS 6: EXPENSES
  { number: '611', name: 'شراء مواد ولوازم / Achats matériaux et fournitures', type: 'expense', class: 6 },
  { number: '6111', name: 'ماء (العداد العام)', type: 'expense', class: 6 },
  { number: '6112', name: 'كهرباء', type: 'expense', class: 6 },
  { number: '6113', name: 'تدفئة وطاقة ومحروقات', type: 'expense', class: 6 },
  { number: '6114', name: 'مشتريات مواد الصيانة وتجهيزات بسيطة', type: 'expense', class: 6 },
  { number: '6115', name: 'معدات بسيطة', type: 'expense', class: 6 },
  { number: '6116', name: 'لوازم', type: 'expense', class: 6 },
  
  { number: '612', name: 'تكاليف أخرى / Autres charges', type: 'expense', class: 6 },
  { number: '6121', name: 'تسديد الاقتراضات', type: 'expense', class: 6 },
  
  { number: '613', name: 'شراء الخدمات الخارجية / Services extérieurs', type: 'expense', class: 6 },
  { number: '6131', name: 'تنظيف المحلات', type: 'expense', class: 6 },
  { number: '6132', name: 'كراءات عقارية', type: 'expense', class: 6 },
  { number: '6133', name: 'كراءات لمنقولات', type: 'expense', class: 6 },
  { number: '6134', name: 'عقود الصيانة', type: 'expense', class: 6 },
  { number: '6135', name: 'صيانة وإصلاحات بسيطة', type: 'expense', class: 6 },
  { number: '6136', name: 'أقساط التأمينات', type: 'expense', class: 6 },
  { number: '6137', name: 'جازيات وكيل اتحاد الملاك مقابل تسيير الملكية المشتركة', type: 'expense', class: 6 },
  { number: '6138', name: 'جازيات أخرى', type: 'expense', class: 6 },
  { number: '6140', name: 'المصاريف البريدية', type: 'expense', class: 6 },
  { number: '6141', name: 'مصاريف بنكية', type: 'expense', class: 6 },
  { number: '6142', name: 'أتعاب', type: 'expense', class: 6 },
  { number: '6143', name: 'تكاليف أخرى', type: 'expense', class: 6 },
  { number: '6144', name: 'تكاليف الفوائد البنكية', type: 'expense', class: 6 },
  
  { number: '616', name: 'ضرائب ورسوم ومدفوعات مماثلة', type: 'expense', class: 6 },
  { number: '6161', name: 'ضرائب ورسوم', type: 'expense', class: 6 },
  
  { number: '617', name: 'مصاريف المستخدمين / Frais de personnel', type: 'expense', class: 6 },
  { number: '6171', name: 'أجور', type: 'expense', class: 6 },
  { number: '6172', name: 'تكاليف اجتماعية وهيئات اجتماعية', type: 'expense', class: 6 },
  { number: '6173', name: 'مصاريف أخرى (طب الشغل، تعاضديات، إلخ...)', type: 'expense', class: 6 },
  { number: '6174', name: 'تأمين عن حوادث الشغل', type: 'expense', class: 6 },
  
  { number: '651', name: 'تكاليف الأشغال والعمليات الغير جارية', type: 'expense', class: 6 },
  { number: '6511', name: 'أشغال مقررة من طرف الجمع العام', type: 'expense', class: 6 },
  { number: '6512', name: 'أشغال مستعجلة', type: 'expense', class: 6 },
  { number: '6513', name: 'دراسات تقنية وتشخيص واستشارة', type: 'expense', class: 6 },
  { number: '6514', name: 'خسائر عن دائنيات غير قابلة للاستيفاء', type: 'expense', class: 6 },
  { number: '6515', name: 'تكاليف غير جارية', type: 'expense', class: 6 },
  
  { number: '691', name: 'مخصصات لتدني دائنيات مشكوك فيها', type: 'expense', class: 6 },

  // CLASS 7: REVENUES
  { number: '711', name: 'طلب الأموال / Appel de fonds', type: 'revenue', class: 7 },
  { number: '7111', name: 'مؤن عن عمليات جارية', type: 'revenue', class: 7 },
  { number: '7112', name: 'مؤن عن أشغال', type: 'revenue', class: 7 },
  { number: '7113', name: 'تسبيقات', type: 'revenue', class: 7 },
  
  { number: '712', name: 'عائدات أخرى / Autres produits', type: 'revenue', class: 7 },
  { number: '7121', name: 'اقتراضات', type: 'revenue', class: 7 },
  { number: '7122', name: 'إعانات', type: 'revenue', class: 7 },
  { number: '7123', name: 'تعويضات التأمين', type: 'revenue', class: 7 },
  { number: '7124', name: 'عائدات أخرى', type: 'revenue', class: 7 },
  { number: '7125', name: 'عائدات مالية', type: 'revenue', class: 7 },
  
  { number: '751', name: 'عائدات الأشغال والعمليات الغير جارية', type: 'revenue', class: 7 },
  { number: '7511', name: 'عائدات أخرى مقررة من طرف الجمع العام', type: 'revenue', class: 7 },
  { number: '7512', name: 'عائدات التفويتات المقبوضة', type: 'revenue', class: 7 },
  { number: '7513', name: 'هبات مقبوضة', type: 'revenue', class: 7 },
  { number: '7514', name: 'مداخيل عن دائنيات مصفاة', type: 'revenue', class: 7 },
  { number: '7515', name: 'عائدات أخرى غير جارية', type: 'revenue', class: 7 },
  
  { number: '791', name: 'استردادات من مؤن عن تدني دائنيات مشكوك فيها', type: 'revenue', class: 7 },
  { number: '793', name: 'استردادات من مؤن', type: 'revenue', class: 7 },
];

async function seedAccounts() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Clear existing accounts
    await Account.deleteMany({});
    console.log('Cleared existing accounts');

    // Insert Moroccan accounts
    const inserted = await Account.insertMany(moroccanAccounts.map(acc => ({
      ...acc,
      isSystem: true
    })));

    console.log(`✅ Seeded ${inserted.length} Moroccan accounting accounts`);
    console.log('Account classes:');
    console.log('  - Class 1: Equity & Reserves');
    console.log('  - Class 3: Assets & Receivables');
    console.log('  - Class 4: Liabilities');
    console.log('  - Class 5: Treasury');
    console.log('  - Class 6: Expenses');
    console.log('  - Class 7: Revenues');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding accounts:', error);
    process.exit(1);
  }
}

seedAccounts();
