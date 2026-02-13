import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Budget from '../models/Budget.js';

async function seedBudgets() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const currentYear = 2026;
    const years = [currentYear - 1, currentYear, currentYear + 1];
    
    // Budget entries for typical Moroccan co-ownership
    const budgetEntries = [
      // Revenue accounts (7xxx)
      { accountNumber: '7111', description: 'Owner Contributions Revenue', amount: 150000 },
      { accountNumber: '7200', description: 'Service Charges Revenue', amount: 25000 },
      
      // Expense accounts (6xxx)
      { accountNumber: '6100', description: 'Maintenance Expenses', amount: 80000 },
      { accountNumber: '6200', description: 'Utilities (Water, Electricity)', amount: 35000 },
      { accountNumber: '6300', description: 'Security and Surveillance', amount: 30000 },
      { accountNumber: '6400', description: 'Insurance Premiums', amount: 15000 },
      { accountNumber: '6500', description: 'Administrative Expenses', amount: 10000 },
      { accountNumber: '6600', description: 'Minor Repairs', amount: 5000 }
    ];

    let totalCreated = 0;

    for (const year of years) {
      for (const entry of budgetEntries) {
        // Check if budget entry already exists
        const existing = await Budget.findOne({ 
          year, 
          budgetType: 'budget',
          accountNumber: entry.accountNumber 
        });
        
        if (existing) {
          continue;
        }

        // Create individual budget document for each account
        const budget = new Budget({
          year,
          budgetType: 'budget',
          accountNumber: entry.accountNumber,
          amount: entry.amount,
          notes: entry.description
        });

        await budget.save();
        totalCreated++;
      }
    }

    console.log(`✅ Budget seeding completed - Created ${totalCreated} budget entries`);
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

seedBudgets();
