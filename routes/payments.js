import express from 'express';
import { auth } from '../middleware/auth.js';
import Financial from '../models/Financial.js';
import User from '../models/User.js';
import Payment from '../models/Payment.js';
import Document from '../models/Document.js';
import cmiPaymentService from '../services/cmiPaymentService.js';
import pdfInvoiceService from '../services/pdfInvoiceService.js';
import paymentAccountingService from '../services/paymentAccountingService.js';
import axios from 'axios';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import crypto from 'crypto';
import streamifier from 'streamifier';
import path from 'path';

const router = express.Router();

// Configure Cloudinary
const cloudinaryConfigured = 
  process.env.CLOUDINARY_CLOUD_NAME && 
  process.env.CLOUDINARY_API_KEY && 
  process.env.CLOUDINARY_API_SECRET;

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

// Configure multer for receipt uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|jpg|jpeg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (extname) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPG, JPEG, PNG files allowed'));
    }
  }
});

// List payments for current user context
router.get('/', auth, async (req, res) => {
  const role = req.user.role;
  let financialQuery = {};
  let paymentQuery = {};

  if (role === 'union_agent') {
    // Use User model directly
    const agent = await User.findById(req.user.id);
    if (!agent) return res.json([]);
    financialQuery.apartment_id = { $in: agent.apartments };
    // For Payment model, get all payments (union agent sees all)
    // You might want to filter by building later
  } else if (role === 'property_owner') {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Handle multiple apartments
    if (user.apartments && user.apartments.length > 0) {
      financialQuery.$or = [
        { owner_id: user._id },
        { apartment_id: { $in: user.apartments } }
      ];
    } else {
      financialQuery.owner_id = user._id;
    }
    
    // For Payment model (CMI payments)
    paymentQuery.owner = user._id;
  }

  // Fetch both Financial and Payment records
  const [financialPayments, cmiPayments] = await Promise.all([
    Financial.find(financialQuery)
      .populate('journalEntry')
      .sort({ due_date: -1 }),
    Payment.find(paymentQuery)
      .populate('journalEntry')
      .sort({ date: -1 })
  ]);

  // Combine and format payments
  const allPayments = [
    ...financialPayments.map(p => ({
      _id: p._id,
      due_date: p.due_date,
      paid_at: p.paid_at,
      description: p.description || p.type,
      amount: p.amount,
      status: p.status,
      journalEntry: p.journalEntry,
      type: 'financial'
    })),
    ...cmiPayments.map(p => ({
      _id: p._id,
      due_date: p.date,
      paid_at: p.date,
      description: `CMI Payment - ${p.reference}`,
      amount: p.totalAmount,
      status: p.status === 'confirmed' ? 'paid' : p.status,
      journalEntry: p.journalEntry,
      reference: p.reference,
      type: 'cmi'
    }))
  ].sort((a, b) => new Date(b.due_date || b.paid_at) - new Date(a.due_date || a.paid_at));

  res.json(allPayments);
});

// Create CMI payment request
router.post('/cmi/create', auth, async (req, res) => {
  try {
    const {
      amount,
      frequency,
      apartmentId,
      buildingId,
      description
    } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate unique order ID
    const orderId = `ORD-${Date.now()}-${user._id}`;

    // Create payment request for CMI gateway
    const paymentRequest = cmiPaymentService.createPaymentRequest({
      orderId,
      amount: parseFloat(amount),
      currency: 'MAD',
      customerEmail: user.email,
      customerName: user.name,
      description: description || `Payment for ${frequency} building services`,
      billToName: user.name,
      billToStreet: user.address || 'N/A',
      billToCity: user.city || 'Casablanca',
      billToPostalCode: user.postalCode || '20000',
      billToCountry: 'MA'
    });

    // Save pending payment record
    const payment = new Payment({
      owner: user._id,
      date: new Date(),
      totalAmount: amount,
      method: 'cmi',
      payment_type: 'automatic',
      reference: orderId,
      status: 'pending'
    });
    await payment.save();

    res.json({
      success: true,
      paymentRequest,
      orderId,
      message: 'Payment request created. Redirect user to CMI gateway.'
    });
  } catch (error) {
    console.error('Error creating CMI payment:', error);
    res.status(500).json({ error: error.message });
  }
});

