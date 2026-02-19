const dotenv = require("dotenv");

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function toBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return String(value).toLowerCase() === "true";
}

const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL || "",
  dbProvider: (process.env.DB_PROVIDER || "").toLowerCase(),
  sqlitePath: process.env.SQLITE_PATH || "db/fanjobo.db",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramAdminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID,
  telegramUseWebhook: toBool(process.env.TELEGRAM_USE_WEBHOOK, false),
  telegramWebhookDomain: process.env.TELEGRAM_WEBHOOK_DOMAIN,
  telegramWebhookPath: process.env.TELEGRAM_WEBHOOK_PATH,
  driveRootFolderId: required("DRIVE_ROOT_FOLDER_ID"),
  driveUniversityFolderId: process.env.DRIVE_UNIVERSITY_FOLDER_ID,
  driveIndustryFolderId: process.env.DRIVE_INDUSTRY_FOLDER_ID,
  googleServiceAccountJsonBase64: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64,
  googleServiceAccountJsonPath: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH,
  adminUserId: process.env.ADMIN_USER_ID || "",
  adminApiKey: process.env.ADMIN_API_KEY || ""
};

module.exports = { config };
