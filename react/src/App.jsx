import { useEffect, useState } from 'react';
import Dashboard from './components/Dashboard.jsx';
import TransactionForm from './components/TransactionForm.jsx';
import { sampleDashboard } from './data/dashboardData.js';
import { buildDashboardData } from './data/buildDashboardData.js';
import { loadTransactions, saveTransactions } from './data/transactionStorage.js';

export default function App() {
  const [transactions, setTransactions] = useState(() => loadTransactions());
  const [saveFailed, setSaveFailed] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const editingTransaction = transactions.find(transaction => transaction.id === editingId);
  const data = buildDashboardData(transactions);

  // Synchronize the committed transaction array, not every form keystroke.
  useEffect(() => {
    setSaveFailed(!saveTransactions(transactions));
  }, [transactions]);

  function handleSaveTransaction(transaction) {
    if (editingId !== null) {
      setTransactions(current => current.map(item =>
        item.id === editingId ? transaction : item
      ));
      setEditingId(null);
    } else {
      setTransactions(current => [transaction, ...current]);
    }
  }

  function handleDeleteTransaction(id) {
    setTransactions(current => current.filter(transaction => transaction.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function loadExample(nextTransactions) {
    setTransactions(nextTransactions);
    setEditingId(null);
  }

  return (
    <div className="app">
      <header className="app-header">
        <p className="app-name">Spendly</p>
        <p className="app-tagline">Track where your money goes.</p>
        <div className="demo-banner">
          <div>
            <strong>React persistence demo</strong>
            <p>Transactions are saved in this browser. Form drafts and filter choices are not saved.</p>
            <p>Reset restores sample transactions. Clear saves an empty list.</p>
            {saveFailed && <p className="form-error" role="alert">Your latest changes could not be saved. Keep this page open; refreshing may lose them. Try again after browser storage is available.</p>}
          </div>
          <button className="btn btn-accent" onClick={() => loadExample([...sampleDashboard.recentTransactions])}>Reset demo data</button>
          <button className="btn" onClick={() => loadExample([])}>Clear demo transactions</button>
        </div>
      </header>
      <main>
        <section className="card form-practice" aria-labelledby="transaction-form-heading">
          <h2 id="transaction-form-heading">{editingTransaction ? `Edit ${editingTransaction.name}` : 'Add a transaction'}</h2>
          <p className="dashboard-note">This learning form updates the dashboard and transaction list below.</p>
          <TransactionForm key={editingId ?? 'new'} initialTransaction={editingTransaction}
            onSaveTransaction={handleSaveTransaction} onCancelEdit={() => setEditingId(null)} />
        </section>
        <Dashboard data={data} onEditTransaction={setEditingId} onDeleteTransaction={handleDeleteTransaction} />
      </main>
    </div>
  );
}
