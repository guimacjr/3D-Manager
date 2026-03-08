import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const nowIso = () => new Date().toISOString();

export function createDb(dbFilePath: string) {
  const db = new Database(dbFilePath);
  db.pragma("foreign_keys = ON");
  return db;
}

export function runMigrations(db: Database.Database, migrationsDir: string) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const applied = new Set<string>(
    db.prepare("SELECT version FROM schema_migrations").all().map((row: any) => row.version)
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const transaction = db.transaction(() => {
      db.exec(sql);
      db
        .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
        .run(file, nowIso());
    });
    transaction();
  }
}

export { nowIso };
