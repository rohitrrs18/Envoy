class BuiltInPlanner {
  static createPlan(goal, currentUrl = '') {
    const g = goal.trim();
    const gLower = g.toLowerCase();
    const steps = [];

    // Detect target URL from goal
    let targetUrl = this.detectUrl(g, currentUrl);

    // 1. Navigation step
    if (targetUrl) {
      steps.push({
        id: 'step-1',
        title: `Navigate to ${new URL(targetUrl).hostname || targetUrl}`,
        action: 'navigate',
        params: { url: targetUrl },
        description: `Open the target website: ${targetUrl}`,
        status: 'pending',
        isRisky: false
      });
    }

    // 2. Search / Query intent
    const searchMatch = g.match(/search(?:\s+for)?\s+["']?([^"'\n,]+)["']?/i) ||
                        g.match(/look\s+up\s+["']?([^"'\n,]+)["']?/i) ||
                        g.match(/find\s+["']?([^"'\n,]+)["']?/i);

    if (searchMatch && !gLower.includes('extract') && !gLower.includes('scrape') && targetUrl && (targetUrl.includes('wikipedia') || targetUrl.includes('google') || targetUrl.includes('bing') || targetUrl.includes('duckduckgo') || targetUrl.includes('github') || targetUrl.includes('youtube'))) {
      const searchTerm = searchMatch[1].trim();
      steps.push({
        id: `step-${steps.length + 1}`,
        title: `Search for "${searchTerm}"`,
        action: 'search',
        params: { query: searchTerm },
        description: `Locate search box, type query "${searchTerm}", and submit`,
        status: 'pending',
        isRisky: false
      });
    }

    // 3. Form filling intent (everyday app automation)
    const formMatch = gLower.includes('fill') || gLower.includes('submit form') || gLower.includes('onboard') || gLower.includes('enter details');
    if (formMatch) {
      steps.push({
        id: `step-${steps.length + 1}`,
        title: 'Analyze and Fill Form Inputs',
        action: 'fill_form',
        params: { goal: g },
        description: 'Detect input fields (Name, Email, Role, Notes) and populate with required data',
        status: 'pending',
        isRisky: false
      });

      steps.push({
        id: `step-${steps.length + 1}`,
        title: 'Review and Confirm Form Submission',
        action: 'submit_form',
        params: {},
        description: 'Submit the filled form. (Requires human confirmation)',
        status: 'pending',
        isRisky: true // HITL Trigger!
      });
    }

    // 4. Click specific button or link
    const clickMatch = g.match(/click(?:\s+on)?\s+["']?([^"'\n,]+)["']?/i);
    if (clickMatch && !formMatch) {
      steps.push({
        id: `step-${steps.length + 1}`,
        title: `Click "${clickMatch[1].trim()}"`,
        action: 'click',
        params: { text: clickMatch[1].trim() },
        description: `Find element with text "${clickMatch[1].trim()}" and trigger click`,
        status: 'pending',
        isRisky: /delete|remove|pay|checkout|buy|submit/i.test(clickMatch[1])
      });
    }

    // 5. Data Extraction intent
    const isExtractIntent = gLower.includes('extract') || gLower.includes('scrape') || gLower.includes('get') || gLower.includes('find') || gLower.includes('fetch') || gLower.includes('collect') || gLower.includes('stories') || gLower.includes('headlines') || gLower.includes('repos') || gLower.includes('data');
    if (isExtractIntent && !formMatch) {
      steps.push({
        id: `step-${steps.length + 1}`,
        title: 'Extract Real Structured Data',
        action: 'extract_data',
        params: { hint: g },
        description: 'Scan page content, identify structured lists/tables, and extract live data items',
        status: 'pending',
        isRisky: false
      });
    }

    // 6. Verification and Final Report
    steps.push({
      id: `step-${steps.length + 1}`,
      title: 'Verify Results & Complete Mission',
      action: 'verify_and_finish',
      params: {},
      description: 'Validate data integrity, ensure goal milestones were met, and generate final summary',
      status: 'pending',
      isRisky: false
    });

    return steps;
  }

  static detectUrl(goal, currentUrl) {
    // 1. Check for explicit URL in goal
    const urlMatch = goal.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
      return urlMatch[0].replace(/[.,;:)]$/, '');
    }

    const gLower = goal.toLowerCase();

    // 2. Check for common domain keywords
    if (gLower.includes('hacker news') || gLower.includes('ycombinator') || gLower.includes('news.ycombinator.com')) {
      return 'https://news.ycombinator.com';
    }
    if (gLower.includes('wikipedia')) {
      return 'https://en.wikipedia.org';
    }
    if (gLower.includes('github trending') || gLower.includes('github.com/trending')) {
      return 'https://github.com/trending';
    }
    if (gLower.includes('github')) {
      return 'https://github.com';
    }
    if (gLower.includes('weather') || gLower.includes('wttr')) {
      const cityMatch = goal.match(/in\s+([a-zA-Z]+)/i);
      const city = cityMatch ? cityMatch[1] : 'London';
      return `https://wttr.in/${city}?format=3`;
    }
    if (gLower.includes('quotes') || gLower.includes('toscrape')) {
      return 'https://quotes.toscrape.com';
    }
    if (gLower.includes('demo') || gLower.includes('demo-app') || gLower.includes('crm') || gLower.includes('onboard') || gLower.includes('everyday app')) {
      const port = process.env.PORT || 3005;
      return `http://localhost:${port}/demo-app`;
    }

    // 3. Fallback to current browser URL if valid
    if (currentUrl && currentUrl.startsWith('http')) {
      return currentUrl;
    }

    // 4. Default to Hacker News as standard real-world testbed
    return 'https://news.ycombinator.com';
  }
}

module.exports = BuiltInPlanner;
