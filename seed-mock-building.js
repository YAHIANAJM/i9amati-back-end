import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import User from './models/User.js';
import UnionAgent from './models/UnionAgent.js';
import Apartment from './models/Apartment.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

async function seedMockBuilding() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/iqamati';
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  // Minimal cleanup for this mock to avoid duplicates by building name
  const BUILDING_NAME = 'IM-M1';

  try {
    // Remove any apartments that match this building to start fresh
    await Apartment.deleteMany({ building_name: BUILDING_NAME });

    // Find or create a union agent (use existing first agent if present)
    let agent = await UnionAgent.findOne();
    let agentUser = null;
    if (!agent) {
      // create union agent user
      agentUser = new User({ name: 'AC Mock Agent', email: 'ac.mock.agent@example.com', password_hash: await bcrypt.hash('AgentPass123', 10), role: 'union_agent' });
      await agentUser.save();
      agent = await new UnionAgent({ email: agentUser.email, prefix: 'AC', user: agentUser._id }).save();
    } else {
      agentUser = await User.findById(agent.user).catch(() => null);
    }

    // Helper to generate next code
    const getNextApartmentCode = (prefix, lastCode) => {
      let nextNum = 100;
      if (lastCode) {
        const lastNum = parseInt(lastCode.replace(prefix, ''));
        if (!isNaN(lastNum)) nextNum = lastNum + 1;
      }
      return `${prefix}${nextNum}`;
    };

    const lastApt = await Apartment.find({ agent: agent._id }).sort({ code: -1 }).limit(1);
    let nextCode = getNextApartmentCode(agent.prefix, lastApt[0]?.code);

    const aptNumbers = ['A101', 'A102', 'A103'];

    for (const num of aptNumbers) {
      const code = nextCode;
      // advance nextCode numeric portion for next iteration
      const numeric = parseInt(code.replace(agent.prefix, '')) || 100;
      nextCode = `${agent.prefix}${numeric + 1}`;

      const apt = new Apartment({
        code,
        name: `${BUILDING_NAME} ${num}`,
        address: `${num} ${BUILDING_NAME} Street`,
        type: 'Residential',
        building_name: BUILDING_NAME,
        apartment_number: num,
        owners: [],
        residents: [],
        agent: agent._id
      });
      await apt.save();

      // create 5 unique owners for this apartment
      for (let i = 1; i <= 5; i++) {
        const first = `Owner${num.replace(/[^a-zA-Z0-9]/g, '')}`;
        const last = `Mock${i}`;
        const name = `${first} ${last}`;
        const username = `${first.toLowerCase()}${i}${code.toLowerCase()}`;
        const email = `${first.toLowerCase()}.${last.toLowerCase()}.${code.toLowerCase()}@mockowners.example`;
        const rawPass = `P@ss-${code}-${i}`;
        const password_hash = await bcrypt.hash(rawPass, 10);
        const user = new User({ name, username, email, password_hash, role: 'property_owner', apartment: apt._id, status: 'ACTIVE' });
        await user.save();
        apt.owners.push(user._id);
      }

      await apt.save();
      agent.apartments = agent.apartments || [];
      agent.apartments.push(apt._id);
      await agent.save();

      console.log(`Created apartment ${apt.name} with 5 owners`);
    }

    console.log('Mock building seed completed.');
  } catch (e) {
    console.error('Seeding failed:', e);
  } finally {
    await mongoose.disconnect();
  }
}

seedMockBuilding().catch(e => { console.error(e); process.exit(1); });
