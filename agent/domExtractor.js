class DOMExtractor {
  static async extractInteractiveElements(page) {
    if (!page) return [];

    return await page.evaluate(() => {
      const isVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight;
      };

      const getSelector = (el) => {
        if (el.id) return `#${el.id}`;
        if (el.name) return `[name="${el.name}"]`;
        if (el.getAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
        if (el.getAttribute('aria-label')) return `[aria-label="${el.getAttribute('aria-label')}"]`;
        if (el.className && typeof el.className === 'string') {
          const firstClass = el.className.trim().split(/\s+/)[0];
          if (firstClass && !firstClass.includes(':')) {
            const matches = document.querySelectorAll(`.${firstClass}`);
            if (matches.length === 1) return `.${firstClass}`;
          }
        }
        
        // Tag + text or hierarchy
        const tag = el.tagName.toLowerCase();
        let path = tag;
        let parent = el.parentElement;
        let depth = 0;
        while (parent && depth < 3) {
          if (parent.id) {
            return `#${parent.id} > ${path}`;
          }
          path = `${parent.tagName.toLowerCase()} > ${path}`;
          parent = parent.parentElement;
          depth++;
        }
        return path;
      };

      const isRiskyElement = (text, type, role) => {
        const lower = (text + ' ' + (type || '') + ' ' + (role || '')).toLowerCase();
        const riskyWords = ['delete', 'remove', 'erase', 'wipe', 'purchase', 'pay now', 'checkout', 'confirm payment', 'transfer money', 'drop database', 'terminate'];
        return riskyWords.some(w => lower.includes(w));
      };

      const elements = [];
      const candidates = document.querySelectorAll('button, a[href], input, textarea, select, [role="button"], [role="link"], [role="checkbox"], [role="tab"]');
      
      let index = 0;
      candidates.forEach((el) => {
        if (!isVisible(el)) return;
        const rect = el.getBoundingClientRect();
        const text = (el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || el.title || '').trim().slice(0, 100);
        const tag = el.tagName.toLowerCase();
        const type = el.type || '';
        const role = el.getAttribute('role') || '';
        const selector = getSelector(el);
        const risky = isRiskyElement(text, type, role);

        elements.push({
          id: index++,
          tag,
          type,
          role,
          text,
          selector,
          href: el.href || null,
          isRisky: risky,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        });
      });

      return elements.slice(0, 50); // Keep top 50 visible elements
    });
  }

  static async extractStructuredData(page, hint = '') {
    if (!page) return [];

    return await page.evaluate((hintText) => {
      const results = [];

      // 1. Check for standard tables
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        const rows = table.querySelectorAll('tr');
        if (rows.length > 1) {
          const headers = [];
          const ths = rows[0].querySelectorAll('th, td');
          ths.forEach((th, idx) => headers.push(th.innerText.trim() || `col_${idx}`));

          const tableData = [];
          for (let i = 1; i < Math.min(rows.length, 30); i++) {
            const cells = rows[i].querySelectorAll('td');
            if (cells.length > 0) {
              const rowObj = {};
              cells.forEach((cell, idx) => {
                const key = headers[idx] || `col_${idx}`;
                rowObj[key] = cell.innerText.trim();
              });
              tableData.push(rowObj);
            }
          }
          if (tableData.length > 0) {
            return tableData;
          }
        }
      }

      // 2. Check for Hacker News style list (titleline)
      const hnItems = document.querySelectorAll('.athing');
      if (hnItems.length > 0) {
        hnItems.forEach((row, idx) => {
          if (idx >= 15) return;
          const titleEl = row.querySelector('.titleline > a');
          const siteEl = row.querySelector('.sitebit');
          const subtext = row.nextElementSibling ? row.nextElementSibling.querySelector('.subtext') : null;
          const scoreEl = subtext ? subtext.querySelector('.score') : null;
          const authorEl = subtext ? subtext.querySelector('.hnuser') : null;

          if (titleEl) {
            results.push({
              rank: idx + 1,
              title: titleEl.innerText.trim(),
              url: titleEl.href,
              source: siteEl ? siteEl.innerText.trim() : 'news.ycombinator.com',
              points: scoreEl ? scoreEl.innerText.trim() : '0 points',
              author: authorEl ? authorEl.innerText.trim() : 'unknown'
            });
          }
        });
        if (results.length > 0) return results;
      }

      // 3. Check for GitHub trending or list rows
      const repoRows = document.querySelectorAll('article.Box-row');
      if (repoRows.length > 0) {
        repoRows.forEach((row, idx) => {
          if (idx >= 10) return;
          const titleLink = row.querySelector('h2 a');
          const descEl = row.querySelector('p');
          const starsEl = row.querySelector('a[href*="/stargazers"]');
          if (titleLink) {
            results.push({
              rank: idx + 1,
              name: titleLink.innerText.trim().replace(/\s+/g, ' '),
              url: titleLink.href,
              description: descEl ? descEl.innerText.trim() : '',
              stars: starsEl ? starsEl.innerText.trim() : ''
            });
          }
        });
        if (results.length > 0) return results;
      }

      // 4. Check for cards or list items (.card, .item, article, li)
      const articles = document.querySelectorAll('article, .card, [role="article"]');
      if (articles.length >= 2) {
        articles.forEach((art, idx) => {
          if (idx >= 15) return;
          const heading = art.querySelector('h1, h2, h3, h4');
          const link = art.querySelector('a');
          const desc = art.querySelector('p');
          if (heading) {
            results.push({
              id: idx + 1,
              title: heading.innerText.trim(),
              url: link ? link.href : '',
              summary: desc ? desc.innerText.trim().slice(0, 150) : ''
            });
          }
        });
        if (results.length > 0) return results;
      }

      // 5. Fallback: extract main headings & paragraphs
      const headings = document.querySelectorAll('h1, h2, h3');
      headings.forEach((h, idx) => {
        if (idx >= 10) return;
        const nextP = h.nextElementSibling && h.nextElementSibling.tagName === 'P' ? h.nextElementSibling.innerText.trim() : '';
        results.push({
          section: h.innerText.trim(),
          content: nextP.slice(0, 200)
        });
      });

      return results;
    }, hint);
  }

  static async getPageSummary(page) {
    if (!page) return { title: '', url: '', textSample: '' };

    return await page.evaluate(() => {
      const title = document.title || '';
      const url = window.location.href;
      
      // Get main text content
      const clone = document.body ? document.body.cloneNode(true) : null;
      if (clone) {
        const scripts = clone.querySelectorAll('script, style, noscript, svg');
        scripts.forEach(s => s.remove());
        const rawText = clone.innerText.replace(/\s+/g, ' ').trim();
        return {
          title,
          url,
          textSample: rawText.slice(0, 1500)
        };
      }
      return { title, url, textSample: '' };
    });
  }
}

module.exports = DOMExtractor;
