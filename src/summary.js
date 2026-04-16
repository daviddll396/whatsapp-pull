import { db } from './db.js';

export function getPendingThreads(lookbackHours = 72) {
  const stmt = db.prepare(`
    SELECT t.id, t.title, c.display_name, c.phone_number, t.last_inbound_at, t.last_outbound_at,
           (SELECT body FROM messages m WHERE m.thread_id = t.id ORDER BY m.sent_at DESC LIMIT 1) AS last_body
    FROM threads t
    LEFT JOIN contacts c ON c.id = t.contact_id
    WHERE t.pending = 1
      AND t.is_group = 0
      AND datetime(t.last_inbound_at) >= datetime('now', ?)
    ORDER BY datetime(t.last_inbound_at) DESC
  `);
  return stmt.all(`-${lookbackHours} hours`);
}

export function formatDigest(rows) {
  if (!rows.length) return 'No pending threads.';
  const lines = [`Pending threads: ${rows.length}`, ''];
  for (const row of rows) {
    const name = row.display_name || row.title || row.phone_number || 'Unknown';
    const snippet = (row.last_body || '').replace(/\s+/g, ' ').slice(0, 120);
    lines.push(`- ${name}`);
    lines.push(`  Last inbound: ${row.last_inbound_at}`);
    if (snippet) lines.push(`  Snippet: ${snippet}`);
    lines.push('');
  }
  return lines.join('\n');
}
