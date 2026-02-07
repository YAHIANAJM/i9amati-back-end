import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Contribution from '../models/Contribution.js';
import JournalEntry from '../models/JournalEntry.js';
import JournalLine from '../models/JournalLine.js';
import GeneralLedger from '../models/GeneralLedger.js';
import Loan from '../models/Loan.js';
import User from '../models/User.js';
import Apartment from '../models/Apartment.js';

async function seedAccountingData() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const currentYear = 2026;

    // ============================================
    // 1. CREATE OWNER CONTRIBUTIONS (المساهمات)
    // ============================================
    console.log('\n📊 Creating Owner Contributions...');
    
    // Get all apartments
    const apartments = await Apartment.find().limit(10);

    if (apartments.length > 0) {
      let createdCount = 0;
      
      for (const apartment of apartments) {
        // Skip if apartment has no owners
        if (!apartment.owners || apartment.owners.length === 0) continue;
        
        // Get the representative user ID (required)
        if (!apartment.representativeUser) continue;
        
        // Create contributions for multiple years
        const years = [currentYear - 1, currentYear];
        
        for (const year of years) {
          // Annual contribution amount based on year
          const baseAmount = year === currentYear ? 2000 : 1800;
          let paidAmount, status;
          
          if (year === currentYear - 1) {
            // Previous year - fully paid
            paidAmount = baseAmount;
            status = 'paid';
          } else {
            // Current year - mix of statuses
            const rand = Math.random();
            if (rand < 0.4) {
              // 40% fully paid
              paidAmount = baseAmount;
              status = 'paid';
            } else if (rand < 0.7) {
              // 30% partially paid
              paidAmount = baseAmount * 0.6;
              status = 'partial';
            } else {
              // 30% unpaid
              paidAmount = 0;
              status = 'unpaid';
            }
          }
          
          const remaining = baseAmount - paidAmount;
          
          const contribution = await Contribution.findOneAndUpdate(
            {
              owner: apartment.representativeUser,
              unit: apartment._id,
              year: year
            },
            {
              dueAmount: baseAmount,
              paidAmount: paidAmount,
              remaining: remaining,
              status: status,
              generalAssemblyRef: `AG-${year}-001`
            },
            { upsert: true, new: true }
          );
          createdCount++;
        }
      }
      
      console.log(`✅ Created ${createdCount} owner contributions for ${apartments.length} apartments`);
    } else {
      console.log('⚠️  No apartments found - skipping contributions');
    }

    // ============================================
    // 2. CREATE RESERVE FUND ENTRIES (الاحتياطيات)
    // ============================================
    console.log('\n💰 Creating Reserve Fund Entries...');

    // Create journal entry for reserve allocation
    const reserveEntry = new JournalEntry({
      date: new Date(currentYear, 0, 15),
      reference: 'RES-2026-001',
      description: 'Annual reserve fund allocation / تخصيص الاحتياطيات السنوية',
      type: 'general'
    });
    await reserveEntry.save();

    // Debit: Transfer from surplus (Account 113 - Net Income)
    const debitLineReserve = new JournalLine({
      journalEntry: reserveEntry._id,
      accountNumber: '113',
      debit: 15000,
      credit: 0,
      description: 'Transfer to reserves from net income'
    });
    await debitLineReserve.save();

    // Credit 1: General Reserve Surplus (Account 111)
    const creditLine111 = new JournalLine({
      journalEntry: reserveEntry._id,
      accountNumber: '111',
      debit: 0,
      credit: 5000,
      description: 'General reserve surplus / فائض الإحتياطي'
    });
    await creditLine111.save();

    // Credit 2: Unexpected Expenses Reserve (Account 1111)
    const creditLine1111 = new JournalLine({
      journalEntry: reserveEntry._id,
      accountNumber: '1111',
      debit: 0,
      credit: 6000,
      description: 'Reserve for unexpected expenses / احتياطيات لتغطية النفقات غير المتوقعة'
    });
    await creditLine1111.save();

    // Credit 3: Long-term Work Reserve (Account 1112)
    const creditLine1112 = new JournalLine({
      journalEntry: reserveEntry._id,
      accountNumber: '1112',
      debit: 0,
      credit: 4000,
      description: 'Reserve for long-term work / احتياطيات لتغطية الأشغال طويلة المدة'
    });
    await creditLine1112.save();

    // Create General Ledger entries for reserves
    const reserveLedgerEntries = [
      {
        accountNumber: '113',
        debit: 15000,
        credit: 0,
        description: 'Transfer to reserves from net income'
      },
      {
        accountNumber: '111',
        debit: 0,
        credit: 5000,
        description: 'General reserve surplus / فائض الإحتياطي'
      },
      {
        accountNumber: '1111',
        debit: 0,
        credit: 6000,
        description: 'Reserve for unexpected expenses'
      },
      {
        accountNumber: '1112',
        debit: 0,
        credit: 4000,
        description: 'Reserve for long-term work'
      }
    ];

    for (const entry of reserveLedgerEntries) {
      const ledger = new GeneralLedger({
        residence_id: null,
        accountNumber: entry.accountNumber,
        journalEntry: reserveEntry._id,
        date: reserveEntry.date,
        reference: reserveEntry.reference,
        description: entry.description,
        debit: entry.debit,
        credit: entry.credit,
        fiscalYear: currentYear,
        fiscalPeriod: 1
      });
      await ledger.save();
    }

    console.log('✅ Created reserve fund allocations:');
    console.log('   - Account 111 (General): 5,000 MAD');
    console.log('   - Account 1111 (Unexpected): 6,000 MAD');
    console.log('   - Account 1112 (Long-term): 4,000 MAD');

    // ============================================
    // 3. CREATE LOAN ENTRIES (القروض)
    // ============================================
    console.log('\n🏦 Creating Loan Entries...');

    // Clear existing loans
    await Loan.deleteMany({});
    console.log('Cleared existing loans');

    // Loan 1: Building renovation loan
    const loan1 = new Loan({
      residence_id: null,
      loanNumber: 'LOAN-2025-001',
      lender: 'Banque Populaire',
      principalAmount: 100000,
      interestRate: 4.5,
      termMonths: 60, // 5 years
      disbursementDate: new Date(2025, 0, 15),
      firstPaymentDate: new Date(2025, 1, 15),
      paymentFrequency: 'monthly',
      purpose: 'Building facade renovation / تجديد واجهة المبنى',
      status: 'active'
    });
    loan1.generateAmortizationSchedule();
    await loan1.save();

    // Record some payments on the loan (first 3 months)
    await loan1.recordPayment(1);
    await loan1.recordPayment(2);
    await loan1.recordPayment(3);
    await loan1.save();

    // Loan 2: Elevator installation loan
    const loan2 = new Loan({
      residence_id: null,
      loanNumber: 'LOAN-2024-002',
      lender: 'Attijariwafa Bank',
      principalAmount: 200000,
      interestRate: 5.0,
      termMonths: 84, // 7 years
      disbursementDate: new Date(2024, 6, 1),
      firstPaymentDate: new Date(2024, 7, 1),
      paymentFrequency: 'monthly',
      purpose: 'Elevator installation / تركيب المصعد',
      status: 'active'
    });
    loan2.generateAmortizationSchedule();
    await loan2.save();

    // Record multiple payments (18 months)
    for (let i = 1; i <= 18; i++) {
      await loan2.recordPayment(i);
    }
    await loan2.save();

    // Loan 3: Water system upgrade (paid off)
    const loan3 = new Loan({
      residence_id: null,
      loanNumber: 'LOAN-2022-003',
      lender: 'Crédit Agricole',
      principalAmount: 50000,
      interestRate: 4.0,
      termMonths: 36, // 3 years
      disbursementDate: new Date(2022, 3, 1),
      firstPaymentDate: new Date(2022, 4, 1),
      paymentFrequency: 'monthly',
      purpose: 'Water system upgrade / تحديث نظام المياه',
      status: 'paid_off'
    });
    loan3.generateAmortizationSchedule();
    
    // Pay off all 36 installments
    for (let i = 1; i <= 36; i++) {
      await loan3.recordPayment(i);
    }
    await loan3.save();

    console.log('✅ Created 3 loans:');
    console.log('   1. Building renovation: 100,000 MAD @ 4.5% (60 months) - Active');
    console.log('   2. Elevator installation: 200,000 MAD @ 5.0% (84 months) - Active');
    console.log('   3. Water system upgrade: 50,000 MAD @ 4.0% (36 months) - Paid Off');

    console.log('\n✅ All accounting data seeded successfully!');
    console.log('\nSummary:');
    console.log(`- Owner Contributions: Created for multiple owners/quarters`);
    console.log(`- Reserve Funds: 15,000 MAD allocated across 3 reserve accounts`);
    console.log(`- Loans: 3 loans created (2 active, 1 paid off)`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding accounting data:', error);
    process.exit(1);
  }
}

seedAccountingData();
