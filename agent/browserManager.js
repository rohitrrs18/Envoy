// agent/browserManager.js
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

class BrowserManager {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cdpSession = null;
    this.isScreencasting = false;
    this.currentUrl = 'about:blank';
    this.currentTitle = 'New Tab';
    this.isLoading = false;
    this.viewport = { width: 1280, height: 800 };
    this.onFrameCallback = null;
    this.onStateChangeCallback = null;
    this.headless = true;
  }

  async findChromePath() {
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      try {
        const chromium = require('@sparticuz/chromium');
        return await chromium.executablePath();
      } catch (e) {
        console.warn('[BrowserManager] @sparticuz/chromium failed:', e.message);
      }
    }

    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
      return process.env.CHROME_PATH;
    }

    const commonPaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ];

    for (const p of commonPaths) {
      if (fs.existsSync(p)) return p;
    }

    try {
      const chromium = require('@sparticuz/chromium');
      return await chromium.executablePath();
    } catch (e) {}

    throw new Error('Chrome or Chromium executable not found. Set CHROME_PATH in environment.');
  }

  async launch(options = {}) {
    // ✅ Fixed: use .connected property (isConnected() was removed in puppeteer v22+)
    if (this.browser && this.browser.connected) {
      if (!this.page || this.page.isClosed()) {
        const pages = await this.browser.pages();
        this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();
        await this.page.setViewport(this.viewport);
        this.setupPageListeners();
        await this.initScreencast();
      }
      return this.page;
    }

    this.headless = options.headless !== undefined ? options.headless : true;

    const remoteWs = process.env.BROWSER_WS_ENDPOINT ||
                     (process.env.BROWSERLESS_API_KEY
                        ? `wss://chrome.browserless.io?token=${process.env.BROWSERLESS_API_KEY}`
                        : null);

    if (remoteWs) {
      console.log('[BrowserManager] Connecting to remote cloud browser...');
      this.browser = await puppeteer.connect({
        browserWSEndpoint: remoteWs,
        defaultViewport: this.viewport
      });
    } else {
      const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
      let launchArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--window-size=1280,850'
      ];

      if (isVercel) {
        try {
          const chromium = require('@sparticuz/chromium');
          launchArgs = chromium.args;
        } catch (e) {}
      }

      const chromePath = options.executablePath || await this.findChromePath();

      this.browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: this.headless ? 'new' : false,
        defaultViewport: this.viewport,
        args: launchArgs
      });
    }

    // Reset state on unexpected disconnect
    this.browser.once('disconnected', () => {
      console.warn('[BrowserManager] Browser disconnected');
      this.browser = null;
      this.page = null;
      this.cdpSession = null;
      this.isScreencasting = false;
    });

    const pages = await this.browser.pages();
    this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();
    await this.page.setViewport(this.viewport);

    this.setupPageListeners();
    await this.initScreencast();

    return this.page;
  }

  setupPageListeners() {
    if (!this.page) return;

    this.page.on('load', async () => {
      this.isLoading = false;
      this.currentUrl = this.page.url();
      this.currentTitle = await this.page.title().catch(() => '');
      this.notifyStateChange();
    });

    this.page.on('framenavigated', async (frame) => {
      if (frame === this.page.mainFrame()) {
        this.currentUrl = this.page.url();
        this.currentTitle = await this.page.title().catch(() => '');
        this.notifyStateChange();
      }
    });

    this.page.on('dialog', async (dialog) => {
      console.log(`[Browser] Dialog: ${dialog.type()} - ${dialog.message()}`);
      await dialog.accept().catch(() => {});
    });
  }

  notifyStateChange() {
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback({
        url: this.currentUrl,
        title: this.currentTitle,
        isLoading: this.isLoading,
        headless: this.headless
      });
    }
  }

  async initScreencast() {
    try {
      if (this.cdpSession) {
        try {
          await this.cdpSession.send('Page.stopScreencast');
          await this.cdpSession.detach();
        } catch (e) {}
      }

      this.cdpSession = await this.page.target().createCDPSession();

      this.cdpSession.on('Page.screencastFrame', async ({ data, sessionId }) => {
        try {
          await this.cdpSession.send('Page.screencastFrameAck', { sessionId });
        } catch (e) {}

        if (this.onFrameCallback) this.onFrameCallback(data);
      });

      await this.cdpSession.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 70,
        maxWidth: this.viewport.width,
        maxHeight: this.viewport.height,
        everyNthFrame: 1
      });

      this.isScreencasting = true;
      console.log('[BrowserManager] CDP screencast started');
    } catch (err) {
      console.error('[BrowserManager] Screencast start error:', err.message);
    }
  }

  async setHeadlessMode(headless) {
    if (this.headless === headless && this.browser) return;
    const previousUrl = this.currentUrl && this.currentUrl !== 'about:blank'
      ? this.currentUrl
      : 'https://news.ycombinator.com';
    await this.close();
    await this.launch({ headless });
    await this.navigateTo(previousUrl);
  }

  async navigateTo(url) {
    if (!this.page || this.page.isClosed()) await this.launch();
    this.isLoading = true;
    this.notifyStateChange();

    let targetUrl = url.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://') && !targetUrl.startsWith('about:')) {
      targetUrl = 'https://' + targetUrl;
    }

    try {
      await this.page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      // Give SPAs (Instagram, DeepSeek) a moment to hydrate their forms
      await this.page.waitForSelector('input', { timeout: 8000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 800));

      this.currentUrl = this.page.url();
      this.currentTitle = await this.page.title().catch(() => '');
      this.isLoading = false;
      this.notifyStateChange();
      return { success: true, url: this.currentUrl, title: this.currentTitle };
    } catch (err) {
      this.isLoading = false;
      this.notifyStateChange();
      throw err;
    }
  }

  async reload() {
    if (!this.page) return;
    this.isLoading = true;
    this.notifyStateChange();
    await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    this.isLoading = false;
    this.notifyStateChange();
  }

  async goBack()    { if (this.page) await this.page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {}); }
  async goForward() { if (this.page) await this.page.goForward({ waitUntil: 'domcontentloaded' }).catch(() => {}); }

  async highlightElement(selector) {
    if (!this.page) return null;
    try {
      return await this.page.evaluate((sel) => {
        let el = null;
        if (sel.startsWith('//') || sel.startsWith('xpath/')) {
          const xpath = sel.replace(/^xpath\//, '');
          const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          el = result.singleNodeValue;
        } else {
          el = document.querySelector(sel);
        }
        if (!el) return null;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const rect = el.getBoundingClientRect();
        const oldOutline = el.style.outline;
        const oldBoxShadow = el.style.boxShadow;
        el.style.outline = '3px solid #6366f1';
        el.style.boxShadow = '0 0 15px rgba(99, 102, 241, 0.6)';
        el.style.transition = 'all 0.2s ease-in-out';
        setTimeout(() => {
          try { el.style.outline = oldOutline; el.style.boxShadow = oldBoxShadow; } catch (e) {}
        }, 1500);
        return {
          x: Math.round(rect.x), y: Math.round(rect.y),
          width: Math.round(rect.width), height: Math.round(rect.height),
          tag: el.tagName.toLowerCase(),
          text: (el.innerText || el.value || el.placeholder || '').slice(0, 50).trim()
        };
      }, selector);
    } catch (e) {
      return null;
    }
  }

  async click(selector, options = {}) {
    if (!this.page) await this.launch();

    const box = await this.highlightElement(selector);
    await new Promise(r => setTimeout(r, 400));

    try {
      if (box && box.x >= 0 && box.y >= 0) {
        const clickX = box.x + Math.min(box.width / 2, 20);
        const clickY = box.y + Math.min(box.height / 2, 15);
        await this.page.mouse.click(clickX, clickY, { delay: 50 });
      } else {
        await this.page.click(selector, { delay: 50 });
      }
      await new Promise(r => setTimeout(r, 600));
      return { success: true };
    } catch (err) {
      const evalSuccess = await this.page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) { el.click(); return true; }
        return false;
      }, selector).catch(() => false);

      if (!evalSuccess) throw err;
      return { success: true, fallback: true };
    }
  }

  async type(selector, text, options = {}) {
    if (!this.page) await this.launch();
    await this.highlightElement(selector);
    await new Promise(r => setTimeout(r, 200));

    if (options.clear !== false) {
      await this.page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) el.value = '';
      }, selector).catch(() => {});
    }

    try {
      await this.page.click(selector, { clickCount: 3 }).catch(() => {});
      await this.page.type(selector, text, { delay: options.delay || 35 });
    } catch (_) {
      // Focus manually then type
      await this.page.focus(selector).catch(() => {});
      await this.page.keyboard.type(text, { delay: options.delay || 35 });
    }

    if (options.pressEnter) {
      await new Promise(r => setTimeout(r, 200));
      await this.page.keyboard.press('Enter');
    }
    await new Promise(r => setTimeout(r, 600));
    return { success: true };
  }

  async scroll(direction = 'down', amount = 400) {
    if (!this.page) return;
    const deltaY = direction === 'up' ? -amount : amount;
    await this.page.evaluate((d) => window.scrollBy({ top: d, behavior: 'smooth' }), deltaY);
    await new Promise(r => setTimeout(r, 500));
  }

  async mouseClickCoordinates(x, y) { if (this.page) await this.page.mouse.click(x, y); }
  async keyPress(key)               { if (this.page) await this.page.keyboard.press(key); }
  async getPageText()               { return this.page ? await this.page.evaluate(() => document.body ? document.body.innerText : '') : ''; }
  async captureScreenshot()         { return this.page ? await this.page.screenshot({ type: 'jpeg', quality: 75, encoding: 'base64' }) : null; }

  async close() {
    if (this.cdpSession) {
      try {
        await this.cdpSession.send('Page.stopScreencast').catch(() => {});
        await this.cdpSession.detach().catch(() => {});
      } catch (e) {}
      this.cdpSession = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.page = null;
    }
  }
}

module.exports = new BrowserManager();