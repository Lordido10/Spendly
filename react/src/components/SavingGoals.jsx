import { formatMoney } from '../formatMoney.js';

// Only the dashboard summary: goal creation, funding and withdrawal stay in Vanilla.
export default function SavingGoals({ savings }) {
  const percent = savings.target > 0
    ? Math.min(100, Math.floor(savings.saved / savings.target * 100)) : 0;

  return (
    <section className="card" aria-labelledby="savings-heading">
      <h2 id="savings-heading">Saving goals</h2>
      {savings.count === 0 ? (
        <p className="empty">No saving goals yet.</p>
      ) : (
        <>
          <p className="goal-numbers">{formatMoney(savings.saved)} saved of {formatMoney(savings.target)}</p>
          <div className="meter-bar" role="progressbar" aria-label="Overall saving progress"
            aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${percent}%` }} />
          </div>
          <p className="dashboard-note">{percent}% of your combined targets · {savings.count} {savings.count === 1 ? 'goal' : 'goals'}</p>
        </>
      )}
    </section>
  );
}
