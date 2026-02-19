const fs = require("fs");
const { Readable } = require("stream");
const { google } = require("googleapis");
const { config } = require("../config");

const scope = ["https://www.googleapis.com/auth/drive"];

function parseServiceAccount() {
  if (config.googleServiceAccountJsonPath) {
    try {
      const jsonText = fs.readFileSync(config.googleServiceAccountJsonPath, "utf8");
      const credentials = JSON.parse(jsonText);
      if (!credentials.client_email || !credentials.private_key) {
        throw new Error("Missing client_email/private_key in service account JSON.");
      }
      return credentials;
    } catch (error) {
      throw new Error("Invalid GOOGLE_SERVICE_ACCOUNT_JSON_PATH. File must be valid service-account JSON.");
    }
  }

  const raw = (config.googleServiceAccountJsonBase64 || "").trim();
  if (!raw) {
    throw new Error(
      "Missing Google credentials. Set GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 or GOOGLE_SERVICE_ACCOUNT_JSON_PATH."
    );
  }

  try {
    // Allow direct JSON as well, but base64 is the recommended env format.
    const jsonText = raw.startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");

    const credentials = JSON.parse(jsonText);
    if (!credentials.client_email || !credentials.private_key) {
      throw new Error("Missing client_email/private_key in service account JSON.");
    }

    return credentials;
  } catch (error) {
    throw new Error(
      "Invalid GOOGLE_SERVICE_ACCOUNT_JSON_BASE64. Use a single-line base64-encoded service-account JSON."
    );
  }
}

function createDriveClient() {
  const credentials = parseServiceAccount();
  const auth = new google.auth.JWT(
    credentials.client_email,
    undefined,
    credentials.private_key,
    scope
  );

  return google.drive({ version: "v3", auth });
}

let driveClient = null;

function getDriveClient() {
  if (!driveClient) {
    driveClient = createDriveClient();
  }

  return driveClient;
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

async function uploadBufferToDrive({
  fileBuffer,
  fileName,
  mimeType,
  contentType,
  makePublic = false
}) {
  const drive = getDriveClient();
  const parentFolderId = resolveParentFolder(contentType);

  const createRes = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [parentFolderId]
    },
    media: {
      mimeType,
      body: Readable.from(Buffer.from(fileBuffer))
    },
    fields: "id,name,webViewLink"
  });

  const fileId = createRes.data.id;

  if (makePublic) {
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: "reader",
        type: "anyone"
      }
    });
  }

  const metadata = await drive.files.get({
    fileId,
    fields: "id,name,webViewLink,webContentLink"
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
