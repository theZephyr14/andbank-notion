import { parse } from 'csv-parse/sync';
import type { LoanRecord } from '../types/loan.js';

interface CsvLoanRow {
  'Financing Institution': string;
  'Entity': string;
  'Credit Line Amount': string;
  'Available Credit': string;
  'Interest Rate': string;
}

export function parseLoanCsv(csvText: string): LoanRecord[] {
  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as CsvLoanRow[];

  return rows.map((row) => ({
    financingInstitution: row['Financing Institution'] || '',
    entity: row['Entity'] || '',
    creditLineAmount: Number(row['Credit Line Amount']) || 0,
    availableCredit: Number(row['Available Credit']) || 0,
    interestRate: Number(row['Interest Rate']) || 0
  }));
}

