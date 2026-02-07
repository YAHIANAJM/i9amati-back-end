import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Payment from '../models/Payment.js';

async function checkPayment() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const payment = await Payment.findOne({
      status: { $in: ['confirmed', 'paid', 'paid_effectively'] }
    }).lean();

    console.log('Sample payment:', JSON.stringify(payment, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkPayment();
