# Crop Diagnosis

## Flow

`CropDoctorView` accepts a locally uploaded JPEG, PNG, or WebP image, sends it to `POST /api/crop/analyze`, and renders the validated analysis. The server uses the configured Gemini vision provider for identification only, then queries verified Supabase knowledge for agricultural controls.

The selected crop is context, not proof. The vision prompt explicitly forbids pesticide names, dosage, concentrations, waiting periods, and mixing instructions. These values can only come from verified Supabase records.

## API

### `POST /api/crop/analyze`

Request JSON:

```json
{"imageBase64":"data:image/jpeg;base64,...","mimeType":"image/jpeg","crop":"Paddy (Rice)","language":"en"}
```

The optional bearer token is used to save the result to the authenticated user's diagnosis history. Without a valid session, analysis can run but `historySaved` is false.

The response includes `analysis`, `verifiedInformation`, `requiresExpertReview`, `chemicalControl`, and `safetyPrecautions`. A confidence below `0.6` requires expert review.

### `GET /api/crop/knowledge`

Accepts `crop`, optional `pest`/`disease`, and `language`. Only records with `verified = true` and `status = 'active'` are returned.

### `GET /api/crop/history`

Requires a Supabase bearer session and returns only the requesting user's saved diagnosis records.

The old `/api/ai/crop-doctor` route is deprecated and no longer returns predictions.