import { formatMoney } from '../formatMoney.js';

// Derived display values, never a second copy of transaction state.
export function buildDashboardData(transactions) {
  const income = transactions.filter(item => item.type === 'income');
  const expenses = transactions.filter(item => item.type === 'expense');
  const sum = items => items.reduce((total, item) => total + item.amount, 0);
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const categoryTotals = {};
  expenses.forEach(item => {
    categoryTotals[item.category] = (categoryTotals[item.category] || 0) + item.amount;
  });
  const categories = Object.entries(categoryTotals)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
  const totalIncome = sum(income);
  const totalExpenses = sum(expenses);
  return {
    balance: totalIncome - totalExpenses,
    totalIncome,
    totalExpenses,
    monthly: {
      label: now.toLocaleDateString('en', { month: 'long', year: 'numeric' }),
      income: sum(income.filter(item => item.date.startsWith(month))),
      expenses: sum(expenses.filter(item => item.date.startsWith(month))),
    },
    // Goal management is outside this lesson; no fictional savings deduction.
    savings: { saved: 0, target: 0, count: 0 },
    categories,
    recentTransactions: transactions,
    insight: categories.length
      ? `${categories[0].name} is the largest spending category (${formatMoney(categories[0].amount)}).`
      : 'No expenses to describe yet.',
  };
}
