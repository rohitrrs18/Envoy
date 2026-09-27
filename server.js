require('dotenv').config();
const http = require('http');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const cors = require('cors');
const path = require('path');

const browserManager = require('./agent/browserManager');
const agentEngine = require('./agent/agentEngine');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3005;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Everyday Business App route
app.get('/demo-app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'demo-app.html'));
});

// Broadcast helper for WebSockets
function broadcast(message) {
  const payload = typeof message === 'string' ? message : JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Wire BrowserManager events to WebSockets
browserManager.onFrameCallback = (base64Jpeg) => {
  broadcast({
    type: 'screencast_frame',
    data: base64Jpeg,
    timestamp: Date.now()
  });
};

browserManager.onStateChangeCallback = (state) => {
  broadcast({
    type: 'browser_state',
    state
  });
};

// Wire AgentEngine events to WebSockets
agentEngine.on('status_change', (data) => broadcast({ type: 'agent_status', data }));
agentEngine.on('plan', (plan) => broadcast({ type: 'agent_plan', plan }));
agentEngine.on('step_update', (data) => broadcast({ type: 'step_update', data }));
agentEngine.on('thought', (thought) => broadcast({ type: 'agent_thought', thought }));
agentEngine.on('log', (entry) => broadcast({ type: 'agent_log', entry }));
agentEngine.on('hitl_request', (data) => broadcast({ type: 'hitl_request', data }));
agentEngine.on('data_extracted', (data) => broadcast({ type: 'data_extracted', data }));
agentEngine.on('task_completed', (data) => broadcast({ type: 'task_completed', data }));

// WebSocket client connection handling
wss.on('connection', (ws) => {
  console.log('[WebSocket] Client connected');

  // Send initial state immediately
  ws.send(JSON.stringify({
    type: 'init_state',
    browser: {
      url: browserManager.currentUrl,
      title: browserManager.currentTitle,
      isLoading: browserManager.isLoading,
      headless: browserManager.headless
    },
    agent: agentEngine.getState()
  }));

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw);
      switch (msg.type) {
        case 'navigate':
          if (msg.url) {
            await browserManager.navigateTo(msg.url);
          }
          break;

        case 'reload':
          await browserManager.reload();
          break;

        case 'back':
          await browserManager.goBack();
          break;

        case 'forward':
          await browserManager.goForward();
          break;

        case 'mouse_click':
          if (typeof msg.x === 'number' && typeof msg.y === 'number') {
            await browserManager.mouseClickCoordinates(msg.x, msg.y);
          }
          break;

        case 'start_task':
          if (msg.goal) {
            agentEngine.startTask(msg.goal, msg.config || {});
          }
          break;

        case 'pause_task':
          agentEngine.pauseTask();
          break;

        case 'resume_task':
          agentEngine.resumeTask();
          break;

        case 'stop_task':
          await agentEngine.stopTask();
          break;

        case 'hitl_response':
          await agentEngine.handleHITLResponse(msg.approved, msg.feedback);
          break;

        case 'toggle_headless':
          await browserManager.setHeadlessMode(msg.headless);
          break;
      }
    } catch (err) {
      console.error('[WebSocket] Message handling error:', err.message);
    }
  });

  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected');
  });
});

// REST API Endpoints
app.get('/api/status', (req, res) => {
  res.json({
    browser: {
      url: browserManager.currentUrl,
      title: browserManager.currentTitle,
      isLoading: browserManager.isLoading,
      headless: browserManager.headless
    },
    agent: agentEngine.getState()
  });
});

app.post('/api/navigate', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    const result = await browserManager.navigateTo(url);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/task/start', (req, res) => {
  const { goal, config } = req.body;
  if (!goal) return res.status(400).json({ error: 'Goal is required' });
  agentEngine.startTask(goal, config || {});
  res.json({ success: true, message: 'Task started' });
});

app.post('/api/task/pause', (req, res) => {
  agentEngine.pauseTask();
  res.json({ success: true });
});

app.post('/api/task/resume', (req, res) => {
  agentEngine.resumeTask();
  res.json({ success: true });
});

app.post('/api/task/stop', async (req, res) => {
  await agentEngine.stopTask();
  res.json({ success: true });
});

app.post('/api/task/hitl', async (req, res) => {
  const { approved, feedback } = req.body;
  await agentEngine.handleHITLResponse(approved, feedback);
  res.json({ success: true });
});

app.post('/api/browser/headless', async (req, res) => {
  const { headless } = req.body;
  await browserManager.setHeadlessMode(Boolean(headless));
  res.json({ success: true, headless: browserManager.headless });
});

app.get('/api/data/export', (req, res) => {
  const format = req.query.format || 'json';
  const data = agentEngine.extractedData || [];

  if (format === 'csv') {
    if (!data.length) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="extracted_data.csv"');
      return res.send('');
    }
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    for (const row of data) {
      const values = headers.map(h => {
        const val = row[h] ? String(row[h]).replace(/"/g, '""') : '';
        return `"${val}"`;
      });
      csvRows.push(values.join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="extracted_data.csv"');
    return res.send(csvRows.join('\n'));
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="extracted_data.json"');
  res.send(JSON.stringify(data, null, 2));
});

// Launch server & initial browser
server.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(`🚀 DOAT Autonomous Browser Agent running on port ${PORT}`);
  console.log(`🌐 Dashboard:  http://localhost:${PORT}`);
  console.log(`🏢 Demo App:   http://localhost:${PORT}/demo-app`);
  console.log(`=======================================================`);

  try {
    console.log('[Init] Initializing Chromium browser instance...');
    await browserManager.launch({ headless: true });
    // Default initial landing page
    await browserManager.navigateTo('https://news.ycombinator.com');
    console.log('[Init] Browser initialized and ready!');
  } catch (err) {
    console.error('[Init] Error launching browser at startup:', err.message);
  }
});

// Graceful cleanup
process.on('SIGINT', async () => {
  console.log('\n[Shutdown] Closing browser and exiting...');
  await browserManager.close();
  process.exit(0);
});
