import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
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
  INSERT OR IGNORE INTO messages (wa_message_id, thread_id, contact_id, direction, body, sent_at, raw_json)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

function toIso(ts) {
  return new Date(ts * 1000).toISOString();
}

async function backfill(limitPerChat = 30, chatLimit = 50) {
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: sessionPath }),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
  });

  client.on('qr', qr => {
    console.log('Scan this QR with WhatsApp:');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', async () => {
    console.log('Backfill started...');
    console.log('Loading chats from WhatsApp Web...');
    const chats = await client.getChats();
    console.log(`Fetched ${chats.length} chats.`);
    const selected = chats
      .filter(c => !c.isGroup && !String(c.id?._serialized || '').includes('status@broadcast'))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, chatLimit);

    console.log(`Processing ${selected.length} recent chats...`);

    for (const [index, chat] of selected.entries()) {
      console.log(`[${index + 1}/${selected.length}] Loading chat: ${chat.name || chat.id._serialized}`);
      const contact = await chat.getContact();
      const waId = contact.id._serialized;
      const phone = contact.number || null;
      const displayName = contact.pushname || contact.name || phone || waId;

      upsertContact.run({ wa_id: waId, display_name: displayName, phone_number: phone });
      const contactRow = getContact.get(waId);

      console.log(`[${index + 1}/${selected.length}] Fetching messages...`);
      const messages = (await chat.fetchMessages({ limit: limitPerChat }))
        .filter(msg => !String(msg.from || '').includes('status@broadcast') && !String(msg.to || '').includes('status@broadcast'));
      let lastInbound = null;
      let lastOutbound = null;
      let lastMessageAt = null;

      for (const msg of messages.reverse()) {
        const direction = msg.fromMe ? 'outbound' : 'inbound';
        const sentAt = toIso(msg.timestamp);
        lastMessageAt = sentAt;
        if (direction === 'inbound') lastInbound = sentAt;
        if (direction === 'outbound') lastOutbound = sentAt;
      }

      const pending = lastInbound && (!lastOutbound || lastInbound > lastOutbound) ? 1 : 0;

      upsertThread.run({
        wa_chat_id: chat.id._serialized,
        contact_id: contactRow.id,
        title: chat.name || displayName,
        is_group: 0,
        last_message_at: lastMessageAt,
        last_inbound_at: lastInbound,
        last_outbound_at: lastOutbound,
        pending
      });

      const threadRow = getThread.get(chat.id._serialized);

      for (const msg of messages.reverse()) {
        insertMessage.run(
          msg.id._serialized,
          threadRow.id,
          contactRow.id,
          msg.fromMe ? 'outbound' : 'inbound',
          msg.body || '',
          toIso(msg.timestamp),
          JSON.stringify({ type: msg.type })
        );
      }

      console.log(`[${index + 1}/${selected.length}] Backfilled: ${chat.name || displayName} (${messages.length} messages)`);
    }

    console.log('Backfill complete.');
    await client.destroy();
    process.exit(0);
  });

  client.initialize();
}

const limitPerChat = Number(process.argv[2] || 30);
const chatLimit = Number(process.argv[3] || 50);
backfill(limitPerChat, chatLimit);
