require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
  console.log('Connecting to Supabase...');
  console.log('URL:', supabaseUrl);
  console.log('');

  try {
    // Query the information_schema to get all tables in the public schema
    const { data, error } = await supabase
      .from('information_schema.tables')
      .select('table_name, table_type')
      .eq('table_schema', 'public');

    if (error) {
      // If direct query fails, try using RPC or a different approach
      console.log('Direct query failed, trying alternative method...');
      
      // Try to list tables using pg_catalog
      const { data: tables, error: rpcError } = await supabase.rpc('get_tables');
      
      if (rpcError) {
        console.log('Note: Cannot query system tables directly with anon key.');
        console.log('Trying to access known tables...');
        
        // Try some common table names to see what exists
        const commonTables = ['users', 'profiles', 'posts', 'articles', 'headlines', 'news', 'scraped_data'];
        
        console.log('\nChecking for common tables:');
        for (const tableName of commonTables) {
          const { data, error } = await supabase.from(tableName).select('*').limit(1);
          if (!error) {
            console.log(`  ✓ Table "${tableName}" exists`);
          } else if (error.code === 'PGRST116') {
            console.log(`  ✗ Table "${tableName}" not found`);
          } else {
            console.log(`  ? Table "${tableName}": ${error.message}`);
          }
        }
        
        console.log('\n---');
        console.log('To see all tables, you can:');
        console.log('1. Go to your Supabase dashboard > Table Editor');
        console.log('2. Or create an RPC function to list tables');
        return;
      }
      
      console.log('Tables in database:', tables);
      return;
    }

    console.log('Tables in public schema:');
    if (data && data.length > 0) {
      data.forEach(table => {
        console.log(`  - ${table.table_name} (${table.table_type})`);
      });
    } else {
      console.log('  No tables found in public schema');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkTables();
