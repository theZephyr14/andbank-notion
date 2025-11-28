import 'dotenv/config';
import { Client } from '@notionhq/client';

async function findDatabase() {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.error('❌ NOTION_TOKEN not found in environment');
    process.exit(1);
  }

  const notion = new Client({ auth: token });

  try {
    console.log('🔍 Searching for databases in your workspace...\n');
    
    // Search for databases
    const response = await notion.search({
      filter: {
        property: 'object',
        value: 'database'
      }
    });

    if (response.results.length === 0) {
      console.log('❌ No databases found in your workspace.');
      console.log('\n📝 To create a database:');
      console.log('   1. Go to your Notion page');
      console.log('   2. Type "/table" and select "Table - Inline"');
      console.log('   3. Add these columns:');
      console.log('      - Financing Institution (Text)');
      console.log('      - Entity (Text)');
      console.log('      - Credit Line Amount (Number)');
      console.log('      - Available Credit (Number)');
      console.log('      - Interest Rate (Number)');
      console.log('      - Last Sync (Date)');
      console.log('   4. Share the database with your integration');
      console.log('   5. Copy the database ID from the URL');
      return;
    }

    console.log(`✅ Found ${response.results.length} database(s):\n`);
    
    for (const db of response.results) {
      if (db.object === 'database') {
        const databaseAny = db as any;
        const title = databaseAny.title?.[0]?.plain_text || 'Untitled';
        const id = databaseAny.id;
        console.log(`📊 ${title}`);
        console.log(`   ID: ${id}`);
        console.log(`   URL: https://www.notion.so/${id.replace(/-/g, '')}`);
        console.log('');
      }
    }

    console.log('\n💡 Configuration options:');
    console.log('\n   Single database:');
    console.log('   NOTION_DATABASE_ID=your-database-id');
    console.log('\n   Multiple databases (comma-separated):');
    console.log('   NOTION_DATABASE_MAPPING="Andbank:db-id-1,Caixa:db-id-2"');
    console.log('\n   Multiple databases (JSON):');
    console.log('   NOTION_DATABASE_MAPPING={"Andbank":"db-id-1","Caixa":"db-id-2"}');
    
  } catch (error: any) {
    console.error('❌ Error searching for databases:', error.message);
    if (error.code === 'unauthorized') {
      console.error('\n💡 Make sure your NOTION_TOKEN is valid and has access to your workspace');
    }
  }
}

findDatabase().catch(console.error);

