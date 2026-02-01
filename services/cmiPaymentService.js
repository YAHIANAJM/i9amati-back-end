import crypto from 'crypto';
import axios from 'axios';

/**
 * CMI Payment Gateway Integration Service
 * Supports Moroccan payment gateway with automatic debit functionality
 */
class CMIPaymentService {
  constructor() {
    // CMI Gateway Configuration (Morocco)
    this.merchantId = process.env.CMI_MERCHANT_ID || 'YOUR_MERCHANT_ID';
    this.storeKey = process.env.CMI_STORE_KEY || 'YOUR_STORE_KEY';
    this.apiKey = process.env.CMI_API_KEY || 'YOUR_API_KEY';
    this.gatewayUrl = process.env.CMI_GATEWAY_URL || 'https://testpayment.cmi.co.ma/fim/est3Dgate';
    this.callbackUrl = process.env.CMI_CALLBACK_URL || `${process.env.FRONTEND_URL}/payments/callback`;
    this.failUrl = process.env.CMI_FAIL_URL || `${process.env.FRONTEND_URL}/payments/failed`;
    this.okUrl = process.env.CMI_OK_URL || `${process.env.FRONTEND_URL}/payments/success`;
    this.mockMode = process.env.CMI_MOCK_MODE === 'true';
  }

  /**
   * Generate secure hash for CMI request
   */
  generateHash(data) {
    const hashString = `${this.merchantId}${data.orderId}${data.amount}${data.currency}${this.storeKey}`;
    return crypto.createHash('sha512').update(hashString).digest('base64');
  }

  /**
   * Create payment request
   * @param {Object} paymentData - Payment information
   * @returns {Object} Payment form data for CMI gateway
   */
  createPaymentRequest(paymentData) {
    const {
      orderId,
      amount,
      currency = 'MAD', // Moroccan Dirham
      customerEmail,
      customerName,
      description,
      billToName,
      billToStreet,
      billToCity,
      billToPostalCode,
      billToCountry = 'MA'
    } = paymentData;

    // If in mock mode, return mock gateway URL
    if (this.mockMode) {
      const mockUrl = `${process.env.FRONTEND_URL}/mock-cmi`;
      return {
        gatewayUrl: mockUrl,
        formData: {
          oid: orderId,
          amount: amount.toFixed(2),
          currency,
          email: customerEmail,
          BillToName: billToName || customerName,
          description: description || 'Payment for building services',
          // Mock mode flag
          mockMode: true
        }
      };
    }

    const requestData = {
      clientid: this.merchantId,
      amount: amount.toFixed(2),
      currency,
      oid: orderId, // Order ID
      okUrl: this.okUrl,
      failUrl: this.failUrl,
      callbackUrl: this.callbackUrl,
      trantype: 'PreAuth', // or 'Auth' for immediate capture
      storetype: '3d_pay_hosting',
      hashAlgorithm: 'ver3',
      encoding: 'UTF-8',
      
      // Customer information
      email: customerEmail,
      BillToName: billToName || customerName,
      BillToStreet1: billToStreet,
      BillToCity: billToCity,
      BillToPostalCode: billToPostalCode,
      BillToCountry: billToCountry,
      
      // Additional fields
      description: description || 'Payment for building services',
      
      // Language
      lang: 'ar' // Arabic for Morocco
    };

    // Generate hash
    requestData.hash = this.generateHash(requestData);

    return {
      gatewayUrl: this.gatewayUrl,
      formData: requestData
    };
  }

  /**
   * Setup automatic debit (Direct Debit)
   * @param {Object} debitData - Debit setup information
   */
  async setupAutomaticDebit(debitData) {
    const {
      customerId,
      accountNumber,
      bankCode,
      frequency, // 'monthly', 'quarterly', 'yearly'
      amount,
      startDate
    } = debitData;

    try {
      // CMI Direct Debit API call
      const response = await axios.post(`${this.gatewayUrl}/direct-debit/setup`, {
        merchantId: this.merchantId,
        customerId,
        accountNumber,
        bankCode,
        frequency,
        amount: amount.toFixed(2),
        startDate,
        apiKey: this.apiKey
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return {
        success: true,
        mandateId: response.data.mandateId,
        status: response.data.status,
        message: 'Direct debit setup successfully'
      };
    } catch (error) {
      console.error('CMI Direct Debit Setup Error:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Verify payment callback from CMI
   * @param {Object} callbackData - Data received from CMI
   */
  verifyPaymentCallback(callbackData) {
    const {
      TRANID,
      oid,
      amount,
      currency,
      HASHPARAMS,
      HASH
    } = callbackData;

    // Reconstruct hash to verify
    const hashString = `${this.merchantId}${oid}${amount}${currency}${this.storeKey}`;
    const calculatedHash = crypto.createHash('sha512').update(hashString).digest('base64');

    const isValid = calculatedHash === HASH;

    return {
      isValid,
      transactionId: TRANID,
      orderId: oid,
      amount: parseFloat(amount),
      currency
    };
  }

  /**
   * Capture pre-authorized payment
   * @param {string} transactionId - CMI transaction ID
   */
  async capturePayment(transactionId, amount) {
    try {
      const response = await axios.post(`${this.gatewayUrl}/capture`, {
        merchantId: this.merchantId,
        transactionId,
        amount: amount.toFixed(2),
        apiKey: this.apiKey
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return {
        success: true,
        captureId: response.data.captureId,
        status: response.data.status
      };
    } catch (error) {
      console.error('CMI Capture Error:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Refund payment
   * @param {string} transactionId - CMI transaction ID
   */
  async refundPayment(transactionId, amount) {
    try {
      const response = await axios.post(`${this.gatewayUrl}/refund`, {
        merchantId: this.merchantId,
        transactionId,
        amount: amount.toFixed(2),
        apiKey: this.apiKey
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return {
        success: true,
        refundId: response.data.refundId,
        status: response.data.status
      };
    } catch (error) {
      console.error('CMI Refund Error:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Check payment status
   * @param {string} orderId - Order ID
   */
  async checkPaymentStatus(orderId) {
    try {
      const response = await axios.get(`${this.gatewayUrl}/query`, {
        params: {
          merchantId: this.merchantId,
          orderId,
          apiKey: this.apiKey
        },
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return {
        success: true,
        status: response.data.status,
        transactionId: response.data.transactionId,
        amount: parseFloat(response.data.amount)
      };
    } catch (error) {
      console.error('CMI Status Check Error:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }
}

export default new CMIPaymentService();
