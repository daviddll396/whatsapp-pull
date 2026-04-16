# Architecture

## Current approach
- `src/bridge.js`: Baileys-based live WhatsApp ingestion
- `src/init-db.js`: initializes SQLite schema
- `src/summary.js`: pending-thread query + digest formatter
- `src/digest.js`: CLI digest entrypoint
- `src/recent.js`: show recent chats and messages from local DB
- `scripts/send-digest.sh`: sends digest to Telegram

## Pending rule
A thread is pending when the latest stored message for that chat is inbound.

## Storage
SQLite file at `db/whatsapp-pending.sqlite`.

## Current scope
- focus on live capture of real direct chats
- exclude statuses, groups, and broadcast noise
- avoid relying on brittle history backfill
