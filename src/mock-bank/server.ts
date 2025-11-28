import express from 'express';
import { mockLoanData, getMockDataWithVariations } from './data.js';
import type { BankDataResponse } from '../types/loan.js';

const app = express();
const PORT = process.env.MOCK_BANK_PORT || 3000;
const USE_VARIATIONS = process.env.MOCK_BANK_VARIATIONS === 'true';

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mock-bank' });
});

// Main endpoint that mimics bank data export
app.get('/api/loans', (req, res) => {
  const loans = USE_VARIATIONS ? getMockDataWithVariations() : mockLoanData;
  
  const response: BankDataResponse = {
    loans,
    lastUpdated: new Date().toISOString()
  };
  
  res.json(response);
});

// CSV export endpoint (mimics SFTP file)
app.get('/api/loans.csv', (req, res) => {
  const loans = USE_VARIATIONS ? getMockDataWithVariations() : mockLoanData;
  
  const headers = 'Financing Institution,Entity,Credit Line Amount,Available Credit,Interest Rate\n';
  const rows = loans.map(loan => 
    `"${loan.financingInstitution}","${loan.entity}",${loan.creditLineAmount},${loan.availableCredit},${loan.interestRate}`
  ).join('\n');
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="loans.csv"');
  res.send(headers + rows);
});

app.listen(PORT, () => {
  console.log(`🚀 Mock Bank Service running on port ${PORT}`);
  console.log(`   GET /api/loans - JSON endpoint`);
  console.log(`   GET /api/loans.csv - CSV export`);
  console.log(`   GET /health - Health check`);
});

