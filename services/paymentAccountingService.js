import JournalEntry from '../models/JournalEntry.js';
import JournalLine from '../models/JournalLine.js';
import Account from '../models/Account.js';
import Payment from '../models/Payment.js';

/**
 * Payment Accounting Integration Service
 * Automatically creates journal entries when payments are confirmed
 */
class PaymentAccountingService {
  /**
   * Create automatic journal entry for payment
   * @param {Object} paymentData - Payment information
   * @returns {Promise<Object>} Created journal entry with reference number
   */
  async createPaymentJournalEntry(paymentData) {
    const {
      paymentId,
      amount,
      paymentDate,
      customerId,
      customerName,
      apartmentId,
      buildingId,
      paymentMethod,
      paymentReference,
      description,
      currency = 'MAD'
    } = paymentData;

    try {
      // Find required accounts
      const cashAccount = await Account.findOne({ code: '5161' }); // Bank/Cash account
      const receivablesAccount = await Account.findOne({ code: '3421' }); // Accounts Receivable
      const revenueAccount = await Account.findOne({ code: '7111' }); // Revenue from services

      if (!cashAccount || !receivablesAccount) {
        throw new Error('Required accounting accounts not found. Please setup chart of accounts.');
      }

      // Generate unique journal reference number
      const journalRef = await this.generateJournalReference('PAY');

      // Create Journal Entry
      const journalEntry = new JournalEntry({
        date: paymentDate || new Date(),
        description: description || `Payment received from ${customerName} - Ref: ${paymentReference}`,
        type: paymentMethod === 'cash' ? 'cash' : 'bank',
        reference: journalRef,
        status: 'active'
      });

      await journalEntry.save();

      // Create Journal Lines (Double Entry)
      const journalLines = [];

      // DEBIT: Bank/Cash Account (Asset increases)
      const debitLine = new JournalLine({
        journalEntry: journalEntry._id,
        account: cashAccount._id,
        description: `Payment received - ${paymentMethod}`,
        debit: amount,
        credit: 0,
        currency
      });
      await debitLine.save();
      journalLines.push(debitLine);
      journalEntry.lines.push(debitLine._id);

      // CREDIT: Accounts Receivable (Asset decreases)
      const creditLine = new JournalLine({
        journalEntry: journalEntry._id,
        account: receivablesAccount._id,
        description: `Payment from ${customerName}`,
        debit: 0,
        credit: amount,
        currency
      });
      await creditLine.save();
      journalLines.push(creditLine);
      journalEntry.lines.push(creditLine._id);

      await journalEntry.save();

      // Update Payment model with journal entry reference
      if (paymentId) {
        await Payment.findByIdAndUpdate(paymentId, {
          journalEntry: journalEntry._id,
          status: 'confirmed'
        });
      }

      // Update Account Balances
      await this.updateAccountBalances(cashAccount._id, amount, 'debit');
      await this.updateAccountBalances(receivablesAccount._id, amount, 'credit');

      return {
        success: true,
        journalEntry: {
          id: journalEntry._id,
          reference: journalRef,
          date: journalEntry.date,
          description: journalEntry.description,
          lines: journalLines
        },
        message: 'Payment automatically recorded in accounting books'
      };
    } catch (error) {
      console.error('Error creating payment journal entry:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create journal entry for contribution invoice
   * @param {Object} contributionData - Contribution information
   */
  async createContributionJournalEntry(contributionData) {
    const {
      contributionId,
      totalAmount,
      invoiceDate,
      ownerId,
      ownerName,
      apartmentId,
      buildingId,
      description,
      currency = 'MAD'
    } = contributionData;

    try {
      // Find required accounts
      const receivablesAccount = await Account.findOne({ code: '3421' }); // Accounts Receivable
      const revenueAccount = await Account.findOne({ code: '7111' }); // Revenue from services

      if (!receivablesAccount || !revenueAccount) {
        throw new Error('Required accounting accounts not found.');
      }

      // Generate unique journal reference
      const journalRef = await this.generateJournalReference('INV');

      // Create Journal Entry
      const journalEntry = new JournalEntry({
        date: invoiceDate || new Date(),
        description: description || `Invoice for ${ownerName}`,
        type: 'general',
        reference: journalRef,
        status: 'active'
      });

      await journalEntry.save();

      // DEBIT: Accounts Receivable (Asset increases)
      const debitLine = new JournalLine({
        journalEntry: journalEntry._id,
        account: receivablesAccount._id,
        description: `Invoice to ${ownerName}`,
        debit: totalAmount,
        credit: 0,
        currency
      });
      await debitLine.save();
      journalEntry.lines.push(debitLine._id);

      // CREDIT: Revenue (Income increases)
      const creditLine = new JournalLine({
        journalEntry: journalEntry._id,
        account: revenueAccount._id,
        description: `Service revenue from ${ownerName}`,
        debit: 0,
        credit: totalAmount,
        currency
      });
      await creditLine.save();
      journalEntry.lines.push(creditLine._id);

      await journalEntry.save();

      // Update Account Balances
      await this.updateAccountBalances(receivablesAccount._id, totalAmount, 'debit');
      await this.updateAccountBalances(revenueAccount._id, totalAmount, 'credit');

      return {
        success: true,
        journalEntry: {
          id: journalEntry._id,
          reference: journalRef,
          date: journalEntry.date,
          description: journalEntry.description
        }
      };
    } catch (error) {
      console.error('Error creating contribution journal entry:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate unique journal reference number
   * @param {string} prefix - Reference prefix (PAY, INV, etc.)
   */
  async generateJournalReference(prefix = 'JE') {
    const year = new Date().getFullYear();
    const count = await JournalEntry.countDocuments({
      createdAt: {
        $gte: new Date(year, 0, 1),
        $lt: new Date(year + 1, 0, 1)
      }
    });

    const sequence = String(count + 1).padStart(6, '0');
    return `${prefix}-${year}-${sequence}`;
  }

  /**
   * Update account balances
   * @param {string} accountId - Account ID
   * @param {number} amount - Amount to add
   * @param {string} type - 'debit' or 'credit'
   */
  async updateAccountBalances(accountId, amount, type) {
    try {
      const account = await Account.findById(accountId);
      if (!account) return;

      if (type === 'debit') {
        account.balance = (account.balance || 0) + amount;
      } else {
        account.balance = (account.balance || 0) - amount;
      }

      await account.save();
    } catch (error) {
      console.error('Error updating account balance:', error);
    }
  }

  /**
   * Reverse journal entry (for refunds/cancellations)
   * @param {string} journalEntryId - Journal entry to reverse
   */
  async reverseJournalEntry(journalEntryId, reason) {
    try {
      const originalEntry = await JournalEntry.findById(journalEntryId)
        .populate('lines');

      if (!originalEntry) {
        throw new Error('Journal entry not found');
      }

      // Mark original as reversed
      originalEntry.status = 'reversed';
      await originalEntry.save();

      // Create reversing entry
      const reversalRef = await this.generateJournalReference('REV');
      const reversalEntry = new JournalEntry({
        date: new Date(),
        description: `Reversal: ${reason} - Original: ${originalEntry.reference}`,
        type: originalEntry.type,
        reference: reversalRef,
        status: 'active'
      });

      await reversalEntry.save();

      // Create reversing lines (swap debit/credit)
      for (const line of originalEntry.lines) {
        const reversalLine = new JournalLine({
          journalEntry: reversalEntry._id,
          account: line.account,
          description: `Reversal: ${line.description}`,
          debit: line.credit, // Swap
          credit: line.debit, // Swap
          currency: line.currency
        });
        await reversalLine.save();
        reversalEntry.lines.push(reversalLine._id);

        // Update account balances
        if (line.debit > 0) {
          await this.updateAccountBalances(line.account, line.debit, 'credit');
        }
        if (line.credit > 0) {
          await this.updateAccountBalances(line.account, line.credit, 'debit');
        }
      }

      await reversalEntry.save();

      return {
        success: true,
        reversalEntry: {
          id: reversalEntry._id,
          reference: reversalRef
        }
      };
    } catch (error) {
      console.error('Error reversing journal entry:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get payment journal entry details
   * @param {string} paymentId - Payment ID
   */
  async getPaymentJournalDetails(paymentId) {
    try {
      const payment = await Payment.findById(paymentId)
        .populate({
          path: 'journalEntry',
          populate: {
            path: 'lines',
            populate: 'account'
          }
        });

      if (!payment || !payment.journalEntry) {
        return null;
      }

      return {
        journalEntry: payment.journalEntry,
        reference: payment.journalEntry.reference,
        date: payment.journalEntry.date,
        lines: payment.journalEntry.lines
      };
    } catch (error) {
      console.error('Error getting payment journal details:', error);
      return null;
    }
  }
}

export default new PaymentAccountingService();
