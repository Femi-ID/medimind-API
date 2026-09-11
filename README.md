<p align="center">
  <img src="https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/PostgreSQL-database-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/LangChain.js-orchestration-1C3C3C" alt="LangChain.js" />
  <img src="https://img.shields.io/badge/license-UNLICENSED-lightgrey" alt="License" />
</p>

<h1 align="center">MediMind API</h1>
<p align="center"><b>A context-aware healthcare personal assistant backend, built for Nigerian users.</b></p>

---

## Table of Contents

1. [Overview](#1-overview)
2. [Key Features](#2-key-features)
3. [Tech Stack](#3-tech-stack)
4. [System Architecture](#4-system-architecture)
5. [Data Model (ERD)](#5-data-model-erd)
6. [Safety Architecture](#6-safety-architecture)
7. [Project Structure](#7-project-structure)
8. [Getting Started](#8-getting-started)
9. [Environment Variables](#9-environment-variables)
10. [Running the Project](#10-running-the-project)
11. [API Reference](#11-api-reference)
12. [Consuming the API](#12-consuming-the-api)
13. [Rate Limiting](#13-rate-limiting)
14. [Testing](#14-testing)
15. [Deployment](#15-deployment)
16. [Academic Context](#16-academic-context)
17. [License](#17-license)

---

## 1. Overview

**MediMind** is the backend for a *Context-Aware Healthcare Personal Assistant with Predictive Symptom Analysis* — a final-year Electrical and Electronics Engineering project at the **University of Lagos**, built to double as a real, deployable product.

MediMind is **not** a diagnostic tool. It is a **decision-support system** that helps a user understand their symptoms *in the context of their own health history*, rather than in isolation, and helps them decide whether — and how urgently — to see a professional. It combines three things most symptom checkers keep separate:

- **Longitudinal vitals tracking** — blood pressure, heart rate, blood glucose, and weight, logged over time.
- **Context-aware AI consultation** — an LLM-backed chat that is grounded in the user's *actual* recent vitals and conversation history before it ever generates a response, with a deterministic safety layer sitting in front of and behind it.
- **Hospital referral** — nearby-facility lookup (live OpenStreetMap data with a Lagos-seeded fallback), ranked by real Haversine distance and filtered by assessed severity.

The system is classified as a **structured-context conversational LLM application with light agentic tool routing**. It retrieves structured SQL rows (not vector embeddings) to ground generation, and the model's severity assessment can trigger a downstream tool call (hospital lookup) — RAG-like retrieval characteristics combined with light agentic behaviour, without full autonomous multi-step planning.


---

## 2. Key Features

### Authentication & Accounts
- Email/password auth with **argon2** password hashing.
- **Google OAuth 2.0** sign-in (`passport-google-oauth20`), with a nullable `passwordHash` for OAuth-only accounts.
- **JWT access + refresh token** flow: short-lived access token returned in the JSON body; long-lived refresh token set as an **httpOnly, Secure, SameSite** cookie scoped to `/api/v1/auth` — never exposed to client-side JavaScript.
- Refresh token **rotation** on every use, with server-side session tracking (`sessions` table) so a session can be individually revoked.
- Soft-delete accounts, password change, and full data export.

### Vitals Tracking
- Log/update/delete partial or complete vitals readings — systolic/diastolic BP, heart rate, blood glucose, weight.
- Clinically-bounded validation on every field (e.g. systolic BP 60–250 mmHg, heart rate 30–220 bpm).
- `latest` (one reading per parameter), `trends` (time-series for charting), and rule-based `insights` (e.g. "BP trending up 12 mmHg over 7 days") endpoints.

### AI Consultation
- Chat-style, session-based consultations (`ChatSession` → many `ChatMessage`).
- **Context injection**: every LLM call is grounded with (a) the user's latest reading per vital parameter with clinical range annotations, (b) basic demographics, and (c) the last 5 conversational exchanges — capped deliberately to control token spend and latency.
- **Structured output**: the LLM returns a Zod-validated `{ assessment, severity, referralSuggested }` object via LangChain's `withStructuredOutput`, not freeform text with a hand-parsed severity guess.
- **Primary/fallback model degradation**: if the primary Groq-hosted model fails after retries, the service transparently falls back to a lighter model, and finally to a safe canned response if both are unavailable — the conversation is never left broken.
- Nigerian clinical context baked into the system prompt (malaria/typhoid differentials, locally-relevant OTC guidance, local terminology).

### Safety Layer (deterministic, non-LLM)
- **Pre-LLM emergency guard**: a keyword/phrase matcher intercepts messages describing classic emergency presentations (chest pain, breathing difficulty, stroke signs, severe bleeding, suicidal ideation, anaphylaxis, etc.) and returns a hardcoded emergency advisory **without ever calling the LLM**.
- **Severity floor**: messages containing "heightened" but non-emergency phrases (e.g. "worst headache", "high fever") still go to the LLM, but the assessed severity is never allowed to fall below Moderate.
- **Post-LLM output validator**: regex-based interception of definitive diagnostic language, prescription-shaped instructions, and prescription-only drug names paired with a dosage — while deliberately *allowing* standard OTC dosing guidance (e.g. paracetamol) to preserve usefulness.
- A non-dismissible disclaimer is attached to every consultation response.

### Hospital Referral
- `GET /hospitals/nearby` — live lookup against the **OpenStreetMap Overpass API** (no API key, ODbL-licensed, 6-hour in-memory cache per coordinate/radius bucket), automatically falling back to a curated Lagos seed list on timeout, error, or empty results. Can be pinned to the seed list with `HOSPITALS_PROVIDER=stub`.
- Results are ranked by real **Haversine great-circle distance** from the user's coordinates and filtered by assessed severity.
- Referral logging (`POST /hospitals/referrals`) for downstream evaluation/analytics.

### Data Portability
- `GET /users/me/export` — full JSON dump of a user's data.
- `GET /users/me/export/csv` — vitals as CSV.
- `GET /users/me/export/pdf` — a generated PDF health report with vitals charts (via `pdfkit`).

### Platform Concerns
- Tiered rate limiting (`@nestjs/throttler`) plus a dedicated **20 messages/hour/user** cap on the consultation endpoint, enforced against persisted message counts (not just an in-memory bucket).
- Global exception filter → a single, predictable error envelope.
- `helmet` security headers, strict CORS allow-list, global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`).
- URI-based API versioning (`/api/v1/...`).
- Interactive API documentation via **Scalar**, generated from the NestJS Swagger/OpenAPI document.
- `/health` endpoint that actively probes the database, for use by container orchestrators/load balancers.

---

## 3. Tech Stack

| Layer | Choice |
|---|---|
| Framework | [NestJS 11](https://nestjs.com/) (TypeScript) |
| Language | TypeScript throughout |
| Database | PostgreSQL |
| ORM | [Prisma 7](https://www.prisma.io/) (`@prisma/adapter-pg` driver adapter) |
| Auth | `@nestjs/jwt` + Passport (`passport-jwt`, `passport-local`, `passport-google-oauth20`) |
| Password hashing | `argon2` |
| AI orchestration | [LangChain.js](https://js.langchain.com/) + [`@langchain/groq`](https://www.npmjs.com/package/@langchain/groq) |
| LLM provider | Groq (OpenAI OSS models: `openai/gpt-oss-120b` primary, `openai/gpt-oss-20b` fallback) |
| Structured output | Zod schemas via `withStructuredOutput` |
| Hospital data | OpenStreetMap Overpass API (live) with a static Lagos seed fallback |
| Rate limiting | `@nestjs/throttler` (Redis-backed storage available via `@nest-lab/throttler-storage-redis`, currently in-memory) |
| API docs | `@nestjs/swagger` + `@scalar/nestjs-api-reference` |
| PDF generation | `pdfkit` |
| Security middleware | `helmet`, `cookie-parser` |
| Validation | `class-validator` / `class-transformer` |
| Package manager | `pnpm` |
| Testing | Jest + Supertest |
| Containerization | Docker (multi-stage build, `node:22-bookworm-slim`) |
| Target deployment | Render (backend/API) + Neon/Supabase (Postgres) + Vercel (frontend) |

---

## 4. System Architecture

### 4.1 High-level request flow

```mermaid
flowchart TD
    Client["Frontend Client<br/>(Next.js / Web / Mobile)"]

    subgraph API["MediMind API — NestJS"]
        direction TB
        MW["Global Middleware<br/>helmet · CORS · cookie-parser · ValidationPipe"]
        Guard["JwtAuthGuard (global)<br/>+ ThrottlerGuard (global)"]
        Auth["Auth Module<br/>login · refresh · logout · Google OAuth"]
        Users["Users Module<br/>profile · preferences · export"]
        Vitals["Vitals Module<br/>CRUD · trends · insights"]
        Consult["Consultations Module"]
        Hosp["Hospitals Module<br/>nearby · referrals"]

        subgraph ConsultPipeline["Consultation message pipeline"]
            direction TB
            Guard2["ProfileCompleteGuard<br/>MessageRateLimitGuard"]
            EmGuard["EmergencyGuardService<br/>(keyword match, pre-LLM)"]
            PromptB["PromptBuilderService<br/>vitals + demographics + history"]
            LLM["LlmService<br/>Groq primary → fallback → canned"]
            Valid["OutputValidatorService<br/>(regex match, post-LLM)"]
        end
    end

    DB[("PostgreSQL<br/>(via Prisma)")]
    Groq[["Groq LLM API"]]
    Overpass[["OpenStreetMap<br/>Overpass API"]]

    Client -->|HTTPS + Bearer JWT<br/>httpOnly refresh cookie| MW
    MW --> Guard --> Auth & Users & Vitals & Consult & Hosp

    Consult --> Guard2 --> EmGuard
    EmGuard -->|emergency detected| ReturnAdvisory["Return hardcoded<br/>emergency advisory<br/>LLM never called"]
    EmGuard -->|not an emergency| PromptB --> LLM --> Valid --> ReturnAI["Return validated<br/>AI assessment"]

    LLM <-->|structured output| Groq
    Hosp <--> Overpass

    Auth <--> DB
    Users <--> DB
    Vitals <--> DB
    ConsultPipeline <--> DB
    Hosp <--> DB
    ReturnAdvisory --> DB
```

### 4.2 Authentication flow (JWT rotation)

```mermaid
sequenceDiagram
    participant C as Client
    participant A as Auth Controller
    participant S as Auth Service
    participant D as Database

    C->>A: POST /auth/login {email, password}
    A->>S: validate credentials (argon2)
    S->>D: create Session (refreshTokenHash)
    S-->>A: {accessToken, refreshToken}
    A-->>C: 200 {accessToken}  +  Set-Cookie: refresh_token (httpOnly)

    Note over C,A: Access token kept in memory, sent as Bearer on every request

    C->>A: Any protected request (401 - token expired)
    C->>A: POST /auth/refresh (cookie sent automatically)
    A->>S: rotate tokens for session
    S->>D: revoke old session, create new one
    S-->>A: {accessToken, refreshToken}
    A-->>C: 200 {accessToken} + new Set-Cookie
    C->>A: Retry original request once with new access token
```

### 4.3 Consultation safety pipeline

```mermaid
flowchart LR
    Msg["User message"] --> RL{"Rate limit OK?<br/>20 msgs/hr"}
    RL -->|no| Reject429["429 Too Many Requests"]
    RL -->|yes| Profile{"Profile complete?<br/>phone + emergency contact"}
    Profile -->|no| Reject403["403 PROFILE_INCOMPLETE"]
    Profile -->|yes| EG{"Emergency Guard:<br/>keyword match?"}

    EG -->|yes| Advisory["Hardcoded emergency advisory<br/>severity = HIGH, isEmergency = true<br/>LLM is NEVER called"]
    EG -->|no, heightened terms found| Note["Note appended to prompt:<br/>lean toward urgency"]
    EG -->|no| Prompt

    Note --> Prompt["Build grounded prompt:<br/>system + demographics + vitals + history"]
    Prompt --> LLMcall["LLM structured call<br/>primary model"]
    LLMcall -->|fails, retryable| Retry["Retry w/ backoff (2s, 5s)"]
    Retry -->|still fails| Fallback["Fallback model"]
    Fallback -->|also fails| Canned["Safe canned response<br/>usedFallback = true"]

    LLMcall -->|success| Val
    Fallback -->|success| Val
    Canned --> Val["Output Validator:<br/>diagnosis language? Rx drug + dose?<br/>prescription instruction?"]

    Val -->|violation found| SafeFallback["Replace with safe fallback text"]
    Val -->|clean| FinalResp

    SafeFallback --> FinalResp["Persist assistant message<br/>Apply severity floor<br/>Attach disclaimer"]
    Advisory --> FinalResp
    FinalResp --> Hospitals{"severity == HIGH<br/>and coords supplied?"}
    Hospitals -->|yes| Nearby["Fetch nearby hospitals"]
    Hospitals -->|no| Return["Return response envelope"]
    Nearby --> Return
```

---

## 5. Data Model (ERD)

```mermaid
erDiagram
    USER ||--o{ SESSION : "has"
    USER ||--o{ VITAL : "logs"
    USER ||--o{ CHAT_SESSION : "starts"
    USER ||--o{ HOSPITAL_REFERRAL : "receives"
    CHAT_SESSION ||--o{ CHAT_MESSAGE : "contains"

    USER {
        string id PK
        string email UK
        string passwordHash "nullable, OAuth users"
        string firstName
        string lastName
        int age "nullable"
        enum gender "MALE FEMALE OTHER"
        string phoneNumber "nullable"
        string emergencyContactName "nullable"
        string emergencyContactPhone "nullable"
        enum preferredLanguage "ENGLISH PIDGIN YORUBA IGBO HAUSA"
        enum role "USER ADMIN"
        boolean emailVerified
        enum authProvider "LOCAL GOOGLE"
        string googleId UK "nullable"
        datetime createdAt
        datetime updatedAt
        datetime deletedAt "nullable, soft delete"
    }

    SESSION {
        string id PK
        string userId FK
        string refreshTokenHash
        string userAgent "nullable"
        string ipAddress "nullable"
        datetime expiresAt
        datetime revokedAt "nullable"
        datetime createdAt
    }

    VITAL {
        string id PK
        string userId FK
        int systolicBp "nullable, mmHg"
        int diastolicBp "nullable, mmHg"
        int heartRate "nullable, bpm"
        float weight "nullable, kg"
        float bloodGlucose "nullable, mmol per L"
        datetime recordedAt
        datetime createdAt
    }

    CHAT_SESSION {
        string id PK
        string userId FK
        string title
        datetime createdAt
        datetime updatedAt
    }

    CHAT_MESSAGE {
        string id PK
        string sessionId FK
        enum role "USER ASSISTANT"
        text content
        enum severity "LOW MODERATE HIGH, nullable"
        boolean isEmergency
        boolean referralSuggested
        datetime createdAt
    }

    HOSPITAL_REFERRAL {
        string id PK
        string userId FK
        string sessionId "nullable"
        string placeId
        string name
        float latitude
        float longitude
        float distance "nullable, km"
        string severity
        datetime createdAt
    }
```

---

## 6. Safety Architecture

MediMind treats safety as a **deterministic layer around** the LLM, not a property the LLM is trusted to enforce on its own:

1. **Pre-LLM emergency guard** — a normalized, word-boundary keyword matcher checks every incoming message against a curated list of emergency presentations (chest pain, breathing difficulty, stroke signs, severe bleeding, suicidal ideation, anaphylaxis, etc.) *before* the LLM is ever invoked. A match short-circuits straight to a hardcoded advisory (call 112, go to the nearest ED, alert someone nearby) and a `HIGH` severity flag — this path costs zero LLM tokens and zero LLM latency, and cannot be argued around by prompt content.
2. **Heightened-term nudging** — a second, softer list (e.g. "worst headache", "high fever") doesn't trigger the hard stop, but is appended to the system prompt as an explicit instruction to lean toward urgency, and enforces a **severity floor** of `MODERATE` regardless of what the LLM itself returns.
3. **Structured LLM output** — the model must return `{ assessment, severity, referralSuggested }` validated against a Zod schema, not freeform prose that the backend has to parse or trust for the severity field.
4. **Post-LLM output validator** — a second, independent regex pass checks the model's own generated text for definitive diagnostic language ("you have been diagnosed with…"), prescription-shaped instructions ("I prescribe…"), and prescription-only drug names paired with a dosage. Violations are swapped for a safe fallback message *before* the user ever sees the raw model output. Standard OTC guidance (paracetamol, ORS, antihistamines, etc.) is deliberately exempted so the assistant stays useful.
5. **Model degradation, not failure** — if the primary Groq model errors or rate-limits, the service retries with backoff, then falls back to a lighter model, and finally to a safe canned response — the user is told the AI is temporarily degraded (`usedFallback: true`) rather than receiving an opaque 500.
6. **Non-dismissible disclaimer** — every consultation response carries a disclaimer that this is general guidance, not a diagnosis.

---

## 7. Project Structure

```
medimind-API/
├── prisma/
│   ├── schema.prisma           # Data model (see ERD above)
│   └── migrations/             # Versioned SQL migrations
├── src/
│   ├── auth/                   # JWT + Google OAuth, guards, strategies
│   ├── users/                  # Profile, preferences, export (JSON/CSV/PDF)
│   ├── vitals/                 # CRUD, trends, rule-based insights
│   ├── consultations/          # Sessions, messages, safety layer, LLM service
│   │   ├── constants/          #   system prompt, emergency/heightened phrase lists
│   │   ├── emergency-guard.service.ts
│   │   ├── output-validator.service.ts
│   │   ├── prompt-builder.service.ts
│   │   ├── llm.service.ts
│   │   └── guards/              #   message-rate-limit.guard.ts
│   ├── hospitals/               # Overpass lookup + Lagos seed fallback, referrals
│   ├── common/                  # Global exception filter, throttler tiers
│   ├── prisma/                  # PrismaService (adapter-pg)
│   ├── generated/prisma/        # Generated Prisma client (do not edit)
│   ├── app.module.ts
│   └── main.ts                  # Bootstrap: helmet, CORS, versioning, Scalar docs
├── test/                        # e2e tests
├── Dockerfile                   # Multi-stage build (builder → pruned runner)
├── prisma.config.ts
└── package.json
```

---

## 8. Getting Started

### Prerequisites

- **Node.js** ≥ 20 (Docker image uses Node 22)
- **pnpm** (`corepack enable` will provide the version pinned in `package.json`)
- A **PostgreSQL** database (e.g. [Neon](https://neon.tech) or [Supabase](https://supabase.com) free tier)
- A **Groq** API key ([console.groq.com](https://console.groq.com))
- *(Optional)* Google OAuth 2.0 client credentials, if you want Google sign-in

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Femi-ID/medimind-API.git
cd medimind-API

# 2. Install dependencies
pnpm install

# 3. Create your environment file and fill in your values
touch .env   # see Section 9 for what each variable needs

# 4. Generate the Prisma client and run migrations
pnpm prisma generate
pnpm prisma migrate deploy   # or `migrate dev` for local iterative development

# 5. Start the API in watch mode
pnpm start:dev
```

The API will be available at `http://localhost:4000` (or whatever `PORT` you set), with interactive docs at:

```
http://localhost:4000/api/v1/docs
```

---

## 9. Environment Variables

Create a `.env` file in the project root. None of these are committed — `.env` is git-ignored.

| Variable | Required | Example | Description |
|---|---|---|---|
| `NODE_ENV` | recommended | `development` / `production` | Controls cookie `secure`/`sameSite` behaviour and debug-only routes. |
| `PORT` | no (defaults 4000) | `4000` | Port the HTTP server listens on. |
| `DATABASE_URL` | **yes** | `postgresql://user:pass@host:5432/medimind?sslmode=require` | PostgreSQL connection string (used by the Prisma `pg` driver adapter). |
| `CORS_ORIGIN` | **yes** | `https://medimind.vercel.app,http://localhost:3000` | Comma-separated list of allowed origins. Must exactly match your frontend origin(s) for the refresh cookie to work cross-site. |
| `FRONTEND_URL` | recommended | `https://medimind.vercel.app` | Where the Google OAuth callback redirects after setting the refresh cookie. Falls back to the first `CORS_ORIGIN` entry if unset. |
| `JWT_ACCESS_TOKEN_SECRET` | **yes** | `openssl rand -hex 32` output | Signing secret for short-lived access tokens. |
| `JWT_ACCESS_TOKEN_EXPIRY` | **yes** | `15m` | Access token lifetime (`s`/`m`/`h`/`d` suffix). |
| `JWT_REFRESH_TOKEN_SECRET` | **yes** | `openssl rand -hex 32` output | Signing secret for refresh tokens. **Must differ** from the access secret. |
| `JWT_REFRESH_TOKEN_EXPIRY` | **yes** | `7d` | Refresh token lifetime; also sets the refresh cookie's `maxAge`. |
| `GOOGLE_CLIENT_ID` | only for Google login | — | OAuth 2.0 client ID from Google Cloud Console. |
| `GOOGLE_SECRET` | only for Google login | — | OAuth 2.0 client secret. |
| `GOOGLE_CALLBACK_URL` | only for Google login | `https://api.medimind.app/api/v1/auth/google/callback` | Must match the authorized redirect URI configured in Google Cloud Console. |
| `GROQ_API_KEY` | **yes** | — | API key for the Groq LLM provider (console.groq.com). |
| `GROQ_MODEL_PRIMARY` | no (default `openai/gpt-oss-120b`) | `openai/gpt-oss-120b` | Primary model for consultation responses. |
| `GROQ_MODEL_FALLBACK` | no (default `openai/gpt-oss-20b`) | `openai/gpt-oss-20b` | Lighter fallback model used if the primary fails after retries. |
| `HOSPITALS_PROVIDER` | no | `stub` | Set to `stub` to force the static Lagos hospital list instead of live Overpass lookups (useful offline or in CI). |
| `GOOGLE_PLACES_API_KEY` | no | — | Reserved for a future/alternate hospitals provider (Google Places); not required by the current Overpass-based implementation. |
| `THROTTLE_TTL` | **yes** | `60000` | Rate-limit window, in milliseconds, shared by all throttler tiers. |
| `DEFAULT_THROTTLE_LIMIT` | **yes** | `100` | Max requests per `THROTTLE_TTL` window under the `default` tier. |
| `STRICT_THROTTLE_LIMIT` | **yes** | `10` | Max requests per window under the `strict` tier (e.g. login). |
| `MODERATE_THROTTLE_LIMIT` | **yes** | `30` | Max requests per window under the `moderate` tier. |

> **Tip:** generate strong random secrets with `openssl rand -hex 32`. Never reuse the access and refresh JWT secrets, and never commit real secrets to version control.

---

## 10. Running the Project

```bash
# Development (hot reload)
pnpm start:dev

# Debug mode (attach a debugger)
pnpm start:debug

# Production build
pnpm build
pnpm start:prod

# Lint / format
pnpm lint
pnpm format
```

### Database (Prisma)

```bash
pnpm prisma generate          # regenerate the client after a schema change
pnpm prisma migrate dev       # create + apply a migration locally
pnpm prisma migrate deploy    # apply pending migrations in production/CI
pnpm prisma studio            # browse the database visually
```

### Docker

The included multi-stage `Dockerfile` builds a pruned, production-only image (native `argon2` build tools live only in the builder stage).

```bash
# Build
docker build -t medimind-api .

# Run (pass env vars via --env-file or your platform's secret manager)
docker run -p 4000:3000 --env-file .env medimind-api
```

> Note: the container listens on the port the platform injects via `process.env.PORT` (Render/Railway-style), and the Dockerfile documents `EXPOSE 3000` as the conventional default — set `PORT` explicitly if you're running it standalone.

---

## 11. API Reference

Full interactive documentation (Scalar, generated from the OpenAPI spec) is served at:

```
GET /api/v1/docs
```

All routes are prefixed `/api/v1`. Protected routes require `Authorization: Bearer <accessToken>`; the global `JwtAuthGuard` protects every route by default except those explicitly marked `@Public()`.

### Auth (`/api/v1/auth`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/auth/login` | Public | `{ email, password }` → `{ accessToken }` + sets refresh cookie. |
| `POST` | `/auth/refresh` | Refresh cookie | Rotates tokens; returns a new `{ accessToken }` + cookie. |
| `POST` | `/auth/logout` | Bearer | `204`, revokes the session and clears the refresh cookie. |
| `GET` | `/auth/google/login` | Public | Full-page redirect into Google's consent screen. |
| `GET` | `/auth/google/callback` | Public | Google redirects here; sets the refresh cookie and redirects to `${FRONTEND_URL}/auth/callback`. |

### Users (`/api/v1/users`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/users/create` | Public | Registers a user. **Returns no tokens** — call `/auth/login` immediately after. |
| `GET` | `/users/profile` | Bearer | Current user's profile. |
| `PATCH` | `/users/me` | Bearer | Update name, age, gender, language, phone, emergency contact. |
| `POST` | `/users/me/change-password` | Bearer | `204` on success. |
| `DELETE` | `/users/me` | Bearer | Soft-deletes the account (requires password confirmation). |
| `GET` | `/users/me/export` | Bearer | Full JSON data download. |
| `GET` | `/users/me/export/csv` | Bearer | Vitals history as CSV. |
| `GET` | `/users/me/export/pdf` | Bearer | Generated PDF health report with vitals charts. |

### Vitals (`/api/v1/vitals`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/vitals` | Bearer | Log a (partial) reading. |
| `GET` | `/vitals` | Bearer | List readings. |
| `GET` | `/vitals/count` | Bearer | Total readings logged. |
| `GET` | `/vitals/latest` | Bearer | Most recent value per parameter. |
| `GET` | `/vitals/trends?parameter=&days=` | Bearer | Time series for charting (`parameter` is snake_case, e.g. `systolic_bp`). |
| `GET` | `/vitals/insights` | Bearer | Rule-based trend insights over the last 7 days. |
| `PATCH` | `/vitals/:vitalId` | Bearer | Update a reading (ownership enforced). |
| `DELETE` | `/vitals/:vitalId` | Bearer | Delete a reading (ownership enforced). |

### Consultations (`/api/v1/consultations`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/consultations/sessions` | Bearer | Create an (optionally titled) session. |
| `GET` | `/consultations/sessions` | Bearer | List sessions with a last-message preview. |
| `GET` | `/consultations/sessions/:id` | Bearer | Full message history for a session. |
| `PATCH` | `/consultations/sessions/:id` | Bearer | Rename a session. |
| `DELETE` | `/consultations/sessions/:id` | Bearer | Delete a session and its messages. |
| `POST` | `/consultations/messages` | Bearer + `ProfileCompleteGuard` + `MessageRateLimitGuard` | Send a symptom message. Omit `sessionId` to start a new session. |

**`POST /consultations/messages` request body:**

```json
{
  "content": "I've had a headache for two days and my BP was 145/95 this morning.",
  "sessionId": "optional-uuid-to-continue-a-session",
  "language": "en",
  "lat": 6.5244,
  "lng": 3.3792
}
```

**Response envelope (identical shape for a normal reply or an emergency):**

```json
{
  "sessionId": "uuid",
  "isNewSession": true,
  "userMessage": { "id": "...", "role": "USER", "content": "...", "createdAt": "..." },
  "assistantMessage": { "id": "...", "role": "ASSISTANT", "content": "...", "severity": "MODERATE", "createdAt": "..." },
  "severity": "LOW | MODERATE | HIGH",
  "referralSuggested": true,
  "isEmergency": false,
  "usedFallback": false,
  "triage": "EMERGENCY | URGENT | MODERATE | SELF_CARE",
  "hospitals": [],
  "disclaimer": "This information is for general guidance only. It is not a medical diagnosis. Please consult a qualified healthcare professional for medical advice."
}
```

> The frontend should render off `triage` — it's the single field that resolves all UI states. A `403` with `{ "code": "PROFILE_INCOMPLETE" }` means the user must first add a phone number and emergency contact via `PATCH /users/me`.

### Hospitals (`/api/v1/hospitals`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/hospitals/nearby?latitude=&longitude=&severity=&radius=` | Bearer | Nearby facilities, ranked by distance, filtered by severity. |
| `POST` | `/hospitals/referrals` | Bearer | Record that a user was referred to a facility. |
| `GET` | `/hospitals/referrals` | Bearer | The current user's referral history. |

### Meta

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/health` | Public | Actively probes the database; never rate-limited. |
| `GET` | `/docs` | Public | Scalar interactive API reference. |

Every error response (from the global exception filter) has the shape:

```json
{ "statusCode": 400, "code": "OPTIONAL_TAGGED_CODE", "message": "human readable", "path": "/api/v1/...", "timestamp": "ISO-8601" }
```

---

## 12. Consuming the API

### Cookie-based refresh — client requirements

The refresh token is delivered as an **httpOnly cookie**, so any client must:

- Send `credentials: 'include'` (fetch) or `withCredentials: true` (axios) on `/auth/login`, `/auth/refresh`, `/auth/logout`, and the Google callback.
- Keep the **access token in memory only** — never in `localStorage`.
- On app load, call `POST /auth/refresh` once to restore a session from the cookie.
- On any `401`, call `/auth/refresh` **once**, retry the original request **once**, and redirect to login if refresh itself fails. Serialize concurrent refreshes with a single-flight lock — the backend **rotates** the refresh token on every use, so a second concurrent refresh is treated as token reuse and revokes all of the user's sessions.

### Example: register → log in → log a vital → start a consultation

```bash
BASE="http://localhost:4000/api/v1"

# 1. Register (no tokens returned)
curl -X POST "$BASE/users/create" \
  -H "Content-Type: application/json" \
  -d '{"email":"paul@example.com","firstName":"Paul","lastName":"Idowu","password":"a-strong-password"}'

# 2. Log in (cookie jar captures the refresh token)
curl -c cookies.txt -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"paul@example.com","password":"a-strong-password"}'
# => { "accessToken": "eyJhbGciOi..." }

TOKEN="eyJhbGciOi..."   # copy from the response above

# 3. Log a vital reading
curl -X POST "$BASE/vitals" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"systolicBp":145,"diastolicBp":92,"heartRate":72}'

# 4. Complete the profile (required before consultations)
curl -X PATCH "$BASE/users/me" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"+2348012345678","emergencyContactName":"Folake Idowu","emergencyContactPhone":"+2348076543210"}'

# 5. Start a consultation
curl -X POST "$BASE/consultations/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"I have had a throbbing headache since this morning and feel dizzy when I stand up.","lat":6.5244,"lng":3.3792}'

# 6. Refresh the session when the access token expires
curl -b cookies.txt -X POST "$BASE/auth/refresh"
```

### Enum reference (use verbatim)

| Enum | Values |
|---|---|
| `Gender` | `MALE`, `FEMALE`, `OTHER` |
| `PreferredLanguage` | `ENGLISH`, `PIDGIN`, `YORUBA`, `IGBO`, `HAUSA` *(multilingual AI replies are post-MVP — send `language: "en"` in chat for now)* |
| `UserRole` | `USER`, `ADMIN` |
| `AuthProvider` | `LOCAL`, `GOOGLE` |
| `ChatRole` | `USER`, `ASSISTANT` |
| `ChatSeverity` / response `severity` | `LOW`, `MODERATE`, `HIGH` |
| response `triage` | `EMERGENCY`, `URGENT`, `MODERATE`, `SELF_CARE` |
| hospital `facilityType` | `teaching_hospital`, `general_hospital`, `clinic`, `pharmacy` |
| `vitals/trends` `parameter` (⚠ snake_case) | `systolic_bp`, `diastolic_bp`, `heart_rate`, `weight`, `blood_glucose` |

---

## 13. Rate Limiting

Three named throttler tiers (`default`, `moderate`, `strict`) are configured globally via `THROTTLE_TTL` and the three `*_THROTTLE_LIMIT` variables, and each controller opts out of the tiers that don't apply to it with `@SkipThrottle()`. On top of the general throttlers, the consultation message endpoint enforces a **hard cap of 20 user messages per hour**, counted against persisted database rows rather than an in-memory counter — so it survives restarts and applies consistently across instances. Exceeding it returns `429 Too Many Requests`.

The `/health` endpoint is exempt from all throttling so container orchestrators never see false negatives during a traffic spike.

---

## 14. Testing

```bash
pnpm test          # unit tests
pnpm test:watch    # watch mode
pnpm test:cov      # coverage report
pnpm test:e2e      # end-to-end tests (test/)
```

Priority test coverage areas: auth (register/login/refresh/wrong-password), vitals ownership (a user must never read/edit/delete another user's vitals), the emergency guardrail against a battery of trigger phrases, and the output validator against known prohibited patterns.

---

## 15. Deployment

The intended production topology:

```mermaid
flowchart LR
    User(["User"]) --> Vercel["Frontend — Vercel<br/>Next.js"]
    Vercel -->|HTTPS, credentials: include| Render["Backend — Render<br/>MediMind API (Docker)"]
    Render --> Neon[("Managed PostgreSQL<br/>Neon / Supabase")]
    Render --> GroqAPI[["Groq LLM API"]]
    Render --> OverpassAPI[["OpenStreetMap<br/>Overpass API"]]
```

1. **Database**: provision a managed Postgres instance (Neon/Supabase) and set `DATABASE_URL`. Run `pnpm prisma migrate deploy` against it.
2. **Backend**: deploy the `Dockerfile` to Render (or any container platform). Set every variable from [Section 9](#9-environment-variables) in the platform's environment/secrets manager — never in source control.
3. **CORS**: set `CORS_ORIGIN` to the exact deployed frontend origin(s); the refresh-cookie flow requires an exact match plus `credentials: true`, which is already configured in `main.ts`.
4. **Frontend**: deploy to Vercel, pointing `NEXT_PUBLIC_API_URL` (or equivalent) at the Render backend's `/api/v1` base URL.
5. **Health checks**: point your platform's health check at `GET /api/v1/health`.

---

<!-- ## 16. Academic Context

This backend implements the system described in the accompanying final-year project report, *"Context-Aware Healthcare Personal Assistant with Predictive Symptom Analysis"* (Idowu Oluwafemi Paul, 160408034, University of Lagos, Dept. of Electrical and Electronics Engineering, supervised by Dr. K. A. Abdulsalam). For academic purposes, the system is best described as a **structured-context conversational LLM application with light agentic tool routing and a deterministic safety layer** — it is not classical vector-embedding RAG (retrieval is structured SQL, not embeddings-over-documents) and not a fully autonomous agent (no open-ended multi-step planning), but it exhibits characteristics of both: structured retrieval feeding generation, and a model-driven severity assessment that can trigger a downstream tool call (hospital lookup). -->

---

## 16. License

This repository is currently **UNLICENSED** (all rights reserved) pending the author's decision on an open-source license. Contact the author before reusing any part of this codebase.
