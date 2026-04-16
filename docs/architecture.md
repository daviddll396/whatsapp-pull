# Architecture

## MVP
- `src/bridge.js`: WhatsApp Web bridge using `whatsapp-web.js`
- `src/init-db.js`: initializes SQLite schema
- `src/summary.js`: pending-thread query + digest formatter
- `src/digest.js`: CLI digest entrypoint
- `scripts/send-digest.sh`: sends digest to Telegram

## Pending rule
A thread is pending when `last_inbound_at > last_outbound_at`.

## Storage
SQLite file at `db/whatsapp-pending.sqlite`.

## Next improvements
- add snooze/follow-up table
- add basic priority tags
- add cron-managed morning digest
- add AI summary/draft layer after ingestion is stable
