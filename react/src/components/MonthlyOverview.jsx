import { formatMoney } from '../formatMoney.js';

export default function MonthlyOverview({ monthly }) {
  return (
    <section className="card" aria-labelledby="monthly-heading">
      <h2 id="monthly-heading">Monthly overview</h2>
      <p className="dashboard-note">{monthly.label}</p>
      <dl className="summary-grid">
        <div><dt>Money in</dt><dd>{formatMoney(monthly.income)}</dd></div>
        <div><dt>Spent</dt><dd>{formatMoney(monthly.expenses)}</dd></div>
        <div><dt>Income minus expenses</dt><dd>{formatMoney(monthly.income - monthly.expenses)}</dd></div>
      </dl>
    </section>
  );
}
