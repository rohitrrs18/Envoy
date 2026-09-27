# 🌐 DOAT Autonomous Browser Agent for Everyday Apps

An end-to-end autonomous AI browser agent built to operate everyday web applications, execute multi-step workflows, verify progress, self-heal upon failure, and safely request human approval before any risky or irreversible action.

---

## ✨ Key Capabilities

- 🎨 **Modern Light Theme Interface**: Clean typography, frosted white cards, high-contrast badges, and real-time status indicators.
- 📺 **Live CDP Screencast Viewport**: Real-time 60fps compositor screencast streamed directly from Chromium with interactive element highlight rings.
- 🔗 **Interactive Address Bar**: Full editable URL input box to navigate anywhere, anytime (e.g., `news.ycombinator.com`, `wikipedia.org`, `/demo-app`).
- 🛡️ **Human-in-the-Loop (HITL) Safety Guard**: Detects risky actions (form submissions, balance transfers, deletion, payments) and pauses execution for explicit user confirmation.
- 🧠 **Dual Reasoning Engine**:
  - **Zero-Key Built-in Autonomous Planner**: Parses natural language goals, plans milestones, interacts with DOM, and extracts real data with zero API keys required out of the box.
  - **Multi-LLM Integration**: Optional support for Google Gemini, OpenAI (GPT-4o), Anthropic Claude, Groq, and Ollama (Local LLM).
- 📊 **Real Data Extraction**: Captures live data from real websites (Hacker News, Wikipedia, GitHub Trending, etc.) with 1-click CSV & JSON export.
- 🏢 **Built-in Everyday Business App**: Pre-installed interactive portal (`/demo-app`) with Employee Onboarding CRM, Access Provisioning, and Expense Management to test real workflows.
- 🚀 **Vercel Serverless Ready**: Architected for direct deployment on Vercel with Server-Sent Events (SSE) and serverless Chromium support.

---

## 🚀 Quick Start (Local Run)

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Application
```bash
npm start
```

### 3. Open in Browser
Visit **[http://localhost:3005](http://localhost:3005)**

To test everyday enterprise automation workflows, visit the built-in app at:
**[http://localhost:3005/demo-app](http://localhost:3005/demo-app)**

---

## ☁️ Deploying on Vercel

The project includes `vercel.json`, `api/index.js`, and dual WebSocket / Server-Sent Events (SSE) streaming configured for Vercel.

### Method 1: Deploy with Vercel CLI
```bash
npx vercel
```
Follow the interactive prompts to deploy. For production:
```bash
npx vercel --prod
```

### Method 2: Deploy via GitHub (Recommended)
1. Initialize git and push to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of DOAT Browser Agent"
   git branch -M main
   git remote add origin https://github.com/<your-username>/doat-browser.git
   git push -u origin main
   ```
2. Go to [vercel.com/new](https://vercel.com/new) and import your repository.
3. Vercel will automatically detect `vercel.json` and deploy both the frontend and serverless API functions.

### Cloud Browser Recommendation for Vercel Serverless
Since AWS Lambda has execution and memory constraints for headless Chrome, for high-volume production deployments on Vercel, you can connect a remote browser service like [Browserless.io](https://browserless.io) by adding an environment variable in your Vercel Project Settings:
- `BROWSERLESS_API_KEY`: `your_api_token`
*(Or `BROWSER_WS_ENDPOINT`: `wss://chrome.browserless.io?token=your_token`)*

The agent will automatically route browser automation through the dedicated cloud browser!

---

## 📁 Project Architecture

```
Doat-browser/
├── vercel.json                 # Vercel serverless functions and routing config
├── package.json                # Dependencies and npm start script
├── server.js                   # Node.js server with WebSockets & static hosting
├── api/
│   └── index.js                # Vercel Serverless Function entrypoint (SSE + REST)
├── agent/
│   ├── browserManager.js       # Chromium controller, CDP screencast, safe DOM actions
│   ├── agentEngine.js          # Mission coordinator, execution loop, HITL safety, recovery
│   ├── builtInPlanner.js       # Autonomous heuristic NLP planner & URL detector
│   ├── domExtractor.js         # Interactive element tree, tables & structured data scraper
│   └── llmProviders.js         # Google Gemini, OpenAI, Claude, Groq & Ollama client
└── public/
    ├── index.html              # Modern Light Theme single-page application
    ├── style.css               # Clean styling, responsive layout, animations
    ├── app.js                  # Client WebSocket/SSE stream handler & UI controller
    └── demo-app.html           # Live everyday business app testbed
```

---

## 🎯 Example Tasks to Try

1. **Hacker News Live Extraction**:
   > *"Go to news.ycombinator.com and extract the top 5 stories with titles, points, and URLs"*
2. **Wikipedia Information Retrieval**:
   > *"Go to wikipedia.org, search for 'Autonomous agent' and extract the summary"*
3. **Everyday Enterprise Onboarding**:
   > *"Go to http://localhost:3005/demo-app, fill in the employee onboarding form and submit"*
   *(Notice the Human-in-the-Loop safety modal asking for confirmation before submitting!)*
4. **GitHub Trending Repositories**:
   > *"Go to github.com/trending and extract the top 3 trending repositories"*
