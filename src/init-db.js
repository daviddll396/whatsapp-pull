import { db } from './db.js';

const schema = `
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY,
  wa_id TEXT UNIQUE,
  display_name TEXT,
  phone_number TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS threads (
  id INTEGER PRIMARY KEY,
  wa_chat_id TEXT UNIQUE,
  contact_id INTEGER,
  title TEXT,
  is_group INTEGER DEFAULT 0,
  last_message_at TEXT,
  last_inbound_at TEXT,
  last_outbound_at TEXT,
  pending INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  wa_message_id TEXT UNIQUE,
  thread_id INTEGER NOT NULL,
  contact_id INTEGER,
  direction TEXT NOT NULL,
  body TEXT,
  sent_at TEXT NOT NULL,
  raw_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(thread_id) REFERENCES threads(id),
  FOREIGN KEY(contact_id) REFERENCES contacts(id)
);

CREATE INDEX IF NOT EXISTS idx_messages_thread_sent_at ON messages(thread_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_pending ON threads(pending, last_inbound_at DESC);
`;

db.exec(schema);
console.log('Database initialized.');
