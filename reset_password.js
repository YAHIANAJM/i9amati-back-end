// backend/reset_password.js
// Usage (from project root):
// node backend/reset_password.js --email=ac1003.agent@example.com --password=AC1003pass!

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "./models/User.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/iqamati";

function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach((arg) => {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  });
  return args;
}

async function main() {
  const args = parseArgs();
  const email = args.email || process.env.EMAIL;
  const password = args.password || process.env.NEW_PASSWORD;
  if (!email || !password) {
    console.error(
      "Usage: node backend/reset_password.js --email=you@example.com --password=NewPass123"
    );
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.error("User not found for email:", email);
      process.exit(2);
    }
    const password_hash = await bcrypt.hash(password, 10);
    user.password_hash = password_hash;
    await user.save();
    console.log(`Password for ${email} updated successfully.`);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(3);
  } finally {
    await mongoose.disconnect();
  }
}

main();
