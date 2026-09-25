# n8n Crop Workflow

The current n8n adapter supports text-agent requests only. Crop analysis currently uses the server-side Gemini vision provider and Supabase knowledge query directly, so no n8n crop workflow is claimed as live.

The compatible future workflow is:

`Express /api/crop/analyze -> n8n image-analysis webhook -> confidence validation -> Supabase verified knowledge query -> safety validation -> language formatting -> Express`

Until an image-capable n8n webhook contract is configured and tested, the direct provider boundary remains authoritative. `N8N_WEBHOOK_SECRET` must remain server-only.