# Deployment

## Option 1 — Local development (recommended for first run)

### Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
The API will be live at `http://localhost:8000` (Swagger docs at `/docs`).
On first startup it automatically creates `resource_tracker.db` and seeds it
with sample data.

### Frontend
```bash
cd frontend
npm install
npm run dev
```
The app will be live at `http://localhost:5173`. Vite's dev server proxies
`/api/*` requests to `http://localhost:8000` (see `vite.config.js`), so both
servers must be running.

## Option 2 — Docker Compose

```bash
docker-compose up --build
```
- Backend: `http://localhost:8000`
- Frontend (production build, served via `serve`): `http://localhost:4173`

The frontend's static build does **not** use the Vite dev proxy, so if you
deploy the containers on different hosts, update `frontend/src/services/api.js`
to point `baseURL` at the backend's public URL (or put both services behind a
reverse proxy that forwards `/api` to the backend).

## Environment variables

`backend/.env`:
```
DATABASE_URL=sqlite:///./resource_tracker.db
```
Swap this for a Postgres/MySQL URL to move off SQLite — SQLAlchemy handles the
rest, no model changes required.

## Production notes

- Set `allow_origins` in `backend/app/main.py` to your real frontend origin
  instead of `"*"` before deploying publicly.
- Run the backend with a process manager (e.g. `gunicorn -k uvicorn.workers.UvicornWorker`)
  behind a reverse proxy (nginx/Caddy) for production traffic.
- Back up `resource_tracker.db` regularly if you're not migrating to a managed
  database.
