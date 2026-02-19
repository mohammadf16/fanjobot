const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
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

function resolveUniversityFolderByKind(contentKind) {
  const map = {
    course: config.driveUniversityCourseFolderId,
    professor: config.driveUniversityProfessorFolderId,
    note: config.driveUniversityNoteFolderId,
    book: config.driveUniversityBookFolderId,
    resource: config.driveUniversityResourceFolderId,
    "exam-tip": config.driveUniversityExamTipFolderId
  };

  return map[String(contentKind || "").trim()] || undefined;
}

function resolveParentFolder(contentType, contentKind) {
  if (contentType === "university" && config.driveUniversityFolderId) {
    return resolveUniversityFolderByKind(contentKind) || config.driveUniversityFolderId;
  }

  if (contentType === "university") {
    return resolveUniversityFolderByKind(contentKind) || config.driveRootFolderId;
  }

  if (contentType === "industry" && config.driveIndustryFolderId) {
    return config.driveIndustryFolderId;
  }

  return config.driveRootFolderId;
}

function normalizeFolderSegment(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  return raw
    .replace(/[\\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 100) || null;
}

function normalizeFolderSegments(segments) {
  if (!Array.isArray(segments)) return [];
  return segments.map(normalizeFolderSegment).filter(Boolean);
}

function escapeDriveQueryValue(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
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
      const authenticatedAccount = await resolveAuthenticatedDriveAccount(drive);
      throw new Error(
        `Drive folder not found or inaccessible: ${folderId}. Authenticated account: ${authenticatedAccount}. Share folder with this account and verify folder id.`
      );
    }
    throw error;
  }
}

async function findChildFolder(drive, parentFolderId, name) {
  const queryValue = escapeDriveQueryValue(name);
  const parentValue = escapeDriveQueryValue(parentFolderId);

  const listRes = await drive.files.list({
    q: `'${parentValue}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${queryValue}' and trashed = false`,
    fields: "files(id,name)",
    pageSize: 5,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });

  return listRes?.data?.files?.[0] || null;
}

async function createChildFolder(drive, parentFolderId, name) {
  const createRes = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId]
    },
    fields: "id,name",
    supportsAllDrives: true
  });

  return createRes?.data || null;
}

async function ensureNestedFolderPath(drive, parentFolderId, segments) {
  const normalizedSegments = normalizeFolderSegments(segments);
  if (!normalizedSegments.length) return parentFolderId;

  let currentParentId = parentFolderId;
  for (const segment of normalizedSegments) {
    const existing = await findChildFolder(drive, currentParentId, segment);
    if (existing?.id) {
      currentParentId = existing.id;
      continue;
    }

    const created = await createChildFolder(drive, currentParentId, segment);
    if (!created?.id) {
      throw new Error(`Failed to create Drive folder segment: ${segment}`);
    }
    currentParentId = created.id;
  }

  return currentParentId;
}

async function resolveAuthenticatedDriveAccount(drive) {
  try {
    const about = await drive.about.get({
      fields: "user(emailAddress,displayName)",
      supportsAllDrives: true
    });
    const email = about?.data?.user?.emailAddress;
    if (email) return email;
    const name = about?.data?.user?.displayName;
    if (name) return name;
    return "unknown";
  } catch (error) {
    return "unknown";
  }
}

async function uploadBufferToDrive({
  fileBuffer,
  fileName,
  mimeType,
  contentType,
  contentKind,
  folderPathSegments = [],
  makePublic = false
}) {
  const drive = await getDriveClient();
  const baseParentFolderId = resolveParentFolder(contentType, contentKind);
  await ensureParentFolderAccessible(drive, baseParentFolderId);
  const finalParentFolderId = await ensureNestedFolderPath(drive, baseParentFolderId, folderPathSegments);

  const createRes = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [finalParentFolderId]
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
    parentFolderId: finalParentFolderId,
    webViewLink: metadata.data.webViewLink,
    webContentLink: metadata.data.webContentLink
  };
}

async function testDriveReadWrite({ folderId }) {
  const drive = await getDriveClient();
  const targetFolderId = String(folderId || "").trim() || config.driveRootFolderId;

  await ensureParentFolderAccessible(drive, targetFolderId);

  const createdAt = new Date();
  const testFileName = `fanjobo-drive-check-${createdAt.getTime()}.txt`;
  const content = `drive-check:${createdAt.toISOString()}`;

  const created = await drive.files.create({
    requestBody: {
      name: testFileName,
      parents: [targetFolderId]
    },
    media: {
      mimeType: "text/plain",
      body: Readable.from(Buffer.from(content, "utf8"))
    },
    supportsAllDrives: true,
    fields: "id,name,parents,createdTime"
  });

  const createdFileId = created?.data?.id;
  if (!createdFileId) {
    throw new Error("Drive write test failed: file id missing.");
  }

  let fetched;
  try {
    fetched = await drive.files.get({
      fileId: createdFileId,
      fields: "id,name,mimeType,size,parents,createdTime,modifiedTime",
      supportsAllDrives: true
    });
  } finally {
    try {
      await drive.files.delete({
        fileId: createdFileId,
        supportsAllDrives: true
      });
    } catch (_cleanupError) {
      // Ignore cleanup failure; test result should still include read/write status.
    }
  }

  return {
    folderId: targetFolderId,
    file: fetched?.data || null
  };
}

async function downloadDriveFileToPath({ fileId, targetPath }) {
  const drive = await getDriveClient();
  const normalizedFileId = String(fileId || "").trim();
  const normalizedTargetPath = String(targetPath || "").trim();

  if (!normalizedFileId) {
    throw new Error("downloadDriveFileToPath requires fileId");
  }
  if (!normalizedTargetPath) {
    throw new Error("downloadDriveFileToPath requires targetPath");
  }

  await fs.promises.mkdir(path.dirname(normalizedTargetPath), { recursive: true });

  const metadataRes = await drive.files.get({
    fileId: normalizedFileId,
    fields: "id,name,mimeType",
    supportsAllDrives: true
  });

  const downloadRes = await drive.files.get(
    {
      fileId: normalizedFileId,
      alt: "media",
      supportsAllDrives: true
    },
    {
      responseType: "stream"
    }
  );

  const tempPath = `${normalizedTargetPath}.part-${Date.now()}`;

  try {
    await pipeline(downloadRes.data, fs.createWriteStream(tempPath));
    await fs.promises.rename(tempPath, normalizedTargetPath);
  } catch (error) {
    try {
      await fs.promises.unlink(tempPath);
    } catch (_cleanupError) {
      // ignore
    }
    throw error;
  }

  return {
    fileId: metadataRes?.data?.id || normalizedFileId,
    fileName: metadataRes?.data?.name || null,
    mimeType: metadataRes?.data?.mimeType || null,
    localPath: normalizedTargetPath
  };
}

module.exports = {
  uploadBufferToDrive,
  testDriveReadWrite,
  downloadDriveFileToPath
};
