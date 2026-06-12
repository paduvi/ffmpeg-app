import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import log from '../logger'

let db: Database.Database | null = null

export function openDb(): Database.Database {
  if (db) return db
  const dbPath = join(app.getPath('userData'), 'db.sqlite')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  migrate(db)
  seedDefaultSamples(db)
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

function seedDefaultSamples(db: Database.Database): void {
  const { c } = db.prepare('SELECT COUNT(*) as c FROM sample_images').get() as { c: number }
  if (c > 0) return

  const sampleDir = is.dev
    ? join(process.cwd(), 'resources', 'sample-images')
    : join(process.resourcesPath, 'sample-images')

  const defaults = [{ name: 'Sample', file: 'sample.png' }]

  const insert = db.prepare(
    'INSERT INTO sample_images (name, path, is_permanent) VALUES (?, ?, 1)'
  )
  for (const { name, file } of defaults) {
    insert.run(name, join(sampleDir, file))
    log.info(`Seeded default sample image: ${name}`)
  }
}
