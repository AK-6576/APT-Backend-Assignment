if (window.location.protocol === 'file:') {
  window.location.replace('http://localhost:3000');
}

const socket = window.location.protocol === 'file:' ? null : io();
const state = {
  events: [],
  counts: { INSERT: 0, UPDATE: 0, DELETE: 0 }
};

const connectionEl = document.getElementById('connection');
const connectionLabelEl = document.getElementById('connection-label');
const feedEl = document.getElementById('activity-feed');
const historyEl = document.getElementById('history');
const clearButton = document.getElementById('clear-feed');
const metricEls = {
  total: document.getElementById('metric-total'),
  INSERT: document.getElementById('metric-insert'),
  UPDATE: document.getElementById('metric-update'),
  DELETE: document.getElementById('metric-delete')
};

function setConnectionStatus(status) {
  const connected = status === 'Connected';
  connectionEl.className = `connection ${connected ? 'connected' : 'disconnected'}`;
  connectionLabelEl.textContent = status;
}

function safeValue(value, fallback = 'Not provided') {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  return String(value);
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return 'Timestamp unavailable';
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}

function operationSummary(event) {
  const type = event.mutationType;
  const newData = event.newData || {};
  const oldData = event.oldData || {};

  if (type === 'INSERT') {
    return {
      title: `Order ${safeValue(event.recordId, 'pending reference')} created`,
      subtitle: `${safeValue(newData.customer_name, 'Customer')} requested ${safeValue(newData.product_name, 'a product')}.`
    };
  }

  if (type === 'UPDATE') {
    return {
      title: `Order ${safeValue(event.recordId, 'pending reference')} updated`,
      subtitle: `Status moved from ${safeValue(oldData.status, 'unknown')} to ${safeValue(newData.status, 'updated')}.`
    };
  }

  if (type === 'DELETE') {
    return {
      title: `Order ${safeValue(event.recordId, 'pending reference')} removed`,
      subtitle: `Archived reference for ${safeValue(oldData.customer_name, 'unspecified customer')}.`
    };
  }

  return {
    title: 'Unsupported operation received',
    subtitle: 'The broker rejected unsupported mutation types before broadcast.'
  };
}

function createDetail(label, value) {
  const detail = document.createElement('div');
  detail.className = 'detail';

  const labelEl = document.createElement('p');
  labelEl.className = 'detail-label';
  labelEl.textContent = label;

  const valueEl = document.createElement('p');
  valueEl.className = 'detail-value';
  valueEl.textContent = safeValue(value);

  detail.append(labelEl, valueEl);
  return detail;
}

function renderMetrics() {
  metricEls.total.textContent = String(state.events.length);
  metricEls.INSERT.textContent = String(state.counts.INSERT);
  metricEls.UPDATE.textContent = String(state.counts.UPDATE);
  metricEls.DELETE.textContent = String(state.counts.DELETE);
}

function renderFeed() {
  feedEl.textContent = '';

  if (state.events.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.id = 'empty-state';

    const wrap = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = 'No operations yet';
    const copy = document.createElement('p');
    copy.textContent = 'Run the simulation or mutate the orders table. New events will appear here after the database commit is streamed to the broker.';
    wrap.append(title, copy);
    empty.appendChild(wrap);
    feedEl.appendChild(empty);
    return;
  }

  state.events.slice(0, 8).forEach((event) => {
    const card = document.createElement('article');
    card.className = 'event-card';

    const top = document.createElement('div');
    top.className = 'event-top';

    const copy = document.createElement('div');
    const summary = operationSummary(event);
    const title = document.createElement('p');
    title.className = 'event-title';
    title.textContent = summary.title;
    const subtitle = document.createElement('p');
    subtitle.className = 'event-subtitle';
    subtitle.textContent = summary.subtitle;
    copy.append(title, subtitle);

    const badge = document.createElement('span');
    badge.className = `badge badge-${event.mutationType}`;
    badge.textContent = event.mutationType;

    top.append(copy, badge);

    const details = document.createElement('div');
    details.className = 'details-grid';
    details.append(
      createDetail('Record ID', event.recordId),
      createDetail('Status', event.newData?.status || event.oldData?.status),
      createDetail('Committed', formatDate(event.timestamp))
    );

    card.append(top, details);
    feedEl.appendChild(card);
  });
}

function renderHistory() {
  historyEl.textContent = '';

  const rows = state.events.slice(0, 10);
  if (rows.length === 0) {
    const row = document.createElement('div');
    row.className = 'history-row';
    const time = document.createElement('div');
    time.className = 'history-time';
    time.textContent = 'Idle';
    const copy = document.createElement('div');
    copy.className = 'history-copy';
    const title = document.createElement('p');
    title.textContent = 'Awaiting committed changes';
    const note = document.createElement('span');
    note.textContent = 'The history will populate as validated events arrive.';
    copy.append(title, note);
    row.append(time, copy);
    historyEl.appendChild(row);
    return;
  }

  rows.forEach((event) => {
    const row = document.createElement('div');
    row.className = 'history-row';

    const time = document.createElement('div');
    time.className = 'history-time';
    time.textContent = formatDate(event.timestamp);

    const copy = document.createElement('div');
    copy.className = 'history-copy';
    const title = document.createElement('p');
    title.textContent = `${event.mutationType} order ${safeValue(event.recordId, 'unknown')}`;
    const note = document.createElement('span');
    note.textContent = operationSummary(event).subtitle;
    copy.append(title, note);

    row.append(time, copy);
    historyEl.appendChild(row);
  });
}

function render() {
  renderMetrics();
  renderFeed();
  renderHistory();
}

if (socket) {
  socket.on('connect', () => {
    setConnectionStatus('Connected');
  });

  socket.on('disconnect', () => {
    setConnectionStatus('Disconnected');
  });

  socket.on('order_cdc_mutation', (event) => {
    if (!event || !['INSERT', 'UPDATE', 'DELETE'].includes(event.mutationType)) {
      return;
    }

    state.events.unshift(event);
    state.events = state.events.slice(0, 50);
    state.counts[event.mutationType] += 1;
    render();
  });
}

clearButton.addEventListener('click', () => {
  state.events = [];
  state.counts = { INSERT: 0, UPDATE: 0, DELETE: 0 };
  render();
});

render();
