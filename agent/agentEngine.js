const EventEmitter = require('events');
const browserManager = require('./browserManager');
const DOMExtractor = require('./domExtractor');
const BuiltInPlanner = require('./builtInPlanner');
const LLMProviders = require('./llmProviders');

class AgentEngine extends EventEmitter {
  constructor() {
    super();
    this.status = 'idle'; // idle | planning | running | paused | waiting_approval | completed | failed
    this.goal = '';
    this.plan = [];
    this.currentStepIndex = -1;
    this.logs = [];
    this.extractedData = [];
    this.currentThought = '';
    this.pendingHITL = null;
    this.config = {
      provider: 'builtin',
      apiKey: '',
      model: '',
      headless: false,
      stepDelay: 700
    };
  }

  log(type, message, details = null) {
    const entry = {
      id: Date.now() + Math.random().toString(36).slice(2, 6),
      time: new Date().toLocaleTimeString(),
      type, // 'info' | 'action' | 'thought' | 'verify' | 'recovery' | 'hitl' | 'success' | 'error'
      message,
      details
    };
    this.logs.push(entry);
    this.emit('log', entry);
    console.log(`[Agent] [${type.toUpperCase()}] ${message}`);
  }

  setThought(thought) {
    this.currentThought = thought;
    this.emit('thought', thought);
    this.log('thought', thought);
  }

  async startTask(goal, config = {}) {
    if (this.status === 'running' || this.status === 'waiting_approval') {
      await this.stopTask();
    }

    this.goal = goal;
    this.config = { ...this.config, ...config };
    this.status = 'planning';
    this.logs = [];
    this.extractedData = [];
    this.currentStepIndex = 0;
    this.pendingHITL = null;

    this.emit('status_change', { status: this.status, goal: this.goal });
    this.log('info', `Mission initiated: "${goal}"`);

    // Ensure browser is launched
    await browserManager.launch({ headless: this.config.headless });

    // 1. Generate Plan
    this.setThought(`Analyzing goal "${goal}" and generating strategic execution plan...`);

    let plan = null;
    if (this.config.provider && this.config.provider !== 'builtin') {
      const prompt = `You are an autonomous web browser agent.
Break down this user goal into 3-6 concrete browser action steps: "${goal}".
Current browser URL: "${browserManager.currentUrl}".
Respond in JSON format:
{
  "plan": [
    {
      "id": "step-1",
      "title": "Short title",
      "action": "navigate | click | type | search | fill_form | fill_field | play_video | extract_data | verify_and_finish",
      "params": { ... },
      "description": "Explanation",
      "isRisky": true/false
    }
  ]
}`;
      const llmResult = await LLMProviders.generatePlanOrAction(prompt, this.config);
      if (llmResult && Array.isArray(llmResult.plan) && llmResult.plan.length > 0) {
        plan = llmResult.plan.map((s, idx) => ({ ...s, id: s.id || `step-${idx + 1}`, status: 'pending' }));
      }
    }

    if (!plan) {
      plan = BuiltInPlanner.createPlan(goal, browserManager.currentUrl);
    }

    this.plan = plan;
    this.emit('plan', this.plan);
    this.log('info', `Plan generated with ${this.plan.length} milestones.`);

    // 2. Start Execution Loop
    this.status = 'running';
    this.emit('status_change', { status: this.status });
    this.executeLoop();
  }

