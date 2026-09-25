# AgroVision Database

## Current Tables

The schema contains three existing agent-memory tables:

- `soil_telemetry`
- `agent_decisions`
- `agent_notifications`

The domain schema adds:

- `profiles`, `farmers`, `farms`, and `crops`
- `soil_readings` and planned sensor-device support
- `disease_records` and `recommendations`
- `chat_sessions` and `chat_messages`
- `marketplace_products` and `marketplace_orders`
- `government_schemes` and `notifications`

UUID primary keys and foreign keys preserve ownership relationships. Timestamp and ownership indexes support the existing agent/history access patterns.

## Ownership and RLS

Authenticated users can access their own profile and farmer record. Farm, crop, and soil-reading policies resolve ownership through the farmer profile. Marketplace products marked available and government schemes have public read policies; mutations require explicit policies or the server-side service role.

The current application has no authentication middleware yet. Until that is implemented, private API routes must not be considered production-authorized even though the database RLS policies are present.

## Data Integrity

Soil moisture and humidity are constrained to 0-100, pH to 0-14, and marketplace quantities/prices to non-negative values. The Express telemetry endpoint validates the same sensor ranges before invoking the agent persistence path.