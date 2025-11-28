import 'dotenv/config';
import { buildFetcher } from './fetcher.js';
import { NotionSyncClient } from './notion-client.js';
import type { LoanRecord } from '../types/loan.js';

/**
 * Parse database mapping from environment variable
 * Format: "Bank1:db-id-1,Bank2:db-id-2" or single "db-id" for backward compatibility
 */
function parseDatabaseMapping(): Map<string, string> {
  const mapping = new Map<string, string>();
  const notionToken = process.env.NOTION_TOKEN;
  
  // Check for single database ID (backward compatibility)
  const singleDbId = process.env.NOTION_DATABASE_ID;
  if (singleDbId) {
    // If single DB, we'll use it as default for all banks
    mapping.set('*', singleDbId);
  }

  // Check for multi-database mapping
  // Format: "Andbank:db-id-1,Caixa:db-id-2" or JSON: {"Andbank":"db-id-1","Caixa":"db-id-2"}
  const dbMapping = process.env.NOTION_DATABASE_MAPPING;
  if (dbMapping) {
    try {
      // Try JSON first
      const jsonMapping = JSON.parse(dbMapping);
      Object.entries(jsonMapping).forEach(([bank, dbId]) => {
        mapping.set(bank.toLowerCase(), dbId as string);
      });
    } catch {
      // Fall back to comma-separated format: "Bank1:db-id-1,Bank2:db-id-2"
      dbMapping.split(',').forEach(entry => {
        const [bank, dbId] = entry.split(':').map(s => s.trim());
        if (bank && dbId) {
          mapping.set(bank.toLowerCase(), dbId);
        }
      });
    }
  }

  return mapping;
}

/**
 * Group loans by bank (Financing Institution)
 */
function groupLoansByBank(loans: LoanRecord[]): Map<string, LoanRecord[]> {
  const grouped = new Map<string, LoanRecord[]>();
  
  for (const loan of loans) {
    const bank = loan.financingInstitution.toLowerCase();
    if (!grouped.has(bank)) {
      grouped.set(bank, []);
    }
    grouped.get(bank)!.push(loan);
  }
  
  return grouped;
}

async function main() {
  console.log('🚀 Starting Notion Sync Worker...\n');

  // Validate environment variables
  const notionToken = process.env.NOTION_TOKEN;
  if (!notionToken) {
    console.error('❌ Missing required environment variable: NOTION_TOKEN');
    process.exit(1);
  }

  // Parse database mapping
  const dbMapping = parseDatabaseMapping();
  if (dbMapping.size === 0) {
    console.error('❌ Missing database configuration:');
    console.error('   Set NOTION_DATABASE_ID (single database) or');
    console.error('   Set NOTION_DATABASE_MAPPING (multiple databases)');
    console.error('   Format: "Andbank:db-id-1,Caixa:db-id-2" or JSON: {"Andbank":"db-id-1"}');
    process.exit(1);
  }

  // Initialize fetcher
  const fetcher = buildFetcher();

  try {
    // Fetch loan data
    const loans = await fetcher.fetch();

    if (loans.length === 0) {
      console.warn('⚠️  No loans found to sync');
      return;
    }

    // Group loans by bank
    const loansByBank = groupLoansByBank(loans);
    console.log(`📊 Found ${loansByBank.size} bank(s) with ${loans.length} total loans\n`);

    // Sync each bank to its corresponding database
    let totalSynced = 0;
    for (const [bank, bankLoans] of loansByBank) {
      // Find database ID for this bank
      let databaseId = dbMapping.get(bank);
      
      // If no specific mapping, use default (*) or skip
      if (!databaseId) {
        databaseId = dbMapping.get('*');
        if (!databaseId) {
          console.warn(`⚠️  No database mapping found for bank "${bank}", skipping ${bankLoans.length} loans`);
          continue;
        }
        console.log(`📌 Using default database for "${bank}"`);
      }

      console.log(`\n🏦 Syncing ${bankLoans.length} loans for "${bank}" to database ${databaseId.substring(0, 8)}...`);
      
      // Create client for this database
      const notionClient = new NotionSyncClient(notionToken, databaseId);
      
      // Verify connection
      const connected = await notionClient.verifyConnection();
      if (!connected) {
        console.error(`❌ Failed to connect to database for "${bank}", skipping`);
        continue;
      }

      // Sync loans
      await notionClient.syncAllLoans(bankLoans);
      totalSynced += bankLoans.length;
    }

    console.log(`\n✨ Sync completed! Synced ${totalSynced} loans across ${loansByBank.size} bank(s)`);
  } catch (error) {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  }
}

// Run when executed directly (not when imported)
const isMainModule = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || 
                     process.argv[1]?.includes('index.ts') ||
                     process.argv[1]?.includes('sync-worker');

if (isMainModule || !process.env.NODE_ENV) {
  main().catch(console.error);
}

export { main };

