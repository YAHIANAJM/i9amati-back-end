import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Payment from '../models/Payment.js';
import JournalEntry from '../models/JournalEntry.js';
import JournalLine from '../models/JournalLine.js';
import GeneralLedger from '../models/GeneralLedger.js';
import Contribution from '../models/Contribution.js';

dotenv.config();

async function migratePaymentsToLedger() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Find all confirmed payments that don't have journal entries
    const payments = await Payment.find({
      status: { $in: ['confirmed', 'paid', 'paid_effectively'] }
    });

    console.log(`Found ${payments.length} confirmed payments to migrate`);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const payment of payments) {
      // Check if journal entry already exists
      const existingEntry = await JournalEntry.findOne({
        reference: `PAY-${payment._id}`
      });

      if (existingEntry) {
        skippedCount++;
        continue;
      }

      // Create journal entry
      const journalEntry = new JournalEntry({
        date: payment.createdAt,
        reference: `PAY-${payment._id}`,
        description: `Payment received - ${payment.method || 'Online'}`,
        residence_id: payment.residence_id || null
      });

      await journalEntry.save();

      // Create journal lines (double-entry)
      const lines = [];

      // Debit: Bank/Cash (Class 5)
      const debitAccount = payment.method === 'cash' ? '5161' : '5121'; // Cash or Bank
      const debitLine = new JournalLine({
        journalEntry: journalEntry._id,
        accountNumber: debitAccount,
        debit: payment.amount,
        credit: 0,
        description: `Payment received via ${payment.method || 'online'}`
      });
      await debitLine.save();
      lines.push(debitLine._id);

      // Create General Ledger entry for debit
      const debitLedgerEntry = new GeneralLedger({
        residence_id: payment.residence_id || null,
        accountNumber: debitAccount,
        journalEntry: journalEntry._id,
        date: payment.createdAt,
        reference: `PAY-${payment._id}`,
        description: `Payment received via ${payment.method || 'online'}`,
        debit: payment.amount,
        credit: 0,
        fiscalYear: new Date(payment.createdAt).getFullYear(),
        fiscalPeriod: new Date(payment.createdAt).getMonth() + 1
      });
      await debitLedgerEntry.save();

      // Credit: Owner Receivable (Account 3421)
      const creditLine = new JournalLine({
        journalEntry: journalEntry._id,
        accountNumber: '3421',
        debit: 0,
        credit: payment.amount,
        description: `Payment from owner - Contribution`
      });
      await creditLine.save();
      lines.push(creditLine._id);

      // Create General Ledger entry for credit
      const creditLedgerEntry = new GeneralLedger({
        residence_id: payment.residence_id || null,
        accountNumber: '3421',
        journalEntry: journalEntry._id,
        date: payment.createdAt,
        reference: `PAY-${payment._id}`,
        description: `Payment from owner - Contribution`,
        debit: 0,
        credit: payment.amount,
        fiscalYear: new Date(payment.createdAt).getFullYear(),
        fiscalPeriod: new Date(payment.createdAt).getMonth() + 1
      });
      await creditLedgerEntry.save();

      // Link lines to journal entry
      journalEntry.lines = lines;
      await journalEntry.save();

      migratedCount++;
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`   Migrated: ${migratedCount} payments`);
    console.log(`   Skipped (already migrated): ${skippedCount}`);
    console.log(`\nYou can now view:`);
    console.log(`   - Journal entries in the Journal tab`);
    console.log(`   - Account balances in General Ledger tab`);
    console.log(`   - Financial statements will now show data`);

    process.exit(0);
  } catch (error) {
    console.error('Error migrating payments:', error);
    process.exit(1);
  }
}

migratePaymentsToLedger();
