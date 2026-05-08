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

let browser = null;

// Initialize browser via browserless.io
async function initBrowser(proxyServer = null) {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) throw new Error('BROWSERLESS_TOKEN env var is required');

  let wsEndpoint = `wss://chrome.browserless.io?token=${token}`;
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
    linkExcludes = [],          // Array of strings to exclude from links
    titleContains = null,       // Title must contain this string (case-insensitive)
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
    screenshot = false,         // Take screenshot for debugging
    timezone = null,            // Timezone ID e.g. "Africa/Lusaka"
    locale = null               // Locale e.g. "en-ZM"
  } = options;

  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  try {
    // Set timezone if provided
    if (timezone) {
      await page.emulateTimezone(timezone);
    }

    // Set custom user agent if provided
    if (userAgent) {
      await page.setUserAgent(userAgent);
    } else {
      // Default mobile user agent (sometimes shows different content)
      // await page.setUserAgent('Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Mobile Safari/537.36');
    }

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

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
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
    const headlines = await page.evaluate((opts) => {
      const { sourceName, linkContains, linkExcludes, titleContains, minTitleLength, selector } = opts;
      const elements = Array.from(document.querySelectorAll(selector));
      
      return elements
        .map(el => {
          // Handle both <a> tags and other elements
          const link = el.href || el.querySelector('a')?.href || '';
          const title = el.innerText?.trim().replace(/\s+/g, ' ') || '';
          return { source: sourceName, title, link };
        })
        .filter(item => {
          // Title length filter
          if (item.title.length < minTitleLength) return false;
          
          // Must be valid URL
          if (!item.link.startsWith('http')) return false;
          
          // Link must contain pattern (if specified)
          if (linkContains && !item.link.toLowerCase().includes(linkContains.toLowerCase())) return false;
          
          // Title must contain text (if specified)
          if (titleContains && !item.title.toLowerCase().includes(titleContains.toLowerCase())) return false;
          
          // Default exclusions
          const defaultExcludes = ['javascript:', 'mailto:', '#', 'login', 'signin', 'signup', 'register'];
          if (defaultExcludes.some(p => item.link.toLowerCase().includes(p))) return false;
          
          // Custom exclusions
          if (linkExcludes && linkExcludes.length > 0) {
            if (linkExcludes.some(p => item.link.toLowerCase().includes(p.toLowerCase()))) return false;
          }
          
          return true;
        });
    }, { sourceName, linkContains, linkExcludes, titleContains, minTitleLength, selector });

    await page.close();
    
    // Apply maxResults if specified
    const finalHeadlines = maxResults ? headlines.slice(0, maxResults) : headlines;
    
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
        .upsert(headline, { onConflict: 'link', ignoreDuplicates: true });
      
      if (error) skipped++;
      else inserted++;
    }

    result.inserted = inserted;
    result.skipped = skipped;
  }

  res.json(result);
});

// ============================================================================
// REGULATORY SOURCES
// ============================================================================

