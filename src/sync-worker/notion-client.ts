import { Client } from '@notionhq/client';
import type { LoanRecord } from '../types/loan.js';

export class NotionSyncClient {
  private notion: Client;
  private databaseId: string;
  private titlePropertyName: string | null = null; // Cache the title property name

  constructor(token: string, databaseId: string) {
    this.notion = new Client({ auth: token });
    this.databaseId = databaseId;
  }

  /**
   * Detect the title property name in the database
   */
  private async getTitlePropertyName(): Promise<string> {
    if (this.titlePropertyName) {
      return this.titlePropertyName;
    }

    try {
      const database = await this.notion.databases.retrieve({
        database_id: this.databaseId
      });
      const databaseAny = database as any;
      const properties = Object.entries(databaseAny.properties || {}) as [string, any][];

      // Find the title property (it's the one with type 'title')
      for (const [key, prop] of properties) {
        if (prop.type === 'title') {
          this.titlePropertyName = key;
          return key;
        }
      }

      // Fallback to 'Financing Institution' if not found
      this.titlePropertyName = 'Financing Institution';
      return this.titlePropertyName;
    } catch (error) {
      console.warn('Could not detect title property, using default');
      this.titlePropertyName = 'Financing Institution';
      return this.titlePropertyName;
    }
  }

  /**
   * Convert loan record to Notion page properties
   */
  private async loanToProperties(loan: LoanRecord): Promise<Record<string, any>> {
    const titleProp = await this.getTitlePropertyName();
    
    return {
      [titleProp]: {
        title: [{ text: { content: loan.financingInstitution } }]
      },
      'Entity': {
        rich_text: [{ text: { content: loan.entity || '(Empty)' } }]
      },
      'Credit Line Amount': {
        number: loan.creditLineAmount
      },
      'Available Credit': {
        number: loan.availableCredit
      },
      'Interest Rate': {
        number: loan.interestRate
      },
      'Last Sync': {
        date: { start: new Date().toISOString() }
      }
    };
  }

  /**
   * Extract current values from Notion page
   */
  private async getCurrentPageValues(pageId: string): Promise<Partial<LoanRecord> | null> {
    try {
      const page = (await this.notion.pages.retrieve({ page_id: pageId })) as any;
      const props = (page.properties || {}) as Record<string, any>;

      // Find the title property dynamically
      let titlePropName = 'Financing Institution';
      const propEntries = Object.entries(props) as [string, any][];
      for (const [key, prop] of propEntries) {
        if (prop.type === 'title') {
          titlePropName = key;
          break;
        }
      }

      return {
        financingInstitution: props[titlePropName]?.type === 'title' 
          ? props[titlePropName].title[0]?.plain_text || '' 
          : '',
        entity: props['Entity']?.type === 'rich_text'
          ? props['Entity'].rich_text[0]?.plain_text || ''
          : '',
        creditLineAmount: props['Credit Line Amount']?.type === 'number'
          ? props['Credit Line Amount'].number || 0
          : 0,
        availableCredit: props['Available Credit']?.type === 'number'
          ? props['Available Credit'].number || 0
          : 0,
        interestRate: props['Interest Rate']?.type === 'number'
          ? props['Interest Rate'].number || 0
          : 0
      };
    } catch (error) {
      console.error('Error fetching current page values:', error);
      return null;
    }
  }

  /**
   * Compare two numbers with tolerance for floating point precision
   */
  private numbersEqual(a: number | null | undefined, b: number | null | undefined, tolerance = 0.01): boolean {
    if (a === null || a === undefined || b === null || b === undefined) return a === b;
    return Math.abs(a - b) < tolerance;
  }

