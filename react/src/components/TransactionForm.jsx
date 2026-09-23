import { useState } from 'react';

export default function TransactionForm({ initialTransaction, onSaveTransaction, onCancelEdit }) {
  const [name, setName] = useState(initialTransaction?.name ?? '');
  const [amount, setAmount] = useState(initialTransaction ? String(initialTransaction.amount) : '');
  const [type, setType] = useState(initialTransaction?.type ?? 'expense');
  const [category, setCategory] = useState(initialTransaction?.category ?? '');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    const numericAmount = Number(amount);

    if (!name.trim()) {
      setError('Please enter a transaction name.');
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Please enter an amount greater than 0.');
      return;
    }
    if (!type) {
      setError('Please select a transaction type.');
      return;
    }
    if (!category) {
      setError('Please select a category.');
      return;
    }

    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const transaction = {
      id: initialTransaction?.id ?? crypto.randomUUID(),
      date: initialTransaction?.date ?? date,
      name: name.trim(),
      amount: numericAmount,
      type,
      category,
    };
    onSaveTransaction(transaction);
    setMessage('Transaction added to the list below.');
    setName('');
    setAmount('');
    setCategory('');
  }

  return (
    <form className="transaction-form" onSubmit={handleSubmit} noValidate>
      <label htmlFor="practice-name">Transaction name</label>
      <input id="practice-name" value={name} onChange={event => setName(event.target.value)} />

      <label htmlFor="practice-amount">Amount (Rp)</label>
      <input id="practice-amount" type="number" step="any" value={amount}
        onChange={event => setAmount(event.target.value)} />

      <label htmlFor="practice-type">Type</label>
      <select id="practice-type" value={type} onChange={event => setType(event.target.value)}>
        <option value="">Select a type</option>
        <option value="income">Income</option>
        <option value="expense">Expense</option>
      </select>

      <label htmlFor="practice-category">Category</label>
      <select id="practice-category" value={category} onChange={event => setCategory(event.target.value)}>
        <option value="">Select a category</option>
        <option value="Food">Food</option>
        <option value="Transport">Transport</option>
        <option value="Shopping">Shopping</option>
        <option value="Work">Work</option>
        <option value="Gift">Gift</option>
        <option value="Other">Other</option>
      </select>

      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-accent" type="submit">{initialTransaction ? 'Save changes' : 'Add transaction'}</button>
      {initialTransaction && <button className="btn" type="button" onClick={onCancelEdit}>Cancel edit</button>}
      <p role="status">{message}</p>
    </form>
  );
}
