import type { BankDataResponse, LoanRecord } from '../types/loan.js';
import SFTPClient from 'ssh2-sftp-client';
import { parseLoanCsv } from '../utils/csv.js';
import { Readable } from 'stream';
import { ensureMockSftpServer } from '../mock-sftp/server.js';

export interface DataFetcher {
  fetch(): Promise<LoanRecord[]>;
}

// Mock bank fetcher (current implementation)
export class MockBankFetcher implements DataFetcher {
  private baseUrl: string;

  constructor(baseUrl: string = process.env.MOCK_BANK_URL || 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async fetch(): Promise<LoanRecord[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/loans`);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
      }
      const data = (await response.json()) as BankDataResponse;
      console.log(`✅ Fetched ${data.loans.length} loans (last updated: ${data.lastUpdated})`);
      return data.loans;
    } catch (error) {
      console.error('❌ Error fetching from mock bank:', error);
      throw error;
    }
  }
}

interface SftpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  remotePath: string;
  autoStartMockServer: boolean;
}

export class SftpBankFetcher implements DataFetcher {
  private config: SftpConfig;

  constructor(config?: Partial<SftpConfig>) {
    this.config = {
      host: process.env.SFTP_HOST || 'localhost',
      port: Number(process.env.SFTP_PORT || 2222),
      username: process.env.SFTP_USERNAME || 'andbank',
      password: process.env.SFTP_PASSWORD || 'sftp-test',
      remotePath: process.env.SFTP_REMOTE_PATH || '/loans.csv',
      autoStartMockServer: process.env.AUTO_START_MOCK_SFTP === 'true' || false,
      ...config
    };
  }

  async fetch(): Promise<LoanRecord[]> {
    if (this.config.autoStartMockServer) {
      await ensureMockSftpServer();
    }

    const client = new SFTPClient();
    try {
      await client.connect({
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        password: this.config.password
      });

      const file = await client.get(this.config.remotePath);
      const buffer = await toBuffer(file);
      const csvText = buffer.toString('utf-8');
      const loans = parseLoanCsv(csvText);

      console.log(
        `✅ Downloaded ${loans.length} loans via SFTP (${this.config.username}@${this.config.host}:${this.config.remotePath})`
      );

      return loans;
    } catch (error) {
      console.error('❌ Error fetching from SFTP:', error);
      throw error;
    } finally {
      await client.end().catch(() => {});
    }
  }
}

// HTTP CSV fetcher - fetches CSV from the CSV storage service
export class HttpCsvFetcher implements DataFetcher {
  private csvUrl: string;

  constructor(csvUrl?: string) {
    this.csvUrl = csvUrl || process.env.CSV_STORAGE_URL || 'http://localhost:10001/loans.csv';
  }

  async fetch(): Promise<LoanRecord[]> {
    try {
      const response = await fetch(this.csvUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
      }
      const csvText = await response.text();
      const loans = parseLoanCsv(csvText);
      console.log(`✅ Fetched ${loans.length} loans from CSV storage (${this.csvUrl})`);
      return loans;
    } catch (error) {
      console.error('❌ Error fetching CSV from HTTP:', error);
      throw error;
    }
  }
}

function toBuffer(input: Buffer | string | Readable): Promise<Buffer> {
  if (Buffer.isBuffer(input)) {
    return Promise.resolve(input);
  }
  if (typeof input === 'string') {
    return Promise.resolve(Buffer.from(input));
  }

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    input.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    input.on('end', () => resolve(Buffer.concat(chunks)));
    input.on('error', reject);
  });
}

export function buildFetcher(): DataFetcher {
  const mode = (process.env.DATA_SOURCE || 'mock-http').toLowerCase();

  if (mode === 'sftp' || mode === 'mock-sftp') {
    return new SftpBankFetcher();
  }

  if (mode === 'csv-storage' || mode === 'http-csv') {
    return new HttpCsvFetcher();
  }

  return new MockBankFetcher();
}

