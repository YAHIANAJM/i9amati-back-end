import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const LoanAmortizationSchema = new Schema({
  paymentNumber: { type: Number, required: true },
  date: { type: Date, required: true },
  principal: { type: Number, required: true },
  interest: { type: Number, required: true },
  totalPayment: { type: Number, required: true },
  remainingBalance: { type: Number, required: true },
  isPaid: { type: Boolean, default: false },
  paidDate: { type: Date },
  journalEntry: { type: Schema.Types.ObjectId, ref: 'JournalEntry' }
});

const LoanSchema = new Schema({
  residence_id: { type: Schema.Types.ObjectId, ref: 'Residence', required: false, index: true },
  loanNumber: { type: String, required: true, unique: true },
  lender: { type: String, required: true }, // Bank or lender name
  loanType: { 
    type: String, 
    enum: ['bank_loan', 'line_of_credit', 'other'], 
    default: 'bank_loan' 
  },
  principalAmount: { type: Number, required: true },
  interestRate: { type: Number, required: true }, // Annual interest rate percentage
  termMonths: { type: Number, required: true }, // Loan term in months
  disbursementDate: { type: Date, required: true },
  firstPaymentDate: { type: Date, required: true },
  paymentFrequency: { 
    type: String, 
    enum: ['monthly', 'quarterly', 'semi-annual', 'annual'], 
    default: 'monthly' 
  },
  status: { 
    type: String, 
    enum: ['active', 'paid_off', 'defaulted'], 
    default: 'active' 
  },
  
  // Accounting references
  disbursementJournalEntry: { type: Schema.Types.ObjectId, ref: 'JournalEntry' },
  
  // Amortization schedule
  amortizationSchedule: [LoanAmortizationSchema],
  
  // Totals
  totalInterest: { type: Number, default: 0 },
  totalPayments: { type: Number, default: 0 },
  remainingBalance: { type: Number },
  
  // Metadata
  purpose: { type: String },
  notes: { type: String },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedDate: { type: Date }
}, { timestamps: true });

// Generate amortization schedule
LoanSchema.methods.generateAmortizationSchedule = function() {
  const monthlyRate = this.interestRate / 100 / 12;
  const numberOfPayments = this.termMonths;
  const principal = this.principalAmount;
  
  // Calculate monthly payment using amortization formula
  const monthlyPayment = principal * 
    (monthlyRate * Math.pow(1 + monthlyRate, numberOfPayments)) / 
    (Math.pow(1 + monthlyRate, numberOfPayments) - 1);
  
  let remainingBalance = principal;
  let currentDate = new Date(this.firstPaymentDate);
  const schedule = [];
  let totalInterest = 0;
  
  for (let i = 1; i <= numberOfPayments; i++) {
    const interestPayment = remainingBalance * monthlyRate;
    const principalPayment = monthlyPayment - interestPayment;
    remainingBalance -= principalPayment;
    totalInterest += interestPayment;
    
    // Adjust for final payment to handle rounding
    if (i === numberOfPayments) {
      remainingBalance = 0;
    }
    
    schedule.push({
      paymentNumber: i,
      date: new Date(currentDate),
      principal: Math.round(principalPayment * 100) / 100,
      interest: Math.round(interestPayment * 100) / 100,
      totalPayment: Math.round(monthlyPayment * 100) / 100,
      remainingBalance: Math.round(Math.max(0, remainingBalance) * 100) / 100,
      isPaid: false
    });
    
    // Increment date based on payment frequency
    switch (this.paymentFrequency) {
      case 'monthly':
        currentDate.setMonth(currentDate.getMonth() + 1);
        break;
      case 'quarterly':
        currentDate.setMonth(currentDate.getMonth() + 3);
        break;
      case 'semi-annual':
        currentDate.setMonth(currentDate.getMonth() + 6);
        break;
      case 'annual':
        currentDate.setFullYear(currentDate.getFullYear() + 1);
        break;
    }
  }
  
  this.amortizationSchedule = schedule;
  this.totalInterest = Math.round(totalInterest * 100) / 100;
  this.totalPayments = Math.round((principal + totalInterest) * 100) / 100;
  this.remainingBalance = principal;
  
  return schedule;
};

// Mark payment as paid
LoanSchema.methods.recordPayment = async function(paymentNumber, journalEntryId) {
  const payment = this.amortizationSchedule.find(p => p.paymentNumber === paymentNumber);
  if (!payment) {
    throw new Error('Payment not found in amortization schedule');
  }
  
  if (payment.isPaid) {
    throw new Error('Payment already recorded');
  }
  
  payment.isPaid = true;
  payment.paidDate = new Date();
  payment.journalEntry = journalEntryId;
  
  // Update remaining balance
  this.remainingBalance = payment.remainingBalance;
  
  // Check if loan is fully paid
  const allPaid = this.amortizationSchedule.every(p => p.isPaid);
  if (allPaid) {
    this.status = 'paid_off';
  }
  
  await this.save();
  return payment;
};

// Get upcoming payments
LoanSchema.methods.getUpcomingPayments = function(numberOfPayments = 3) {
  return this.amortizationSchedule
    .filter(p => !p.isPaid && p.date > new Date())
    .slice(0, numberOfPayments);
};

// Get overdue payments
LoanSchema.methods.getOverduePayments = function() {
  return this.amortizationSchedule
    .filter(p => !p.isPaid && p.date < new Date());
};

// Static method to get all active loans for a residence
LoanSchema.statics.getActiveLoans = function(residenceId) {
  return this.find({
    residence_id: residenceId,
    status: 'active'
  }).sort({ disbursementDate: -1 });
};

const Loan = mongoose.model('Loan', LoanSchema);
export default Loan;
