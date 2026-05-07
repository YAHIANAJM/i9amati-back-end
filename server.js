import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import connectDB from "./db.js";
import authRoutes from "./routes/auth.js";
import unionAgentRoutes from "./routes/unionAgent.js";
import serviceRoutes from "./routes/service.js";
import dashboardRoutes from "./routes/dashboard.js";
import alertsRoutes from "./routes/alerts.js";
import paymentsRoutes from "./routes/payments.js";
import communityFeedRoutes from "./routes/communityFeed.js";
import apartementRoutes from "./routes/Apartement.js";
import propertyOwnerRoutes from "./routes/Propertyowner.js";
import builldingRoutes from "./routes/Building.js";
import accountingRoutes from "./routes/accountingNew.js";
import moroccanAccountingRoutes from "./routes/moroccanAccounting.js";
import annexesRoutes from "./routes/annexes.js";
import exportsRoutes from "./routes/exports.js";
import documentRoutes from "./routes/documents.js";
import notificationRoutes from "./routes/notifications.js";

import votingRoutes from "./routes/voting.js";
import residenceRoutes from "./routes/Residence.js";

dotenv.config();

if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET environment variable is not set");
  process.exit(1);
}

const app = express();

// Required for Vercel / reverse proxies — enables correct IP and HTTPS detection
app.set('trust proxy', 1);

// ─── Security headers ────────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://i9amati-front-end.vercel.app",
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    const allowed = [
      process.env.FRONTEND_URL,
      "https://iqamati.ma",
      "https://www.iqamati.ma",
      "https://i9amati-front-end.vercel.app",
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:5174",
    ].filter(Boolean);

    if (allowed.includes(origin)) {
      return callback(null, true);
    }

    console.log("❌ Blocked CORS origin:", origin);

    // IMPORTANT: don't throw error (just reject)
    return callback(null, false);
  },

  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ─── Rate limiting ───────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts, please try again later" },
});

app.use(globalLimiter);
app.use("/api/auth/login", authLimiter);

// ─── Body & Cookie parsing ───────────────────────────────────────────────────
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

connectDB();

// ─── API routes ──────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/union", unionAgentRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/alerts", alertsRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/community", communityFeedRoutes);
app.use("/api/apartments", apartementRoutes);
app.use("/api/property-owners", propertyOwnerRoutes);
app.use("/api/buildings", builldingRoutes);
app.use("/api/accounting/moroccan", moroccanAccountingRoutes);
app.use("/api/annexes", annexesRoutes);
app.use("/api/exports", exportsRoutes);
app.use("/api/accounting", accountingRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/voting", votingRoutes);
app.use("/api/residences", residenceRoutes);

// ─── Health check ────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.send("Iqamati API is running..."));
app.get("/health", (req, res) => res.json({ status: "OK", timestamp: new Date().toISOString() }));

// ─── Global error handler ────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  // Never expose raw error messages in production
  const message =
    process.env.NODE_ENV === "production"
      ? status >= 500 ? "Internal Server Error" : err.message
      : err.message || "Internal Server Error";
  res.status(status).json({ message });
  if (status >= 500) console.error(err);
});

// ─── Start server ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT} [${process.env.NODE_ENV}]`);
});
