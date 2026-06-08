require('dotenv').config();
const express = require('express');
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// Serve screenshots folder as static files
app.use('/screenshots', express.static(path.join(__dirname, 'screenshots')));

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Realistic desktop UA — some regulator sites serve an empty DOM to the default
// headless user agent.
const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

let browser = null;

// Initialize browser via browserless.io
async function initBrowser(proxyServer = null) {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) throw new Error('BROWSERLESS_TOKEN env var is required');

  // stealth + blockAds help with bot-gated sites (e.g. FINRA, FSS Korea) that
  // otherwise serve a near-empty DOM to headless Chrome.
  let wsEndpoint = `wss://chrome.browserless.io?token=${token}&stealth&blockAds`;
  if (proxyServer) {
    wsEndpoint += `&--proxy-server=${encodeURIComponent(proxyServer)}`;
  }

  browser = await puppeteer.connect({
    browserWSEndpoint: wsEndpoint,
    defaultViewport: null,
  });
  console.log('Browser connected to browserless.io' + (proxyServer ? ` with proxy: ${proxyServer}` : ''));
}

// Scrape a single URL with filtering options
async function scrapeUrl(url, options = {}) {
  const {
    sourceName = 'Custom',
    linkContains = null,        // Link must contain this string
    linkRegex = null,           // Link must match this regex (string source, case-insensitive)
    linkExcludes = [],          // Array of strings to exclude from links
    titleContains = null,       // Title must contain this string (case-insensitive)
    titleExcludes = [],         // Array of strings to exclude from titles
    minTitleLength = 15,        // Minimum title length
    selector = 'a',             // CSS selector (default: all links)
    maxResults = null,          // Limit number of results
    cookies = [],               // Array of cookies to set
    geolocation = null,         // { latitude, longitude, accuracy }
    userAgent = null,           // Custom user agent string
    headers = {},               // Custom HTTP headers
    waitForSelector = null,     // Wait for specific element before scraping
    scrollPage = false,         // Scroll to load more content
    scrollCount = 3,            // Number of scroll iterations
    waitTime = 3000,            // Time to wait after page load (ms)
    waitUntil = 'domcontentloaded', // 'networkidle2' lets Cloudflare JS challenges resolve (FINRA)
    screenshot = false,         // Take screenshot for debugging
    timezone = null,            // Timezone ID e.g. "Africa/Lusaka"
    locale = null,              // Locale e.g. "en-ZM"
    fetchDateFromArticle = false // Visit each article to read its published date (for listings with no date)
  } = options;

  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  try {
    // Set timezone if provided
    if (timezone) {
      await page.emulateTimezone(timezone);
    }

    // Set user agent — default to a real desktop UA. Some sites (e.g. AMF Canada)
    // serve a near-empty DOM to the headless default UA, so a realistic UA is important.
    await page.setUserAgent(userAgent || DEFAULT_UA);
    await page.setViewport({ width: 1366, height: 768 });

    // Set custom headers
    if (headers && Object.keys(headers).length > 0) {
      await page.setExtraHTTPHeaders(headers);
    }

    // Set Accept-Language based on locale
    if (locale) {
      await page.setExtraHTTPHeaders({
        'Accept-Language': locale,
        ...headers
      });
    }

    // Set geolocation if provided (useful for location-based sites)
    if (geolocation) {
      await page.setGeolocation(geolocation);
      // Grant geolocation permission
      const context = browser.defaultBrowserContext();
      await context.overridePermissions(new URL(url).origin, ['geolocation']);
    }

    // Set cookies if provided
    if (cookies && cookies.length > 0) {
      await page.setCookie(...cookies);
    }

    await page.goto(url, { waitUntil, timeout: 60000 });

    // Wait for specific element if specified
    if (waitForSelector) {
      try {
        await page.waitForSelector(waitForSelector, { timeout: 10000 });
      } catch (e) {
        console.log(`Warning: Selector "${waitForSelector}" not found within timeout`);
      }
    }

    // Wait for content
    await new Promise(r => setTimeout(r, waitTime));

    // If we landed on a Cloudflare/anti-bot interstitial, give it time to clear.
    try {
      for (let i = 0; i < 8; i++) {
        const t = await page.title();
        if (!/just a moment|attention required|one moment|checking your browser/i.test(t)) break;
        await new Promise(r => setTimeout(r, 2500));
      }
    } catch {}

    // Scroll page to load more content (infinite scroll)
    if (scrollPage) {
      for (let i = 0; i < scrollCount; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise(r => setTimeout(r, 2000));
      }
      // Scroll back to top
      await page.evaluate(() => window.scrollTo(0, 0));
      await new Promise(r => setTimeout(r, 1000));
    }

    // Take screenshot for debugging - saves to file
    let screenshotFile = null;
    if (screenshot) {
      // Ensure screenshots folder exists
      const screenshotsDir = path.join(__dirname, 'screenshots');
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir);
      }
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `screenshot-${timestamp}.png`;
      const filepath = path.join(screenshotsDir, filename);
      
      await page.screenshot({ path: filepath, fullPage: false });
      screenshotFile = filename;
    }

    // Extract headlines with filters
    const EXTRACT = (opts) => {
      const { sourceName, linkContains, linkRegexSrc, linkExcludes, titleContains, titleExcludes, minTitleLength, selector } = opts;
      const linkRegex = linkRegexSrc ? new RegExp(linkRegexSrc, 'i') : null;

      const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
      const DATE_TOKEN = '((\\d{4}-\\d{2}-\\d{2})|(\\d{1,2}\\/\\d{1,2}\\/\\d{4})|(\\d{1,2}\\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?\\s+\\d{4})|((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?\\s+\\d{1,2},?\\s+\\d{4}))';
      const DATE_RE = new RegExp(DATE_TOKEN, 'i');

      // Parse a date string into an ISO timestamp. Slash dates are treated as
      // DD/MM/YYYY (European), matching the regulators we scrape.
      function toISO(str) {
        if (!str) return null;
        str = str.trim();
        let m;
        if (/^\d{4}-\d{2}-\d{2}/.test(str)) { const d = new Date(str); return isNaN(d) ? null : d.toISOString(); }
        if ((m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) { const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])); return isNaN(d) ? null : d.toISOString(); }
        if ((m = str.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/))) { const mo = MONTHS[m[2].toLowerCase()]; if (mo == null) return null; const d = new Date(Date.UTC(+m[3], mo, +m[1])); return isNaN(d) ? null : d.toISOString(); }
        if ((m = str.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/))) { const mo = MONTHS[m[1].toLowerCase()]; if (mo == null) return null; const d = new Date(Date.UTC(+m[3], mo, +m[2])); return isNaN(d) ? null : d.toISOString(); }
        return null;
      }

      // Look for the article's published date near the link: a <time datetime>
      // in an ancestor, else a date string in surrounding text.
      function findDate(a) {
        let el = a;
        for (let i = 0; i < 5 && el; i++) {
          const t = el.querySelector && el.querySelector('time[datetime]');
          if (t) { const iso = toISO(t.getAttribute('datetime')); if (iso) return iso; }
          el = el.parentElement;
        }
        el = a;
        for (let i = 0; i < 6 && el; i++) {
          const m = (el.textContent || '').match(DATE_RE);
          if (m) { const iso = toISO(m[0]); if (iso) return iso; }
          el = el.parentElement;
        }
        return null;
      }

      // Pagination / navigation labels that are not real articles.
      const JUNK_RE = /^(\d+|last|next|previous|prev|first|back|more|home|menu|search|subscribe|next\s*page.*|last\s*page.*|previous\s*page.*|first\s*page.*|page\s+\d+.*|go to .*|skip to .*|reverse chronological|.*current page.*|.*current sub-section.*|see all .*|view all.*|search all .*|connect with us|read more)$/i;

      function cleanTitle(raw) {
        let t = (raw || '').replace(/\s+/g, ' ').trim();
        // Strip a trailing date the page concatenated onto the headline
        // (e.g. ESMA "... newsletter 01/06/2026").
        t = t.replace(new RegExp('[\\s,–-]*' + DATE_TOKEN + '\\s*$', 'i'), '').trim();
        // Strip trailing "Link is external" accessibility noise (FCA etc.)
        t = t.replace(/\s*Link is external\s*$/i, '').trim();
        return t;
      }

      const elements = Array.from(document.querySelectorAll(selector));
      const seen = new Set();
      const out = [];
      for (const el of elements) {
        const link = el.href || (el.querySelector('a') && el.querySelector('a').href) || '';
        let published_at = findDate(el);
        // A publish date can't be in the future — that's an event/deadline date, not a publish date.
        if (published_at && new Date(published_at).getTime() > Date.now() + 864e5) published_at = null;
        const title = cleanTitle(el.innerText || el.textContent || '');

        if (title.length < minTitleLength) continue;
        if (!link.startsWith('http')) continue;
        if (linkContains && !link.toLowerCase().includes(linkContains.toLowerCase())) continue;
        if (linkRegex && !linkRegex.test(link)) continue;
        if (titleContains && !title.toLowerCase().includes(titleContains.toLowerCase())) continue;
        if (JUNK_RE.test(title)) continue;

        const defaultExcludes = ['javascript:', 'mailto:', '#', 'login', 'signin', 'signup', 'register'];
        if (defaultExcludes.some(p => link.toLowerCase().includes(p))) continue;
        if (linkExcludes && linkExcludes.some(p => link.toLowerCase().includes(p.toLowerCase()))) continue;
        if (titleExcludes && titleExcludes.some(p => title.toLowerCase().includes(p.toLowerCase()))) continue;

        if (seen.has(link)) continue;
        seen.add(link);
        out.push({ source: sourceName, title, link, published_at });
      }
      return out;
    };

    const EXTRACT_ARGS = { sourceName, linkContains, linkRegexSrc: linkRegex, linkExcludes, titleContains, titleExcludes, minTitleLength, selector };
    // Some sites client-side redirect just after load, destroying the execution
    // context mid-eval (UK T+1, CSA Canada). Retry once after settling.
    let headlines;
    try {
      headlines = await page.evaluate(EXTRACT, EXTRACT_ARGS);
    } catch (e) {
      await new Promise(r => setTimeout(r, 4000));
      headlines = await page.evaluate(EXTRACT, EXTRACT_ARGS);
    }

    await page.close();

    // Apply maxResults if specified
    const finalHeadlines = maxResults ? headlines.slice(0, maxResults) : headlines;

    // For listings that don't expose a date (e.g. AFME), optionally open each
    // article and read the published date from its body.
    if (fetchDateFromArticle) {
      for (const h of finalHeadlines) {
        if (h.published_at) continue;
        try {
          const ap = await browser.newPage();
          await ap.setUserAgent(userAgent || DEFAULT_UA);
          await ap.goto(h.link, { waitUntil: 'domcontentloaded', timeout: 25000 });
          await new Promise(r => setTimeout(r, 1500));
          h.published_at = await ap.evaluate(() => {
            const MO = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
            const meta = document.querySelector('meta[property="article:published_time"], meta[name="article:published_time"], meta[itemprop="datePublished"]');
            if (meta && meta.content) { const d = new Date(meta.content); if (!isNaN(d)) return d.toISOString(); }
            const time = document.querySelector('time[datetime]');
            if (time) { const d = new Date(time.getAttribute('datetime')); if (!isNaN(d)) return d.toISOString(); }
            const m = (document.body.textContent || '').match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i);
            if (m) { const d = new Date(Date.UTC(+m[3], MO[m[2].toLowerCase()], +m[1])); if (!isNaN(d)) return d.toISOString(); }
            return null;
          });
          await ap.close();
        } catch (e) {
          // Couldn't fetch article date — leave it null
        }
      }
    }
    
    const result = { success: true, headlines: finalHeadlines, count: finalHeadlines.length };
    if (screenshotFile) {
      result.screenshotFile = screenshotFile;
      result.screenshotUrl = `/screenshots/${screenshotFile}`;
    }
    return result;
  } catch (error) {
    await page.close();
    return { success: false, error: error.message, headlines: [], count: 0 };
  }
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Project Horizon Scraper API' });
});