// CMI Payment Callback (Webhook)
router.post('/cmi/callback', async (req, res) => {
  try {
    const callbackData = req.body;

    // Check if this is a mock payment (for testing)
    const isMockPayment = callbackData.hash === 'mock-hash-signature' || process.env.CMI_MOCK_MODE === 'true';

    let verification;
    if (isMockPayment) {
      // Mock verification for testing
      verification = {
        isValid: true,
        orderId: callbackData.orderId,
        transactionId: callbackData.transactionId || `TXN-MOCK-${Date.now()}`,
        status: callbackData.status || 'APPROVED'
      };
    } else {
      // Real CMI verification
      verification = cmiPaymentService.verifyPaymentCallback(callbackData);
    }

    if (!verification.isValid) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // Find payment record
    const payment = await Payment.findOne({ reference: verification.orderId });
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Update payment status
    payment.status = 'confirmed';
    payment.transactionId = verification.transactionId;
    await payment.save();

    // Get user details
    const user = await User.findById(payment.owner)
      .populate('apartments');

    // Create automatic journal entry
    const journalResult = await paymentAccountingService.createPaymentJournalEntry({
      paymentId: payment._id,
      amount: payment.totalAmount,
      paymentDate: payment.date,
      customerId: user._id,
      customerName: user.name,
      apartmentId: user.apartments?.[0]?._id,
      paymentMethod: 'cmi',
      paymentReference: payment.reference,
      description: `CMI Payment - ${verification.transactionId}`
    });

    if (!journalResult.success) {
      console.error('Failed to create journal entry:', journalResult.error);
    }

    // Generate payment receipt PDF (optional - only if Cloudinary configured)
    let receiptData = null;
    try {
      const receiptInfo = {
        receiptNumber: `REC-${Date.now()}`,
        paymentDate: payment.date,
        customer: {
          name: user.name,
          apartmentNumber: user.apartments?.[0]?.number || 'N/A'
        },
        building: {
          name: user.apartments?.[0]?.building?.name || 'N/A'
        },
        amount: payment.totalAmount,
        currency: 'MAD',
        paymentMethod: 'cmi',
        paymentReference: verification.transactionId,
        invoiceNumber: payment.reference,
        unionAgent: {
          name: 'Union Agent',
          address: 'Address',
          phone: 'Phone'
        },
        journalReference: journalResult.success ? journalResult.journalEntry.reference : null
      };

      receiptData = await pdfInvoiceService.generateReceipt(receiptInfo);
    } catch (pdfError) {
      console.error('PDF generation failed (non-critical):', pdfError.message);
    }

    res.json({
      success: true,
      payment: {
        id: payment._id,
        status: payment.status,
        amount: payment.totalAmount,
        transactionId: verification.transactionId
      },
      journalEntry: journalResult.success ? journalResult.journalEntry : null,
      receiptData
    });
  } catch (error) {
    console.error('Error processing CMI callback:', error);
    res.status(500).json({ error: error.message });
  }
});

