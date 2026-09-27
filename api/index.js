require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const browserManager = require('../agent/browserManager');
const agentEngine = require('../agent/agentEngine');

const app = express();

app.use(cors());
app.use(express.json());

// Server-Sent Events clients for Vercel real-time streaming
const sseClients = new Set();

function broadcastSSE(type, data) {
  const payload = `data: ${JSON.stringify({ type, data, timestamp: Date.now() })}\n\n`;
  sseClients.forEach((client) => {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  });
}

// Wire BrowserManager & AgentEngine events to SSE
browserManager.onFrameCallback = (base64Jpeg) => {
  broadcastSSE('screencast_frame', base64Jpeg);
};

browserManager.onStateChangeCallback = (state) => {
  broadcastSSE('browser_state', state);
};

agentEngine.on('status_change', (data) => broadcastSSE('agent_status', data));
agentEngine.on('plan', (plan) => broadcastSSE('agent_plan', plan));
agentEngine.on('step_update', (data) => broadcastSSE('step_update', data));
agentEngine.on('thought', (thought) => broadcastSSE('agent_thought', thought));
agentEngine.on('log', (entry) => broadcastSSE('agent_log', entry));
agentEngine.on('hitl_request', (data) => broadcastSSE('hitl_request', data));
agentEngine.on('data_extracted', (data) => broadcastSSE('data_extracted', data));
agentEngine.on('task_completed', (data) => broadcastSSE('task_completed', data));

// SSE Endpoint for Vercel Serverless streaming
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Send initial state immediately
  res.write(`data: ${JSON.stringify({
    type: 'init_state',
    data: {
      browser: {
        url: browserManager.currentUrl,
        title: browserManager.currentTitle,
        isLoading: browserManager.isLoading,
        headless: browserManager.headless
      },
      agent: agentEngine.getState()
    }
  })}\n\n`);

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// REST Endpoints
app.get('/api/status', async (req, res) => {
  let screenshot = null;
  try {
    screenshot = await browserManager.captureScreenshot();
  } catch (e) {}

  res.json({
    browser: {
      url: browserManager.currentUrl,
      title: browserManager.currentTitle,
      isLoading: browserManager.isLoading,
      headless: browserManager.headless,
      screenshot
    },
    agent: agentEngine.getState()
  });
});

app.post('/api/navigate', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    const result = await browserManager.navigateTo(url);
    const screenshot = await browserManager.captureScreenshot();
    broadcastSSE('screencast_frame', screenshot);
    res.json({ ...result, screenshot });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/task/start', async (req, res) => {
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

module.exports = app;
