# Supabase Setup

AgroVision uses Supabase as the server-side persistence layer. The project URL is configured through `SUPABASE_URL`; the JavaScript client must receive the project URL without `/rest/v1/`.

## Environment

Copy `.env.example` to `.env` and configure:

```text
SUPABASE_URL=https://dgkfmkgsmdunlfhlqrdd.supabase.co
SUPABASE_ANON_KEY=your_publishable_or_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key
VITE_SUPABASE_URL=https://dgkfmkgsmdunlfhlqrdd.supabase.co
VITE_SUPABASE_ANON_KEY=your_publishable_or_anon_key
```

`SUPABASE_SERVICE_ROLE_KEY` is used only by the Express server and must never use a `VITE_` prefix or appear in frontend code. Do not commit `.env` files.

The `VITE_*` values are intentionally limited to the Supabase project URL and publishable anon key. They are used by Supabase Auth in the browser; never add the service-role key to a `VITE_*` variable.

## Buyer Authentication

Marketplace browsing remains public. Checkout requires a buyer session created through Supabase Auth. Buyer sign-up metadata is marked with `role = 'buyer'`, and the `on_auth_user_created` trigger creates the matching `profiles` row in Supabase. Email confirmation behavior follows the Supabase project's Auth settings.

To automatically confirm every buyer account, open the Supabase Dashboard, go to **Authentication -> Providers -> Email**, disable **Confirm email**, and save. New buyer sign-ups will then receive an authenticated session immediately. This setting applies to every email/password account in the project; use admin-controlled approval instead if verification is required later.

After changing Auth settings or environment variables, restart the Vite/Express server.

## Schema

Run `supabase/schema.sql` in the Supabase SQL editor. It creates the existing agent tables plus AgroVision profiles, farmers, farms, crops, soil readings, disease records, recommendations, chat, marketplace, schemes, and notifications.

The schema enables RLS and includes owner policies for authenticated profile/farm data. The current backend service-role client bypasses RLS by design; application authentication and request-to-farm authorization must be added before exposing private records to users.

## Health Check

Start the server and call `GET /api/health/supabase`.

Expected configured response:

```json
{"success":true,"service":"supabase","status":"connected"}
```

Without credentials, the endpoint returns `SUPABASE_CONNECTION_ERROR`; this is an expected configuration state, not a successful database connection.

## Telemetry

`GET /api/iot/soil-moisture` reads the latest rows from `soil_telemetry` when Supabase is configured. The response includes `sensorDataAvailable` and `dataSource`. Without persisted sensor data, the response is explicitly marked `demo` and must not be treated as a real sensor reading.