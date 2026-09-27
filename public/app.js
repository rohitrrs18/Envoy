// ENVOY Autonomous Browser Agent - Client Application
document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const urlForm = document.getElementById('urlForm');
  const urlInput = document.getElementById('urlInput');
  const btnBack = document.getElementById('btnBack');
  const btnForward = document.getElementById('btnForward');
  const btnReload = document.getElementById('btnReload');
  const pageTitleText = document.getElementById('pageTitleText');
  const agentStatusBadge = document.getElementById('agentStatusBadge');
  const agentStatusText = document.getElementById('agentStatusText');
  const btnToggleHeadless = document.getElementById('btnToggleHeadless');
  const headlessBtnText = document.getElementById('headlessBtnText');
  const btnSettings = document.getElementById('btnSettings');

  // Viewport
  const canvas = document.getElementById('screencastCanvas');
  const ctx = canvas.getContext('2d');
  const viewportPlaceholder = document.getElementById('viewportPlaceholder');
  const elementHighlight = document.getElementById('elementHighlight');
  const btnManualClickToggle = document.getElementById('btnManualClickToggle');
  const manualClickText = document.getElementById('manualClickText');

  // Task & Agent
  const goalInput = document.getElementById('goalInput');
  const btnRunAgent = document.getElementById('btnRunAgent');
  const btnPauseAgent = document.getElementById('btnPauseAgent');
  const btnStopAgent = document.getElementById('btnStopAgent');
  const taskChips = document.querySelectorAll('.task-chip');

  // Tabs & Views
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const planList = document.getElementById('planList');
  const planEmptyState = document.getElementById('planEmptyState');
  const planCountBadge = document.getElementById('planCountBadge');
  const agentThoughtText = document.getElementById('agentThoughtText');
  const actionLogsList = document.getElementById('actionLogsList');
  const btnClearLogs = document.getElementById('btnClearLogs');
  const dataSummaryText = document.getElementById('dataSummaryText');
  const dataCountBadge = document.getElementById('dataCountBadge');
  const dataEmptyState = document.getElementById('dataEmptyState');
  const dataTableWrapper = document.getElementById('dataTableWrapper');
  const btnExportJson = document.getElementById('btnExportJson');
  const btnExportCsv = document.getElementById('btnExportCsv');

  // Modals
  const hitlModal = document.getElementById('hitlModal');
  const hitlActionTitle = document.getElementById('hitlActionTitle');
  const hitlActionDesc = document.getElementById('hitlActionDesc');
  const btnHitlApprove = document.getElementById('btnHitlApprove');
  const btnHitlReject = document.getElementById('btnHitlReject');

  const settingsModal = document.getElementById('settingsModal');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const aiProviderSelect = document.getElementById('aiProviderSelect');
  const apiKeyRow = document.getElementById('apiKeyRow');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const stepDelayInput = document.getElementById('stepDelayInput');
  const delayValueLabel = document.getElementById('delayValueLabel');
  const btnSaveSettings = document.getElementById('btnSaveSettings');

  // State
  let ws = null;
  let isHeadless = true;
  let isManualClickEnabled = false;
  let currentExtractedData = [];
  let currentPlan = [];
  let agentConfig = {
    provider: 'builtin',
    apiKey: '',
    stepDelay: 700,
    headless: true
  };

  // Image buffer for smooth canvas rendering
  const frameImg = new Image();
  frameImg.onload = () => {
    ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);
    if (viewportPlaceholder) {
      viewportPlaceholder.style.display = 'none';
    }
  };

  // ==========================================================================
  // Connection Management (WebSocket with SSE / REST fallback for Vercel)
  // ==========================================================================
  let isUsingSSE = false;
  let eventSource = null;

  function initConnection() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WS] Connected to ENVOY Agent Server');
        isUsingSSE = false;
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleServerMessage(msg);
        } catch (err) {
          console.error('[WS] Parse error:', err);
        }
      };

      ws.onclose = () => {
        // If WebSocket fails or closes immediately (common on Vercel Serverless), switch to SSE
        if (!isUsingSSE) {
          console.log('[WS] WebSocket closed or not supported on this host. Falling back to Server-Sent Events (SSE)...');
          initSSE();
        }
      };

      ws.onerror = () => {
        if (!isUsingSSE) {
          initSSE();
        }
      };
    } catch (e) {
      initSSE();
    }
  }

  function initSSE() {
    if (isUsingSSE && eventSource) return;
    isUsingSSE = true;
    console.log('[SSE] Connecting to /api/stream...');
    
    eventSource = new EventSource('/api/stream');

    eventSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type && msg.data) {
          handleServerMessage({ type: msg.type, ...msg });
        }
      } catch (err) {
        console.error('[SSE] Parse error:', err);
      }
    };

    eventSource.onerror = () => {
      console.warn('[SSE] EventSource reconnecting...');
    };

    // Also fetch initial status via REST
    fetch('/api/status')
      .then(res => res.json())
      .then(data => {
        if (data.browser) updateBrowserState(data.browser);
        if (data.browser && data.browser.screenshot) {
          frameImg.src = `data:image/jpeg;base64,${data.browser.screenshot}`;
        }
        if (data.agent) updateAgentFullState(data.agent);
      })
      .catch(() => {});
  }

  async function sendAction(type, payload = {}) {
    if (ws && ws.readyState === WebSocket.OPEN && !isUsingSSE) {
      ws.send(JSON.stringify({ type, ...payload }));
      return;
    }

    // REST Fallback for Vercel
    try {
      if (type === 'navigate') {
        const res = await fetch('/api/navigate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: payload.url })
        });
        const data = await res.json();
        if (data.screenshot) {
          frameImg.src = `data:image/jpeg;base64,${data.screenshot}`;
        }
      } else if (type === 'start_task') {
        await fetch('/api/task/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goal: payload.goal, config: payload.config })
        });
      } else if (type === 'pause_task') {
        await fetch('/api/task/pause', { method: 'POST' });
      } else if (type === 'resume_task') {
        await fetch('/api/task/resume', { method: 'POST' });
      } else if (type === 'stop_task') {
        await fetch('/api/task/stop', { method: 'POST' });
      } else if (type === 'hitl_response') {
        await fetch('/api/task/hitl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approved: payload.approved, feedback: payload.feedback })
        });
      } else if (type === 'toggle_headless') {
        await fetch('/api/browser/headless', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ headless: payload.headless })
        });
      }
    } catch (err) {
      console.error('[Action] REST fallback error:', err);
    }
  }

  function handleServerMessage(msg) {
    switch (msg.type) {
      case 'init_state':
        if (msg.browser) updateBrowserState(msg.browser);
        if (msg.agent) updateAgentFullState(msg.agent);
        break;

      case 'screencast_frame':
        frameImg.src = `data:image/jpeg;base64,${msg.data}`;
        break;

      case 'browser_state':
        updateBrowserState(msg.state);
        break;

      case 'agent_status':
        updateAgentStatus(msg.data.status);
        break;

      case 'agent_plan':
        renderPlan(msg.plan);
        break;

      case 'step_update':
        updateStepItem(msg.data.stepIndex, msg.data.step);
        break;

      case 'agent_thought':
        renderThought(msg.thought);
        break;

      case 'agent_log':
        appendLogEntry(msg.entry);
        break;

      case 'hitl_request':
        showHITLModal(msg.data);
        break;

      case 'data_extracted':
        renderExtractedData(msg.data);
        break;

      case 'task_completed':
        updateAgentStatus('completed');
        renderThought(`Task completed successfully! Processed ${msg.data.logsCount} operations.`);
        break;
    }
  }

  // ==========================================================================
  // Browser Navigation & Editable Address Bar
  // ==========================================================================
  urlForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (url) {
      sendAction('navigate', { url });
    }
  });

  btnBack.addEventListener('click', () => sendAction('back'));
  btnForward.addEventListener('click', () => sendAction('forward'));
  btnReload.addEventListener('click', () => sendAction('reload'));

  function updateBrowserState(state) {
    if (!state) return;
    if (document.activeElement !== urlInput && state.url && state.url !== 'about:blank') {
      urlInput.value = state.url;
    }
    if (state.title) {
      pageTitleText.textContent = state.title;
    }
    if (state.headless !== undefined) {
      isHeadless = state.headless;
      headlessBtnText.textContent = isHeadless ? 'Headless: ON' : 'Desktop Window';
    }
  }

  btnToggleHeadless.addEventListener('click', () => {
    isHeadless = !isHeadless;
    sendAction('toggle_headless', { headless: isHeadless });
    headlessBtnText.textContent = isHeadless ? 'Headless: ON' : 'Desktop Window';
  });

  // Manual Click Mode on Viewport
  btnManualClickToggle.addEventListener('click', () => {
    isManualClickEnabled = !isManualClickEnabled;
    manualClickText.textContent = isManualClickEnabled ? 'Click: Active (Clickable)' : 'Click: View Only';
    canvas.style.cursor = isManualClickEnabled ? 'pointer' : 'default';
  });

  canvas.addEventListener('click', (e) => {
    if (!isManualClickEnabled) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    sendAction('mouse_click', { x, y });
  });

  // ==========================================================================
  // Agent Task Execution & Control
  // ==========================================================================
  btnRunAgent.addEventListener('click', () => {
    const goal = goalInput.value.trim();
    if (!goal) {
      goalInput.focus();
      return;
    }
    sendAction('start_task', { goal, config: agentConfig });
    // Switch to Plan tab automatically
    switchTab('tabPlan');
  });

  btnPauseAgent.addEventListener('click', () => sendAction('pause_task'));
  btnStopAgent.addEventListener('click', () => sendAction('stop_task'));

  // Quick Test Tasks
  taskChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const task = chip.getAttribute('data-task');
      goalInput.value = task;
      sendAction('start_task', { goal: task, config: agentConfig });
      switchTab('tabPlan');
    });
  });

  function updateAgentStatus(status) {
    agentStatusBadge.className = 'status-badge';
    
    if (status === 'running' || status === 'planning') {
      agentStatusBadge.classList.add('status-running');
      agentStatusText.textContent = status === 'planning' ? 'Planning...' : 'Agent Running';
      btnRunAgent.disabled = true;
      btnPauseAgent.disabled = false;
      btnStopAgent.disabled = false;
    } else if (status === 'waiting_approval') {
      agentStatusBadge.classList.add('status-hitl');
      agentStatusText.textContent = 'Approval Required';
      btnRunAgent.disabled = true;
      btnPauseAgent.disabled = true;
      btnStopAgent.disabled = false;
    } else if (status === 'completed') {
      agentStatusBadge.classList.add('status-completed');
      agentStatusText.textContent = 'Mission Complete';
      btnRunAgent.disabled = false;
      btnPauseAgent.disabled = true;
      btnStopAgent.disabled = true;
    } else {
      agentStatusBadge.classList.add('status-idle');
      agentStatusText.textContent = status === 'paused' ? 'Agent Paused' : 'Agent Idle';
      btnRunAgent.disabled = false;
      btnPauseAgent.disabled = true;
      btnStopAgent.disabled = true;
    }
  }

  function updateAgentFullState(state) {
    if (!state) return;
    if (state.goal) goalInput.value = state.goal;
    updateAgentStatus(state.status);
    if (state.plan && state.plan.length > 0) renderPlan(state.plan);
    if (state.currentThought) renderThought(state.currentThought);
    if (state.logs && state.logs.length > 0) {
      actionLogsList.innerHTML = '';
      state.logs.forEach(appendLogEntry);
    }
    if (state.extractedData && state.extractedData.length > 0) {
      renderExtractedData(state.extractedData);
    }
  }

  // ==========================================================================
  // Plan Rendering
  // ==========================================================================
  function renderPlan(steps) {
    currentPlan = steps || [];
    planCountBadge.textContent = currentPlan.length;

    if (!currentPlan || currentPlan.length === 0) {
      planEmptyState.style.display = 'flex';
      planList.innerHTML = '';
      return;
    }

    planEmptyState.style.display = 'none';
    planList.innerHTML = '';

    currentPlan.forEach((step, idx) => {
      const item = document.createElement('div');
      item.className = `plan-step-item step-${step.status || 'pending'}`;
      item.id = `step-item-${idx}`;

      const iconChar = step.status === 'completed' ? '✓' : step.status === 'failed' ? '✕' : `${idx + 1}`;

      item.innerHTML = `
        <div class="step-status-icon">${iconChar}</div>
        <div class="step-content">
          <div class="step-title-row">
            <span class="step-title">${escapeHtml(step.title)}</span>
            ${step.isRisky ? '<span class="risk-badge">RISKY ACTION</span>' : ''}
          </div>
          <div class="step-desc">${escapeHtml(step.description || '')}</div>
        </div>
      `;

      planList.appendChild(item);
    });
  }

  function updateStepItem(idx, step) {
    const el = document.getElementById(`step-item-${idx}`);
    if (!el) {
      if (currentPlan.length) renderPlan(currentPlan);
      return;
    }

    el.className = `plan-step-item step-${step.status}`;
    const iconEl = el.querySelector('.step-status-icon');
    if (iconEl) {
      iconEl.textContent = step.status === 'completed' ? '✓' : step.status === 'failed' ? '✕' : `${idx + 1}`;
    }
  }

  // ==========================================================================
  // Thoughts & Logs
  // ==========================================================================
  function renderThought(thought) {
    agentThoughtText.textContent = thought || 'Analyzing...';
  }

  function appendLogEntry(entry) {
    if (!entry) return;
    const item = document.createElement('div');
    item.className = 'log-entry';

    const typeTagClass = `tag-${entry.type || 'info'}`;
    item.innerHTML = `
      <span class="log-time">${entry.time || ''}</span>
      <span class="log-tag ${typeTagClass}">${entry.type || 'info'}</span>
      <span class="log-text">${escapeHtml(entry.message)}</span>
    `;

    actionLogsList.appendChild(item);
    actionLogsList.scrollTop = actionLogsList.scrollHeight;
  }

  btnClearLogs.addEventListener('click', () => {
    actionLogsList.innerHTML = '';
  });

  // ==========================================================================
  // Extracted Real Data Display & Export
  // ==========================================================================
  function renderExtractedData(data) {
    currentExtractedData = data || [];
    dataCountBadge.textContent = currentExtractedData.length;
    dataSummaryText.textContent = `${currentExtractedData.length} live records extracted`;

    if (!currentExtractedData || currentExtractedData.length === 0) {
      dataEmptyState.style.display = 'flex';
      dataTableWrapper.style.display = 'none';
      dataTableWrapper.innerHTML = '';
      return;
    }

    dataEmptyState.style.display = 'none';
    dataTableWrapper.style.display = 'block';

    const keys = Object.keys(currentExtractedData[0]);
    let html = '<table class="extracted-table"><thead><tr>';
    keys.forEach(k => {
      html += `<th>${escapeHtml(k.toUpperCase())}</th>`;
    });
    html += '</tr></thead><tbody>';

    currentExtractedData.forEach(row => {
      html += '<tr>';
      keys.forEach(k => {
        let val = row[k];
        if (typeof val === 'string' && val.startsWith('http')) {
          html += `<td><a href="${escapeHtml(val)}" target="_blank">${escapeHtml(val)}</a></td>`;
        } else {
          html += `<td>${escapeHtml(String(val !== undefined ? val : ''))}</td>`;
        }
      });
      html += '</tr>';
    });
    html += '</tbody></table>';

    dataTableWrapper.innerHTML = html;
  }

  btnExportJson.addEventListener('click', () => {
    window.location.href = '/api/data/export?format=json';
  });

  btnExportCsv.addEventListener('click', () => {
    window.location.href = '/api/data/export?format=csv';
  });

  // ==========================================================================
  // Human-in-the-Loop (HITL) Safety Confirmation
  // ==========================================================================
  function showHITLModal(data) {
    hitlActionTitle.textContent = data.title || 'Sensitive Browser Action';
    hitlActionDesc.textContent = data.description || 'Action requires user permission';
    hitlModal.style.display = 'flex';
  }

  btnHitlApprove.addEventListener('click', () => {
    hitlModal.style.display = 'none';
    sendAction('hitl_response', { approved: true });
  });

  btnHitlReject.addEventListener('click', () => {
    hitlModal.style.display = 'none';
    sendAction('hitl_response', { approved: false, feedback: 'User rejected risky action' });
  });

  // ==========================================================================
  // Tabs Navigation
  // ==========================================================================
  function switchTab(targetId) {
    tabBtns.forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-tab') === targetId);
    });
    tabPanes.forEach(p => {
      p.classList.toggle('active', p.id === targetId);
    });
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.getAttribute('data-tab'));
    });
  });

  // ==========================================================================
  // Settings Modal
  // ==========================================================================
  btnSettings.addEventListener('click', () => {
    settingsModal.style.display = 'flex';
  });

  btnCloseSettings.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });

  aiProviderSelect.addEventListener('change', () => {
    const val = aiProviderSelect.value;
    apiKeyRow.style.display = val === 'builtin' || val === 'ollama' ? 'none' : 'block';
  });

  stepDelayInput.addEventListener('input', () => {
    delayValueLabel.textContent = `${stepDelayInput.value}ms`;
  });

  btnSaveSettings.addEventListener('click', () => {
    agentConfig.provider = aiProviderSelect.value;
    agentConfig.apiKey = apiKeyInput.value.trim();
    agentConfig.stepDelay = parseInt(stepDelayInput.value, 10);
    const selectedRadio = document.querySelector('input[name="headlessRadio"]:checked');
    if (selectedRadio) {
      agentConfig.headless = selectedRadio.value === 'true';
      if (agentConfig.headless !== isHeadless) {
        isHeadless = agentConfig.headless;
        sendAction('toggle_headless', { headless: isHeadless });
      }
    }
    settingsModal.style.display = 'none';
  });

  // Helper
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initialize
  initConnection();
});
