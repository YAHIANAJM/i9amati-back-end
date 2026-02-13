import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import User from '../models/User.js';
import Apartment from '../models/Apartment.js';
import Contribution from '../models/Contribution.js';
import GeneralLedger from '../models/GeneralLedger.js';
import Budget from '../models/Budget.js';
import Account from '../models/Account.js';

async function checkData() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check apartments
    const apartments = await Apartment.find().limit(3).populate('representativeUser').populate('owners');
    console.log('📦 Apartments count:', await Apartment.countDocuments());
    if (apartments[0]) {
      console.log('Sample apartment:', {
        _id: apartments[0]._id,
        unit_code: apartments[0].unit_code,
        hasRepresentativeUser: !!apartments[0].representativeUser,
        representativeUser: apartments[0].representativeUser ? {
          _id: apartments[0].representativeUser._id,
          firstName: apartments[0].representativeUser.firstName,
          lastName: apartments[0].representativeUser.lastName
        } : null,
        ownersCount: apartments[0].owners?.length || 0
      });
    }

    // Check contributions
    const contributions = await Contribution.countDocuments();
    console.log('\n💰 Contributions count:', contributions);
    if (contributions > 0) {
      const sample = await Contribution.findOne().populate('owner').populate('unit');
      console.log('Sample contribution:', {
        year: sample.year,
        dueAmount: sample.dueAmount,
        owner: sample.owner?.firstName + ' ' + sample.owner?.lastName,
        unit: sample.unit?.unit_code
      });
    }

    // Check general ledger
    const ledgers = await GeneralLedger.countDocuments();
    console.log('\n📚 General Ledgers count:', ledgers);
    if (ledgers > 0) {
      const sample = await GeneralLedger.findOne();
      console.log('Sample ledger:', {
        accountNumber: sample.accountNumber,
        accountName: sample.accountName,
        balance: sample.balance
      });
    }

    // Check budgets
    const budgets = await Budget.countDocuments();
    console.log('\n📊 Budgets count:', budgets);
    if (budgets > 0) {
      const sample = await Budget.findOne();
      console.log('Sample budget:', {
        year: sample.year,
        budgetType: sample.budgetType,
        accountNumber: sample.accountNumber,
        amount: sample.amount
      });
    }

    // Check accounts (Chart of Accounts)
    const accountsCount = await Account.countDocuments();
    console.log('\n📋 Accounts count:', accountsCount);
    if (accountsCount > 0) {
      const sample = await Account.findOne();
      console.log('Sample account:', {
        number: sample.number,
        name: sample.name,
        type: sample.type
      });

      // Check for mismatch between GL and Accounts
      const glAccounts = await GeneralLedger.distinct('accountNumber');
      console.log('Unique GL account numbers:', glAccounts.slice(0, 5), '...');
      
      const accountNumbers = await Account.distinct('number');
      console.log('Account numbers in Chart:', accountNumbers.slice(0, 5), '...');
    }

    await mongoose.disconnect();
    console.log('\n✅ Done');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkData();
