import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGO_URI);

const JE = mongoose.model('JournalEntry', new mongoose.Schema({}, { strict: false, collection: 'journalentries' }));
const GL = mongoose.model('GeneralLedger', new mongoose.Schema({}, { strict: false, collection: 'generalledgers' }));

const jeCount = await JE.countDocuments();
const glCount = await GL.countDocuments();
const jeSample = await JE.findOne().lean();
const glSample = await GL.findOne().lean();

console.log('=== JournalEntry ===');
console.log('Count:', jeCount);
console.log('Keys:', jeSample ? Object.keys(jeSample).join(', ') : 'NO DOCS');
console.log('Date:', jeSample?.date);
console.log('Has residence_id:', !!jeSample?.residence_id);

console.log('\n=== GeneralLedger ===');
console.log('Count:', glCount);
console.log('Keys:', glSample ? Object.keys(glSample).join(', ') : 'NO DOCS');
console.log('Date:', glSample?.date);
console.log('fiscalYear:', glSample?.fiscalYear);
console.log('residence_id:', glSample?.residence_id);

await mongoose.disconnect();
