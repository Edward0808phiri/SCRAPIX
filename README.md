# PROJECT-HORIZON

Regulatory news scraper for financial compliance teams. Scrapes headlines from global financial regulators and stores them in Supabase.

## Regulators Covered (45+ Sources)

| Region | Regulators |
|--------|------------|
| UK | FCA, PRA, Bank of England, UK T+1 Taskforce |
| EU | ESMA, AFME |
| Switzerland | FINMA |
| Ireland | Central Bank of Ireland |
| US | SEC, CFTC, FINRA, DTCC, CAT NMS |
| Canada | AMF, CSA, OSC, MSC |
| Asia Pacific | ASIC (AU), HKMA, SFC (HK), MAS (SG), FSC/FSS (KR), JFSA (JP), CSRC (CN) |
| Israel | Bank of Israel |
| Global | ISDA |

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file with your Supabase credentials:
```
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_supabase_key
```

3. Run `supabase-setup.sql` in your Supabase SQL Editor to create the tables.

## Usage

Run the scraper:
```bash
node scraper.js
```

## Tech Stack
- Node.js
- Puppeteer (web scraping)
- Supabase (database)
