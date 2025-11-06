import dotenv from 'dotenv';
dotenv.config();

import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGO_URI, {
  tls: true,
  // tlsAllowInvalidCertificates: true, // Uncomment if needed
  serverSelectionTimeoutMS: 10000,
});

async function test() {
  try {
    console.log('⏳ Attempting to connect...');
    await client.connect();
    const info = await client.db().admin().serverStatus();
    console.log('✅ Connected! MongoDB version:', info.version);
  } catch (err) {
    console.error('💥 Raw driver error:', err.message);
    console.error('Full error:', err);
  } finally {
    await client.close().catch(() => {});
  }
}

test();