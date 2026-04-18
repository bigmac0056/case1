# DAMUMED Backend (FastAPI)

## Run

```bash
cd back
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Health check: `http://localhost:8000/health`

## Endpoints used by extension

- `POST /api/parse-consultation`
- `POST /api/schedule`
- `POST /api/status`
- `POST /api/ai/chat` (local ai/ service proxy)

## Scheduling rules (MVP)

- `child_status=norm` -> schedule is skipped (no periodic services).
- `child_status=deviations` -> schedule is generated.
- `role_profile=default` -> default target `9` working days.
- `role_profile=psychologist` -> default target `10` working days.
- Weekends are excluded by default.
- Time conflicts are avoided when provided in request:
  - `service_time != hospitalization_time`
  - `service_time != consultation_time`
  - `service_time > consultation_end_time` (with 30 min step)
- For psychologist profile first generated service has `duration_min=30`.

## Notes

- CORS is enabled for local extension integration.
- If LLM server is unavailable, intent/consultation parse endpoints may return fallback/empty data.

## AI proxy

Backend exposes `POST /api/ai/chat` so frontend does not call local AI service directly.

Request JSON:

```json
{
  "message": "Привет",
  "model": "minimax-m2.5:cloud"
}
```

`model` is optional (default from env: `AI_DEFAULT_MODEL`).

Response JSON:

```json
{
  "reply": "..."
}
```
