import Contribution from '../models/Contribution.js';
import Payment from '../models/Payment.js';
import PaymentAllocation from '../models/PaymentAllocation.js';
import Account from '../models/Account.js';
import JournalEntry from '../models/JournalEntry.js';
import JournalLine from '../models/JournalLine.js';
import Apartment from '../models/Apartment.js';
import User from '../models/User.js';

/**
 * POST /api/accounting/contributions/generate
 * Generate annual contributions for all active units
 * 
 * Body: { year: 2026, monthly_amount: 350, start_date: "2026-01-01" }
 * 
 * Logic:
 * 1. Calculate annual fee (monthly_amount * 12)
 * 2. Create contribution record for each active unit
 * 3. Create journal entry with double-entry:
 *    - Credit 7111 (Revenue) with total
 *    - Debit 3421 (Receivable) for each unit/owner
 */
export const generateAnnualContributions = async (req, res) => {
  try {
    const { year, monthly_amount, start_date } = req.body;

    if (!year || !monthly_amount) {
      return res.status(400).json({ error: 'Year and monthly_amount are required' });
    }

    const annualAmount = monthly_amount * 12;

    // Get all apartments
    const allApartments = await Apartment.find({});
    console.log(`📊 Total apartments in system: ${allApartments.length}`);
    
    // Check which apartments have representative users
    const apartmentsWithReps = allApartments.filter(apt => apt.representativeUser);
    console.log(`👥 Apartments with representativeUser: ${apartmentsWithReps.length}`);
    
    // Check which apartments have embedded owners
    const apartmentsWithEmbeddedOwners = allApartments.filter(apt => apt.owners && apt.owners.length > 0);
    console.log(`📋 Apartments with embedded owners: ${apartmentsWithEmbeddedOwners.length}`);

    if (allApartments.length === 0) {
      return res.status(400).json({ 
        error: 'No apartments found in the system. Please create apartments first.' 
      });
    }

    if (apartmentsWithReps.length === 0) {
      return res.status(400).json({ 
        error: `Found ${allApartments.length} apartment(s) but none have a representative user assigned. Please assign representative users to apartments first.`,
        details: {
          totalApartments: allApartments.length,
          apartmentsWithRepresentative: 0,
          apartmentsWithEmbeddedOwners: apartmentsWithEmbeddedOwners.length,
          hint: 'Apartments need a representativeUser (a User who can log in) to generate contributions.'
        }
      });
    }

    // Get apartments with their representative users populated
    const apartments = await Apartment.find({ representativeUser: { $exists: true, $ne: null } })
      .populate('representativeUser');
    
    console.log(`✅ Processing ${apartments.length} apartments for contribution generation`);
    
    // Debug: Check first apartment's representative user
    if (apartments.length > 0) {
      const firstApt = apartments[0];
      console.log(`🔍 Debug first apartment:`, {
        unit_code: firstApt.unit_code,
        hasRepUser: !!firstApt.representativeUser,
        repUserType: typeof firstApt.representativeUser,
        repUserId: firstApt.representativeUser?._id,
        isPopulated: firstApt.representativeUser?.name !== undefined
      });
    }

    console.log(`✅ Processing ${apartments.length} apartments for contribution generation`);

    // Get accounts
    const account3421 = await Account.findOne({ number: '3421' });
    const account7111 = await Account.findOne({ number: '7111' });

    if (!account3421 || !account7111) {
      return res.status(500).json({ error: 'Required accounting accounts not found. Please run seed-accounts.js' });
    }

    const contributions = [];
    let totalAmount = 0;

    // Create contributions for each apartment
    for (const apartment of apartments) {
      if (!apartment.representativeUser) {
        console.log(`⚠️  Skipping apartment ${apartment.unit_code} - no representative user`);
        continue; // Skip apartments without representative
      }

      const ownerId = apartment.representativeUser._id || apartment.representativeUser;

      // Check if contribution already exists
      const existing = await Contribution.findOne({ 
        owner: ownerId, 
        unit: apartment._id, 
        year 
      });
      if (existing) {
        console.log(`⚠️  Skipping apartment ${apartment.unit_code} - contribution already exists for ${year}`);
        continue; // Skip if already generated
      }

      const contribution = new Contribution({
        owner: ownerId,
        unit: apartment._id,
        year,
        dueAmount: annualAmount,
        paidAmount: 0,
        remaining: annualAmount,
        status: 'unpaid',
        generalAssemblyRef: `Contribution ${year}`
      });

      await contribution.save();
      contributions.push(contribution);
      totalAmount += annualAmount;
      
      console.log(`✅ Created contribution for ${apartment.unit_code}: ${annualAmount} MAD`);
    }

    if (contributions.length === 0) {
      return res.status(400).json({ error: 'No new contributions created. They may already exist for this year.' });
    }

    // Create Journal Entry
    const journalEntry = new JournalEntry({
      date: start_date || new Date(`${year}-01-01`),
      description: `Génération des contributions annuelles ${year}`,
      type: 'general',
      status: 'active',
      reference: `CONTRIB-${year}`
    });
    await journalEntry.save();

    // Create Journal Lines
    const journalLines = [];

    // Debit lines for each unit/owner (Account 3421)
    for (const contrib of contributions) {
      const line = new JournalLine({
        journalEntry: journalEntry._id,
        accountNumber: account3421.number,
        debit: contrib.dueAmount,
        credit: 0,
        owner: contrib.owner,
        unit: contrib.unit,
        description: `Contribution ${year} - Unit ${contrib.unit}`
      });
      await line.save();
      journalLines.push(line);
      journalEntry.lines.push(line._id);
    }

    // Credit line for total (Account 7111)
    const creditLine = new JournalLine({
      journalEntry: journalEntry._id,
      accountNumber: account7111.number,
      debit: 0,
      credit: totalAmount,
      description: `Total contributions ${year}`
    });
    await creditLine.save();
    journalLines.push(creditLine);
    journalEntry.lines.push(creditLine._id);

    await journalEntry.save();

    // Verify double-entry balance
    const totalDebit = journalLines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredit = journalLines.reduce((sum, line) => sum + line.credit, 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error('Journal entry is not balanced! Debit != Credit');
    }

    res.status(201).json({
      success: true,
      message: `Generated ${contributions.length} contributions for year ${year}`,
      data: {
        contributions: contributions.length,
        totalAmount,
        journalEntry: {
          id: journalEntry._id,
          totalDebit,
          totalCredit,
          balanced: totalDebit === totalCredit
        }
      }
    });

  } catch (error) {
    console.error('Error generating contributions:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/accounting/payments
 * Record a payment with allocations to multiple units
 * 
 * Body: {
 *   owner_id: "123",
 *   date: "2026-02-15",
 *   method: "CHEQUE", // or CASH, VIREMENT
 *   reference: "CHK-998877",
 *   allocations: [
 *     { unit_id: "1", amount: 4200 },
 *     { unit_id: "2", amount: 2100 }
 *   ]
 * }
 */
export const recordPayment = async (req, res) => {
  try {
    const { owner_id, date, method, reference, allocations } = req.body;

    if (!owner_id || !date || !method || !allocations || allocations.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate method
    const validMethods = ['CASH', 'CHEQUE', 'VIREMENT'];
    const normalizedMethod = method.toUpperCase();
    if (!validMethods.includes(normalizedMethod)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }

    // Calculate total payment amount
    const totalAmount = allocations.reduce((sum, alloc) => sum + alloc.amount, 0);

    // Verify owner exists
    const owner = await User.findById(owner_id);
    if (!owner) {
      return res.status(404).json({ error: 'Owner not found' });
    }

    // Get the appropriate debit account based on payment method
    let debitAccountNumber;
    if (normalizedMethod === 'CASH') debitAccountNumber = '5161';
    else if (normalizedMethod === 'CHEQUE') debitAccountNumber = '5122';
    else if (normalizedMethod === 'VIREMENT') debitAccountNumber = '5121';

    const debitAccount = await Account.findOne({ number: debitAccountNumber });
    const creditAccount = await Account.findOne({ number: '3421' });

    if (!debitAccount || !creditAccount) {
      return res.status(500).json({ error: 'Required accounts not found' });
    }

    // Create Journal Entry
    const journalEntry = new JournalEntry({
      date: new Date(date),
      description: `Paiement de ${owner.name} - ${normalizedMethod}`,
      type: normalizedMethod === 'CASH' ? 'cash' : normalizedMethod === 'VIREMENT' ? 'bank' : 'general',
      status: 'active',
      reference: reference || `PAY-${Date.now()}`
    });
    await journalEntry.save();

    // Create Payment record
    const payment = new Payment({
      owner: owner_id,
      date: new Date(date),
      totalAmount,
      method: normalizedMethod.toLowerCase(),
      reference,
      account: debitAccount._id,
      journalEntry: journalEntry._id,
      status: normalizedMethod === 'CHEQUE' ? 'pending' : 'confirmed'
    });
    await payment.save();

    // Create debit line (Cash/Bank/Check account)
    const debitLine = new JournalLine({
      journalEntry: journalEntry._id,
      accountNumber: debitAccount.number,
      debit: totalAmount,
      credit: 0,
      description: `Encaissement ${normalizedMethod} - ${owner.name}`
    });
    await debitLine.save();
    journalEntry.lines.push(debitLine._id);

    // Process allocations and create credit lines
    const paymentAllocations = [];
    for (const alloc of allocations) {
      const { contribution_id, unit_id, amount } = alloc;

      // Find the contribution by ID (preferred) or fallback to unit lookup
      let contribution;
      if (contribution_id) {
        contribution = await Contribution.findById(contribution_id);
      } else {
        // Fallback: find contribution by unit and current year
        const currentYear = new Date(date).getFullYear();
        contribution = await Contribution.findOne({
          owner: owner_id,
          unit: unit_id,
          year: currentYear
        });
      }

      if (!contribution) {
        throw new Error(`No contribution found for unit ${unit_id}`);
      }

      // Check for overpayment
      if (amount > contribution.remaining) {
        throw new Error(`Overpayment for unit ${unit_id}. Remaining: ${contribution.remaining}, Paid: ${amount}`);
      }

      // Update contribution
      contribution.paidAmount += amount;
      contribution.remaining -= amount;
      if (contribution.remaining === 0) {
        contribution.status = 'paid';
      } else if (contribution.paidAmount > 0) {
        contribution.status = 'partial';
      }
      await contribution.save();

      // Create payment allocation
      const allocation = new PaymentAllocation({
        payment: payment._id,
        unit: contribution.unit,
        amount,
        contribution: contribution._id
      });
      await allocation.save();
      paymentAllocations.push(allocation);

      // Create credit line for this unit (Account 3421)
      const creditLine = new JournalLine({
        journalEntry: journalEntry._id,
        accountNumber: creditAccount.number,
        debit: 0,
        credit: amount,
        owner: owner_id,
        unit: contribution.unit,
        description: `Paiement unit ${contribution.unit}`
      });
      await creditLine.save();
      journalEntry.lines.push(creditLine._id);
    }

    await journalEntry.save();

    // Verify balance
    const lines = await JournalLine.find({ journalEntry: journalEntry._id });
    const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error('Payment journal entry is not balanced!');
    }

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: {
        payment: {
          id: payment._id,
          totalAmount,
          method: payment.method,
          reference: payment.reference,
          status: payment.status
        },
        allocations: paymentAllocations.length,
        journalEntry: {
          id: journalEntry._id,
          totalDebit,
          totalCredit,
          balanced: Math.abs(totalDebit - totalCredit) < 0.01
        }
      }
    });

  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/accounting/checks/deposit
 * Deposit checks to bank (transfer from 5122 to 5121)
 * 
 * Body: { payment_ids: [10, 11] }
 */
export const depositChecks = async (req, res) => {
  try {
    const { payment_ids } = req.body;

    if (!payment_ids || !Array.isArray(payment_ids) || payment_ids.length === 0) {
      return res.status(400).json({ error: 'payment_ids array is required' });
    }

    // Find payments
    const payments = await Payment.find({
      _id: { $in: payment_ids },
      method: 'cheque',
      status: 'pending'
    });

    if (payments.length === 0) {
      return res.status(400).json({ error: 'No valid pending cheque payments found' });
    }

    const totalAmount = payments.reduce((sum, p) => sum + p.totalAmount, 0);

    // Get accounts
    const account5121 = await Account.findOne({ number: '5121' }); // Bank
    const account5122 = await Account.findOne({ number: '5122' }); // Checks

    if (!account5121 || !account5122) {
      return res.status(500).json({ error: 'Required accounts not found' });
    }

    // Create journal entry
    const journalEntry = new JournalEntry({
      date: new Date(),
      description: `Dépôt de ${payments.length} chèques`,
      type: 'bank',
      status: 'active',
      reference: `DEPOSIT-${Date.now()}`
    });
    await journalEntry.save();

    // Debit bank account
    const debitLine = new JournalLine({
      journalEntry: journalEntry._id,
      accountNumber: account5121.number,
      debit: totalAmount,
      credit: 0,
      description: 'Dépôt chèques en banque'
    });
    await debitLine.save();
    journalEntry.lines.push(debitLine._id);

    // Credit checks account
    const creditLine = new JournalLine({
      journalEntry: journalEntry._id,
      accountNumber: account5122.number,
      debit: 0,
      credit: totalAmount,
      description: 'Chèques déposés'
    });
    await creditLine.save();
    journalEntry.lines.push(creditLine._id);

    await journalEntry.save();

    // Update payment statuses
    await Payment.updateMany(
      { _id: { $in: payment_ids } },
      { status: 'confirmed' }
    );

    res.status(200).json({
      success: true,
      message: `Deposited ${payments.length} checks totaling ${totalAmount}`,
      data: {
        deposited: payments.length,
        totalAmount,
        journalEntry: journalEntry._id
      }
    });

  } catch (error) {
    console.error('Error depositing checks:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/accounting/ledger/:owner_id
 * Get co-owner statement showing all contributions and payments
 */
export const getOwnerLedger = async (req, res) => {
  try {
    const { owner_id } = req.params;
    const { year } = req.query;

    if (!owner_id) {
      return res.status(400).json({ error: 'owner_id is required' });
    }

    const owner = await User.findById(owner_id);
    if (!owner) {
      return res.status(404).json({ error: 'Owner not found' });
    }

    // Build query
    const query = { owner: owner_id };
    if (year) query.year = parseInt(year);

    // Get contributions
    const contributions = await Contribution.find(query)
      .populate('unit')
      .sort({ year: -1, createdAt: -1 });

    // Get payments
    const payments = await Payment.find({ owner: owner_id })
      .populate('journalEntry')
      .sort({ date: -1 });

    // Get payment allocations
    const paymentIds = payments.map(p => p._id);
    const allocations = await PaymentAllocation.find({ payment: { $in: paymentIds } })
      .populate('unit')
      .populate('contribution');

    // Calculate totals
    const totalDue = contributions.reduce((sum, c) => sum + c.dueAmount, 0);
    const totalPaid = contributions.reduce((sum, c) => sum + c.paidAmount, 0);
    const totalRemaining = contributions.reduce((sum, c) => sum + c.remaining, 0);

    res.status(200).json({
      success: true,
      data: {
        owner: {
          id: owner._id,
          name: owner.name,
          email: owner.email
        },
        summary: {
          totalDue,
          totalPaid,
          totalRemaining,
          contributionsCount: contributions.length,
          paymentsCount: payments.length
        },
        contributions: contributions.map(c => ({
          id: c._id,
          unit: c.unit,
          year: c.year,
          dueAmount: c.dueAmount,
          paidAmount: c.paidAmount,
          remaining: c.remaining,
          status: c.status
        })),
        payments: payments.map(p => ({
          id: p._id,
          date: p.date,
          amount: p.totalAmount,
          method: p.method,
          reference: p.reference,
          status: p.status
        })),
        allocations: allocations.map(a => ({
          payment: a.payment,
          unit: a.unit,
          amount: a.amount,
          contribution: a.contribution
        }))
      }
    });

  } catch (error) {
    console.error('Error fetching owner ledger:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/accounting/summary
 * Get overall accounting summary
 */
export const getAccountingSummary = async (req, res) => {
  try {
    const { year } = req.query;
    const currentYear = year ? parseInt(year) : new Date().getFullYear();

    // Get contributions for the year
    const contributions = await Contribution.find({ year: currentYear });
    
    const totalDue = contributions.reduce((sum, c) => sum + c.dueAmount, 0);
    const totalCollected = contributions.reduce((sum, c) => sum + c.paidAmount, 0);
    const totalUnpaid = contributions.reduce((sum, c) => sum + c.remaining, 0);

    // Count by status
    const paid = contributions.filter(c => c.status === 'paid').length;
    const partial = contributions.filter(c => c.status === 'partial').length;
    const unpaid = contributions.filter(c => c.status === 'unpaid').length;

    // Get recent payments
    const recentPayments = await Payment.find({})
      .sort({ date: -1 })
      .limit(10)
      .populate('owner', 'name email');

    res.status(200).json({
      success: true,
      data: {
        year: currentYear,
        totals: {
          totalDue,
          totalCollected,
          totalUnpaid,
          collectionRate: totalDue > 0 ? ((totalCollected / totalDue) * 100).toFixed(2) : 0
        },
        status: {
          paid,
          partial,
          unpaid
        },
        recentPayments: recentPayments.map(p => ({
          id: p._id,
          owner: p.owner,
          date: p.date,
          amount: p.totalAmount,
          method: p.method,
          reference: p.reference
        }))
      }
    });

  } catch (error) {
    console.error('Error fetching accounting summary:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/accounting/contributions
 * Get all contributions with filters
 */
export const getContributions = async (req, res) => {
  try {
    const { year, owner_id, status } = req.query;

    const query = {};
    if (year) query.year = parseInt(year);
    if (owner_id) query.owner = owner_id;
    if (status) query.status = status;

    const contributions = await Contribution.find(query)
      .populate('owner', 'name email')
      .populate('unit')
      .sort({ year: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: contributions.length,
      data: contributions
    });

  } catch (error) {
    console.error('Error fetching contributions:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/accounting/setup/assign-representatives
 * Assign representative users to apartments based on embedded owner data
 * 
 * This is a setup/utility endpoint that:
 * 1. Finds all apartments with embedded owners but no representativeUser
 * 2. Creates User accounts for property owners (if they don't exist)
 * 3. Links the User as representativeUser to the apartment
 */
const assignRepresentativeUsers = async (req, res) => {
  try {
    console.log('\n🔧 Starting representative user assignment...\n');

    // Get all property owner users
    const propertyOwners = await User.find({ role: 'property_owner' });
    console.log(`📋 Found ${propertyOwners.length} property owner users in system`);

    if (propertyOwners.length === 0) {
      return res.status(400).json({
        error: 'No property_owner users found in system. Please create property owner user accounts first.',
        hint: 'Users with role="property_owner" are needed to assign as representatives'
      });
    }

    // Find apartments without representative users
    const apartments = await Apartment.find({});
    console.log(`📊 Found ${apartments.length} apartments total`);

    let assigned = 0;
    const errors = [];

    // Simple strategy: assign the first property owner to all apartments
    // (In production, you'd match by email/name/etc.)
    const defaultOwner = propertyOwners[0];
    console.log(`✅ Using ${defaultOwner.name || defaultOwner.email} as default representative\n`);

    for (const apartment of apartments) {
      try {
        console.log(`🏢 ${apartment.unit_code || apartment.main_plot_number}`);

        await Apartment.updateOne(
          { _id: apartment._id },
          { $set: { representativeUser: defaultOwner._id } }
        );
        
        console.log(`   ✅ Assigned ${defaultOwner.name || defaultOwner.email}`);
        assigned++;

      } catch (err) {
        const msg = `Error with ${apartment.unit_code}: ${err.message}`;
        console.error(`   ❌ ${msg}`);
        errors.push(msg);
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 Summary: ${assigned} apartments assigned to ${defaultOwner.name || defaultOwner.email}`);
    console.log(`${'='.repeat(60)}\n`);

    res.status(200).json({
      success: true,
      message: `Successfully assigned ${assigned} apartments to representative user`,
      data: {
        assigned,
        representativeUser: {
          _id: defaultOwner._id,
          name: defaultOwner.name,
          email: defaultOwner.email
        },
        errors: errors.length,
        errorDetails: errors
      }
    });

  } catch (error) {
    console.error('❌ Error assigning representatives:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * GET /api/accounting/setup/check-apartments
 * Debug endpoint to see actual apartment data structure
 */
const checkApartmentData = async (req, res) => {
  try {
    // Get apartments without any transformation
    const apartments = await Apartment.find({}).limit(3).lean();
    
    res.status(200).json({
      success: true,
      apartments: apartments.map(apt => ({
        unit_code: apt.unit_code,
        _id: apt._id,
        hasRepField: apt.representativeUser !== undefined && apt.representativeUser !== null,
        representativeUser: apt.representativeUser,
        owners: apt.owners
      }))
    });

  } catch (error) {
    console.error('Error checking apartments:', error);
    res.status(500).json({ error: error.message });
  }
};

export default {
  generateAnnualContributions,
  recordPayment,
  depositChecks,
  getOwnerLedger,
  getAccountingSummary,
  getContributions,
  assignRepresentativeUsers,
  checkApartmentData
};

