# Real-Time Error Insights Dashboard

## 🎯 Overview

An MVP application for **real-time monitoring and analysis of frontend error events**.

The app allows you to:

- Ingest and store events (MongoDB for raw data, Elasticsearch for indexed search, Redis for caching and live stats)
- Search with filters and pagination
- Visualize aggregated statistics (Top browsers, Top error messages)
- Explore a simple Angular dashboard with **pagination** and **infinite scroll** options

---

## 🛠 Tech Stack

- **Backend**: Node.js (TypeScript), Express
- **Databases**:
  - MongoDB → raw events
  - Elasticsearch → indexed search & aggregations
  - Redis → query caching & live stats (rolling 1h/global)
- **Frontend**: Angular (standalone components, signals, RxJS interop)
- **Infra**: Docker Compose (MongoDB, Elasticsearch, Redis)

---

## 📦 Requirements

- Node.js v20+
- Docker + Docker Compose
- Angular CLI v20

---

## ▶️ Setup

### 1. Clone & install
```bash
git clone <repo-url>
cd error-insights
npm install
```

### 2. Start dependencies
```bash
docker compose up -d
```
This will start:
- MongoDB on port 27017  
- Elasticsearch on port 9200  
- Redis on port 6379  

### 3. Environment (.env on backend)
Create a `.env` file at the project root:

```env
PORT=3000
MONGO_URI=mongodb://localhost:27017
MONGO_DB=error_insights
ES_NODE=http://localhost:9200
ES_INDEX=error_events
REDIS_URL=redis://localhost:6379
CACHE_TTL_SEC=60
```

### 4. Run backend
```bash
cd backend
npm run start
```

### 5. Run frontend
```bash
cd frontend/error-dashboard
npm run start
```

Dashboard is available at 👉 **http://localhost:4200**

---

## 💾 Data Ingestion

### From a JSON file
```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  --data-binary @seed/events.sample.json
```

### Bulk seeding
```bash
npm run bulk-seed-5k
```
Generates **5k random events** and sends them to the backend.

---

## 📑 Features

### 🔍 Search (ES + Redis cache)
- Filters: **date range, userId, browser, url, keyword**
- Pagination (prev/next, go-to page)
- Infinite scroll (PIT + search_after, no 10k limit)
- Results: timestamp, userId, browser, url, errorMessage

### 📊 Stats
- **ES mode** → filtered aggregations (respect current search filters)
- **Redis (Live)** → global / last 1h counters, auto-refresh every 10s

### ⚡ Widgets
- Top 5 Browsers (pie chart)
- Top 5 Error Messages (bar chart)

### 🖥 UI
- Angular standalone component (dashboard)
- Signals + RxJS interop for reactive data flow
- Paged vs Infinite switch
- Cache status (hit/miss) badge

---

## 🔄 Modes Explained

| Mode        | When to use | Details |
|-------------|------------|---------|
| **Paged**   | For queries up to 10k records | Uses Elasticsearch `from/size`, supports prev/next/go-to page |
| **Load More (Infinite)** | For queries beyond 10k | Uses Elasticsearch PIT + `search_after`, appends results as you scroll |

---

## ✅ Testing

### Unit Tests
We included a **minimal test suite** to validate core functionality:

1. **Elasticsearch query builder** – ensures filters, ranges, and keyword search work correctly.
2. **Cache use-case** – validates first request → `MISS`, second request → `HIT`.
3. **API smoke tests** – using Supertest with mocked reader/cache for `/events/search` and `/events/stats`.

Run tests:
```bash
npm run test
```


---

## ⚠️ Limitations (MVP)
  
- Classic paging max window: **10k** (Elasticsearch limitation).  
- UI not polished (intentionally minimal for MVP).  

---

