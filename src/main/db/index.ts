import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'
import log from '../logger'

let db: Database.Database | null = null

export function openDb(): Database.Database {
  if (db) return db
  const dbPath = join(app.getPath('userData'), 'db.sqlite')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  migrate(db)
  log.info(`Database opened at ${dbPath}`)
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
    log.info('Database closed')
  }
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sample_images (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      path        TEXT    NOT NULL,
      is_permanent INTEGER NOT NULL DEFAULT 0
    );
  `)
}
