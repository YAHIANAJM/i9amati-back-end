import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Apartment from './models/Apartment.js';
import User from './models/User.js';

dotenv.config();

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/iqamati';

async function assignRepresentativeUsers() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find apartments without representative users but with embedded owners
    const apartments = await Apartment.find({
      representativeUser: { $exists: false },
      owners: { $exists: true, $ne: [] }
    });

    console.log(`\n📊 Found ${apartments.length} apartments needing representative users\n`);

    let assigned = 0;
    let created = 0;
    let errors = 0;

    for (const apartment of apartments) {
      try {
        // Get the first owner from embedded owners array (or the representative if marked)
        let firstOwner = apartment.owners.find(o => o.isRepresentative) || apartment.owners[0];
        
        if (!firstOwner || !firstOwner.email) {
          console.log(`⚠️  Apartment ${apartment.unit_code || apartment.main_plot_number || apartment._id} has no valid owner data`);
          errors++;
          continue;
        }

        const ownerFullName = `${firstOwner.firstName} ${firstOwner.lastName}`;
        console.log(`\n🏢 Processing apartment: ${apartment.unit_code || apartment.main_plot_number}`);
        console.log(`   Owner: ${ownerFullName}`);
        console.log(`   Email: ${firstOwner.email}`);

        // Try to find existing user by email
        let user = await User.findOne({ email: firstOwner.email });
        
        if (user) {
          console.log(`   ✅ Found existing user: ${user.name || user.email}`);
        } else if (firstOwner.phone) {
          // Try by phone as fallback
          user = await User.findOne({ phone: firstOwner.phone });
          if (user) {
            console.log(`   ✅ Found existing user by phone: ${user.phone}`);
          }
        }

        // If no user found, create one
        if (!user) {
          console.log(`   🆕 Creating new user account...`);
          
          user = new User({
            name: ownerFullName,
            email: firstOwner.email,
            phone: firstOwner.phone || null,
            role: 'property_owner',
            password: 'ChangeMe123!' // Default password - should be changed
          });

          await user.save();
          console.log(`   ✅ Created user: ${user.email}`);
          created++;
        }

        // Assign user as representative
        apartment.representativeUser = user._id;
        await apartment.save();
        
        console.log(`   ✅ Assigned ${ownerFullName} as representative`);
        assigned++;

      } catch (err) {
        console.error(`   ❌ Error processing apartment ${apartment.unit_code || apartment.main_plot_number}:`, err.message);
        errors++;
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 Summary:`);
    console.log(`   ✅ Apartments processed: ${assigned}`);
    console.log(`   🆕 Users created: ${created}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`${'='.repeat(60)}\n`);

    // Show final status
    const apartmentsWithRep = await Apartment.find({ representativeUser: { $exists: true, $ne: null } });
    console.log(`✅ ${apartmentsWithRep.length} apartments now have representative users\n`);

    if (created > 0) {
      console.log(`⚠️  Note: ${created} new user(s) created with default password "ChangeMe123!"`);
      console.log(`   Users should change their passwords on first login.\n`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Disconnected from MongoDB');
  }
}

assignRepresentativeUsers();
