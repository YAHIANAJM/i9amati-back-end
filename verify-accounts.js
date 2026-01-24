// Script to verify and create required accounting accounts
import mongoose from 'mongoose';
import Account from './models/Account.js';
import dotenv from 'dotenv';

dotenv.config();

async function verifyAccounts() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const requiredAccounts = [
      {
        code: '5161',
        name: 'Bank/Cash Account',
        name_ar: 'حساب البنك/النقدية',
        type: 'asset',
        balance: 0
      },
      {
        code: '3421',
        name: 'Accounts Receivable',
        name_ar: 'حسابات القبض',
        type: 'asset',
        balance: 0
      },
      {
        code: '7111',
        name: 'Service Revenue',
        name_ar: 'إيرادات الخدمات',
        type: 'revenue',
        balance: 0
      }
    ];

    console.log('\n📊 Checking required accounts...\n');

    for (const accountData of requiredAccounts) {
      const existing = await Account.findOne({ code: accountData.code });
      
      if (existing) {
        console.log(`✅ Account ${accountData.code} (${accountData.name}) already exists`);
      } else {
        const newAccount = new Account(accountData);
        await newAccount.save();
        console.log(`✨ Created account ${accountData.code} (${accountData.name})`);
      }
    }

    console.log('\n✅ All required accounts are ready!');
    console.log('\nAccount Summary:');
    
    for (const accountData of requiredAccounts) {
      const account = await Account.findOne({ code: accountData.code });
      console.log(`  ${account.code} - ${account.name} (${account.name_ar})`);
      console.log(`    Type: ${account.type}, Balance: ${account.balance || 0}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

verifyAccounts();
