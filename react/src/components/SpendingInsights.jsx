export default function SpendingInsights({ insight }) {
  return (
    <section className="card dashboard-insight" aria-labelledby="insight-heading">
      <h2 id="insight-heading">At a glance</h2>
      <p>{insight || 'Add expenses in the full Spendly app to see spending insights. This empty demo has no activity to describe.'}</p>
    </section>
  );
}
