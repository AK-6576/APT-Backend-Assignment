const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ quiet: true });

const VALID_MUTATION_TYPES = new Set(['INSERT', 'UPDATE', 'DELETE']);
const PUBLIC_FIELDS = ['id', 'customer_name', 'product_name', 'status', 'updated_at'];

function validateEnvironment() {
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(JSON.stringify({
      level: 'error',
      service: 'apt-realtime-broker',
      message: 'Missing required environment variables',
      missing
    }));
    process.exit(1);
  }
}

validateEnvironment();

const app = express();
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'"
  );
  next();
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/app.js', (req, res) => {
  res.type('application/javascript').sendFile(path.join(__dirname, 'app.js'));
});

const server = http.createServer(app);

const allowedOrigins = [process.env.APP_ORIGIN || 'http://localhost:3000'];
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] }
});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

function log(level, message, context = {}) {
  const safeContext = Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined && value !== null)
  );

  const line = {
    level,
    service: 'apt-realtime-broker',
    message,
    ...safeContext
  };

  const output = JSON.stringify(line);
  if (level === 'error') {
    console.error(output);
    return;
  }

  if (level === 'warn') {
    console.warn(output);
    return;
  }

  console.log(output);
}

function pickPublicFields(record) {
  if (!record || typeof record !== 'object') {
    return null;
  }

  return PUBLIC_FIELDS.reduce((safeRecord, field) => {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      safeRecord[field] = record[field];
    }
    return safeRecord;
  }, {});
}

function buildBroadcastPayload(payload) {
  const mutationType = payload?.eventType;
  if (!VALID_MUTATION_TYPES.has(mutationType)) {
    return null;
  }

  const newData = pickPublicFields(payload?.new);
  const oldData = pickPublicFields(payload?.old);
  const recordId = newData?.id || oldData?.id || null;

  if (!recordId) {
    return null;
  }

  return Object.freeze({
    mutationType,
    recordId,
    newData,
    oldData,
    timestamp: payload?.commit_timestamp || new Date().toISOString()
  });
}

log('info', 'Launching real-time CDC event broker');

const ordersChannel = supabase
  .channel('postgres-orders-stream')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'orders' },
    (payload) => {
      const broadcastData = buildBroadcastPayload(payload);
      if (!broadcastData) {
        log('warn', 'Rejected invalid CDC payload before broadcast');
        return;
      }

      log('info', 'Validated CDC event received', {
        mutationType: broadcastData.mutationType,
        recordId: broadcastData.recordId
      });
      io.emit('order_cdc_mutation', broadcastData);
    }
  )
  .subscribe((status, err) => {
    if (status === 'SUBSCRIBED') {
      log('info', 'Streaming connection established with PostgreSQL WAL');
    }

    if (err) {
      log('error', 'Replication pipeline connection error', { error: err.message || String(err) });
    }
  });

io.on('connection', (socket) => {
  log('info', 'Client connected', { socketId: socket.id });
  socket.on('disconnect', () => {
    log('info', 'Client disconnected', { socketId: socket.id });
  });
});

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    log('error', 'Port is already in use', { host: HOST, port: PORT });
    process.exit(1);
  }

  if (error.code === 'EPERM') {
    log('error', 'Port binding was blocked by the operating system or sandbox', { host: HOST, port: PORT });
    process.exit(1);
  }

  log('error', 'Server failed to start', { error: error.message || String(error) });
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  log('info', 'Real-time broker listening', { host: HOST, port: PORT });
});
