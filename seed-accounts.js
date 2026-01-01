import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Account from './models/Account.js';

dotenv.config();

const seedAccounts = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Define the core accounts for co-owner contributions
    const accounts = [
      {
        number: '3421',
        name: 'Copropriétaires - Créances',
        type: 'asset',
        isSystem: true
      },
      {
        number: '7111',
        name: 'Appel de fonds (Contributions)',
        type: 'revenue',
        isSystem: true
      },
      {
        number: '5161',
        name: 'Caisse (Cash on Hand)',
        type: 'treasury',
        isSystem: true
      },
      {
        number: '5121',
        name: 'Banque (Bank Account)',
        type: 'treasury',
        isSystem: true
      },
      {
        number: '5122',
        name: 'Chèques à encaisser (Checks on Hand)',
        type: 'treasury',
        isSystem: true
      }
    ];

    // Use bulkWrite with upsert to avoid duplicates
    const bulkOps = accounts.map(account => ({
      updateOne: {
        filter: { number: account.number },
        update: { $setOnInsert: account },
        upsert: true
      }
    }));

    const result = await Account.bulkWrite(bulkOps);
    console.log(`✅ Seeded ${result.upsertedCount} accounts (${result.matchedCount} already existed)`);

    // Display all accounts
    const allAccounts = await Account.find({ isSystem: true }).sort({ number: 1 });
    console.log('\n📊 Chart of Accounts:');
    allAccounts.forEach(acc => {
      console.log(`  ${acc.number} - ${acc.name} (${acc.type})`);
    });

    await mongoose.connection.close();
    console.log('\n✅ Seed completed successfully');
  } catch (error) {
    console.error('❌ Error seeding accounts:', error);
    process.exit(1);
  }
};

seedAccounts();
