// One-off cleanup: remove decommissioned sources.
// Client feedback items #9 (MSC Manitoba), #10 (DTCC Learning Center).
// (Item #7 — FCA warnings — needs no row deletion: the scraper excludes
//  /warnings and the stray "Show all warnings" was already removed. We do NOT
//  blanket-delete "warning" titles, as that would remove legitimate OSC/CBI
//  investor-alert articles.)
// Usage: node cleanup-sources.js            (dry run)
//        node cleanup-sources.js --delete    (apply)
require('dotenv').config({ quiet: true });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY);

const DROP_SOURCES = ['MSC Manitoba - Derivatives', 'DTCC - Learning Center'];

(async () => {
  const doDelete = process.argv.includes('--delete');
  const { data, error } = await s.from('headlines').select('id,source,title');
  if (error) { console.log('Fetch error:', error.message); process.exit(1); }

  const bySource = data.filter(r => DROP_SOURCES.includes(r.source));

  console.log('=== Decommissioned sources ===');
  DROP_SOURCES.forEach(src => console.log('   ' + src + ': ' + data.filter(r => r.source === src).length + ' rows'));

  const ids = [...new Set(bySource.map(r => r.id))];
  console.log('\nTotal to delete: ' + ids.length + ' (of ' + data.length + ' rows)');

  if (!doDelete) { console.log('\nDRY RUN — re-run with --delete to apply.'); process.exit(0); }

  let deleted = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const { error: delErr, count } = await s.from('headlines').delete({ count: 'exact' }).in('id', batch);
    if (delErr) console.log('  delete error:', delErr.message);
    else deleted += (count ?? batch.length);
  }
  console.log('\n✓ Deleted ' + deleted + ' rows.');
  const { count: remaining } = await s.from('headlines').select('*', { count: 'exact', head: true });
  console.log('Remaining rows:', remaining);
  process.exit(0);
})();
