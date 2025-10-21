// backend/seed-extended.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// All models are ESM now
import User from './models/User.js';
import UnionAgent from './models/UnionAgent.js';
import Apartment from './models/Apartment.js';
import Financial from './models/Financial.js';
import Meeting from './models/Meeting.js';
import Post from './models/Post.js';
import Alert from './models/Alert.js';
import Document from './models/Document.js';
import Residence from './models/Residence.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

async function seedExtended() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/iqamati';
  await mongoose.connect(uri);

  // Cleanup minimal sets to avoid duplications
  await User.deleteMany({});
  await UnionAgent.deleteMany({});
  await Apartment.deleteMany({});
  await Financial.deleteMany({});
  await Meeting.deleteMany({});
  await Post.deleteMany({});
  await Alert.deleteMany({});
  await Document.deleteMany({});
  await Residence.deleteMany({});

  // Create a residence
  const residence = await new Residence({
    name: 'Residential Complex A',
    address: '123 Main Street',
    city: 'Your City'
  }).save();

  // Create union agent
  const agentUser = new User({
    name: 'AC1003 Agent',
    email: 'ac1003.agent@example.com',
    password_hash: await bcrypt.hash('AC1003pass!', 10),
    role: 'union_agent'
  });
  await agentUser.save();
  const agent = await new UnionAgent({ email: agentUser.email, prefix: 'AC', user: agentUser._id }).save();

  // Create apartment
  const apt = await new Apartment({
    code: 'AC1003',
    name: 'Apartment AC1003',
    address: 'Main St 1',
    type: 'Residential',
    owners: [],
    residents: [],
    agent: agent._id
  }).save();

  // Create property owner
  const ownerUser = await new User({
    name: 'John Owner',
    username: 'johnownerAC1003',
    email: 'john.owner@example.com',
    password_hash: await bcrypt.hash('JohnOwnerPass1', 10),
    role: 'property_owner',
    apartment: apt._id
  }).save();
  apt.owners.push(ownerUser._id);
  await apt.save();

  // Payments (Financial) mirroring mockPayments
  const payments = [
    { date: '2024-11-01', description: 'Monthly Charges', amount: 320.00, status: 'PAID' },
    { date: '2024-10-01', description: 'Special Assessment', amount: 150.00, status: 'PAID' },
    { date: '2024-09-01', description: 'Monthly Charges', amount: 320.00, status: 'PENDING' }
  ];
  for (const p of payments) {
    await new Financial({
      apartment_id: apt._id,
      owner_id: ownerUser._id,
      type: 'PAYMENT',
      description: p.description,
      amount: p.amount,
      currency: 'EUR',
      due_date: new Date(p.date),
      status: p.status
    }).save();
  }

  // Meetings
  await new Meeting({
    residence_id: residence._id,
    type: 'ORDINARY',
    agenda: 'Annual General Meeting',
    scheduled_at: new Date('2024-12-15T19:00:00Z'),
    status: 'PLANNED',
    votes: []
  }).save();

  // Posts (Social)
  await new Post({
    residence_id: residence._id,
    user_id: agentUser._id,
    content: 'Reminder: Please keep noise levels down after 10 PM.',
    comments: []
  }).save();

  // Alerts
  await Promise.all([
    new Alert({
      residence_id: residence._id,
      title: 'Elevator Maintenance',
      category: 'MAINTENANCE',
      priority: 'medium',
      message: 'Elevator maintenance scheduled for Friday',
      status: 'NEW',
      isRead: false,
      actionRequired: true
    }).save(),
    new Alert({
      residence_id: residence._id,
      title: 'Overdue Payment',
      category: 'FINANCIAL',
      priority: 'high',
      message: 'Unit 3B payment overdue',
      status: 'NEW',
      isRead: false,
      actionRequired: true
    }).save(),
    new Alert({
      residence_id: residence._id,
      title: 'Garden Update',
      category: 'SOCIAL',
      priority: 'low',
      message: 'Garden maintenance completed',
      status: 'RESOLVED',
      isRead: true,
      actionRequired: false,
      resolved_at: new Date()
    }).save()
  ]);

  // Documents
  await new Document({
    residence_id: residence._id,
    title: 'Building Regulations 2024',
    type: 'PDF',
    category: 'Legal',
    uploaded_at: new Date('2024-11-15'),
    size_bytes: 2400000,
    url: '#'
  }).save();

  console.log('Extended seed completed.');
  await mongoose.disconnect();
}

seedExtended().catch((e) => {
  console.error(e);
  process.exit(1);
});


