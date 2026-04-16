import fs from 'fs';
import path from 'path';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { DisconnectReason, fetchLatestBaileysVersion, makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { db } from './db.js';

const sessionPath = path.resolve('.session');
if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

const logger = pino({ level: 'silent' });

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

function isRealDirectChat(jid = '') {
  return jid.endsWith('@s.whatsapp.net');
}

function extractText(message = {}) {
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.buttonsResponseMessage?.selectedDisplayText ||
    message.listResponseMessage?.title ||
    ''
  );
}

function toIso(ms) {
  return new Date(Number(ms) * 1000).toISOString();
}

function syncRecord({ jid, pushName, timestamp, fromMe, messageId, text }) {
  if (!isRealDirectChat(jid)) return;
  const displayName = pushName || jid.split('@')[0];
  const phone = jid.split('@')[0];

  upsertContact.run({ wa_id: jid, display_name: displayName, phone_number: phone });
  const contactRow = getContact.get(jid);

  const direction = fromMe ? 'outbound' : 'inbound';
  const sentAt = toIso(timestamp);
  const pending = direction === 'inbound' ? 1 : 0;

  upsertThread.run({
    wa_chat_id: jid,
    contact_id: contactRow.id,
    title: displayName,
    is_group: 0,
    last_message_at: sentAt,
    last_inbound_at: direction === 'inbound' ? sentAt : null,
    last_outbound_at: direction === 'outbound' ? sentAt : null,
    pending
  });

  const threadRow = getThread.get(jid);
  insertMessage.run(
    messageId,
    threadRow.id,
    contactRow.id,
    direction,
    text,
    sentAt,
    JSON.stringify({})
  );

  console.log(`[${direction}] ${displayName}: ${(text || '').slice(0, 100)}`);
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ['Bob', 'Chrome', '1.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr: qrString }) => {
    if (qrString) {
      console.log('Scan this QR with WhatsApp:');
      qrcode.generate(qrString, { small: true });
    }

    if (connection === 'open') {
      console.log('WhatsApp bridge ready.');
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(`Connection closed. Reconnect: ${shouldReconnect}`);
      if (shouldReconnect) start();
    }
  });

  sock.ev.on('messages.upsert', ({ messages }) => {
    for (const msg of messages) {
      const jid = msg.key?.remoteJid || '';
      if (!isRealDirectChat(jid)) continue;
      if (msg.key?.fromMe === undefined) continue;
      const text = extractText(msg.message || {});
      syncRecord({
        jid,
        pushName: msg.pushName,
        timestamp: msg.messageTimestamp,
        fromMe: Boolean(msg.key?.fromMe),
        messageId: msg.key?.id || `${jid}:${msg.messageTimestamp}`,
        text
      });
    }
  });
}

start().catch(err => {
  console.error(err);
  process.exit(1);
});
