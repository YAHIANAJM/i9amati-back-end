// backend/routes/auth.js
// Basic Express authentication routes template

import express from "express";
const router = express.Router();

// Example login route

import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    // Create JWT token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || "secret",
      { expiresIn: "1d" }
    );
    // Return user info (excluding password_hash)
    const { password_hash, ...userData } = user.toObject();
    res.json({ token, user: userData });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Example register route
router.post("/register", (req, res) => {
  // TODO: Implement registration logic
  res.send("Register route");
});

export default router;
