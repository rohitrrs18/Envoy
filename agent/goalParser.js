// agent/goalParser.js
// Extracts typed-in values (email, phone, password, username, name, city, company)
// directly from the user's goal sentence. Nothing is predefined.

class GoalParser {
  /**
   * Returns an array of { kind, value, label, selectorHint }
   */
  static parseValues(goal) {
    const g = (goal || '').trim();
    const out = [];
    const seen = new Set();

    const push = (kind, value, label, selectorHint) => {
      if (!value || seen.has(kind)) return;
      seen.add(kind);
      out.push({ kind, value: String(value).trim(), label, selectorHint });
    };

    // ---- 1. email ---------------------------------------------------------
    const emailRe = /(?:e-?mail|mail\s*id|mail\s*address)\s*(?:is|:|=|to|as|with)?\s*["']?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})["']?/i;
    const emailMatch = g.match(emailRe);
    if (emailMatch) {
      push('email', emailMatch[1], 'email',
        'input[type="email"], input[name*="email" i], input[id*="email" i]');
    } else {
      const bare = g.match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
      if (bare) {
        push('email', bare[1], 'email',
          'input[type="email"], input[name*="email" i], input[id*="email" i]');
      }
    }

    // ---- 2. phone ---------------------------------------------------------
    const phoneRe = /(?:phone|mobile|telephone|tel|contact\s*(?:no|number)?|number|whatsapp)\s*(?:is|:|=|to|as|with)?\s*["']?(\+?\d[\d\s\-().]{6,20}\d)["']?/i;
    const phoneMatch = g.match(phoneRe);
    if (phoneMatch) {
      push('phone', phoneMatch[1].replace(/[^\d+]/g, ''), 'phone',
        'input[type="tel"], input[name*="phone" i], input[name*="mobile" i]');
    }

    // ---- 3. password ------------------------------------------------------
    const pwdRe = /(?:password|passcode|pwd|pass)\s*(?:is|:|=|to|as|with)?\s*["']?([^\s"',.]+)["']?/i;
    const pwdMatch = g.match(pwdRe);
    if (pwdMatch && !/^(is|the|a|an)$/i.test(pwdMatch[1])) {
      push('password', pwdMatch[1], 'password', 'input[type="password"]');
    }

    // ---- 4. username ------------------------------------------------------
    const userRe = /(?:user\s*name|username|handle|login\s*id|user\s*id)\s*(?:is|:|=|to|as|with)?\s*["']?@?([A-Za-z0-9._-]{2,40})["']?/i;
    const userMatch = g.match(userRe);
    if (userMatch) {
      push('username', userMatch[1], 'username',
        'input[name*="user" i], input[id*="user" i]');
    }

    // ---- 5. name ----------------------------------------------------------
    const nameRe = /(?:full\s*name|my\s*name|name)\s*(?:is|:|=|to|as|with)?\s*["']?([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})["']?/i;
    const nameMatch = g.match(nameRe);
    if (nameMatch && !seen.has('username') && nameMatch[1].length > 1) {
      push('name', nameMatch[1], 'name',
        'input[name*="name" i], input[id*="name" i]');
    }

    // ---- 6. city ----------------------------------------------------------
    const cityRe = /(?:city|location|town)\s*(?:is|:|=|to|as|with)?\s*["']?([A-Za-z .'-]{2,40})["']?/i;
    const cityMatch = g.match(cityRe);
    if (cityMatch) {
      push('city', cityMatch[1].trim(), 'city',
        'input[name*="city" i], input[id*="city" i]');
    }

    // ---- 7. company -------------------------------------------------------
    const compRe = /(?:company|organisation|organization|employer)\s*(?:is|:|=|to|as|with)?\s*["']?([A-Za-z0-9 .&'-]{2,50})["']?/i;
    const compMatch = g.match(compRe);
    if (compMatch) {
      push('company', compMatch[1].trim(), 'company',
        'input[name*="company" i], input[id*="company" i]');
    }

    // ---- 8. optional "user:pass" style pair -------------------------------
    const pairRe = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\s*[\/|]\s*([^\s"',]+)/i;
    const pair = g.match(pairRe);
    if (pair) {
      push('email', pair[1], 'email',
        'input[type="email"], input[name*="email" i]');
      push('password', pair[2], 'password', 'input[type="password"]');
    }

    return out;
  }
}

module.exports = GoalParser;