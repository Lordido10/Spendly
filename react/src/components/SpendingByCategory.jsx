import { formatMoney } from '../formatMoney.js';

export default function SpendingByCategory({ categories, totalExpenses }) {
  return (
    <section className="card" aria-labelledby="categories-heading">
      <h2 id="categories-heading">Spending by category</h2>
      <p className="dashboard-note">All-time expenses</p>
      <ul className="dashboard-list">
        {categories.length === 0 ? <li className="empty">No expenses yet. Your category breakdown will appear here.</li> :
          categories.map(category => {
            const percent = totalExpenses > 0 ? Math.round(category.amount / totalExpenses * 100) : 0;
            return (
              <li key={category.name}>
                <div className="dashboard-row">
                  <span>{category.name}</span>
                  <strong>{formatMoney(category.amount)} · {percent}%</strong>
                </div>
                <div className="meter-bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
              </li>
            );
          })}
      </ul>
    </section>
  );
}
