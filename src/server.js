const express = require("express");
const cors = require("cors");
const { config } = require("./config");
const { closeDb } = require("./db");
const { attachBot } = require("./bot");
const { initConsoleCapture, logInfo, logError } = require("./services/logger");

const healthRoutes = require("./routes/health");
const authRoutes = require("./routes/auth");
const profileRoutes = require("./routes/profile");
const universityRoutes = require("./routes/university");
const universityStudentRoutes = require("./routes/universityStudent");
const industryRoutes = require("./routes/industry");
const industryStudentRoutes = require("./routes/industryStudent");
const recommendationRoutes = require("./routes/recommendations");
const roadmapRoutes = require("./routes/roadmap");
const fileRoutes = require("./routes/files");
const supportRoutes = require("./routes/support");
const adminPanelRoutes = require("./routes/adminPanel");
const adminUiRoutes = require("./routes/adminUi");
const miniappRoutes = require("./routes/miniapp");
const communitySubmissionsRoutes = require("./routes/communitySubmissions");
const errorHandler = require("./routes/error");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

let botRuntime;
initConsoleCapture();
logInfo("Server bootstrap started");

async function bootstrap() {
  app.use("/", healthRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/profile", profileRoutes);
  app.use("/api/university", universityRoutes);
  app.use("/api/university/student", universityStudentRoutes);
  app.use("/api/industry", industryRoutes);
  app.use("/api/industry/student", industryStudentRoutes);
  app.use("/api/recommendations", recommendationRoutes);
  app.use("/api/roadmap", roadmapRoutes);
  app.use("/api/files", fileRoutes);
  app.use("/api/support", supportRoutes);
  app.use("/api/miniapp", miniappRoutes);
  app.use("/api/admin", adminPanelRoutes);
  app.use("/api/community/submissions", communitySubmissionsRoutes);
  app.use("/", adminUiRoutes);

  app.use(errorHandler);

  try {
    botRuntime = await attachBot(app);
    if (botRuntime?.mode) {
      logInfo("Bot attached", { mode: botRuntime.mode, webhookPath: botRuntime.webhookPath || null });
    }
  } catch (error) {
    botRuntime = null;
    console.error("Telegram bot startup failed. API will continue without bot.");
    console.error(error?.message || error);
    logError("Telegram bot startup failed", { error: error?.message || String(error) });
  }

  app.listen(config.port, () => {
    console.log(`Fanjobo API listening on ${config.port}`);
    logInfo("HTTP server listening", { port: config.port });
    if (botRuntime?.mode === "webhook") {
      console.log(`Telegram webhook path: ${botRuntime.webhookPath}`);
    }
  });
}

bootstrap().catch((error) => {
  console.error("Failed to bootstrap app", error);
  logError("Failed to bootstrap app", { error: error?.message || String(error) });
  process.exit(1);
});

async function gracefulShutdown() {
  console.log("Shutting down...");
  logInfo("Graceful shutdown requested");
  if (botRuntime?.bot) {
    botRuntime.bot.stop();
  }
  await closeDb();
  process.exit(0);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
