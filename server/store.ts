import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Contact, Invoice, Settings } from '../shared/types.js';

/** JSONスナップショットとSQLのトランザクションを組み合わせ、小規模利用を簡潔に保つ。 */
export function createStore(directory: string) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, 'tatekae.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);`);
  function transaction<T>(work: () => T): T {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return {
    db,
    transaction,
    contacts: () =>
      db
        .prepare('SELECT data FROM contacts')
        .all()
        .map((row) => JSON.parse(String(row.data)) as Contact),
    invoices: () =>
      db
        .prepare('SELECT data FROM invoices ORDER BY rowid DESC')
        .all()
        .map((row) => JSON.parse(String(row.data)) as Invoice),
    settings: (): Settings | undefined => {
      const row = db.prepare('SELECT data FROM settings WHERE id=1').get();
      return row ? JSON.parse(String(row.data)) : undefined;
    },
    saveSettings: (value: Settings) =>
      db
        .prepare(
          'INSERT INTO settings VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
        )
        .run(JSON.stringify(value)),
    saveContact: (value: Contact) =>
      db
        .prepare(
          'INSERT INTO contacts VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET email=excluded.email, data=excluded.data',
        )
        .run(value.id, value.email, JSON.stringify(value)),
    saveInvoice: (value: Invoice) =>
      db
        .prepare(
          'INSERT INTO invoices VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
        )
        .run(value.id, JSON.stringify(value)),
  };
}
export type Store = ReturnType<typeof createStore>;