// Set proxy and restart browser
app.post('/set-proxy', async (req, res) => {
  const { proxy } = req.body;
  
  try {
    if (browser) {
      await browser.close();
    }
    await initBrowser(proxy || null);
    res.json({ success: true, message: proxy ? `Proxy set to: ${proxy}` : 'Proxy removed, using direct connection' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Scrape a single URL (doesn't save to DB)
app.post('/scrape', async (req, res) => {
  const { url, ...options } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  console.log(`Scraping: ${url}`);
  const result = await scrapeUrl(url, options);
  
  res.json(result);
});

// Scrape and save to Supabase
app.post('/scrape-and-save', async (req, res) => {
  const { url, ...options } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  console.log(`Scraping and saving: ${url}`);
  const result = await scrapeUrl(url, options);

  if (result.success && result.headlines.length > 0) {
    let inserted = 0;
    let skipped = 0;

    for (const headline of result.headlines) {
      const { error } = await supabase
        .from('headlines')
        .upsert(headline, { onConflict: 'link' });

      if (error) skipped++;
      else inserted++;
    }

    result.inserted = inserted;
    result.skipped = skipped;
  }

  res.json(result);
});

// ============================================================================
// RSS  — some sources are bot-gated (Cloudflare/DDoS-Guard) for a browser but
// expose a public RSS/Atom feed over plain HTTP. When a source has `rss`, we
// fetch the feed instead of driving a browser. Gives clean titles + real dates.
// ============================================================================
function decodeEntities(s) {
  return (s || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function rssTag(block, name) {
  const m = block.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)<\\/' + name + '>', 'i'));
  return m ? m[1] : '';
}

function parseFeed(xml, sourceName) {
  const out = [];
  const isAtom = /<entry[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml);
  const chunks = xml.split(isAtom ? /<entry[\s>]/i : /<item[\s>]/i).slice(1);
  for (const raw of chunks) {
    const block = raw.split(isAtom ? /<\/entry>/i : /<\/item>/i)[0];
    const title = decodeEntities(rssTag(block, 'title'));
    let link = decodeEntities(rssTag(block, 'link'));
    if (!link) { const m = block.match(/<link[^>]*href=["']([^"']+)["']/i); if (m) link = m[1]; }
    const dateStr = rssTag(block, 'pubDate') || rssTag(block, 'dc:date') || rssTag(block, 'published') || rssTag(block, 'updated');
    let published_at = null;
    if (dateStr) { const d = new Date(dateStr.trim()); if (!isNaN(d) && d.getTime() <= Date.now() + 864e5) published_at = d.toISOString(); }
    if (title && link && link.startsWith('http')) out.push({ source: sourceName, title, link, published_at });
  }
  return out;
}

// Read an article's publish date over plain HTTP (for feeds like FCA that omit
// per-item dates). The article pages aren't bot-gated even when listings are.
async function fetchArticleDate(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': DEFAULT_UA }, redirect: 'follow' });
    const b = await res.text();
    let m = b.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i)
         || b.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:published_time["']/i)
         || b.match(/<time[^>]+datetime=["']([^"']+)["']/i);
    if (m) { const d = new Date(m[1]); if (!isNaN(d) && d.getTime() <= Date.now() + 864e5) return d.toISOString(); }
    return null;
  } catch { return null; }
}

async function fetchRss(reg, attempts = 3) {
  let lastErr = 'unknown';
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(reg.rss, { headers: { 'User-Agent': DEFAULT_UA, 'Accept': 'application/rss+xml, application/xml, text/xml, */*' }, redirect: 'follow' });
      const body = await res.text();
      let items = parseFeed(body, reg.name);
      if (reg.maxResults) items = items.slice(0, reg.maxResults);
      if (reg.fetchDateFromArticle) {
        for (const h of items) {
          if (!h.published_at) h.published_at = await fetchArticleDate(h.link);
        }
      }
      return { success: true, headlines: items, count: items.length };
    } catch (e) {
      // Some hosts intermittently drop the connection ("fetch failed"); retry.
      lastErr = e.cause ? e.cause.message : e.message;
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
  return { success: false, error: lastErr, headlines: [], count: 0 };
}

// ============================================================================
// REGULATORY SOURCES
// ============================================================================

const REGULATORS = [
  // UK
  { name: 'FCA - News', region: 'UK', url: 'https://www.fca.org.uk/news', rss: 'https://www.fca.org.uk/news/rss.xml', fetchDateFromArticle: true, maxResults: 20 },
  { name: 'FCA - Policy & Guidance', region: 'UK', url: 'https://www.fca.org.uk/publications', rss: 'https://www.fca.org.uk/publications/rss.xml', fetchDateFromArticle: true, maxResults: 20 },
  { name: 'FCA - SFTR News', region: 'UK', url: 'https://www.fca.org.uk/markets/sftr/news', linkContains: '/sftr' },
  { name: 'FCA - UK EMIR News', region: 'UK', url: 'https://www.fca.org.uk/firms/uk-emir/news', linkContains: '/publication' },
  { name: 'FCA - MiFIR Transaction Reporting', region: 'UK', url: 'https://www.fca.org.uk/markets/transaction-reporting', linkContains: '/transaction-reporting' },
  { name: 'PRA', region: 'UK', url: 'https://www.bankofengland.co.uk/prudential-regulation/news', linkContains: '/news' },
  { name: 'Bank of England - Financial Stability', region: 'UK', url: 'https://www.bankofengland.co.uk/news/latest-and-upcoming', linkContains: '/news' },
  { name: 'UK T+1 Taskforce', region: 'UK', url: 'https://acceleratedsettlement.co.uk/news/', rss: 'https://acceleratedsettlement.co.uk/feed/' },
  // EU
  { name: 'ESMA - News', region: 'EU', url: 'https://www.esma.europa.eu/press-news/esma-news', linkContains: '/esma-news' },
  { name: 'ESMA - Library', region: 'EU', url: 'https://www.esma.europa.eu/databases-library/esma-library/', linkContains: '/document', scrollPage: true },
  { name: 'ESMA - Consultations', region: 'EU', url: 'https://www.esma.europa.eu/press-news/consultations', linkContains: '/consultations' },
  { name: 'AFME - Press Releases', region: 'EU', url: 'https://www.afme.eu/news/press-releases', linkContains: '/press-releases', fetchDateFromArticle: true, maxResults: 25 },
  // Switzerland
  { name: 'FINMA - News', region: 'CH', url: 'https://www.finma.ch/en/news/', linkContains: '/news' },
  { name: 'FINMA - Guidance', region: 'CH', url: 'https://www.finma.ch/en/documentation/finma-guidance/', titleContains: 'guidance' },
  // Ireland
  { name: 'Central Bank of Ireland - News', region: 'IE', url: 'https://www.centralbank.ie/news-media', linkContains: '/news' },
  { name: 'Central Bank of Ireland - Schedule', region: 'IE', url: 'https://www.centralbank.ie/news-media/schedule', linkContains: '/schedule' },
  // US
  { name: 'SEC - News', region: 'US', url: 'https://www.sec.gov/news', linkContains: '/news' },
  { name: 'SEC - Rulemaking', region: 'US', url: 'https://www.sec.gov/rules-regulations/rulemaking-index', linkContains: '/rules' },
  { name: 'SEC - Regulatory Agenda', region: 'US', url: 'https://www.reginfo.gov/public/do/eAgendaMain', linkContains: '/eAgenda' },
  { name: 'CFTC - Press Releases', region: 'US', url: 'https://www.cftc.gov/PressRoom/PressReleases', linkContains: '/PressReleases' },
  { name: 'CFTC - No Action Letters', region: 'US', url: 'https://www.cftc.gov/LawRegulation/CFTCStaffLetters/letters.htm', linkContains: '/csl/', minTitleLength: 6 },
  { name: 'FINRA - News Releases', region: 'US', url: 'https://www.finra.org/media-center/newsreleases', linkContains: '/newsreleases', waitUntil: 'networkidle2', waitTime: 10000, scrollPage: true },
  { name: 'FINRA - TRACE Updates', region: 'US', url: 'https://www.finra.org/filing-reporting/market-transparency-reporting/trace/recent-updates', linkContains: '/trace', waitUntil: 'networkidle2', waitTime: 10000 },
  { name: 'FINRA - CAT Announcements', region: 'US', url: 'https://www.catnmsplan.com/announcements', linkContains: '/announcements' },
  { name: 'FINRA - CAT Specifications', region: 'US', url: 'https://www.catnmsplan.com/specifications/im', linkContains: '/specifications' },
  { name: 'DTCC - US Treasury Clearing', region: 'US', url: 'https://www.dtcc.com/clearing-services/ficc-gov/treasury-clearing', linkContains: '/treasury' },
  // Canada
  { name: 'AMF Canada - News', region: 'CA', url: 'https://lautorite.qc.ca/en/general-public/media-centre/news', linkContains: '/news', waitTime: 8000, scrollPage: true },
  { name: 'CSA Canada - News', region: 'CA', url: 'https://www.securities-administrators.ca/news/', rss: 'https://www.securities-administrators.ca/news/feed/' },
  { name: 'OSC Ontario - News', region: 'CA', url: 'https://www.osc.ca/en/news-events/news', linkContains: '/news' },
  { name: 'OSC Ontario - Publications', region: 'CA', url: 'https://www.osc.ca/en/news-events/reports-and-publications', linkContains: 'reports-and-publications', scrollPage: true },
  // Asia Pacific
  { name: 'ASIC - Newsroom', region: 'AU', url: 'https://asic.gov.au/newsroom', linkContains: '/newsroom' },
  { name: 'ASIC - Derivatives Reporting', region: 'AU', url: 'https://asic.gov.au/regulatory-resources/markets/otc-derivatives/derivative-transaction-reporting/', linkContains: '/derivatives' },
  { name: 'HKMA - Press Releases', region: 'HK', url: 'https://www.hkma.gov.hk/eng/news-and-media/press-releases/', linkContains: '/press-releases' },
  { name: 'SFC Hong Kong - Circulars', region: 'HK', url: 'https://apps.sfc.hk/edistributionWeb/gateway/EN/circular/', linkContains: '/circular' },
  { name: 'MAS Singapore - News', region: 'SG', url: 'https://www.mas.gov.sg/news', linkContains: '/news' },
  { name: 'MAS Singapore - Publications', region: 'SG', url: 'https://www.mas.gov.sg/publications', linkContains: '/publications' },
  { name: 'FSC Korea - News', region: 'KR', url: 'https://www.fsc.go.kr/eng/pr010101', linkContains: '/pr' },
  { name: 'FSS Korea - Press Releases', region: 'KR', url: 'https://english.fss.or.kr/fss/eng/promo/pressrel/list.jsp', linkContains: '/pressrel' },
  { name: 'FSS Korea - Rule Changes', region: 'KR', url: 'https://english.fss.or.kr/fss/eng/promo/rulechange/list.jsp', linkContains: '/rulechange' },
  { name: 'JFSA Japan - News', region: 'JP', url: 'https://www.fsa.go.jp/en/news/index.html', linkContains: '/news' },
  { name: 'CSRC China - Rules', region: 'CN', url: 'http://www.csrc.gov.cn/csrc_en/c102033/common_list.shtml', linkContains: '/csrc_en', waitTime: 7000 },
  { name: 'CSRC China - Policy Q&A', region: 'CN', url: 'http://www.csrc.gov.cn/csrc_en/c102034/common_list.shtml', linkContains: '/csrc_en', waitTime: 7000 },
  // Israel
  { name: 'Bank of Israel - Press Releases', region: 'IL', url: 'https://www.boi.org.il/en/communication-and-publications/press-releases/', linkContains: '/press-releases' },
  // Industry
  { name: 'ISDA - Data & Reporting', region: 'Global', url: 'https://www.isda.org/category/infrastructure/data-and-reporting/', linkContains: null, linkRegex: '/20\\d\\d/\\d{2}/' },
  { name: 'ISDA - Compliance Calendar', region: 'Global', url: 'https://www.isda.org/tag/compliance-calendar/', linkContains: null, linkRegex: '/20\\d\\d/\\d{2}/' },
];

// Track whether a scrape run is already in progress
let scrapeInProgress = false;

// Background job: scrape all regulators and save to Supabase
async function runAllScrapers() {
  if (scrapeInProgress) {
    console.log('Scrape already in progress, skipping.');
    return;
  }
  scrapeInProgress = true;
  console.log(`\n[run-scrapers] Starting full scrape of ${REGULATORS.length} sources...`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const reg of REGULATORS) {
    try {
      const result = reg.rss
        ? await fetchRss(reg)
        : await scrapeUrl(reg.url, {
            sourceName: reg.name,
            linkContains: reg.linkContains,
            linkRegex: reg.linkRegex,
            linkExcludes: reg.linkExcludes,
            titleContains: reg.titleContains,
            titleExcludes: reg.titleExcludes,
            minTitleLength: reg.minTitleLength,
            maxResults: reg.maxResults,
            scrollPage: reg.scrollPage || false,
            fetchDateFromArticle: reg.fetchDateFromArticle || false,
            waitTime: reg.waitTime || 3000,
            waitUntil: reg.waitUntil || 'domcontentloaded',
          });

      if (result.success && result.headlines.length > 0) {
        for (const headline of result.headlines) {
          // Merge (not ignore) so published_at backfills on existing rows.
          const { error } = await supabase
            .from('headlines')
            .upsert(headline, { onConflict: 'link' });
          if (error) skipped++;
          else inserted++;
        }
      }
      console.log(`[run-scrapers] ${reg.name}: ${result.count} found`);
    } catch (err) {
      console.log(`[run-scrapers] ${reg.name} ERROR: ${err.message}`);
      errors++;
    }
  }

  console.log(`[run-scrapers] Done. Inserted: ${inserted}, Skipped: ${skipped}, Errors: ${errors}`);
  scrapeInProgress = false;
}

// Trigger full scrape (fire-and-forget — responds immediately for cron-job.org)
app.get('/run-scrapers', (req, res) => {
  res.json({ status: 'accepted', message: 'Scrape job started in background', sources: REGULATORS.length });
  runAllScrapers();
});

// Scrape status check
app.get('/scrape-status', (req, res) => {
  res.json({ scrapeInProgress });
});

// ============================================================================
// Get all headlines from DB
app.get('/headlines', async (req, res) => {
  const { source, limit } = req.query;

  // Most recent article first. Fall back to scrape time when an article has no
  // published date.
  let query = supabase
    .from('headlines')
    .select('*')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('scraped_at', { ascending: false });

  if (source) {
    query = query.ilike('source', `%${source}%`);
  }

  if (limit) {
    query = query.limit(parseInt(limit));
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ count: data.length, headlines: data });
});

// ============================================================================
// START SERVER
// ============================================================================

const PORT = process.env.PORT || 3009;

initBrowser().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 Scraper API running at http://localhost:${PORT}`);
    console.log('\nEndpoints:');
    console.log('  GET  /              - Health check (cron keep-alive)');
    console.log('  GET  /run-scrapers  - Trigger full scrape (fire-and-forget)');
    console.log('  GET  /scrape-status - Check if scrape is running');
    console.log('  POST /set-proxy     - Set proxy server (restarts browser)');
    console.log('  POST /scrape        - Scrape a URL (returns data)');
    console.log('  POST /scrape-and-save - Scrape and save to Supabase');
    console.log('  GET  /headlines     - Get saved headlines');
    console.log('\nFilter options:');
    console.log('  sourceName     - Name for the source');
    console.log('  linkContains   - Link URL must contain this string');
    console.log('  linkExcludes   - Array of strings to exclude');
    console.log('  titleContains  - Title must contain this text');
    console.log('  minTitleLength - Min title length (default: 15)');
    console.log('  selector       - CSS selector (default: "a")');
    console.log('  maxResults     - Limit results');
    console.log('\nLocation/Browser options:');
    console.log('  geolocation    - {latitude, longitude} - GPS spoof');
    console.log('  timezone       - e.g. "Africa/Lusaka"');
    console.log('  locale         - e.g. "en-ZM"');
    console.log('  cookies        - [{name, value, domain}]');
    console.log('  headers        - Custom HTTP headers');
    console.log('  userAgent      - Custom user agent');
    console.log('\nPage options:');
    console.log('  waitTime       - Wait after load (ms, default: 3000)');
    console.log('  waitForSelector- Wait for element');
    console.log('  scrollPage     - Scroll for infinite content');
    console.log('  scrollCount    - Scroll iterations (default: 3)');
    console.log('  screenshot     - Return base64 screenshot');
    console.log('\nProxy: POST /set-proxy with {"proxy": "http://ip:port"}');
  });
});

// Cleanup on exit
process.on('SIGINT', async () => {
  if (browser) await browser.close();
  process.exit();
});
