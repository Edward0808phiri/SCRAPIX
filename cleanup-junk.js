// One-off cleanup: remove stale junk rows from the headlines table.
// Usage:
//   node cleanup-junk.js          (dry run — shows what would be deleted)
//   node cleanup-junk.js --delete (actually deletes)
require('dotenv').config({ quiet: true });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY);

const JUNK = /^(\d+|last|next|previous|prev|first|back|more|home|menu|search|subscribe|next\s*page.*|last\s*page.*|previous\s*page.*|first\s*page.*|page\s+\d+.*|go to .*|skip to .*|reverse chronological|.*current page.*|.*current sub-section.*|see all .*|view all.*|search all .*|connect with us|read more|show all.*)$/i;
const OLD_SOURCES = ['TEST', 'FCA', 'Bank of England'];

(async () => {
  const doDelete = process.argv.includes('--delete');
  const { data, error } = await s.from('headlines').select('id,source,title');
  if (error) { console.log('Fetch error:', error.message); process.exit(1); }

  const junk = data.filter(r => JUNK.test((r.title || '').trim()));
  const old = data.filter(r => OLD_SOURCES.includes(r.source));

  console.log(`=== Pagination/nav junk: ${junk.length} ===`);
  junk.forEach(r => console.log('   [' + r.source + '] ' + (r.title || '').slice(0, 55)));

  console.log('\n=== Old/TEST sources ===');
  OLD_SOURCES.forEach(src => {
    const n = data.filter(r => r.source === src);
    console.log('   ' + src + ': ' + n.length + ' rows');
    n.slice(0, 3).forEach(r => console.log('       - ' + (r.title || '').slice(0, 55)));
  });

  // Union of ids to delete
  const ids = [...new Set([...junk, ...old].map(r => r.id))];
  console.log(`\nTotal to delete: ${ids.length} (of ${data.length} rows)`);

  if (!doDelete) {
    console.log('\nDRY RUN — nothing deleted. Re-run with --delete to apply.');
    process.exit(0);
  }

  let deleted = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const { error: delErr, count } = await s.from('headlines').delete({ count: 'exact' }).in('id', batch);
    if (delErr) { console.log('  delete error:', delErr.message); }
    else deleted += (count ?? batch.length);
  }
  console.log(`\n✓ Deleted ${deleted} rows.`);

  const { count: remaining } = await s.from('headlines').select('*', { count: 'exact', head: true });
  console.log('Remaining rows in table:', remaining);
  process.exit(0);
})();