// Setup Direct Debit
router.post('/direct-debit/setup', auth, async (req, res) => {
  try {
    const {
      accountNumber,
      bankCode,
      frequency,
      amount
    } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await cmiPaymentService.setupAutomaticDebit({
      customerId: user._id.toString(),
      accountNumber,
      bankCode,
      frequency,
      amount: parseFloat(amount),
      startDate: new Date()
    });

    res.json(result);
  } catch (error) {
    console.error('Error setting up direct debit:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate Invoice PDF
router.post('/invoice/generate', auth, async (req, res) => {
  try {
    const {
      items,
      customerId,
      buildingId,
      dueDate,
      paymentTerms,
      notes
    } = req.body;

    const customer = await User.findById(customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const tax = subtotal * 0.20; // 20% VAT
    const total = subtotal + tax;

    const invoiceNumber = `INV-${Date.now()}`;

    const invoiceData = {
      invoiceNumber,
      invoiceDate: new Date(),
      dueDate: dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      customer: {
        name: customer.name,
        apartmentNumber: customer.apartments?.[0]?.number || 'N/A',
        phone: customer.phone,
        email: customer.email
      },
      building: {
        name: 'Building Name'
      },
      items,
      subtotal,
      tax,
      total,
      currency: 'MAD',
      unionAgent: {
        name: 'Union Agent Name',
        address: 'Agent Address',
        phone: 'Agent Phone',
        email: 'agent@example.com',
        ice: 'ICE123456',
        rc: 'RC123456'
      },
      paymentTerms: paymentTerms || 'Payment due within 30 days',
      notes
    };

    const invoicePath = await pdfInvoiceService.generateInvoice(invoiceData);

    res.json({
      success: true,
      invoiceNumber,
      invoicePath,
      message: 'Invoice generated successfully'
    });
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({ error: error.message });
  }
});

// Download Invoice/Receipt PDF
router.get('/pdf/download/:filename', auth, async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Extract payment ID from filename (format: receipt_PAYMENTID.pdf or invoice_PAYMENTID.pdf)
    const match = filename.match(/(receipt|invoice)_([a-f0-9]+)\.pdf/);
    
    if (!match) {
      return res.status(400).json({ error: 'Invalid filename format' });
    }

    const [, type, paymentId] = match;
    
    // Find the payment
    const payment = await Payment.findById(paymentId).populate('owner journalEntry');
    
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    // Generate PDF on-demand
    const pdfData = {
      receiptNumber: `REC-${payment._id}`,
      paymentDate: payment.date,
      customer: {
        name: payment.owner.name,
        email: payment.owner.email,
        apartmentNumber: 'N/A'
      },
      building: {
        name: 'Building Name'
      },
      amount: payment.totalAmount,
      currency: 'MAD',
      paymentMethod: payment.method,
      paymentReference: payment.reference,
      invoiceNumber: payment.reference,
      unionAgent: {
        name: 'Union Agent',
        address: 'Address',
        phone: 'Phone'
      },
      journalReference: payment.journalEntry?.reference || null
    };
    
    let cloudinaryResult;
    if (type === 'receipt') {
      cloudinaryResult = await pdfInvoiceService.generateReceipt(pdfData);
    } else {
      cloudinaryResult = await pdfInvoiceService.generateInvoice({
        ...pdfData,
        invoiceNumber: payment.reference,
        invoiceDate: payment.date,
        dueDate: payment.date,
        items: [{
          description: `Payment for building services`,
          quantity: 1,
          unitPrice: payment.totalAmount,
          total: payment.totalAmount
        }],
        subtotal: payment.totalAmount,
        tax: 0,
        total: payment.totalAmount
      });
    }
    
    if (!cloudinaryResult) {
      return res.status(503).json({ 
        error: 'PDF generation unavailable' 
      });
    }
    
    // Return the URL directly
    res.json({ url: cloudinaryResult.url });
  } catch (error) {
    console.error('Error downloading PDF:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get payment journal entry details
router.get('/:paymentId/journal', auth, async (req, res) => {
  try {
    const { paymentId } = req.params;
    const journalDetails = await paymentAccountingService.getPaymentJournalDetails(paymentId);

    if (!journalDetails) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    res.json(journalDetails);
  } catch (error) {
    console.error('Error fetching journal details:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create manual payment
router.post('/manual', auth, async (req, res) => {
  try {
    const { amount, method, reference, description } = req.body;

    if (!amount || !method) {
      return res.status(400).json({ error: 'Amount and payment method are required' });
    }

    // Create payment with status 'paid_manually'
    const payment = new Payment({
      owner: req.user.id,
      date: new Date(),
      totalAmount: amount,
      method: method,
      payment_type: 'manual',
      reference: reference || `MAN-${Date.now()}`,
      status: 'paid_manually'
    });

    await payment.save();

    res.status(201).json({
      success: true,
      payment,
      message: 'Manual payment created. Please upload bank receipt to confirm.'
    });
  } catch (error) {
    console.error('Error creating manual payment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload receipt and confirm manual payment
router.post('/:paymentId/upload-receipt', auth, upload.single('receipt'), async (req, res) => {
  try {
    const { paymentId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'No receipt file uploaded' });
    }

    if (!cloudinaryConfigured) {
      return res.status(503).json({ error: 'File upload service not configured' });
    }

    // Find payment
    const payment = await Payment.findById(paymentId).populate('owner');
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Check authorization
    if (req.user.role !== 'union_agent' && payment.owner._id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Upload receipt to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const fileExt = path.extname(req.file.originalname);
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'auto',
          folder: 'receipts',
          public_id: `receipt_${paymentId}_${Date.now()}${fileExt}`,
          type: 'upload'
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
    });

    // Create document record
    const document = new Document({
      title: `Bank Receipt - ${payment.reference}`,
      description: `Bank receipt for payment ${payment.reference}`,
      category: 'Financial',
      type: path.extname(req.file.originalname).substring(1).toUpperCase(),
      file_path: uploadResult.public_id,
      url: uploadResult.secure_url,
      resource_type: uploadResult.resource_type,
      size_bytes: req.file.size,
      mime_type: req.file.mimetype,
      access_level: 'agent_only',
      workflow_status: 'published',
      uploaded_by: req.user.id,
      uploaded_at: new Date(),
      version: 1,
      is_latest: true
    });

    await document.save();

    // Update payment status
    payment.status = 'paid_effectively';
    payment.receipt_document = document._id;
    payment.receipt_uploaded_at = new Date();
    await payment.save();

    // Create journal entry now that payment is confirmed
    const user = await User.findById(payment.owner).populate('apartments');
    const journalResult = await paymentAccountingService.createPaymentJournalEntry({
      paymentId: payment._id,
      amount: payment.totalAmount,
      paymentDate: payment.date,
      customerId: user._id,
      customerName: user.name,
      apartmentId: user.apartments?.[0]?._id,
      paymentMethod: payment.method,
      paymentReference: payment.reference,
      description: `Manual Payment - Receipt uploaded`
    });

    if (journalResult.success) {
      payment.journalEntry = journalResult.journalEntry._id;
      await payment.save();
    }

    res.json({
      success: true,
      payment,
      document,
      journalEntry: journalResult.success ? journalResult.journalEntry : null,
      message: 'Receipt uploaded and payment confirmed successfully'
    });
  } catch (error) {
    console.error('Error uploading receipt:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;



