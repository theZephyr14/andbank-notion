import type { LoanRecord } from '../types/loan.js';

// Mock data matching the table structure from your image
export const mockLoanData: LoanRecord[] = [
  {
    financingInstitution: 'Andbank',
    entity: 'Aribau Ventures SL',
    creditLineAmount: 1200000.00,
    availableCredit: 800000.00,
    interestRate: 2.5
  },
  {
    financingInstitution: 'Andbank',
    entity: 'Oikos Builders SL',
    creditLineAmount: 850000.00,
    availableCredit: 600000.00,
    interestRate: 3.2
  },
  {
    financingInstitution: 'Andbank',
    entity: 'Esteban Almirall',
    creditLineAmount: 500000.00,
    availableCredit: 350000.00,
    interestRate: 3.0
  },
  {
    financingInstitution: 'Andbank',
    entity: '', // Empty entity as shown in image
    creditLineAmount: 650000.00,
    availableCredit: 450000.00,
    interestRate: 2.8
  }
];

// Function to simulate data changes (for testing)
export function getMockDataWithVariations(): LoanRecord[] {
  const base = [...mockLoanData];
  // Randomly vary available credit and interest rates slightly
  return base.map(loan => ({
    ...loan,
    availableCredit: loan.availableCredit + (Math.random() * 10000 - 5000),
    interestRate: Number((loan.interestRate + (Math.random() * 0.2 - 0.1)).toFixed(2))
  }));
}

