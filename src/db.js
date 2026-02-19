const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const { config } = require("./config");

const jsonColumns = new Set([
  "interests",
  "skills",
  "passed_courses",
  "tags",
  "payload",
  "prerequisites",
  "checklist",
  "required_skills",
  "deliverables",
  "evaluation_criteria",
  "sample_projects",
  "junior_ready_checklist",
  "metadata",
  "filters",
  "output_links"
]);
const booleanColumns = new Set([
  "is_published",
  "is_active",
  "is_approved",
  "is_verified",
  "is_resolved",
  "resume_ready"
]);

function isPostgresUrl(value) {
  return /^postgres(ql)?:\/\//i.test(value || "");
}

function normalizeSqlitePath(rawPath) {
  if (!rawPath) return "";
  const trimmed = String(rawPath).trim();

  if (/^sqlite:\/\//i.test(trimmed)) {
    return trimmed.replace(/^sqlite:\/\//i, "");
  }

  if (/^sqlite:/i.test(trimmed)) {
    return trimmed.replace(/^sqlite:/i, "");
  }

  return trimmed;
}

function getDbProvider() {
  if (isPostgresUrl(config.databaseUrl)) {
    return "postgres";
  }

  if (config.dbProvider === "postgres" || config.dbProvider === "sqlite") {
    return config.dbProvider;
  }

  return "sqlite";
}

function normalizeRailwayPostgresUrl(rawUrl) {
  if (!rawUrl) return "";

  try {
    const parsed = new URL(String(rawUrl));
    const host = parsed.hostname;
    const isRailway = Boolean(process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_ENVIRONMENT);
    const isSimpleHost = /^[a-z0-9-]+$/i.test(host);

    if (isRailway && isSimpleHost && host !== "localhost") {
      parsed.hostname = `${host}.railway.internal`;
      return parsed.toString();
    }

    return parsed.toString();
  } catch (_error) {
    return String(rawUrl);
  }
}

function resolvePostgresConnectionString() {
  const direct = String(config.databaseUrl || "").trim();
  if (direct) return normalizeRailwayPostgresUrl(direct);

  const host = String(process.env.PGHOST || "").trim();
  const port = String(process.env.PGPORT || "5432").trim();
  const user = String(process.env.PGUSER || "").trim();
  const password = String(process.env.PGPASSWORD || "").trim();
  const database = String(process.env.PGDATABASE || "").trim();

  if (!host || !user || !database) return "";

  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
  const built = `postgresql://${auth}@${host}:${port}/${database}`;
  return normalizeRailwayPostgresUrl(built);
}

function resolveSqliteFile() {
  const fromDatabaseUrl = normalizeSqlitePath(config.databaseUrl);
  const configured = fromDatabaseUrl || config.sqlitePath || "db/fanjobo.db";

  if (path.isAbsolute(configured)) return configured;
  return path.join(process.cwd(), configured);
}

function transformSqlForSqlite(sql) {
  return sql
    .replace(/\$(\d+)/g, "?$1")
    .replace(/::jsonb/g, "")
    .replace(/::text/g, "")
    .replace(/\bNOW\(\)/gi, "CURRENT_TIMESTAMP")
    .replace(/\bTRUE\b/gi, "1")
    .replace(/\bFALSE\b/gi, "0");
}

function normalizeSqliteRow(row) {
  const normalized = { ...row };

  for (const key of Object.keys(normalized)) {
    if (jsonColumns.has(key) && typeof normalized[key] === "string") {
      try {
        normalized[key] = JSON.parse(normalized[key]);
      } catch (_error) {
        normalized[key] = normalized[key];
      }
    }

    if (booleanColumns.has(key) && normalized[key] !== null && normalized[key] !== undefined) {
      normalized[key] = Boolean(normalized[key]);
    }
  }

  return normalized;
}

const dbProvider = getDbProvider();
const postgresConnectionString = dbProvider === "postgres" ? resolvePostgresConnectionString() : "";

if (dbProvider === "postgres" && !postgresConnectionString) {
  throw new Error("Postgres is selected but no DATABASE_URL/PG* credentials are configured.");
}

const pool = dbProvider === "postgres"
  ? new Pool({
      connectionString: postgresConnectionString,
      ssl: postgresConnectionString.includes("localhost")
        ? false
        : { rejectUnauthorized: false }
    })
  : null;

let sqliteDbPromise = null;

async function getSqliteDb() {
  if (sqliteDbPromise) return sqliteDbPromise;

  const sqliteFile = resolveSqliteFile();
  fs.mkdirSync(path.dirname(sqliteFile), { recursive: true });

  sqliteDbPromise = open({
    filename: sqliteFile,
    driver: sqlite3.Database
  });

  const db = await sqliteDbPromise;
  await db.exec("PRAGMA foreign_keys = ON;");

  return db;
}

async function query(text, params = []) {
  if (dbProvider === "postgres") {
    return pool.query(text, params);
  }

  const db = await getSqliteDb();
  const sqliteSql = transformSqlForSqlite(text);
  const hasReturning = /\bRETURNING\b/i.test(sqliteSql);
  const isSelectLike = /^\s*(SELECT|WITH|PRAGMA)\b/i.test(sqliteSql);

  if (hasReturning || isSelectLike) {
    const rows = (await db.all(sqliteSql, params)).map(normalizeSqliteRow);
    return { rows, rowCount: rows.length };
  }

  const result = await db.run(sqliteSql, params);
  return { rows: [], rowCount: result?.changes || 0 };
}

async function executeSqlScript(sqlText) {
  if (dbProvider === "postgres") {
    return pool.query(sqlText);
  }

  const db = await getSqliteDb();
  return db.exec(sqlText);
}

async function closeDb() {
  if (dbProvider === "postgres") {
    await pool.end();
    return;
  }

  if (sqliteDbPromise) {
    const db = await sqliteDbPromise;
    await db.close();
    sqliteDbPromise = null;
  }
}

module.exports = {
  pool,
  query,
  closeDb,
  executeSqlScript,
  getDbProvider
};
