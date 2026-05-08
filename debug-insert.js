require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function debugInsert() {
  const testHeadline = {
    source: 'TEST',
    title: 'Debug test headline',
    link: `https://test.com/debug-${Date.now()}`
  };

  console.log('Attempting insert with:', testHeadline);
  
  const { data, error } = await supabase
    .from('headlines')
    .insert(testHeadline)
    .select();

  if (error) {
    console.log('Error:', error);
  } else {
    console.log('Success:', data);
  }

  // Check what's in the table
  const { data: all, error: readErr } = await supabase
    .from('headlines')
    .select('*');
  
  console.log('\nAll headlines in table:', all?.length || 0);
  if (readErr) console.log('Read error:', readErr);
}

debugInsert();
