# Agricultural Knowledge

`agricultural_pest_knowledge` is the source of verified pest, disease, biological-control, and chemical-control information. AI output is never written as verified knowledge.

Required review fields include crop, problem type, active ingredient/product information where applicable, approved use, safety precautions, source, source URL, region, language, verification status, and verification date.

Only active records with `verified = true` are returned by the crop API. If no matching record exists, the UI displays that verified pesticide information is unavailable and directs the farmer to an agriculture officer.

Admin/expert write policies must be added after application authentication and authorization are available. Farmers have no policy allowing them to modify knowledge records.