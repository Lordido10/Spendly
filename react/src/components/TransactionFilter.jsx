// A controlled component: the parent owns the value and handles changes.
export default function TransactionFilter({ selectedType, onTypeChange }) {
  function handleChange(event) {
    onTypeChange(event.target.value);
  }

  return (
    <div className="transaction-filter">
      <label htmlFor="transaction-type">Transaction type</label>
      <select id="transaction-type" value={selectedType} onChange={handleChange}>
        <option value="all">All transactions</option>
        <option value="income">Income</option>
        <option value="expense">Expenses</option>
      </select>
    </div>
  );
}
