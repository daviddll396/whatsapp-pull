import Database from 'better-sqlite3';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = process.env.DB_PATH || './db/whatsapp-pending.sqlite';
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
