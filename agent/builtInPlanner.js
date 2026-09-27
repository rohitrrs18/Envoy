// agent/builtInPlanner.js
const GoalParser = require('./goalParser');

class BuiltInPlanner {
  static createPlan(goal, currentUrl = '') {
    const g = goal.trim();
    const gLower = g.toLowerCase();
    const steps = [];

    // DEBUG (remove later if you like):
    try {
      console.log('[BuiltInPlanner] goal:', g);
      console.log('[BuiltInPlanner] parsed values:', GoalParser.parseValues(g));
    } catch (_) {}

    // 1. Detect target URL from goal
    let targetUrl = this.detectUrl(g, currentUrl);

    // 2. Detect subject / entity query from goal
    const subject = this.detectSubject(g);

    // 3. Navigation step
    if (targetUrl) {
      let hostLabel = targetUrl;
      try { hostLabel = new URL(targetUrl).hostname || targetUrl; } catch (_) {}
      steps.push({
        id: `step-${steps.length + 1}`,
        title: `Navigate to ${hostLabel}`,
        action: 'navigate',
        params: { url: targetUrl },
        description: `Open the target website: ${targetUrl}`,
        status: 'pending',
        isRisky: false
      });
    }

    // 4. Form filling intent (generic "fill the form" phrasing)
    const formMatch = gLower.includes('fill') ||
                      gLower.includes('submit form') ||
                      gLower.includes('onboard') ||
                      gLower.includes('enter details');

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
        isRisky: true
      });
    }

    // 4.5 — Type values the user typed directly into the goal
    const parsedValues = GoalParser.parseValues(g);
    if (parsedValues.length > 0) {
      for (const item of parsedValues) {
        steps.push({
          id: `step-${steps.length + 1}`,
          title: `Type ${item.label}: ${this.mask(item)}`,
          action: 'fill_field',
          params: {
            kind: item.kind,
            value: item.value,           // literal value from the goal
            label: item.label,
            selectorHint: item.selectorHint
          },
          description: `Type the ${item.label} provided by the user into the matching input.`,
          status: 'pending',
          isRisky: item.kind === 'password'
        });
      }

      if (/log\s*in|sign\s*in|submit|continue|register|sign\s*up|log\s*me\s*in/i.test(gLower)) {
        steps.push({
          id: `step-${steps.length + 1}`,
          title: 'Submit the form',
          action: 'click',
          params: {
            text: 'Log in',
            selectorHint: 'button[type="submit"], input[type="submit"]'
          },
          description: 'Click the submit / login button to complete authentication.',
          status: 'pending',
          isRisky: true
        });
      }
    }

    // 5. Search / Lookup step
    const isSearchableSite = targetUrl && (
      targetUrl.includes('wikipedia') ||
      targetUrl.includes('google') ||
      targetUrl.includes('bing') ||
      targetUrl.includes('duckduckgo') ||
      targetUrl.includes('github') ||
      targetUrl.includes('youtube')
    );

    if (subject && isSearchableSite && !formMatch && parsedValues.length === 0) {
      // ⭐ FIX: strip trailing instructions like "and play the first video"
      const cleanQuery = this.cleanQuery(subject);

      if (cleanQuery) {
        steps.push({
          id: `step-${steps.length + 1}`,
          title: `Search for "${cleanQuery}"`,
          action: 'search',
          params: { query: cleanQuery },
          description: `Locate search input, type "${cleanQuery}", and submit`,
          status: 'pending',
          isRisky: false
        });
      }
    }

    // 5.5 ⭐ NEW — Play / watch media intent
    const wantsPlay = /\b(play|watch)\b/i.test(g) &&
                      /\b(video|song|audio|music|clip|first\s+video|first\s+result)\b/i.test(g);

    if (wantsPlay && parsedValues.length === 0 && !formMatch) {
      steps.push({
        id: `step-${steps.length + 1}`,
        title: 'Play the first video / audio',
        action: 'play_video',
        params: { preferAudio: /\b(song|audio|music)\b/i.test(g) },
        description: 'Open the first visible video result and start playback with audio enabled.',
        status: 'pending',
        isRisky: false
      });
    }

    // 6. Click specific button or link if explicitly asked
    const clickMatch = g.match(/click(?:\s+on)?\s+["']?([^"'\n,]+)["']?/i);
    if (clickMatch && !formMatch && !subject) {
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

    // 7. Data Extraction intent
    const isExtractIntent = gLower.includes('extract') ||
                            gLower.includes('scrape') ||
                            gLower.includes('get') ||
                            gLower.includes('find') ||
                            gLower.includes('info') ||
                            gLower.includes('details') ||
                            gLower.includes('stories') ||
                            gLower.includes('headlines') ||
                            gLower.includes('repos') ||
                            gLower.includes('data') ||
                            subject;

    // ⭐ FIX: don't extract when the goal is really "play a video"
    if (isExtractIntent && !formMatch && parsedValues.length === 0 && !wantsPlay) {
      steps.push({
        id: `step-${steps.length + 1}`,
        title: subject ? `Extract Information for "${subject}"` : 'Extract Real Structured Data',
        action: 'extract_data',
        params: { hint: g, subject },
        description: subject
          ? `Extract infobox, key facts, and summary for ${subject}`
          : 'Scan page content, identify structured records, and extract live data items',
        status: 'pending',
        isRisky: false
      });
    }

    // 8. Verification and Final Report
    steps.push({
      id: `step-${steps.length + 1}`,
      title: 'Verify Results & Complete Mission',
      action: 'verify_and_finish',
      params: { subject },
      description: 'Validate data integrity, ensure goal milestones were met, and generate final summary',
      status: 'pending',
      isRisky: false
    });

    return steps;
  }

  /** Strip trailing instructions from a search subject. */
  static cleanQuery(subject) {
    if (!subject) return '';
    return subject
      .replace(/\b(and|then|play|watch|open|click)\b.*$/i, '')
      .replace(/\b(the\s+)?(first|top|latest)\s+(video|result|song|audio|clip)s?\b.*$/i, '')
      .replace(/https?:\/\/[^\s]+/i, '')
      .replace(/on\s+wikipedia/i, '')
      .replace(/from\s+wikipedia/i, '')
      .replace(/[.,;:]+$/, '')
      .trim();
  }

  static mask(item) {
    if (item.kind === 'password') return '••••••';
    if (item.kind === 'email' && item.value.includes('@')) {
      const [u, d] = item.value.split('@');
      return `${u.slice(0, 2)}***@${d}`;
    }
    if (item.kind === 'phone' && item.value.length > 4) {
      return item.value.slice(0, 2) + '****' + item.value.slice(-2);
    }
    return item.value;
  }

  static detectSubject(goal) {
    const g = goal.trim();

    // Don't treat credential-fill sentences as search subjects
    if (/\b(enter|type|put|fill|input|populate|log\s*in|sign\s*in|sign\s*up)\b/i.test(g)) {
      return null;
    }

    const m1 = g.match(/extract\s+([a-zA-Z0-9\s]+?)(?:'s|s)?\s+(?:information|info|details|summary|data|bio|facts|history)/i);
    if (m1 && m1[1]) {
      const clean = m1[1].replace(/https?:\/\/[^\s]+/i, '').replace(/from\s+wikipedia/i, '').replace(/on\s+wikipedia/i, '').trim();
      if (clean.length > 1) return this.normalizeSubject(clean);
    }

    const m2 = g.match(/(?:extract|get|find|fetch)\s+(?:all\s+)?(?:information|info|details|summary|data|facts)\s+(?:about|on|for|of)\s+([^,\n.]+)/i);
    if (m2 && m2[1]) {
      const clean = m2[1].replace(/https?:\/\/[^\s]+/i, '').replace(/from\s+wikipedia/i, '').replace(/on\s+wikipedia/i, '').trim();
      if (clean.length > 1) return this.normalizeSubject(clean);
    }

    // ⭐ FIX: Pattern 3 — stop the subject at "and"/"then"/end-of-string
    const m3 = g.match(/(?:search|look\s+up|find)\s+(?:for\s+)?["']?([^"'\n,]+?)["']?\s*(?:and\b|then\b|,|$)/i);
    if (m3 && m3[1]) {
      const clean = m3[1]
        .replace(/\b(and|then|play|watch|open|click)\b.*$/i, '')
        .replace(/\b(the\s+)?(first|top|latest)\s+(video|result|song|audio|clip)s?\b.*$/i, '')
        .replace(/https?:\/\/[^\s]+/i, '')
        .replace(/on\s+wikipedia/i, '')
        .replace(/from\s+wikipedia/i, '')
        .trim();

      const forbidden = ['stories', 'headlines', 'repos', 'data', 'video', 'audio', 'song'];
      if (clean.length > 1 && !forbidden.includes(clean.toLowerCase())) {
        return this.normalizeSubject(clean);
      }
    }

    const m4 = g.match(/(?:who\s+is|what\s+is|tell\s+me\s+about)\s+([^,\n.?]+)/i);
    if (m4 && m4[1]) {
      const clean = m4[1].trim();
      if (clean.length > 1) return this.normalizeSubject(clean);
    }

    const m5 = g.match(/extract\s+([a-zA-Z0-9\s]+)/i);
    if (m5 && m5[1]) {
      const candidate = m5[1].replace(/https?:\/\/[^\s]+/i, '').replace(/from\s+[^\s]+/i, '').trim();
      const forbidden = ['stories', 'data', 'table', 'content', 'page', 'text', 'headlines', 'repositories', 'repos'];
      if (!forbidden.includes(candidate.toLowerCase()) && candidate.length > 2 && candidate.length < 35) {
        return this.normalizeSubject(candidate);
      }
    }

    return null;
  }

  static normalizeSubject(subject) {
    let s = subject.trim();
    const sLower = s.toLowerCase();
    if (sLower === 'newton' || sLower === 'newtons' || sLower === 'isaac newton') return 'Isaac Newton';
    if (sLower === 'einstein' || sLower === 'albert einstein') return 'Albert Einstein';
    if (sLower === 'turing' || sLower === 'alan turing') return 'Alan Turing';
    if (sLower === 'musk' || sLower === 'elon musk') return 'Elon Musk';
    return s;
  }

  static detectUrl(goal, currentUrl) {
    const urlMatch = goal.match(/https?:\/\/[^\s,]+/i);
    if (urlMatch) return urlMatch[0].replace(/[.,;:)]$/, '');

    const gLower = goal.toLowerCase();

    if (gLower.includes('hacker news') || gLower.includes('ycombinator') || gLower.includes('news.ycombinator.com')) {
      return 'https://news.ycombinator.com';
    }
    if (gLower.includes('wikipedia')) return 'https://www.wikipedia.org';
    if (gLower.includes('github trending') || gLower.includes('github.com/trending')) return 'https://github.com/trending';
    if (gLower.includes('github')) return 'https://github.com';
    if (gLower.includes('youtube')) return 'https://www.youtube.com';
    if (gLower.includes('instagram')) return 'https://www.instagram.com';
    if (gLower.includes('deepseek')) return 'https://chat.deepseek.com';
    if (gLower.includes('weather') || gLower.includes('wttr')) {
      const cityMatch = goal.match(/in\s+([a-zA-Z]+)/i);
      const city = cityMatch ? cityMatch[1] : 'London';
      return `https://wttr.in/${city}?format=3`;
    }
    if (gLower.includes('quotes') || gLower.includes('toscrape')) return 'https://quotes.toscrape.com';
    if (gLower.includes('demo') || gLower.includes('demo-app') || gLower.includes('crm') ||
        gLower.includes('onboard') || gLower.includes('everyday app')) {
      const port = process.env.PORT || 3005;
      return `http://localhost:${port}/demo-app`;
    }

    if (currentUrl && currentUrl.startsWith('http')) return currentUrl;
    if (this.detectSubject(goal)) return 'https://www.wikipedia.org';
    return 'https://news.ycombinator.com';
  }
}

module.exports = BuiltInPlanner;