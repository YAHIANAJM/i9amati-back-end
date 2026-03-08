import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
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
//testing
dotenv.config(); // Load environment variables

const app = express();

const allowedOrigins = [process.env.FRONTEND_URL];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.indexOf(origin) !== -1 ||
        origin.includes("localhost")
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    optionsSuccessStatus: 200,
  }),
);
// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

connectDB();

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }
      console.log(logLine);
    }
  });

  next();
});

// TEST LOG - Remove after debugging
app.use((req, res, next) => {
  if (req.path.includes("upload")) {
    console.log(`[HTTP] Incoming Request: ${req.method} ${req.path}`);
  }
  next();
});

// Register API routes
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

// Register API routes
// registerRoutes(app);

// Example route
app.get("/", (req, res) => {
  res.send("Iqamati API is running...");
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
  console.error(err);
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`📡 API endpoints available at http://localhost:${PORT}/api`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
});
