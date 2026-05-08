require('dotenv').config();
const puppeteer = require('puppeteer-core');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// REGULATORY SOURCES CONFIGURATION
// ============================================================================

const REGULATORS = [
  // -------------------------------------------------------------------------
  // UNITED KINGDOM
  // -------------------------------------------------------------------------
  {
    name: 'FCA - News',
    region: 'UK',
    url: 'https://www.fca.org.uk/news',
    linkFilter: '/news',
  },
  {
    name: 'FCA - Policy & Guidance',
    region: 'UK',
    url: 'https://www.fca.org.uk/publications/search-results?p_search_term=&category=policy%20and%20guidance',
    linkFilter: '/publications',
  },
  {
    name: 'FCA - SFTR News',
    region: 'UK',
    url: 'https://www.fca.org.uk/markets/sftr/news',
    linkFilter: '/sftr',
  },
  {
    name: 'FCA - UK EMIR News',
    region: 'UK',
    url: 'https://www.fca.org.uk/firms/uk-emir/news',
    linkFilter: '/emir',
  },
  {
    name: 'FCA - MiFIR Transaction Reporting',
    region: 'UK',
    url: 'https://www.fca.org.uk/markets/transaction-reporting',
    linkFilter: '/transaction-reporting',
  },
  {
    name: 'PRA',
    region: 'UK',
    url: 'https://www.bankofengland.co.uk/prudential-regulation/news',
    linkFilter: '/news',
    cookieSelector: '#onetrust-accept-btn-handler',
  },
  {
    name: 'Bank of England - Financial Stability',
    region: 'UK',
    url: 'https://www.bankofengland.co.uk/news/latest-and-upcoming',
    linkFilter: '/news',
    cookieSelector: '#onetrust-accept-btn-handler',
  },
  {
    name: 'UK T+1 Taskforce',
    region: 'UK',
    url: 'https://acceleratedsettlement.co.uk/news/',
    linkFilter: '/news',
  },

  // -------------------------------------------------------------------------
  // EUROPE
  // -------------------------------------------------------------------------
  {
    name: 'ESMA - News',
    region: 'EU',
    url: 'https://www.esma.europa.eu/press-news/esma-news',
    linkFilter: '/esma-news',
  },
  {
    name: 'ESMA - Library',
    region: 'EU',
    url: 'https://www.esma.europa.eu/databases-library/esma-library/',
    linkFilter: '/library',
  },
  {
    name: 'ESMA - Consultations',
    region: 'EU',
    url: 'https://www.esma.europa.eu/press-news/consultations',
    linkFilter: '/consultations',
  },
  {
    name: 'AFME - Press Releases',
    region: 'EU',
    url: 'https://www.afme.eu/news/press-releases',
    linkFilter: '/press-releases',
  },

  // -------------------------------------------------------------------------
  // SWITZERLAND
  // -------------------------------------------------------------------------
  {
    name: 'FINMA - News',
    region: 'CH',
    url: 'https://www.finma.ch/en/news/',
    linkFilter: '/news',
  },
  {
    name: 'FINMA - Guidance',
    region: 'CH',
    url: 'https://www.finma.ch/en/documentation/finma-guidance/',
    linkFilter: '/guidance',
  },

  // -------------------------------------------------------------------------
  // IRELAND
  // -------------------------------------------------------------------------
  {
    name: 'Central Bank of Ireland - News',
    region: 'IE',
    url: 'https://www.centralbank.ie/news-media',
    linkFilter: '/news',
  },
  {
    name: 'Central Bank of Ireland - Schedule',
    region: 'IE',
    url: 'https://www.centralbank.ie/news-media/schedule',
    linkFilter: '/schedule',
  },

  // -------------------------------------------------------------------------
  // UNITED STATES
  // -------------------------------------------------------------------------
  {
    name: 'SEC - News',
    region: 'US',
    url: 'https://www.sec.gov/news',
    linkFilter: '/news',
  },
  {
    name: 'SEC - Rulemaking',
    region: 'US',
    url: 'https://www.sec.gov/rules-regulations/rulemaking-index',
    linkFilter: '/rules',
  },
  {
    name: 'SEC - Regulatory Agenda',
    region: 'US',
    url: 'https://www.reginfo.gov/public/do/eAgendaMain',
    linkFilter: '/eAgenda',
  },
  {
    name: 'CFTC - Press Releases',
    region: 'US',
    url: 'https://www.cftc.gov/PressRoom/PressReleases',
    linkFilter: '/PressReleases',
  },
  {
    name: 'CFTC - No Action Letters',
    region: 'US',
    url: 'https://www.cftc.gov/LawRegulation/CFTCStaffLetters/letters.htm',
    linkFilter: '/letters',
  },
  {
    name: 'FINRA - News Releases',
    region: 'US',
    url: 'https://www.finra.org/media-center/newsreleases',
    linkFilter: '/newsreleases',
  },
  {
    name: 'FINRA - TRACE Updates',
    region: 'US',
    url: 'https://www.finra.org/filing-reporting/market-transparency-reporting/trace/recent-updates',
    linkFilter: '/trace',
  },
  {
    name: 'FINRA - CAT Announcements',
    region: 'US',
    url: 'https://www.catnmsplan.com/announcements',
    linkFilter: '/announcements',
  },
  {
    name: 'FINRA - CAT Specifications',
    region: 'US',
    url: 'https://www.catnmsplan.com/specifications/im',
    linkFilter: '/specifications',
  },
  {
    name: 'DTCC - US Treasury Clearing',
    region: 'US',
    url: 'https://www.dtcc.com/clearing-services/ficc-gov/treasury-clearing',
    linkFilter: '/treasury',
  },
  {
    name: 'DTCC - Learning Center',
    region: 'US',
    url: 'https://dtcclearning.com/',
    linkFilter: null,
  },

  // -------------------------------------------------------------------------
  // CANADA
  // -------------------------------------------------------------------------
  {
    name: 'AMF Canada - News',
    region: 'CA',
    url: 'https://lautorite.qc.ca/en/general-public/media-centre/news',
    linkFilter: '/news',
  },
  {
    name: 'CSA Canada - News',
    region: 'CA',
    url: 'https://www.securities-administrators.ca/news/',
    linkFilter: '/news',
  },
  {
    name: 'OSC Ontario - News',
    region: 'CA',
    url: 'https://www.osc.ca/en/news-events/news',
    linkFilter: '/news',
  },
  {
    name: 'OSC Ontario - Publications',
    region: 'CA',
    url: 'https://www.osc.ca/en/news-events/reports-and-publications',
    linkFilter: '/publications',
  },
  {
    name: 'MSC Manitoba - Derivatives',
    region: 'CA',
    url: 'https://docs.mbsecurities.ca/msc/derivatives/en/0-9/nav_alpha.do',
    linkFilter: '/derivatives',
  },

  // -------------------------------------------------------------------------
  // ASIA PACIFIC
  // -------------------------------------------------------------------------
  {
    name: 'ASIC - Newsroom',
    region: 'AU',
    url: 'https://asic.gov.au/newsroom',
    linkFilter: '/newsroom',
  },
  {
    name: 'ASIC - Derivatives Reporting',
    region: 'AU',
    url: 'https://asic.gov.au/regulatory-resources/markets/otc-derivatives/derivative-transaction-reporting/',
    linkFilter: '/derivatives',
  },
  {
    name: 'HKMA - Press Releases',
    region: 'HK',
    url: 'https://www.hkma.gov.hk/eng/news-and-media/press-releases/',
    linkFilter: '/press-releases',
  },
  {
    name: 'SFC Hong Kong - Circulars',
    region: 'HK',
    url: 'https://apps.sfc.hk/edistributionWeb/gateway/EN/circular/',
    linkFilter: '/circular',
  },
  {
    name: 'MAS Singapore - News',
    region: 'SG',
    url: 'https://www.mas.gov.sg/news',
    linkFilter: '/news',
  },
  {
    name: 'MAS Singapore - Publications',
    region: 'SG',
    url: 'https://www.mas.gov.sg/publications',
    linkFilter: '/publications',
  },
  {
    name: 'FSC Korea - News',
    region: 'KR',
    url: 'https://www.fsc.go.kr/eng/pr010101',
    linkFilter: '/pr',
  },
  {
    name: 'FSS Korea - Press Releases',
    region: 'KR',
    url: 'https://english.fss.or.kr/fss/eng/promo/pressrel/list.jsp',
    linkFilter: '/pressrel',
  },
  {
    name: 'FSS Korea - Rule Changes',
    region: 'KR',
    url: 'https://english.fss.or.kr/fss/eng/promo/rulechange/list.jsp',
    linkFilter: '/rulechange',
  },
  {
    name: 'JFSA Japan - News',
    region: 'JP',
    url: 'https://www.fsa.go.jp/en/news/index.html',
    linkFilter: '/news',
  },
  {
    name: 'CSRC China - Rules',
    region: 'CN',
    url: 'http://www.csrc.gov.cn/csrc_en/c102033/common_list.shtml',
    linkFilter: '/csrc_en',
  },
  {
    name: 'CSRC China - Policy Q&A',
    region: 'CN',
    url: 'http://www.csrc.gov.cn/csrc_en/c102034/common_list.shtml',
    linkFilter: '/csrc_en',
  },

  // -------------------------------------------------------------------------
  // ISRAEL
  // -------------------------------------------------------------------------
  {
    name: 'Bank of Israel - Press Releases',
    region: 'IL',
    url: 'https://www.boi.org.il/en/communication-and-publications/press-releases/',
    linkFilter: '/press-releases',
  },

  // -------------------------------------------------------------------------
  // INDUSTRY / ASSOCIATIONS
  // -------------------------------------------------------------------------
  {
    name: 'ISDA - Data & Reporting',
    region: 'Global',
    url: 'https://www.isda.org/category/infrastructure/data-and-reporting/',
    linkFilter: '/data-and-reporting',
  },
  {
    name: 'ISDA - Compliance Calendar',
    region: 'Global',
    url: 'https://www.isda.org/tag/compliance-calendar/',
    linkFilter: '/compliance-calendar',
  },
];

