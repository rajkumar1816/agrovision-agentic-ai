<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# AgroVision

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/5e4a10f4-9080-4b97-8b19-f5a8088c51b4

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env` and set only the credentials for services you have configured. Never expose `SUPABASE_SERVICE_ROLE_KEY` to Vite or the browser.
3. Run the app:
   `npm run dev`

The backend exposes `GET /api/health` and `GET /api/health/supabase`. The Supabase schema is in `supabase/schema.sql`; run it in the Supabase SQL editor before enabling persistence.
