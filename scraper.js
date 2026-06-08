require('dotenv').config();
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Realistic desktop UA — some regulator sites serve an empty DOM to the default
// headless user agent.
const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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

function tag(block, name) {
  const m = block.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)<\\/' + name + '>', 'i'));
  return m ? m[1] : '';
}

function parseFeed(xml, sourceName) {
  const out = [];
  const isAtom = /<entry[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml);
  const chunks = xml.split(isAtom ? /<entry[\s>]/i : /<item[\s>]/i).slice(1);
  for (const raw of chunks) {
    const block = raw.split(isAtom ? /<\/entry>/i : /<\/item>/i)[0];
    const title = decodeEntities(tag(block, 'title'));
    let link = decodeEntities(tag(block, 'link'));
    if (!link) { const m = block.match(/<link[^>]*href=["']([^"']+)["']/i); if (m) link = m[1]; }
    const dateStr = tag(block, 'pubDate') || tag(block, 'dc:date') || tag(block, 'published') || tag(block, 'updated');
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
      // Enrich missing dates from each article page (opt-in; e.g. FCA feeds).
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
// REGULATORY SOURCES  (kept in sync with api-server.js)
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
  { name: 'FINRA - News Releases', region: 'US', url: 'https://www.finra.org/media-center/newsreleases', linkContains: '/newsreleases', waitTime: 8000, scrollPage: true },
  { name: 'FINRA - TRACE Updates', region: 'US', url: 'https://www.finra.org/filing-reporting/market-transparency-reporting/trace/recent-updates', linkContains: '/trace' },
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

// ============================================================================
// SCRAPER  (extraction logic identical to api-server.js)
// ============================================================================
let browser = null;

async function scrapeUrl(url, options = {}) {
  const {
    sourceName = 'Custom',
    linkContains = null,
    linkRegex = null,
    linkExcludes = [],
    titleContains = null,
    titleExcludes = [],
    minTitleLength = 15,
    selector = 'a',
    maxResults = null,
    scrollPage = false,
    scrollCount = 3,
    waitTime = 3000,
    fetchDateFromArticle = false,
  } = options;

  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  try {
    await page.setUserAgent(DEFAULT_UA);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, waitTime));

    if (scrollPage) {
      for (let i = 0; i < scrollCount; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise(r => setTimeout(r, 2000));
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await new Promise(r => setTimeout(r, 1000));
    }

    const EXTRACT = (opts) => {
      const { sourceName, linkContains, linkRegexSrc, linkExcludes, titleContains, titleExcludes, minTitleLength, selector } = opts;
      const linkRegex = linkRegexSrc ? new RegExp(linkRegexSrc, 'i') : null;

      const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
      const DATE_TOKEN = '((\\d{4}-\\d{2}-\\d{2})|(\\d{1,2}\\/\\d{1,2}\\/\\d{4})|(\\d{1,2}\\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?\\s+\\d{4})|((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?\\s+\\d{1,2},?\\s+\\d{4}))';
      const DATE_RE = new RegExp(DATE_TOKEN, 'i');

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

      const JUNK_RE = /^(\d+|last|next|previous|prev|first|back|more|home|menu|search|subscribe|next\s*page.*|last\s*page.*|previous\s*page.*|first\s*page.*|page\s+\d+.*|go to .*|skip to .*|reverse chronological|.*current page.*|.*current sub-section.*|see all .*|view all.*|search all .*|connect with us|read more)$/i;

      function cleanTitle(raw) {
        let t = (raw || '').replace(/\s+/g, ' ').trim();
        t = t.replace(new RegExp('[\\s,–-]*' + DATE_TOKEN + '\\s*$', 'i'), '').trim();
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

    const finalHeadlines = maxResults ? headlines.slice(0, maxResults) : headlines;

    if (fetchDateFromArticle) {
      for (const h of finalHeadlines) {
        if (h.published_at) continue;
        try {
          const ap = await browser.newPage();
          await ap.setUserAgent(DEFAULT_UA);
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

    return { success: true, headlines: finalHeadlines, count: finalHeadlines.length };
  } catch (error) {
    try { await page.close(); } catch {}
    return { success: false, error: error.message, headlines: [], count: 0 };
  }
}

// ============================================================================
// SAVE
// ============================================================================
const OUTPUT_FILE = path.join(__dirname, 'scraped-headlines.json');

async function saveHeadlines(headlines) {
  console.log(`\nSaving ${headlines.length} headlines to Supabase...`);
  let inserted = 0;
  let skipped = 0;
  let loggedErr = false;

  for (const headline of headlines) {
    // Merge (not ignore) so published_at backfills onto existing rows.
    const { error } = await supabase
      .from('headlines')
      .upsert(headline, { onConflict: 'link' });
    if (error) {
      skipped++;
      if (!loggedErr) { console.log(`  ⚠ first upsert error: ${error.message}`); loggedErr = true; }
    } else {
      inserted++;
    }
  }
  console.log(`✓ Saved: ${inserted}, Skipped: ${skipped}`);
  return { inserted, skipped };
}

// ============================================================================
// MAIN
// ============================================================================
(async () => {
  // --save-only: skip scraping, push the last scraped JSON to Supabase
  // (useful after adding the published_at column, to avoid re-scraping).
  if (process.argv.includes('--save-only')) {
    if (!fs.existsSync(OUTPUT_FILE)) {
      console.log(`No ${OUTPUT_FILE} found. Run a normal scrape first.`);
      process.exit(1);
    }
    const cached = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    console.log(`Loaded ${cached.length} headlines from ${OUTPUT_FILE}`);
    await saveHeadlines(cached);
    console.log('\nDone!');
    process.exit(0);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('PROJECT HORIZON - Regulatory News Scraper (LOCAL Chrome)');
  console.log(`${'='.repeat(60)}`);
  console.log(`Starting scrape of ${REGULATORS.length} sources...\n`);

  browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });

  let allHeadlines = [];
  let successCount = 0;
  let errorCount = 0;

  // --only="name fragment,another" runs just the matching sources (for verifying fixes).
  const onlyArg = process.argv.find(a => a.startsWith('--only='));
  const onlyList = onlyArg ? onlyArg.split('=')[1].toLowerCase().split(',').map(x => x.trim()) : null;
  const regs = onlyList ? REGULATORS.filter(r => onlyList.some(x => r.name.toLowerCase().includes(x))) : REGULATORS;
  if (onlyList) console.log(`(--only) running ${regs.length} matching source(s)\n`);

  for (const reg of regs) {
    process.stdout.write(`[${reg.region}] ${reg.name}${reg.rss ? ' (rss)' : ''}... `);
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
        });

    if (result.success) {
      const withDates = result.headlines.filter(h => h.published_at).length;
      console.log(`✓ ${result.count} found (${withDates} with dates)`);
      allHeadlines = allHeadlines.concat(result.headlines);
      successCount++;
    } else {
      console.log(`✗ Error: ${result.error}`);
      errorCount++;
    }
  }

  await browser.close();

  // Remove duplicates by link
  const uniqueHeadlines = Array.from(new Map(allHeadlines.map(h => [h.link, h])).values());

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Scraping complete: ${successCount} success, ${errorCount} errors`);
  console.log(`Total unique headlines: ${uniqueHeadlines.length}`);
  console.log(`${'='.repeat(60)}`);

  // Persist to disk first so a failed save never wastes the scrape.
  // Skip when running a --only subset, so we don't clobber the full cache.
  if (!onlyList) {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(uniqueHeadlines, null, 2));
    console.log(`Cached results to ${OUTPUT_FILE}`);
  }

  await saveHeadlines(uniqueHeadlines);
  console.log('(If save was skipped due to a missing column, add it then run: node scraper.js --save-only)');
  console.log('\nDone!');
  process.exit(0);
})();
