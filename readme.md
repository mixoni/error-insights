Real-Time Error Insights Dashboard
🎯 Overview

An MVP application for real-time monitoring and analysis of frontend error events.
The app allows you to:

ingest and store events (MongoDB for raw data, Elasticsearch for indexed search, Redis for caching and live stats),

search with filters and pagination,

visualize aggregated statistics (Top browsers, Top error messages),

explore a simple Angular dashboard with pagination and infinite scroll options.

🛠 Tech Stack

Backend: Node.js (TypeScript), Express

Databases:

MongoDB → raw events

Elasticsearch → indexed search & aggregations

Redis → query caching & live stats (rolling 1h/global)

Frontend: Angular (standalone components, signals, RxJS interop)

Infra: Docker Compose (MongoDB, Elasticsearch, Redis)

📦 Requirements

Node.js v20+

Docker + Docker Compose

Angular CLI v20

▶️ Setup
1. Clone & install
git clone <repo-url>
cd error-insights
npm install

2. Start dependencies
docker compose up -d


This will start:

MongoDB on port 27017

Elasticsearch on port 9200

Redis on port 6379

3. Environment (.env)

At the project root:

PORT=3000
MONGO_URI=mongodb://localhost:27017
MONGO_DB=error_insights
ES_NODE=http://localhost:9200
ES_INDEX=error_events
REDIS_URL=redis://localhost:6379
CACHE_TTL_SEC=60

4. Run backend
cd backend
npm run start

5. Run frontend
cd frontend/error-dashboard
npm run start


Dashboard is available at http://localhost:4200
.

💾 Data Ingestion
From a JSON file
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  --data-binary @seed/events.sample.json

Bulk seeding
npm run bulk-seed-5k


Generates 5k random events and sends them to the backend.

📑 Features
🔍 Search (ES + Redis cache)

Filters: date range, userId, browser, url, keyword

Pagination (prev/next, go-to page)

Infinite scroll (PIT + search_after, no 10k limit)

Results: timestamp, userId, browser, url, errorMessage

📊 Stats

ES mode → filtered aggregations (respect current search filters)

Redis (Live) → global / last 1h counters, auto-refresh every 10s

⚡ Widgets

Top 5 Browsers (pie chart)

Top 5 Error Messages (bar chart)

🖥 UI

Angular standalone component (dashboard)

Signals + RxJS interop for reactive data flow

Paged vs Infinite switch

Cache status (hit/miss) badge

⚠️ Limitations (MVP)

Mongo is used only as a raw event store (no direct API endpoints). All queries and stats are served via Elasticsearch.

PIT search holds connection ~2m (default keep_alive)

Classic paging max window: 10k (Elasticsearch limitation)

UI not polished (intentionally minimal for MVP)

🚀 Next steps

Add authentication & multi-tenant support

Kafka ingestion (currently mocked)

Config endpoint for runtime tuning (refresh interval, top N)

CI/CD pipeline + broader test coverage