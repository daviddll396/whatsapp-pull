import { db } from './db.js';

const chatLimit = Number(process.argv[2] || 5);
const messageLimit = Number(process.argv[3] || 5);

const chats = db.prepare(`
  SELECT id, title, last_message_at
  FROM threads
  WHERE is_group = 0
  ORDER BY datetime(last_message_at) DESC
  LIMIT ?
`).all(chatLimit);

if (!chats.length) {
  console.log('No chats found.');
  process.exit(0);
}

const messagesStmt = db.prepare(`
  SELECT direction, body, sent_at
  FROM messages
  WHERE thread_id = ?
  ORDER BY datetime(sent_at) DESC
  LIMIT ?
`);

for (const chat of chats) {
  console.log(`${chat.title || 'Unknown'} (${chat.last_message_at || 'no timestamp'})`);
  const messages = messagesStmt.all(chat.id, messageLimit).reverse();
  for (const msg of messages) {
    const prefix = msg.direction === 'outbound' ? 'you' : 'them';
    const body = (msg.body || '').replace(/\s+/g, ' ').trim();
    console.log(`  [${prefix}] ${body || '(no text)'} (${msg.sent_at})`);
  }
  console.log('');
}