const REGULATORS = [
  // UK
  { name: 'FCA - News', region: 'UK', url: 'https://www.fca.org.uk/news', linkContains: '/news' },
  { name: 'FCA - Policy & Guidance', region: 'UK', url: 'https://www.fca.org.uk/publications/search-results?p_search_term=&category=policy%20and%20guidance', linkContains: '/publications' },
  { name: 'FCA - SFTR News', region: 'UK', url: 'https://www.fca.org.uk/markets/sftr/news', linkContains: '/sftr' },
  { name: 'FCA - UK EMIR News', region: 'UK', url: 'https://www.fca.org.uk/firms/uk-emir/news', linkContains: '/emir' },
  { name: 'FCA - MiFIR Transaction Reporting', region: 'UK', url: 'https://www.fca.org.uk/markets/transaction-reporting', linkContains: '/transaction-reporting' },
  { name: 'PRA', region: 'UK', url: 'https://www.bankofengland.co.uk/prudential-regulation/news', linkContains: '/news' },
  { name: 'Bank of England - Financial Stability', region: 'UK', url: 'https://www.bankofengland.co.uk/news/latest-and-upcoming', linkContains: '/news' },
  { name: 'UK T+1 Taskforce', region: 'UK', url: 'https://acceleratedsettlement.co.uk/news/', linkContains: '/news' },
  // EU
  { name: 'ESMA - News', region: 'EU', url: 'https://www.esma.europa.eu/press-news/esma-news', linkContains: '/esma-news' },
  { name: 'ESMA - Library', region: 'EU', url: 'https://www.esma.europa.eu/databases-library/esma-library/', linkContains: '/library' },
  { name: 'ESMA - Consultations', region: 'EU', url: 'https://www.esma.europa.eu/press-news/consultations', linkContains: '/consultations' },
  { name: 'AFME - Press Releases', region: 'EU', url: 'https://www.afme.eu/news/press-releases', linkContains: '/press-releases' },
  // Switzerland
  { name: 'FINMA - News', region: 'CH', url: 'https://www.finma.ch/en/news/', linkContains: '/news' },
  { name: 'FINMA - Guidance', region: 'CH', url: 'https://www.finma.ch/en/documentation/finma-guidance/', linkContains: '/guidance' },
  // Ireland
  { name: 'Central Bank of Ireland - News', region: 'IE', url: 'https://www.centralbank.ie/news-media', linkContains: '/news' },
  { name: 'Central Bank of Ireland - Schedule', region: 'IE', url: 'https://www.centralbank.ie/news-media/schedule', linkContains: '/schedule' },
  // US
  { name: 'SEC - News', region: 'US', url: 'https://www.sec.gov/news', linkContains: '/news' },
  { name: 'SEC - Rulemaking', region: 'US', url: 'https://www.sec.gov/rules-regulations/rulemaking-index', linkContains: '/rules' },
  { name: 'SEC - Regulatory Agenda', region: 'US', url: 'https://www.reginfo.gov/public/do/eAgendaMain', linkContains: '/eAgenda' },
  { name: 'CFTC - Press Releases', region: 'US', url: 'https://www.cftc.gov/PressRoom/PressReleases', linkContains: '/PressReleases' },
  { name: 'CFTC - No Action Letters', region: 'US', url: 'https://www.cftc.gov/LawRegulation/CFTCStaffLetters/letters.htm', linkContains: '/letters' },
  { name: 'FINRA - News Releases', region: 'US', url: 'https://www.finra.org/media-center/newsreleases', linkContains: '/newsreleases' },
  { name: 'FINRA - TRACE Updates', region: 'US', url: 'https://www.finra.org/filing-reporting/market-transparency-reporting/trace/recent-updates', linkContains: '/trace' },
  { name: 'FINRA - CAT Announcements', region: 'US', url: 'https://www.catnmsplan.com/announcements', linkContains: '/announcements' },
  { name: 'FINRA - CAT Specifications', region: 'US', url: 'https://www.catnmsplan.com/specifications/im', linkContains: '/specifications' },
  { name: 'DTCC - US Treasury Clearing', region: 'US', url: 'https://www.dtcc.com/clearing-services/ficc-gov/treasury-clearing', linkContains: '/treasury' },
  { name: 'DTCC - Learning Center', region: 'US', url: 'https://dtcclearning.com/', linkContains: null },
  // Canada
  { name: 'AMF Canada - News', region: 'CA', url: 'https://lautorite.qc.ca/en/general-public/media-centre/news', linkContains: '/news' },
  { name: 'CSA Canada - News', region: 'CA', url: 'https://www.securities-administrators.ca/news/', linkContains: '/news' },
  { name: 'OSC Ontario - News', region: 'CA', url: 'https://www.osc.ca/en/news-events/news', linkContains: '/news' },
  { name: 'OSC Ontario - Publications', region: 'CA', url: 'https://www.osc.ca/en/news-events/reports-and-publications', linkContains: '/publications' },
  { name: 'MSC Manitoba - Derivatives', region: 'CA', url: 'https://docs.mbsecurities.ca/msc/derivatives/en/0-9/nav_alpha.do', linkContains: '/derivatives' },
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
  { name: 'CSRC China - Rules', region: 'CN', url: 'http://www.csrc.gov.cn/csrc_en/c102033/common_list.shtml', linkContains: '/csrc_en' },
  { name: 'CSRC China - Policy Q&A', region: 'CN', url: 'http://www.csrc.gov.cn/csrc_en/c102034/common_list.shtml', linkContains: '/csrc_en' },
  // Israel
  { name: 'Bank of Israel - Press Releases', region: 'IL', url: 'https://www.boi.org.il/en/communication-and-publications/press-releases/', linkContains: '/press-releases' },
  // Industry
  { name: 'ISDA - Data & Reporting', region: 'Global', url: 'https://www.isda.org/category/infrastructure/data-and-reporting/', linkContains: '/data-and-reporting' },
  { name: 'ISDA - Compliance Calendar', region: 'Global', url: 'https://www.isda.org/tag/compliance-calendar/', linkContains: '/compliance-calendar' },
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
      const result = await scrapeUrl(reg.url, {
        sourceName: reg.name,
        linkContains: reg.linkContains,
        waitTime: 3000,
      });

      if (result.success && result.headlines.length > 0) {
        for (const headline of result.headlines) {
          const { error } = await supabase
            .from('headlines')
            .upsert(headline, { onConflict: 'link', ignoreDuplicates: true });
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

  let query = supabase
    .from('headlines')
    .select('*')
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
