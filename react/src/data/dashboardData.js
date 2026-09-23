// Temporary display fixtures, not a financial engine or saved application state.
// The sample covers September 2026. All five transactions are listed here.
export const sampleDashboard = {
  balance: 3420000,
  totalIncome: 5000000,
  totalExpenses: 1080000,
  monthly: { label: 'September 2026', income: 5000000, expenses: 1080000 },
  savings: { saved: 500000, target: 2000000, count: 2 },
  categories: [
    { name: 'Food', amount: 600000 },
    { name: 'Shopping', amount: 300000 },
    { name: 'Transport', amount: 180000 },
  ],
  recentTransactions: [
    { id: 5, name: 'Groceries', type: 'expense', category: 'Food', date: '2026-09-23', amount: 600000 },
    { id: 4, name: 'Freelance work', type: 'income', category: 'Freelance', date: '2026-09-22', amount: 1000000 },
    { id: 3, name: 'Study supplies', type: 'expense', category: 'Shopping', date: '2026-09-20', amount: 300000 },
    { id: 2, name: 'Monthly transport pass', type: 'expense', category: 'Transport', date: '2026-09-02', amount: 180000 },
    { id: 1, name: 'Part-time work', type: 'income', category: 'Part-time', date: '2026-09-01', amount: 4000000 },
  ],
  insight: 'Food is the largest spending category (Rp 600.000). Groceries is the highest expense (Rp 600.000). September income exceeds expenses by Rp 3.920.000 before savings transfers.',
};

export const emptyDashboard = {
  balance: 0,
  totalIncome: 0,
  totalExpenses: 0,
  monthly: { label: 'September 2026', income: 0, expenses: 0 },
  savings: { saved: 0, target: 0, count: 0 },
  categories: [],
  recentTransactions: [],
  insight: '',
};