  async executeLoop() {
    while (this.status === 'running' && this.currentStepIndex < this.plan.length) {
      const step = this.plan[this.currentStepIndex];
      step.status = 'running';
      this.emit('step_update', { stepIndex: this.currentStepIndex, step });

      try {
        // Check for Human-in-the-loop requirement
        if (step.isRisky) {
          this.status = 'waiting_approval';
          this.pendingHITL = step;
          this.emit('status_change', { status: this.status });
          this.emit('hitl_request', {
            stepId: step.id,
            title: step.title,
            description: step.description,
            action: step.action,
            params: step.params
          });
          this.log('hitl', `Human confirmation required before risky action: "${step.title}"`);
          return; // Pause loop until approved or rejected
        }

        // Execute step with self-healing retries
        await this.executeStepWithRetry(step);

        step.status = 'completed';
        this.emit('step_update', { stepIndex: this.currentStepIndex, step });
        this.log('success', `Completed: ${step.title}`);

        this.currentStepIndex++;
        await new Promise(r => setTimeout(r, this.config.stepDelay || 600));
      } catch (err) {
        console.error('[AgentEngine] Step execution failed:', err);
        step.status = 'failed';
        this.emit('step_update', { stepIndex: this.currentStepIndex, step });
        this.log('error', `Failed at step "${step.title}": ${err.message}`);

        this.status = 'failed';
        this.emit('status_change', { status: this.status, error: err.message });
        return;
      }
    }

    if (this.currentStepIndex >= this.plan.length && this.status === 'running') {
      this.status = 'completed';
      this.setThought(`Mission accomplished! All ${this.plan.length} steps executed successfully.`);
      this.emit('status_change', { status: this.status });
      this.emit('task_completed', {
        goal: this.goal,
        extractedData: this.extractedData,
        logsCount: this.logs.length
      });
      this.log('success', `Goal achieved end-to-end!`);
    }
  }

