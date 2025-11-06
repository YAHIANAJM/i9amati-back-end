// models/Building.js
import mongoose from 'mongoose';

const BuildingSchema = new mongoose.Schema({
  // Existing
  name: { type: String, required: true },
  estateFeeNumber: { type: String }, // optional

  // New fields from the form (all optional unless specified)
  address: { type: String }, // عنوان الإقامة
  propertyLandArea: { type: Number }, // مساحة أرض العقار (m²)
  numberOfBuildings: { type: Number }, // عدد العمارات (might be 1 if this doc = 1 building)
  averageUnitsPerBuilding: { type: Number }, // متوسط الوحدات لكل عمارة
  averageFloorsPerBuilding: { type: Number }, // متوسط عدد الطوابق
  totalUnits: { type: Number }, // إجمالي عدد الشقق / الوحدات
  propertyPlanNumber: { type: String }, // رقم الرسم العقاري الأصلي
  hasGarage: { type: Boolean, default: false }, // هل تحتوي على مرآب؟
  hasSwimmingPool: { type: Boolean, default: false }, // هل تحتوي على مسبح؟
  sharedParts: { type: String }, // أجزاء مشتركة مع إقامة أخرى؟ (text: e.g., "None", or description)
  description: { type: String }, // وصف الإقامة

  // References
  agent: { 
    name: String, // اسم الوكيل (السلنديك)
    company: String // الشركة (للسلنديك)
  },
  residenceManager: { type: String }, // مدير الإقامة
  mainOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner' }, // المالك الرئيسي (مرجع)

  // Relationships
  apartments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Apartment' }],

  // Optional: residenceCode if needed as unique ID
  residenceCode: { type: String, unique: true } // رقم العقار / الإقامة (الكود)
}, { timestamps: true });

export default mongoose.model('Building', BuildingSchema);