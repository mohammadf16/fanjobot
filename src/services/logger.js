const MAX_LOG_ENTRIES = 3000;
const logs = [];

let consolePatched = false;

function truncate(value, max = 2000) {
  const text = String(value ?? "");
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function serializeArgs(args) {
  return args
    .map((item) => {
      if (typeof item === "string") return item;
      if (item instanceof Error) return `${item.name}: ${item.message}\n${item.stack || ""}`;
      try {
        return JSON.stringify(item);
      } catch (_error) {
        return String(item);
      }
    })
    .join(" ");
}

function addLog(level, message, meta = null) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    level: String(level || "info").toLowerCase(),
    message: truncate(message, 5000),
    meta: meta || null,
    createdAt: new Date().toISOString()
  };

  logs.push(entry);
  if (logs.length > MAX_LOG_ENTRIES) {
    logs.splice(0, logs.length - MAX_LOG_ENTRIES);
  }
}

function initConsoleCapture() {
  if (consolePatched) return;
  consolePatched = true;

  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  };

  console.log = (...args) => {
    addLog("info", serializeArgs(args), { source: "console.log" });
    original.log(...args);
  };
  console.info = (...args) => {
    addLog("info", serializeArgs(args), { source: "console.info" });
    original.info(...args);
  };
  console.warn = (...args) => {
    addLog("warn", serializeArgs(args), { source: "console.warn" });
    original.warn(...args);
  };
  console.error = (...args) => {
    addLog("error", serializeArgs(args), { source: "console.error" });
    original.error(...args);
  };

  addLog("info", "Console capture initialized", { source: "logger" });
}

function logInfo(message, meta = null) {
  addLog("info", message, meta);
}

function logWarn(message, meta = null) {
  addLog("warn", message, meta);
}

function logError(message, meta = null) {
  addLog("error", message, meta);
}

function getLogs({ level, search, limit = 200 } = {}) {
  const normalizedLevel = level ? String(level).toLowerCase() : null;
  const normalizedSearch = search ? String(search).toLowerCase() : null;
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 200));

  let items = logs;
  if (normalizedLevel) {
    items = items.filter((item) => item.level === normalizedLevel);
  }
  if (normalizedSearch) {
    items = items.filter((item) => {
      const hay = `${item.message || ""} ${JSON.stringify(item.meta || {})}`.toLowerCase();
      return hay.includes(normalizedSearch);
    });
  }

  const sliced = items.slice(-safeLimit).reverse();
  return { total: items.length, items: sliced };
}

module.exports = {
  initConsoleCapture,
  logInfo,
  logWarn,
  logError,
  getLogs
};

