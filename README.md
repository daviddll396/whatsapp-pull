# whatsapp-pending

Personal WhatsApp pending-thread tracker.

## MVP
- ingest personal WhatsApp messages with Baileys
- store normalized chats/messages in SQLite
- detect pending threads where last inbound is newer than last outbound
- generate a pending digest
- show recent chat/message view

## Setup
1. `cp .env.example .env`
2. `npm install`
3. `npm run init-db`
4. `npm start`
5. scan the QR code with WhatsApp
6. `npm run digest`
7. `npm run recent`

## Notes
- built for personal use
- uses an unofficial WhatsApp bridge
- keep it on an always-on machine if you want continuous ingestion
- historical backfill is not the focus right now, live ingestion is
