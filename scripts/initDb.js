const fs = require("fs");
const path = require("path");
const { executeSqlScript, closeDb, getDbProvider } = require("../src/db");

async function run() {
  const sqlFile = getDbProvider() === "postgres" ? "init.sql" : "init.sqlite.sql";
  const filePath = path.join(__dirname, "..", "sql", sqlFile);
  const sql = fs.readFileSync(filePath, "utf8");

  await executeSqlScript(sql);
  await closeDb();

  console.log("Database initialized successfully.");
}

run().catch(async (error) => {
  console.error("Database init failed", error);
  await closeDb();
  process.exit(1);
});
