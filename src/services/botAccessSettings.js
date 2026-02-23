const { executeSqlScript, getDbProvider, query } = require("../db");

const DEFAULT_CHANNEL_USERNAME = "@Industry_talk";
let ensurePromise = null;

const POSTGRES_SQL = `
CREATE TABLE IF NOT EXISTS bot_access_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  membership_required BOOLEAN NOT NULL DEFAULT TRUE,
  channel_username TEXT NOT NULL DEFAULT '@Industry_talk',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO bot_access_settings (id, membership_required, channel_username, updated_at)
VALUES (1, TRUE, '@Industry_talk', NOW())
ON CONFLICT (id) DO NOTHING;
`;

const SQLITE_SQL = `
CREATE TABLE IF NOT EXISTS bot_access_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  membership_required INTEGER NOT NULL DEFAULT 1,
  channel_username TEXT NOT NULL DEFAULT '@Industry_talk',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO bot_access_settings (id, membership_required, channel_username, updated_at)
VALUES (1, 1, '@Industry_talk', CURRENT_TIMESTAMP);
`;

function toBoolean(raw, fallback = false) {
  if (raw === undefined || raw === null || raw === "") return fallback;
  if (raw === true || raw === false) return raw;
  const text = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
}

function normalizeChannelUsername(rawValue) {
  if (rawValue === undefined || rawValue === null) return null;
  let value = String(rawValue).trim();
  if (!value) return null;

  if (/^-100\d+$/.test(value)) {
    return value;
  }

  if (/^https?:\/\/t\.me\//i.test(value)) {
    value = value.replace(/^https?:\/\/t\.me\//i, "");
  }

  value = value.split(/[/?#]/)[0] || "";
  value = value.replace(/^@+/, "").trim();
  if (!value) return null;
  if (!/^[A-Za-z0-9_]{5,32}$/.test(value)) return null;
  return `@${value}`;
}

function buildChannelUrl(channelUsername) {
  const normalized = normalizeChannelUsername(channelUsername);
  if (!normalized) return null;
  if (normalized.startsWith("-100")) return null;
  return `https://t.me/${normalized.replace(/^@/, "")}`;
}

function normalizeSettingsRow(row = null) {
  const rawChannel = row?.channel_username || DEFAULT_CHANNEL_USERNAME;
  const channelUsername = normalizeChannelUsername(rawChannel) || DEFAULT_CHANNEL_USERNAME;

  return {
    membershipRequired: toBoolean(row?.membership_required, true),
    channelUsername,
    channelUrl: buildChannelUrl(channelUsername),
    updatedAt: row?.updated_at || null
  };
}

async function ensureBotAccessSettingsTable() {
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    const sql = getDbProvider() === "postgres" ? POSTGRES_SQL : SQLITE_SQL;
    await executeSqlScript(sql);
  })().catch((error) => {
    ensurePromise = null;
    throw error;
  });

  return ensurePromise;
}

async function getBotAccessSettings() {
  await ensureBotAccessSettingsTable();

  const res = await query(
    `SELECT id, membership_required, channel_username, updated_at
     FROM bot_access_settings
     WHERE id = 1
     LIMIT 1`
  );

  if (!res.rows.length) {
    await query(
      `INSERT INTO bot_access_settings
       (id, membership_required, channel_username, updated_at)
       VALUES (1, TRUE, $1, NOW())`,
      [DEFAULT_CHANNEL_USERNAME]
    );

    return {
      membershipRequired: true,
      channelUsername: DEFAULT_CHANNEL_USERNAME,
      channelUrl: buildChannelUrl(DEFAULT_CHANNEL_USERNAME),
      updatedAt: null
    };
  }

  return normalizeSettingsRow(res.rows[0]);
}

async function updateBotAccessSettings(input = {}) {
  const current = await getBotAccessSettings();

  const nextMembershipRequired =
    Object.prototype.hasOwnProperty.call(input, "membershipRequired")
      ? toBoolean(input.membershipRequired, current.membershipRequired)
      : current.membershipRequired;

  const rawChannelInput =
    Object.prototype.hasOwnProperty.call(input, "channelUsername")
      ? input.channelUsername
      : Object.prototype.hasOwnProperty.call(input, "channel")
      ? input.channel
      : undefined;

  let nextChannelUsername = current.channelUsername;
  if (rawChannelInput !== undefined) {
    const normalized = normalizeChannelUsername(rawChannelInput);
    if (!normalized) {
      throw new Error("Invalid channel username or link");
    }
    nextChannelUsername = normalized;
  }

  if (nextMembershipRequired && !nextChannelUsername) {
    throw new Error("channelUsername is required when membership is enabled");
  }

  const upsertRes = await query(
    `INSERT INTO bot_access_settings
     (id, membership_required, channel_username, updated_at)
     VALUES (1, $1, $2, NOW())
     ON CONFLICT (id)
     DO UPDATE SET
       membership_required = EXCLUDED.membership_required,
       channel_username = EXCLUDED.channel_username,
       updated_at = NOW()
     RETURNING id, membership_required, channel_username, updated_at`,
    [nextMembershipRequired, nextChannelUsername]
  );

  return normalizeSettingsRow(upsertRes.rows[0] || null);
}

module.exports = {
  DEFAULT_CHANNEL_USERNAME,
  ensureBotAccessSettingsTable,
  getBotAccessSettings,
  updateBotAccessSettings,
  normalizeChannelUsername,
  buildChannelUrl
};
