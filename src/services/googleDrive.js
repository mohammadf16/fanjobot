const fs = require("fs");
const { Readable } = require("stream");
const { google } = require("googleapis");
const { config } = require("../config");

const scope = ["https://www.googleapis.com/auth/drive"];

function hasOauthCredentials() {
  return Boolean(
    config.googleOauthClientId &&
    config.googleOauthClientSecret &&
    config.googleOauthRefreshToken
  );
}

function assertOauthConfigIfPartiallySet() {
  const oauthVars = [
    config.googleOauthClientId,
    config.googleOauthClientSecret,
    config.googleOauthRefreshToken
  ];
  const hasAny = oauthVars.some(Boolean);
  const hasAll = oauthVars.every(Boolean);

  if (hasAny && !hasAll) {
    throw new Error(
      "Incomplete OAuth config. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REFRESH_TOKEN."
    );
  }
}

function createOauthClient() {
  const auth = new google.auth.OAuth2(
    config.googleOauthClientId,
    config.googleOauthClientSecret
  );
  auth.setCredentials({
    refresh_token: config.googleOauthRefreshToken
  });
  return auth;
}

function parseServiceAccount() {
  if (config.googleServiceAccountJsonPath) {
    try {
      const jsonText = fs.readFileSync(config.googleServiceAccountJsonPath, "utf8");
      const credentials = JSON.parse(jsonText);
      return normalizeServiceAccountCredentials(credentials);
    } catch (error) {
      throw new Error("Invalid GOOGLE_SERVICE_ACCOUNT_JSON_PATH. File must be valid service-account JSON.");
    }
  }

  const raw = (config.googleServiceAccountJsonBase64 || "").trim();
  if (!raw) {
    throw new Error(
      "Missing Google credentials. Set OAuth (GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN) or service account (GOOGLE_SERVICE_ACCOUNT_JSON_BASE64/GOOGLE_SERVICE_ACCOUNT_JSON_PATH)."
    );
  }

  try {
    // Allow direct JSON as well, but base64 is the recommended env format.
    const jsonText = raw.startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");

    const credentials = JSON.parse(jsonText);
    return normalizeServiceAccountCredentials(credentials);
  } catch (error) {
    throw new Error(
      "Invalid GOOGLE_SERVICE_ACCOUNT_JSON_BASE64. Use a single-line base64-encoded service-account JSON."
    );
  }
}

function normalizeServiceAccountCredentials(credentials) {
  const normalized = { ...(credentials || {}) };

  if (typeof normalized.private_key === "string") {
    normalized.private_key = normalized.private_key
      .replace(/^"+|"+$/g, "")
      .replace(/\\n/g, "\n")
      .trim();
  }

  if (typeof normalized.client_email === "string") {
    normalized.client_email = normalized.client_email.trim();
  }

  if (normalized.type && normalized.type !== "service_account") {
    throw new Error("Invalid Google credentials type. Expected service_account JSON.");
  }

  if (!normalized.client_email || !normalized.private_key) {
    throw new Error("Missing client_email/private_key in service account JSON.");
  }

  return normalized;
}

let driveClientPromise = null;

async function getDriveClient() {
  if (!driveClientPromise) {
    driveClientPromise = (async () => {
      assertOauthConfigIfPartiallySet();

      if (hasOauthCredentials()) {
        const oauthClient = createOauthClient();
        return google.drive({ version: "v3", auth: oauthClient });
      }

      const credentials = parseServiceAccount();
      const auth = new google.auth.GoogleAuth({ credentials, scopes: scope });
      const client = await auth.getClient();
      return google.drive({ version: "v3", auth: client });
    })().catch((error) => {
      driveClientPromise = null;
      throw error;
    });
  }

  return driveClientPromise;
}

function resolveParentFolder(contentType) {
  if (contentType === "university" && config.driveUniversityFolderId) {
    return config.driveUniversityFolderId;
  }

  if (contentType === "industry" && config.driveIndustryFolderId) {
    return config.driveIndustryFolderId;
  }

  return config.driveRootFolderId;
}

async function ensureParentFolderAccessible(drive, folderId) {
  if (!folderId) {
    throw new Error("Drive folder id is missing. Set DRIVE_ROOT_FOLDER_ID (or section folder id).");
  }

  try {
    await drive.files.get({
      fileId: folderId,
      fields: "id,name,mimeType",
      supportsAllDrives: true
    });
  } catch (error) {
    const status = error?.code || error?.response?.status;
    if (status === 404) {
      throw new Error(
        `Drive folder not found or inaccessible: ${folderId}. Share folder with the authenticated Google account and verify folder id.`
      );
    }
    throw error;
  }
}

async function uploadBufferToDrive({
  fileBuffer,
  fileName,
  mimeType,
  contentType,
  makePublic = false
}) {
  const drive = await getDriveClient();
  const parentFolderId = resolveParentFolder(contentType);
  await ensureParentFolderAccessible(drive, parentFolderId);

  const createRes = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [parentFolderId]
    },
    media: {
      mimeType,
      body: Readable.from(Buffer.from(fileBuffer))
    },
    supportsAllDrives: true,
    fields: "id,name,webViewLink"
  });

  const fileId = createRes.data.id;

  if (makePublic) {
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: "reader",
        type: "anyone"
      },
      supportsAllDrives: true
    });
  }

  const metadata = await drive.files.get({
    fileId,
    fields: "id,name,webViewLink,webContentLink",
    supportsAllDrives: true
  });

  return {
    fileId: metadata.data.id,
    fileName: metadata.data.name,
    webViewLink: metadata.data.webViewLink,
    webContentLink: metadata.data.webContentLink
  };
}

module.exports = {
  uploadBufferToDrive
};
