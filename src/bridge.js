import fs from 'fs';
import path from 'path';
import qrcode from 'qrcode-terminal';
import { Client, LocalAuth } from 'whatsapp-web.js';
import { db } from './db.js';

const sessionPath = path.resolve('.session');
if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

const upsertContact = db.prepare(`
  INSERT INTO contacts (wa_id, display_name, phone_number, updated_at)
  VALUES (@wa_id, @display_name, @phone_number, CURRENT_TIMESTAMP)
  ON CONFLICT(wa_id) DO UPDATE SET
    display_name = excluded.display_name,
    phone_number = excluded.phone_number,
    updated_at = CURRENT_TIMESTAMP
`);

const getContact = db.prepare('SELECT id FROM contacts WHERE wa_id = ?');
const upsertThread = db.prepare(`
  INSERT INTO threads (wa_chat_id, contact_id, title, is_group, last_message_at, last_inbound_at, last_outbound_at, pending, updated_at)
  VALUES (@wa_chat_id, @contact_id, @title, @is_group, @last_message_at, @last_inbound_at, @last_outbound_at, @pending, CURRENT_TIMESTAMP)
  ON CONFLICT(wa_chat_id) DO UPDATE SET
    contact_id = excluded.contact_id,
    title = excluded.title,
    is_group = excluded.is_group,
    last_message_at = excluded.last_message_at,
    last_inbound_at = COALESCE(excluded.last_inbound_at, threads.last_inbound_at),
    last_outbound_at = COALESCE(excluded.last_outbound_at, threads.last_outbound_at),
    pending = excluded.pending,
    updated_at = CURRENT_TIMESTAMP
`);
const getThread = db.prepare('SELECT id, last_inbound_at, last_outbound_at FROM threads WHERE wa_chat_id = ?');
const insertMessage = db.prepare(`
  INSERT OR IGNORE INTO messages (wa_message_id, thread_id, contact_id, direction, body, sent_at, raw_json)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const updateThreadPending = db.prepare(`
  UPDATE threads
  SET last_inbound_at = ?, last_outbound_at = ?, pending = ?, last_message_at = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

function iso(ts) {
  return new Date(ts * 1000).toISOString();
}

async function syncMessage(message) {
  const chat = await message.getChat();
  const contact = await message.getContact();
  const waId = contact.id._serialized;
  const phone = contact.number || null;
  const displayName = contact.pushname || contact.name || phone || waId;

  upsertContact.run({ wa_id: waId, display_name: displayName, phone_number: phone });
  const contactRow = getContact.get(waId);

  const direction = message.fromMe ? 'outbound' : 'inbound';
  const sentAt = iso(message.timestamp);

  const existingThread = getThread.get(chat.id._serialized);
  const lastInbound = direction === 'inbound' ? sentAt : (existingThread?.last_inbound_at || null);
  const lastOutbound = direction === 'outbound' ? sentAt : (existingThread?.last_outbound_at || null);
  const pending = lastInbound && (!lastOutbound || lastInbound > lastOutbound) ? 1 : 0;

  upsertThread.run({
    wa_chat_id: chat.id._serialized,
    contact_id: contactRow.id,
    title: chat.name || displayName,
    is_group: chat.isGroup ? 1 : 0,
    last_message_at: sentAt,
    last_inbound_at: direction === 'inbound' ? sentAt : null,
    last_outbound_at: direction === 'outbound' ? sentAt : null,
    pending
  });

  const threadRow = getThread.get(chat.id._serialized);
  insertMessage.run(
    message.id._serialized,
    threadRow.id,
    contactRow.id,
    direction,
    message.body || '',
    sentAt,
    JSON.stringify({ type: message.type })
  );

  updateThreadPending.run(lastInbound, lastOutbound, pending, sentAt, threadRow.id);
  console.log(`[${direction}] ${chat.name || displayName}: ${(message.body || '').slice(0, 80)}`);
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: sessionPath }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', qr => {
  console.log('Scan this QR with WhatsApp:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => console.log('WhatsApp bridge ready.'));
client.on('message', syncMessage);
client.on('message_create', async msg => {
  if (msg.fromMe) await syncMessage(msg);
});
client.on('auth_failure', msg => console.error('Auth failure:', msg));
client.on('disconnected', reason => console.error('Disconnected:', reason));

client.initialize();
