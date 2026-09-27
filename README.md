# 🌐 ENVOY — Autonomous Browser Agent for Everyday Apps

An end-to-end autonomous AI browser agent built to operate everyday web
applications, execute multi-step workflows, verify progress, self-heal upon
failure, and safely request human approval before any risky or irreversible
action.

> **Describe the task. Watch it happen. Get the data.**

[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)]()
[![Puppeteer](https://img.shields.io/badge/puppeteer--core-%5E22-blue)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()

---

## ✨ Key Capabilities

- 🎨 **Modern Light Theme Interface** — Clean typography, frosted white
  cards, high-contrast badges, and real-time status indicators.
- 📺 **Live CDP Screencast Viewport** — Real-time 60 fps compositor
  screencast streamed directly from Chromium with interactive element
  highlight rings.
- 🔗 **Interactive Address Bar** — Full editable URL input to navigate
  anywhere, anytime (`news.ycombinator.com`, `wikipedia.org`, `/demo-app`).
- ⌨️ **Inline Credentials & Form Values** — Type emails, phone numbers,
  passwords, usernames, names, cities and companies *directly inside the
  goal sentence*. No `.env`, no predefined profile, no separate settings
  page. ENVOY extracts the value from what you typed and finds the right
  input on the page.
- 🎥 **Video & Audio Playback** — Handles "play the first video" style
  requests on YouTube and similar media sites by opening the first real
  result and forcing playback with audio enabled.
- 🛡️ **Human-in-the-Loop (HITL) Safety Guard** — Detects risky actions
  (form submissions, password entry, deletion, payments, checkouts) and
  pauses execution for explicit user confirmation.
- 🧠 **Dual Reasoning Engine**
  - **Zero-Key Built-in Autonomous Planner** — Parses natural language
    goals, plans milestones, interacts with the DOM, and extracts real
    data with zero API keys required out of the box.
  - **Multi-LLM Integration** — Optional support for Google Gemini,
    OpenAI (GPT-4o), Anthropic Claude, Groq, and Ollama (local LLM).
- 📊 **Real Data Extraction** — Captures live data from real websites
  (Hacker News, Wikipedia, GitHub Trending, tables, article cards) with
  1-click CSV & JSON export.
- 🩹 **Self-Healing Recovery** — On failure, ENVOY dismisses blocking
  modals, re-scrolls, retries up to N times, and only then surfaces the
  error.
- 🏢 **Built-in Everyday Business App** — Pre-installed interactive portal
  (`/demo-app`) with Employee Onboarding CRM, Access Provisioning, and
  Expense Management to test real workflows.
- 🚀 **Vercel Serverless Ready** — Architected for direct deployment on
  Vercel with Server-Sent Events (SSE) and serverless Chromium support.

---

## 🆚 How ENVOY is different

Most "browser agent" repos fall into one of two buckets:

1. **Fragile Selenium scripts** — hard-coded selectors per site, break the
   moment a layout changes.
2. **Token-hungry LLM agents** — reason about every click through a paid
   API and *still* fail to fill a simple form.

ENVOY sits in between:

| | Selenium scripts | LLM-only agents | **ENVOY** |
|--|------------------|-----------------|-----------|
| Selector strategy | hard-coded | per-step LLM | runtime heuristic + optional LLM |
| API key required | no | yes | **no** (default) |
| Handles unknown sites | no | sometimes | yes |
| Types user-provided credentials | manual | manual | **yes, inline in the goal** |
| Human-in-the-loop for risky actions | no | rarely | **yes** |
| Cost per task | ~0 | $$$ | **~0** |

The default mode is fast, cheap, offline-friendly, and deterministic.

---

## 🚀 Quick Start (Local Run)

### 1. Install Dependencies
```bash
npm install