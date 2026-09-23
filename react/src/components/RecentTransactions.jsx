import { useState } from 'react';
import { formatMoney } from '../formatMoney.js';
import TransactionFilter from './TransactionFilter.jsx';

export default function RecentTransactions({ transactions, onEditTransaction, onDeleteTransaction }) {
  const [selectedType, setSelectedType] = useState('all');

  function handleTypeChange(nextType) {
    setSelectedType(nextType);
  }

  // Derive the visible list on each render; do not change the original array.
  const visibleTransactions = transactions.filter(transaction =>
    selectedType === 'all' || transaction.type === selectedType
  );

  return (
    <section className="card" aria-labelledby="recent-heading">
      <h2 id="recent-heading">Transactions</h2>
      <p className="dashboard-note">All matching transactions. New entries appear first. This filter only changes this list.</p>
      <TransactionFilter selectedType={selectedType} onTypeChange={handleTypeChange} />
      <p className="dashboard-note" role="status">Showing {visibleTransactions.length} transactions</p>
      <ul className="dashboard-list">
        {visibleTransactions.length === 0 ? (
          <li className="empty">{transactions.length === 0 ? 'No transactions yet.' : 'No transactions match this filter.'}</li>
        ) : visibleTransactions.map(transaction => (
            <li className="dashboard-row" key={transaction.id}>
              <div>
                <strong>{transaction.name}</strong>
                <p className="dashboard-note">
                  {transaction.type === 'income' ? 'Income' : 'Expense'} · {transaction.category} · <time dateTime={transaction.date}>{transaction.date}</time>
                </p>
              </div>
              <strong className={`dashboard-${transaction.type}`}>
                {transaction.type === 'income' ? '+' : '−'}{formatMoney(transaction.amount)}
              </strong>
              <div className="transaction-actions">
                <a className="btn edit-link" href="#transaction-form-heading" aria-label={`Edit ${transaction.name}`} onClick={() => onEditTransaction(transaction.id)}>Edit</a>
                <button className="btn" type="button" aria-label={`Delete ${transaction.name}`} onClick={() => onDeleteTransaction(transaction.id)}>Delete</button>
              </div>
            </li>
          ))}
      </ul>
    </section>
  );
}
