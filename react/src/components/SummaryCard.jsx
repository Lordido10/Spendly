import { formatMoney } from '../formatMoney.js';

export default function SummaryCard({ label, amount, isBalance = false }) {
  return (
    <div className={isBalance ? 'card summary-balance' : 'card'}>
      <dt>{label}</dt>
      <dd>{formatMoney(amount)}</dd>
    </div>
  );
}
