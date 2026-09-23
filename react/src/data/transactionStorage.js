import { sampleDashboard } from './dashboardData.js';

export const TRANSACTIONS_KEY = 'spendly:react:transactions';

export function validTransactions(value) {
  if (!Array.isArray(value)) return false;
  const ids = new Set();
  return value.every(item => {
    if (!item || typeof item !== 'object') return false;
    const validId = (typeof item.id === 'string' && item.id.trim() !== '')
      || (Number.isSafeInteger(item.id) && item.id > 0);
    if (!validId || ids.has(String(item.id))) return false;
    ids.add(String(item.id));
    return typeof item.name === 'string' && item.name.trim() !== ''
      && typeof item.amount === 'number' && Number.isFinite(item.amount) && item.amount > 0
      && ['income', 'expense'].includes(item.type)
      && typeof item.category === 'string' && item.category.trim() !== ''
      && typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date);
  });
}

// Optional storage argument lets the small tests simulate browser storage.
export function loadTransactions(storage) {
  try {
    const raw = (storage ?? window.localStorage).getItem(TRANSACTIONS_KEY);
    if (raw === null) return sampleDashboard.recentTransactions;
    const parsed = JSON.parse(raw);
    if (!validTransactions(parsed)) throw new Error('Saved transactions have missing or invalid fields.');
    return parsed;
  } catch (error) {
    if (import.meta.env?.DEV) console.warn('Spendly React: unable to load saved transactions; using sample data.', error);
    return sampleDashboard.recentTransactions;
  }
}

export function saveTransactions(transactions, storage) {
  try {
    (storage ?? window.localStorage).setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
    return true;
  } catch (error) {
    if (import.meta.env?.DEV) console.warn('Spendly React: transactions could not be saved.', error);
    return false;
  }
}