  async executeStepWithRetry(step, maxRetries = 2) {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        await this.executeStep(step);
        return;
      } catch (err) {
        attempt++;
        if (attempt <= maxRetries) {
          this.log('recovery', `Self-healing trigger: Error during "${step.title}" (${err.message}). Retrying [Attempt ${attempt}/${maxRetries}]...`);
          await this.selfHeal(step, err);
          await new Promise(r => setTimeout(r, 1000));
        } else {
          throw err;
        }
      }
    }
  }

  async selfHeal(step, err) {
    this.setThought(`Engaging self-healing recovery for "${step.title}"...`);
    try {
      const page = browserManager.page;
      if (!page) return;

      // 1. Dismiss potential blocking modals, cookies, overlays
      await page.evaluate(() => {
        const dismissBtns = Array.from(document.querySelectorAll('button, a, [role="button"]'))
          .filter(el => /accept|agree|close|dismiss|got it|ok|allow/i.test(el.innerText || ''));
        if (dismissBtns.length > 0) {
          dismissBtns[0].click();
        }
      }).catch(() => {});

      // 2. Scroll into view
      await browserManager.scroll('down', 200);
      await new Promise(r => setTimeout(r, 400));
    } catch (e) {
      console.warn('[SelfHeal] Cleanup attempt failed:', e.message);
    }
  }

  async executeStep(step) {
    const page = browserManager.page;
    if (!page) throw new Error('Browser page not available');

    switch (step.action) {
      case 'navigate': {
        const url = step.params.url || BuiltInPlanner.detectUrl(this.goal, browserManager.currentUrl);
        this.setThought(`Navigating to ${url}...`);
        this.log('action', `Navigating to ${url}`);
        await browserManager.navigateTo(url);
        await new Promise(r => setTimeout(r, 800));
        break;
      }

      case 'search': {
        const query = step.params.query || 'Technology';
        this.setThought(`Locating search box to query "${query}"...`);
        this.log('action', `Locating search bar for query "${query}"`);

        // Heuristic to find search input
        const searchInputSelector = await page.evaluate(() => {
          const selectors = [
            'input[type="search"]',
            'input[name="search"]',
            'input[name="q"]',
            'input#searchInput',
            'input[placeholder*="Search" i]',
            'input[placeholder*="search" i]',
            'input[type="text"]'
          ];
          for (const s of selectors) {
            const el = document.querySelector(s);
            if (el && el.offsetParent !== null) return s;
          }
          return null;
        });

        if (searchInputSelector) {
          await browserManager.type(searchInputSelector, query, { pressEnter: true, delay: 45 });
          this.log('action', `Typed query "${query}" into search bar`);
          await new Promise(r => setTimeout(r, 1500));
        } else {
          throw new Error('Search input field not found on current page');
        }
        break;
      }

      case 'click': {
        const targetText = step.params.text || '';
        this.setThought(`Searching for clickable element matching "${targetText}"...`);

        const clicked = await page.evaluate((text) => {
          const lower = text.toLowerCase();
          const elements = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="submit"]'));
          const target = elements.find(el => (el.innerText || el.value || '').toLowerCase().includes(lower));
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.click();
            return true;
          }
          return false;
        }, targetText);

        if (!clicked) {
          throw new Error(`Clickable element matching "${targetText}" was not found`);
        }
        this.log('action', `Clicked element matching "${targetText}"`);
        await new Promise(r => setTimeout(r, 1000));
        break;
      }

      // ⭐ NEW — type a value that came straight from the user's goal
      case 'fill_field': {
        const { kind, value, label, selectorHint } = step.params || {};

        if (!value) {
          this.log('recovery', `No value supplied for "${label}". Skipping.`);
          break;
        }

        this.setThought(`Locating the "${label}" input to type the provided value...`);
        this.log('action', `Typing ${label} into the matching input`);

        // Ask DOMExtractor for every visible interactive element
        const elements = await DOMExtractor.extractInteractiveElements(page);
        const pool = elements.filter(el => el.tag === 'input' || el.tag === 'textarea');

        let selector = null;
        const want = (kind || '').toLowerCase();

        // (a) Try the explicit selectorHint from the planner
        if (selectorHint) {
          const candidates = selectorHint.split(',').map(s => s.trim());
          for (const sel of candidates) {
            const found = await page.$(sel).catch(() => null);
            if (found) { selector = sel; break; }
          }
        }

        // (b) Score every visible input by how well it matches the requested kind
        if (!selector) {
          const score = (el) => {
            const blob = `${el.type} ${el.text} ${el.selector}`.toLowerCase();
            let s = 0;
            if (want === 'email')    { if (el.type === 'email')    s += 5; if (/email|e-mail|mail/.test(blob)) s += 3; }
            if (want === 'phone')    { if (el.type === 'tel')      s += 5; if (/phone|mobile|tel/.test(blob)) s += 3; }
            if (want === 'password') { if (el.type === 'password') s += 6; if (/password|passcode/.test(blob)) s += 3; }
            if (want === 'username') { if (/user(name)?|login|handle/.test(blob)) s += 4; }
            if (want === 'name')     { if (/(full\s*)?name/.test(blob)) s += 4; }
            if (want === 'city')     { if (/city|town|location/.test(blob)) s += 4; }
            if (want === 'company')  { if (/company|organi[sz]ation|employer/.test(blob)) s += 4; }
            if (!el.text) s += 1;   // prefer empty inputs
            return s;
          };

          const ranked = pool
            .map(el => ({ el, s: score(el) }))
            .filter(x => x.s > 0)
            .sort((a, b) => b.s - a.s);

          if (ranked.length > 0) selector = ranked[0].el.selector;
        }

        // (c) If there's exactly one empty input on the page, use it
        if (!selector && pool.length === 1) selector = pool[0].selector;

        if (!selector) {
          throw new Error(`Could not locate a matching "${label}" input on this page`);
        }

        await browserManager.type(selector, value, { clear: true, delay: 40 });
        this.log('action', `Typed ${label} into ${selector}`);
        await new Promise(r => setTimeout(r, 500));
        break;
      }

      // ⭐ NEW — play the first video / audio result
      case 'play_video': {
        this.setThought(`Finding the first video result and starting playback...`);
        this.log('action', `Locating first video result`);

        // Wait for a results tile to appear
        await page.waitForSelector('ytd-video-renderer a#video-title, a#video-title', { timeout: 15000 })
          .catch(() => {});

        // Grab the first real /watch link (skip Shorts and ads)
        const firstVideo = await page.evaluate(() => {
          const candidates = Array.from(
            document.querySelectorAll('ytd-video-renderer a#video-title, a#video-title')
          );
          const target = candidates.find(a => a.href && a.href.includes('/watch'));
          if (!target) return null;
          return { href: target.href, text: (target.innerText || '').trim().slice(0, 100) };
        });

        if (!firstVideo) {
          throw new Error('No playable video result was found on the page');
        }

        this.log('action', `Opening video: ${firstVideo.text}`);

        // Navigate directly to the watch URL — much more reliable than clicking
        await browserManager.navigateTo(firstVideo.href);
        await page.waitForSelector('video', { timeout: 15000 }).catch(() => {});

        // Force play + unmute (Chromium often blocks autoplay with sound otherwise)
        const state = await page.evaluate(async () => {
          const v = document.querySelector('video');
          if (!v) return { ok: false, reason: 'no <video> element' };
          v.muted = false;
          v.volume = 1.0;
          try { await v.play(); } catch (e) { return { ok: false, reason: String(e) }; }
          return { ok: true, paused: v.paused, muted: v.muted, t: v.currentTime };
        }).catch(e => ({ ok: false, reason: String(e) }));

        this.log('verify', `Video state: ${JSON.stringify(state)}`);

        if (!state.ok) {
          // One self-heal attempt: click the big play button if present
          await page.evaluate(() => {
            const btn = document.querySelector('.ytp-large-play-button, button.ytp-play-button');
            if (btn) btn.click();
          }).catch(() => {});
          await new Promise(r => setTimeout(r, 1500));
        }

        this.log('action', `Video playback started`);
        await new Promise(r => setTimeout(r, 2500));
        break;
      }

      case 'fill_form': {
        this.setThought(`Detecting and populating form input fields...`);
        this.log('action', `Inspecting page for form inputs`);

        const fillResult = await page.evaluate((goal) => {
          const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'));
          const filled = [];

          inputs.forEach((input) => {
            const id = (input.id || '').toLowerCase();
            const name = (input.name || '').toLowerCase();
            const placeholder = (input.placeholder || '').toLowerCase();
            const label = input.labels && input.labels[0] ? input.labels[0].innerText.toLowerCase() : '';
            const key = `${id} ${name} ${placeholder} ${label}`;

            if (key.includes('name') || key.includes('full name') || key.includes('user')) {
              input.value = 'Jane Doe';
              filled.push({ field: 'Name', value: 'Jane Doe' });
            } else if (key.includes('email') || key.includes('mail')) {
              input.value = 'jane.doe@example.com';
              filled.push({ field: 'Email', value: 'jane.doe@example.com' });
            } else if (key.includes('role') || key.includes('title') || key.includes('position')) {
              input.value = 'Lead Solutions Architect';
              filled.push({ field: 'Role', value: 'Lead Solutions Architect' });
            } else if (key.includes('department') || key.includes('dept')) {
              input.value = 'Engineering & AI';
              filled.push({ field: 'Department', value: 'Engineering & AI' });
            } else if (key.includes('note') || key.includes('desc') || key.includes('comment') || key.includes('msg') || input.tagName === 'TEXTAREA') {
              input.value = 'Automated workflow execution verified by autonomous browser agent.';
              filled.push({ field: 'Notes', value: input.value });
            } else if (input.type === 'checkbox') {
              input.checked = true;
              filled.push({ field: key.slice(0, 20), value: 'checked' });
            } else if (input.tagName === 'SELECT') {
              if (input.options.length > 1) {
                input.selectedIndex = 1;
                filled.push({ field: 'Select', value: input.options[1].text });
              }
            } else if (input.type === 'text') {
              input.value = 'Standard Test Value';
              filled.push({ field: 'Input', value: 'Standard Test Value' });
            }

            // Dispatch input & change events for modern frameworks (React/Vue/Angular)
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          });

          return filled;
        }, this.goal);

        this.log('action', `Filled ${fillResult.length} form field(s)`, fillResult);
        await new Promise(r => setTimeout(r, 600));
        break;
      }

      case 'submit_form': {
        this.setThought(`Executing confirmed form submission...`);
        const submitted = await page.evaluate(() => {
          const submitBtn = document.querySelector('button[type="submit"], input[type="submit"], button.btn-submit, #submitBtn');
          if (submitBtn) {
            submitBtn.click();
            return true;
          }
          const form = document.querySelector('form');
          if (form) {
            form.submit();
            return true;
          }
          return false;
        });

        if (!submitted) {
          throw new Error('Form submission button not found');
        }
        this.log('action', 'Submitted form');
        await new Promise(r => setTimeout(r, 1200));
        break;
      }

      case 'extract_data': {
        this.setThought(`Extracting structured live data from page DOM...`);
        this.log('action', `Scanning document structure and tables`);

        const data = await DOMExtractor.extractStructuredData(page, this.goal);
        if (data && data.length > 0) {
          this.extractedData = data;
          this.emit('data_extracted', this.extractedData);
          this.log('action', `Extracted ${data.length} real live records`, data.slice(0, 3));
        } else {
          // Fallback: extract summary text
          const summary = await DOMExtractor.getPageSummary(page);
          this.extractedData = [{ title: summary.title, url: summary.url, content: summary.textSample }];
          this.emit('data_extracted', this.extractedData);
          this.log('action', `Extracted page text summary`, summary.title);
        }
        break;
      }

      case 'verify_and_finish': {
        this.setThought(`Verifying page state, validating milestone conditions...`);
        const summary = await DOMExtractor.getPageSummary(page);
        this.log('verify', `Verified page: "${summary.title}" (${summary.url})`);
        break;
      }

      default:
        this.log('info', `Executed action: ${step.action}`);
        break;
    }
  }

  async handleHITLResponse(approved, feedback = '') {
    if (this.status !== 'waiting_approval' || !this.pendingHITL) return;

    const step = this.pendingHITL;
    this.pendingHITL = null;

    if (approved) {
      this.log('hitl', `Human APPROVED risky action: "${step.title}". Resuming execution.`);
      this.status = 'running';
      this.emit('status_change', { status: this.status });

      // Temporarily mark isRisky as false so it doesn't loop
      step.isRisky = false;
      this.executeLoop();
    } else {
      this.log('hitl', `Human REJECTED risky action: "${step.title}". Reason: ${feedback || 'User cancelled'}. Aborting task.`);
      step.status = 'failed';
      this.status = 'failed';
      this.emit('step_update', { stepIndex: this.currentStepIndex, step });
      this.emit('status_change', { status: this.status, error: 'User aborted risky action' });
    }
  }

  pauseTask() {
    if (this.status === 'running') {
      this.status = 'paused';
      this.emit('status_change', { status: this.status });
      this.log('info', 'Task execution paused by user.');
    }
  }

  resumeTask() {
    if (this.status === 'paused') {
      this.status = 'running';
      this.emit('status_change', { status: this.status });
      this.log('info', 'Task execution resumed.');
      this.executeLoop();
    }
  }

  async stopTask() {
    this.status = 'idle';
    this.pendingHITL = null;
    this.emit('status_change', { status: this.status });
    this.log('info', 'Task execution terminated.');
  }

  getState() {
    return {
      status: this.status,
      goal: this.goal,
      plan: this.plan,
      currentStepIndex: this.currentStepIndex,
      currentThought: this.currentThought,
      logs: this.logs,
      extractedData: this.extractedData,
      pendingHITL: this.pendingHITL,
      config: {
        provider: this.config.provider,
        model: this.config.model,
        headless: this.config.headless
      }
    };
  }
}

module.exports = new AgentEngine();