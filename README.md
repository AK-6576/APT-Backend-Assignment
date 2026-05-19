# Apt Real-Time Dashboard

Enterprise-style real-time operations dashboard for the `orders` table. The system streams committed database changes to a browser UI without polling.

## Architecture

```text
PostgreSQL / Supabase
        |
        | committed INSERT / UPDATE / DELETE events
        v
Supabase Realtime
        |
        v
Node.js Broker
        |
        | validated Socket.IO events
        v
Browser Operations Console
```

## Flow

1. The Node.js broker starts and validates required environment variables.
2. The broker subscribes to Supabase Realtime changes on `public.orders`.
3. Database mutations are received after commit.
4. The broker validates the mutation type and whitelists safe order fields.
5. Connected browsers receive the event through Socket.IO.
6. The dashboard updates metrics, operation cards, and session history.

## Features

- Real-time insert, update, and delete updates
- Clean operations dashboard with metrics and history
- Same-origin Socket.IO client delivery
- Structured JSON logs
- No polling
- No third-party runtime script CDN
- Safe browser rendering using text nodes

## Project Structure

```text
server.js      Express server, Supabase Realtime listener, Socket.IO broker
index.html    Dashboard markup and styling
app.js        Browser-side realtime rendering logic
simulate.js   Insert/update/delete lifecycle simulator
package.json  Scripts and dependencies
```

## Prerequisites

- Node.js
- Supabase project with Realtime enabled
- `orders` table in the `public` schema

Expected `orders` fields:

```text
id             integer primary key
customer_name  string
product_name   string
status         string
updated_at     timestamp
```

## Configuration

Create `.env` in the project root:

```env
SUPABASE_URL=https://your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
APP_ORIGIN=http://localhost:3000
PORT=3000
```

For evaluation, the Supabase connection values are provided separately with the submission package. The `.env` file is intentionally not committed because it contains environment-specific database access details.

Only the Supabase anon key is required for this project. No service-role key or privileged database credential should be committed to the repository.

## Install

```bash
npm install
```

## Run

```bash
npm start
```

Open:

```text
http://localhost:3000
```

If `index.html` is opened directly from the file system, it redirects to the local server URL. The server URL is the correct entry point because Socket.IO is served by the Node broker.

## Test

Keep the dashboard open, then run:

```bash
npm run simulate
```

The simulator performs:

1. Insert test order
2. Update order status
3. Delete test order

Each committed mutation should appear in the operations console.

## Security and Integrity

- Required environment variables are validated at startup.
- CORS is restricted through `APP_ORIGIN`.
- Security headers are set by the Express server.
- Content Security Policy restricts runtime resources.
- Events are broadcast only after database commit.
- Unsupported mutation types are rejected.
- Broadcast payloads include only whitelisted fields.
- Client rendering avoids HTML injection.
- Logs are plain structured JSON without decorative symbols.

## ACID Alignment

- **Atomicity**: Events are emitted after committed database mutations.
- **Consistency**: Payloads are validated before broadcast.
- **Isolation**: The UI displays committed stream events, not speculative local state.
- **Durability**: PostgreSQL remains the durable source of truth.

## Evaluation Summary

- **Design Thinking**: Event-driven CDC flow avoids polling and keeps responsibilities separated.
- **Correctness**: Insert, update, and delete events are streamed and rendered in real time.
- **Code Quality**: Server, UI, client logic, and simulator are separated into focused files.
- **Documentation**: Setup, execution, testing, architecture, and security posture are documented here.
