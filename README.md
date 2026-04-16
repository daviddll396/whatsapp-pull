# whatsapp-pending

Personal WhatsApp pending-thread tracker.

## MVP
- ingest personal WhatsApp messages via `whatsapp-web.js`
- store normalized threads/messages in SQLite
- detect pending threads where last inbound is newer than last outbound
- generate a daily digest

## Setup
1. `cp .env.example .env`
2. `npm install`
3. `npm run init-db`
4. `npm start`
5. scan the QR code with WhatsApp
6. `npm run digest`

## Notes
- built for personal use
- unofficial bridge, may break if WhatsApp changes web behavior
- keep this on an always-on machine if you want continuous ingestion
