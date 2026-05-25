import { openDb } from '.'
import type { SampleImage } from '../../shared/types'

type Row = { id: number; name: string; path: string; is_permanent: number }

function toModel(row: Row): SampleImage {
  return { id: row.id, name: row.name, path: row.path, isPermanent: row.is_permanent === 1 }
}

export function getAllSampleImages(): SampleImage[] {
  const rows = openDb()
    .prepare('SELECT * FROM sample_images ORDER BY is_permanent DESC, name ASC')
    .all() as Row[]
  return rows.map(toModel)
}

export function insertSampleImage(name: string, path: string, isPermanent = false): SampleImage {
  const db = openDb()
  const result = db
    .prepare('INSERT INTO sample_images (name, path, is_permanent) VALUES (?, ?, ?)')
    .run(name, path, isPermanent ? 1 : 0)
  return { id: result.lastInsertRowid as number, name, path, isPermanent }
}

export function deleteSampleImage(id: number): void {
  openDb()
    .prepare('DELETE FROM sample_images WHERE id = ? AND is_permanent = 0')
    .run(id)
}

export function getSampleImage(id: number): SampleImage | undefined {
  const row = openDb()
    .prepare('SELECT * FROM sample_images WHERE id = ?')
    .get(id) as Row | undefined
  return row ? toModel(row) : undefined
}
