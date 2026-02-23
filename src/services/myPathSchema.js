const { executeSqlScript, getDbProvider, query } = require("../db");

let ensurePromise = null;

const POSTGRES_SQL = `
CREATE TABLE IF NOT EXISTS my_path_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  current_stage TEXT NOT NULL DEFAULT 'university_and_industry',
  four_week_goal TEXT,
  weekly_hours INTEGER NOT NULL DEFAULT 8,
  free_days JSONB NOT NULL DEFAULT '[]'::jsonb,
  university_weight INTEGER NOT NULL DEFAULT 50,
  industry_weight INTEGER NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS my_path_goals (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('academic', 'career', 'project', 'application')),
  title TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  priority INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  success_metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
  progress_percent INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS my_path_tasks (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id BIGINT REFERENCES my_path_goals(id) ON DELETE SET NULL,
  step_label TEXT,
  type TEXT NOT NULL CHECK (type IN ('study', 'practice', 'project', 'apply', 'interview')),
  title TEXT NOT NULL,
  estimated_minutes INTEGER NOT NULL DEFAULT 60,
  priority INTEGER NOT NULL DEFAULT 3,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  dependency_task_id BIGINT REFERENCES my_path_tasks(id) ON DELETE SET NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  planned_week TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS my_path_progress_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id BIGINT REFERENCES my_path_tasks(id) ON DELETE CASCADE,
  actual_minutes INTEGER,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS my_path_artifacts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id BIGINT REFERENCES my_path_goals(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('github', 'demo', 'file', 'certificate', 'resume_bullet')),
  title TEXT NOT NULL,
  url TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE my_path_goals ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE my_path_goals ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE my_path_goals ADD COLUMN IF NOT EXISTS success_metrics JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE my_path_goals ADD COLUMN IF NOT EXISTS progress_percent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE my_path_goals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE my_path_tasks ADD COLUMN IF NOT EXISTS step_label TEXT;
ALTER TABLE my_path_tasks ADD COLUMN IF NOT EXISTS goal_id BIGINT REFERENCES my_path_goals(id) ON DELETE SET NULL;
ALTER TABLE my_path_tasks ADD COLUMN IF NOT EXISTS dependency_task_id BIGINT REFERENCES my_path_tasks(id) ON DELETE SET NULL;
ALTER TABLE my_path_tasks ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE my_path_tasks ADD COLUMN IF NOT EXISTS planned_week TEXT;
ALTER TABLE my_path_tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE my_path_tasks ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE my_path_tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE my_path_artifacts ADD COLUMN IF NOT EXISTS goal_id BIGINT REFERENCES my_path_goals(id) ON DELETE SET NULL;
ALTER TABLE my_path_artifacts ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE my_path_artifacts ADD COLUMN IF NOT EXISTS description TEXT;
`;

const SQLITE_BASE_SQL = `
CREATE TABLE IF NOT EXISTS my_path_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  current_stage TEXT NOT NULL DEFAULT 'university_and_industry',
  four_week_goal TEXT,
  weekly_hours INTEGER NOT NULL DEFAULT 8,
  free_days TEXT NOT NULL DEFAULT '[]',
  university_weight INTEGER NOT NULL DEFAULT 50,
  industry_weight INTEGER NOT NULL DEFAULT 50,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS my_path_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('academic', 'career', 'project', 'application')),
  title TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  priority INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  success_metrics TEXT NOT NULL DEFAULT '[]',
  progress_percent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS my_path_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id INTEGER REFERENCES my_path_goals(id) ON DELETE SET NULL,
  step_label TEXT,
  type TEXT NOT NULL CHECK (type IN ('study', 'practice', 'project', 'apply', 'interview')),
  title TEXT NOT NULL,
  estimated_minutes INTEGER NOT NULL DEFAULT 60,
  priority INTEGER NOT NULL DEFAULT 3,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  dependency_task_id INTEGER REFERENCES my_path_tasks(id) ON DELETE SET NULL,
  attachments TEXT NOT NULL DEFAULT '[]',
  planned_week TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS my_path_progress_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES my_path_tasks(id) ON DELETE CASCADE,
  actual_minutes INTEGER,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS my_path_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id INTEGER REFERENCES my_path_goals(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('github', 'demo', 'file', 'certificate', 'resume_bullet')),
  title TEXT NOT NULL,
  url TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

const SQLITE_COLUMN_PATCHES = {
  my_path_goals: [
    { column: "start_date", sql: "ALTER TABLE my_path_goals ADD COLUMN start_date TEXT;" },
    { column: "end_date", sql: "ALTER TABLE my_path_goals ADD COLUMN end_date TEXT;" },
    { column: "success_metrics", sql: "ALTER TABLE my_path_goals ADD COLUMN success_metrics TEXT NOT NULL DEFAULT '[]';" },
    { column: "progress_percent", sql: "ALTER TABLE my_path_goals ADD COLUMN progress_percent INTEGER NOT NULL DEFAULT 0;" },
    { column: "updated_at", sql: "ALTER TABLE my_path_goals ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;" }
  ],
  my_path_tasks: [
    { column: "step_label", sql: "ALTER TABLE my_path_tasks ADD COLUMN step_label TEXT;" },
    { column: "goal_id", sql: "ALTER TABLE my_path_tasks ADD COLUMN goal_id INTEGER;" },
    { column: "dependency_task_id", sql: "ALTER TABLE my_path_tasks ADD COLUMN dependency_task_id INTEGER;" },
    { column: "attachments", sql: "ALTER TABLE my_path_tasks ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]';" },
    { column: "planned_week", sql: "ALTER TABLE my_path_tasks ADD COLUMN planned_week TEXT;" },
    { column: "completed_at", sql: "ALTER TABLE my_path_tasks ADD COLUMN completed_at TEXT;" },
    { column: "due_date", sql: "ALTER TABLE my_path_tasks ADD COLUMN due_date TEXT;" },
    { column: "updated_at", sql: "ALTER TABLE my_path_tasks ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;" }
  ],
  my_path_artifacts: [
    { column: "goal_id", sql: "ALTER TABLE my_path_artifacts ADD COLUMN goal_id INTEGER;" },
    { column: "url", sql: "ALTER TABLE my_path_artifacts ADD COLUMN url TEXT;" },
    { column: "description", sql: "ALTER TABLE my_path_artifacts ADD COLUMN description TEXT;" }
  ]
};

async function patchSqliteTableColumns(tableName, patches) {
  const infoRes = await query(`PRAGMA table_info(${tableName})`);
  const existing = new Set((infoRes.rows || []).map((row) => String(row.name || "").toLowerCase()));

  for (const patch of patches) {
    const columnName = String(patch.column || "").toLowerCase();
    if (!columnName || existing.has(columnName)) continue;
    await executeSqlScript(patch.sql);
    existing.add(columnName);
  }
}

async function ensureMyPathTables() {
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    const provider = getDbProvider();

    if (provider === "postgres") {
      await executeSqlScript(POSTGRES_SQL);
      return;
    }

    await executeSqlScript(SQLITE_BASE_SQL);

    for (const [tableName, patches] of Object.entries(SQLITE_COLUMN_PATCHES)) {
      await patchSqliteTableColumns(tableName, patches);
    }
  })().catch((error) => {
    ensurePromise = null;
    throw error;
  });

  return ensurePromise;
}

module.exports = {
  ensureMyPathTables
};