  /**
   * Compare two strings (handling empty/null cases)
   */
  private stringsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
    const normalize = (s: string | null | undefined) => (s || '').trim() || '(Empty)';
    return normalize(a) === normalize(b);
  }

  /**
   * Find existing page by Entity name
   */
  private async findPageByEntity(entity: string): Promise<string | null> {
    try {
      const response = await this.notion.databases.query({
        database_id: this.databaseId,
        filter: {
          property: 'Entity',
          rich_text: {
            equals: entity || '(Empty)'
          }
        }
      });

      return response.results.length > 0 ? response.results[0].id : null;
    } catch (error) {
      console.error(`Error finding page for entity "${entity}":`, error);
      return null;
    }
  }

  /**
   * Create or update a loan record in Notion (only updates changed fields)
   */
  async upsertLoan(loan: LoanRecord): Promise<void> {
    const existingPageId = await this.findPageByEntity(loan.entity);
    const allProperties = await this.loanToProperties(loan);
    const changedFields: string[] = [];

    try {
      if (existingPageId) {
        // Get current values from Notion
        const current = await this.getCurrentPageValues(existingPageId);
        
        if (current) {
          // Build properties object with only changed fields
          const updateProperties: Record<string, any> = {
            'Last Sync': allProperties['Last Sync'] // Always update timestamp
          };

          // Compare each field and only include if changed
          const titleProp = await this.getTitlePropertyName();
          if (!this.stringsEqual(current.financingInstitution, loan.financingInstitution)) {
            updateProperties[titleProp] = allProperties[titleProp];
            changedFields.push(titleProp);
          }

          if (!this.stringsEqual(current.entity, loan.entity)) {
            updateProperties['Entity'] = allProperties['Entity'];
            changedFields.push('Entity');
          }

          if (!this.numbersEqual(current.creditLineAmount, loan.creditLineAmount)) {
            updateProperties['Credit Line Amount'] = allProperties['Credit Line Amount'];
            changedFields.push('Credit Line Amount');
          }

          if (!this.numbersEqual(current.availableCredit, loan.availableCredit)) {
            updateProperties['Available Credit'] = allProperties['Available Credit'];
            changedFields.push('Available Credit');
          }

          if (!this.numbersEqual(current.interestRate, loan.interestRate)) {
            updateProperties['Interest Rate'] = allProperties['Interest Rate'];
            changedFields.push('Interest Rate');
          }

          // Only update if something changed (besides Last Sync)
          if (changedFields.length > 0) {
            await this.notion.pages.update({
              page_id: existingPageId,
              properties: updateProperties
            });
            console.log(`  ✓ Updated ${loan.entity || '(Empty)'}: ${changedFields.join(', ')}`);
          } else {
            // Still update Last Sync even if nothing else changed
            await this.notion.pages.update({
              page_id: existingPageId,
              properties: updateProperties
            });
            console.log(`  ⊙ No changes for ${loan.entity || '(Empty)'} (updated Last Sync)`);
          }
        } else {
          // Fallback: if we can't read current values, update everything
          await this.notion.pages.update({
            page_id: existingPageId,
            properties: allProperties
          });
          console.log(`  ✓ Updated: ${loan.entity || '(Empty)'} (full update)`);
        }
      } else {
        // Create new page with all properties
        await this.notion.pages.create({
          parent: { database_id: this.databaseId },
          properties: allProperties
        });
        console.log(`  ✓ Created: ${loan.entity || '(Empty)'}`);
      }
    } catch (error) {
      console.error(`  ✗ Failed to sync ${loan.entity}:`, error);
      throw error;
    }
  }

  /**
   * Sync all loans to Notion database
   */
  async syncAllLoans(loans: LoanRecord[]): Promise<void> {
    console.log(`\n🔄 Syncing ${loans.length} loans to Notion...`);
    
    for (const loan of loans) {
      await this.upsertLoan(loan);
      // Small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\n✅ Successfully synced ${loans.length} loans to Notion!\n`);
  }

  /**
   * Verify database connection and schema
   */
  async verifyConnection(): Promise<boolean> {
    try {
      const database = await this.notion.databases.retrieve({
        database_id: this.databaseId
      });
      const databaseAny = database as any;
      console.log(`✅ Connected to Notion database: "${databaseAny.title?.[0]?.plain_text || 'Unknown'}"`);
      return true;
    } catch (error) {
      console.error('❌ Failed to connect to Notion database:', error);
      return false;
    }
  }
}

