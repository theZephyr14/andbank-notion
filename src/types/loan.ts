export interface LoanRecord {
  financingInstitution: string;
  entity: string;
  creditLineAmount: number;
  availableCredit: number;
  interestRate: number;
}

export interface BankDataResponse {
  loans: LoanRecord[];
  lastUpdated: string;
}

