import fs from 'fs';
import path from 'path';
import qrcode from 'qrcode-terminal';
import pkg from 'whatsapp-web.js';
import { db } from './db.js';

const { Client, LocalAuth } = pkg;

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
    last_inbound_at = excluded.last_inbound_at,
    last_outbound_at = excluded.last_outbound_at,
    pending = excluded.pending,
    updated_at = CURRENT_TIMESTAMP
`);
const getThread = db.prepare('SELECT id FROM threads WHERE wa_chat_id = ?');
const insertMessage = db.prepare(`
  INSERT OR REPLACE INTO messages (wa_message_id, thread_id, contact_id, direction, body, sent_at, raw_json)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

function isRealDirectChat(chat) {
  const id = String(chat?.id?._serialized || '');
  if (!chat) return false;
  if (chat.isGroup) return false;
  if (!id || id.includes('status@broadcast') || id.includes('@broadcast')) return false;
  return id.endsWith('@c.us') || id.endsWith('@lid');
}

function toIso(ts) {
  if (!ts) return null;
  return new Date(ts * 1000).toISOString();
}

async function syncChat(chat) {
  if (!isRealDirectChat(chat)) return;

  const contact = await chat.getContact();
  const waId = contact.id._serialized;
  const phone = contact.number || null;
  const displayName = contact.pushname || contact.name || phone || waId;

  upsertContact.run({ wa_id: waId, display_name: displayName, phone_number: phone });
  const contactRow = getContact.get(waId);

  const lastMsg = chat.lastMessage;
  if (!lastMsg) return;

  const direction = lastMsg.fromMe ? 'outbound' : 'inbound';
  const sentAt = toIso(lastMsg.timestamp);
  const pending = direction === 'inbound' ? 1 : 0;

  upsertThread.run({
    wa_chat_id: chat.id._serialized,
    contact_id: contactRow.id,
    title: chat.name || displayName,
    is_group: 0,
    last_message_at: sentAt,
    last_inbound_at: direction === 'inbound' ? sentAt : null,
    last_outbound_at: direction === 'outbound' ? sentAt : null,
    pending
  });

  const threadRow = getThread.get(chat.id._serialized);
  insertMessage.run(
    lastMsg.id?._serialized || `${chat.id._serialized}:${lastMsg.timestamp}`,
    threadRow.id,
    contactRow.id,
    direction,
    lastMsg.body || '',
    sentAt,
    JSON.stringify({ type: lastMsg.type || null })
  );

  console.log(`[sync] ${chat.name || displayName}: ${(lastMsg.body || '').slice(0, 80)}`);
}

async function syncRecentChats(client) {
  const chats = await client.getChats();
  const selected = chats
    .filter(isRealDirectChat)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 50);

  for (const chat of selected) {
    try {
      await syncChat(chat);
    } catch (error) {
      console.error(`[sync-error] ${chat.name || chat.id._serialized}: ${error.message}`);
    }
  }
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

client.on('ready', async () => {
  console.log('WhatsApp bridge ready.');
  await syncRecentChats(client);
});

client.on('message', async msg => {
  try {
    const chat = await msg.getChat();
    await syncChat(chat);
  } catch (error) {
    console.error(`[message-error] ${error.message}`);
  }
});

client.on('message_create', async msg => {
  if (!msg.fromMe) return;
  try {
    const chat = await msg.getChat();
    await syncChat(chat);
  } catch (error) {
    console.error(`[message-create-error] ${error.message}`);
  }
});

client.on('auth_failure', msg => console.error('Auth failure:', msg));
client.on('disconnected', reason => console.error('Disconnected:', reason));

client.initialize();
