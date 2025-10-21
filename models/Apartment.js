import mongoose from 'mongoose';


const apartmentSchema = new mongoose.Schema({
	code: { type: String, required: true, unique: true }, // e.g. AC100
	// Old fields retained for backward-compatibility
	name: { type: String, required: false },
	// Address for the apartment/building (required)
	address: { type: String, required: true },
	// Type limited to specific choices
	type: { type: String, enum: ['Residential', 'Studio', 'Loft', 'Penthouse'], default: 'Residential' },
	// New fields requested
	building_name: { type: String }, // e.g. IM-M1
	apartment_number: { type: String }, // e.g. A23
	owner_first_name: { type: String },
	owner_last_name: { type: String }, 
	
	real_estate_drawing: { type: String },
	apartment_space: { type: Number },
	common_parts_space: { type: Number },
	// Link to the main owner user (user_id / FK)
	owner_user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

	owners: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // property owners (array)
	residents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
	agent: { type: mongoose.Schema.Types.ObjectId, ref: 'UnionAgent', required: true }
});

export default mongoose.model('Apartment', apartmentSchema);