// ============================================================================
// SCRAPER
// ============================================================================

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log('PROJECT HORIZON - Regulatory News Scraper');
  console.log(`${'='.repeat(60)}`);
  console.log(`Starting scrape of ${REGULATORS.length} sources...\n`);

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });

  let allHeadlines = [];
  let successCount = 0;
  let errorCount = 0;

  for (const reg of REGULATORS) {
    try {
      const page = await browser.newPage();
      
      // Set longer timeout for slow sites
      page.setDefaultTimeout(60000);
      
      console.log(`[${reg.region}] ${reg.name}...`);
      await page.goto(reg.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Accept cookies if selector provided
      if (reg.cookieSelector) {
        try {
          await page.waitForSelector(reg.cookieSelector, { timeout: 5000 });
          await page.click(reg.cookieSelector);
          await sleep(1000);
        } catch {
          // Cookie button not found, continue
        }
      }

      // Wait for content to load
      await sleep(3000);

      // Extract headlines
      const headlines = await page.evaluate((regName, linkFilter) => {
        const links = Array.from(document.querySelectorAll('a'));
        return links
          .map(a => ({
            source: regName,
            title: a.innerText.trim().replace(/\s+/g, ' '),
            link: a.href
          }))
          .filter(item => {
            // Must have meaningful title
            if (item.title.length < 15) return false;
            // Must be a valid URL
            if (!item.link.startsWith('http')) return false;
            // Filter by link pattern if provided
            if (linkFilter && !item.link.includes(linkFilter)) return false;
            // Exclude common navigation links
            const excludePatterns = ['javascript:', 'mailto:', '#', 'login', 'signin', 'signup', 'subscribe'];
            if (excludePatterns.some(p => item.link.toLowerCase().includes(p))) return false;
            return true;
          });
      }, reg.name, reg.linkFilter);

      console.log(`   ✓ Found ${headlines.length} headlines`);
      allHeadlines = allHeadlines.concat(headlines);
      successCount++;

      await page.close();
    } catch (err) {
      console.log(`   ✗ Error: ${err.message}`);
      errorCount++;
    }
  }

  await browser.close();

  // Remove duplicates by link
  const uniqueHeadlines = Array.from(new Map(allHeadlines.map(h => [h.link, h])).values());

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Scraping complete: ${successCount} success, ${errorCount} errors`);
  console.log(`Total unique headlines: ${uniqueHeadlines.length}`);
  console.log(`${'='.repeat(60)}\n`);

  // Save to Supabase
  console.log('Saving to Supabase...');
  
  let inserted = 0;
  let skipped = 0;
  
  for (const headline of uniqueHeadlines) {
    const { error } = await supabase
      .from('headlines')
      .upsert(headline, { onConflict: 'link', ignoreDuplicates: true });
    
    if (error) {
      skipped++;
    } else {
      inserted++;
    }
  }
  
  console.log(`✓ Inserted: ${inserted}, Skipped (duplicates): ${skipped}`);
  console.log('\nDone!');
})();