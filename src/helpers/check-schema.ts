import 'dotenv/config';
import { Client } from '@notionhq/client';

async function checkSchema() {
  const token = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!token || !databaseId) {
    console.error('❌ Missing NOTION_TOKEN or NOTION_DATABASE_ID');
    process.exit(1);
  }

  const notion = new Client({ auth: token });

  try {
    const database = await notion.databases.retrieve({
      database_id: databaseId
    });
    const databaseAny = database as any;

    console.log('📊 Database Schema:\n');
    console.log(`Title: ${databaseAny.title?.[0]?.plain_text || 'Untitled'}\n`);
    console.log('Properties:');
    
    for (const [key, prop] of Object.entries(databaseAny.properties || {})) {
      const type = prop.type;
      console.log(`  - ${key}: ${type}`);
      if (type === 'title' || type === 'rich_text') {
        console.log(`    (This is a ${type} property)`);
      }
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

checkSchema().catch(console.error);

