import SummaryCard from './SummaryCard.jsx';
import MonthlyOverview from './MonthlyOverview.jsx';
import SavingGoals from './SavingGoals.jsx';
import SpendingByCategory from './SpendingByCategory.jsx';
import RecentTransactions from './RecentTransactions.jsx';
import SpendingInsights from './SpendingInsights.jsx';

export default function Dashboard({ data, onEditTransaction, onDeleteTransaction }) {
  return (
    <section className="dashboard" aria-labelledby="dashboard-heading">
      <div className="card-head">
        <h1 id="dashboard-heading">Dashboard</h1>
        <span className="count">Overview</span>
      </div>
      <p className="dashboard-note">Values come from the current transaction list. Demo balance is income minus expenses; savings management is not connected.</p>
      <dl className="dashboard-metrics">
        <SummaryCard label="Available balance" amount={data.balance} isBalance />
        <SummaryCard label="Total recorded income" amount={data.totalIncome} />
        <SummaryCard label="Total expenses" amount={data.totalExpenses} />
      </dl>
      <div className="dashboard-panels">
        <MonthlyOverview monthly={data.monthly} />
        <SavingGoals savings={data.savings} />
        <SpendingByCategory categories={data.categories} totalExpenses={data.totalExpenses} />
        <RecentTransactions transactions={data.recentTransactions} onEditTransaction={onEditTransaction} onDeleteTransaction={onDeleteTransaction} />
      </div>
      <SpendingInsights insight={data.insight} />
    </section>
  );
}
