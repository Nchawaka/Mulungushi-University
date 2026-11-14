# CampusCare API — ICT461 Lab 3

This is a teaching/demo backend for the CampusCare campus-problem reporting form.

## Endpoints

- `GET /api/health` — confirms that the API is running.
- `POST /api/reports` — independently validates a report; returns `201` for valid input and `422` with `application/problem+json` for validation failures.
- `GET /api/reports` — returns reports stored in memory.

## Start on Windows PowerShell

From the `backend` folder:

```powershell
npm pkg set "scripts.start=node server.js" "scripts.dev=node --watch server.js" "scripts.test=jest --runInBand"
npm start
```

Open `http://localhost:3000/api/health` in a browser.

## Run tests

Open a second terminal in `backend` and run:

```powershell
npm test
```

## Test valid JSON

```powershell
$body = @{
  studentName = "Aubrey Muwaya"
  email = "student@example.com"
  phone = "+260 971 234 567"
  category = "water"
  location = "Engineering block"
  dateObserved = "2026-10-22"
  urgency = "medium"
  description = "There is a leaking tap outside the laboratory."
  agreement = $true
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/reports" -ContentType "application/json" -Body $body
```

## Test server-side rejection (client validation bypass)

```powershell
$badBody = @{
  studentName = "A"
  email = "not-an-email"
  phone = "x"
  category = "unknown"
  location = "x"
  dateObserved = "not-a-date"
  urgency = "urgent"
  description = "short"
  agreement = $false
} | ConvertTo-Json

try {
  Invoke-WebRequest -Method Post -Uri "http://localhost:3000/api/reports" -ContentType "application/json" -Body $badBody
} catch {
  $_.Exception.Response.StatusCode
  $_.ErrorDetails.Message
}
```

The second request should be rejected with HTTP `422` and field-level errors. Server validation is independent of browser JavaScript, so the same rejection applies to direct HTTP requests.

## Important limitations

- Reports are stored in memory only and are cleared when the process restarts. This is suitable for a lab prototype, not production.
- Optional photo uploads are accepted as PNG/JPEG/WebP up to 5 MB, held in memory for the request, and represented in the response by metadata. They are not saved to disk.
- This backend intentionally does not modify the existing `index.html`, `style.css`, or `script.js`. Connect the existing frontend to this API only after confirming its current submission logic and field names.
- CORS permits localhost ports 5500 and 5173, plus requests without an Origin header (such as curl/PowerShell). Change the allowlist if the frontend runs elsewhere.
