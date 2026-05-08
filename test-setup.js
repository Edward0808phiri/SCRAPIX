require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSetup() {
  console.log('Testing Supabase setup...\n');

  // Test 1: Check if headlines table exists
  console.log('1. Checking headlines table...');
  const { data, error } = await supabase
    .from('headlines')
    .select('*')
    .limit(1);

  if (error) {
    console.log('   ✗ Table not found or not accessible');
    console.log('   Error:', error.message);
    console.log('\n   → Run supabase-setup.sql in your Supabase Dashboard');
    return;
  }
  console.log('   ✓ Headlines table exists');

  // Test 2: Try inserting a test headline
  console.log('\n2. Testing insert...');
  const testHeadline = {
    source: 'TEST',
    title: 'Test headline - please delete',
    link: `https://test.com/test-${Date.now()}`
  };

  const { error: insertError } = await supabase
    .from('headlines')
    .insert(testHeadline);

  if (insertError) {
    console.log('   ✗ Insert failed:', insertError.message);
  } else {
    console.log('   ✓ Insert works');
  }

  // Test 3: Read back
  console.log('\n3. Testing read...');
  const { data: headlines, error: readError } = await supabase
    .from('headlines')
    .select('*')
    .order('scraped_at', { ascending: false })
    .limit(5);

  if (readError) {
    console.log('   ✗ Read failed:', readError.message);
  } else {
    console.log('   ✓ Read works');
    console.log(`   Found ${headlines.length} headline(s)`);
  }

  // Cleanup test data
  console.log('\n4. Cleaning up test data...');
  await supabase
    .from('headlines')
    .delete()
    .eq('source', 'TEST');
  console.log('   ✓ Cleaned up');

  console.log('\n✅ Setup complete! Ready to scrape.');
}

testSetup();
