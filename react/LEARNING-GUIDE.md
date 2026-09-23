# Learn React with Spendly — Phase 2

Start the app from this folder with `npm run dev`, then open http://127.0.0.1:5173. If dependencies are missing, run `npm ci` first. `npm run build` checks production compilation.

This phase adds one interaction: filter recent transactions by All, Income, or Expenses. All shows five mock records, Income shows two, and Expenses shows three. Dashboard amounts and category totals do not change because this is only a list filter. There is no storage or backend.

## Study in this order

1. `src/components/TransactionFilter.jsx`: a dropdown with two props and an event handler.
2. `src/components/RecentTransactions.jsx`: the parent, its state, and its derived list.
3. `src/components/Dashboard.jsx`: how sections are composed and receive data.
4. `src/App.jsx`: the existing sample/empty switch.
5. `src/data/dashboardData.js`: the objects and arrays being displayed.

Keep the app open beside the code. Select Income, then follow that value through the two components.

## A. Components

A component is a JavaScript function that returns a description of some UI. A meaningful section can have its own component; every small HTML tag does not need one.

From `Dashboard.jsx`:

```jsx
<MonthlyOverview monthly={data.monthly} />
<SavingGoals savings={data.savings} />
```

React calls these components to describe their sections. In Vanilla you might have functions such as `renderSummary()` and `renderGoals()`. React components serve a similar organizational purpose, but return JSX rather than searching for elements and changing them directly. Capitalized names distinguish components from browser tags such as `<section>`.

## B. JSX

JSX is HTML-like syntax inside JavaScript. Braces insert a JavaScript expression into the UI.

From `RecentTransactions.jsx`:

```jsx
<strong>{transaction.name}</strong>
```

If the name is Groceries, React displays Groceries as text. In Vanilla you might write `element.textContent = transaction.name`. Here you describe the text in JSX and React updates it. Use `className` instead of HTML's `class`. Vite transforms JSX into runnable JavaScript; the browser does not directly interpret JSX.

## C. Props

Props are inputs a parent passes to a child, like arguments to a function.

From `RecentTransactions.jsx`:

```jsx
<TransactionFilter selectedType={selectedType} onTypeChange={handleTypeChange} />
```

The child receives the current selection and a function it can call. Its function signature is:

```jsx
export default function TransactionFilter({ selectedType, onTypeChange }) {
```

The braces unpack those two properties from the props object. In Vanilla this resembles calling `renderFilter(value, callback)`. Treat props as read-only: a child should not assign a new value to a prop or change an array it receives.

## D. State

State is a component's memory between renders. Our parent remembers which transaction type you selected.

From `RecentTransactions.jsx`:

```jsx
const [selectedType, setSelectedType] = useState('all');
```

`selectedType` begins as `'all'`, and later might be `'income'`. A normal local variable is recreated when a function runs; React state is retained for the mounted component. State is not localStorage: reloading the page resets this demo to All.

The sample/empty button changes the data prop without removing RecentTransactions from the component tree, so the selected filter stays selected across that switch. This lets you see that changing props and changing state are separate things.

## E. useState

`useState` supplies the current value and a setter function. The setter asks React to render again with the next value.

From `RecentTransactions.jsx`:

```jsx
function handleTypeChange(nextType) {
  setSelectedType(nextType);
}
```

If `nextType` is `'expense'`, the next render uses `'expense'`. Do not write `selectedType = nextType`: it neither uses React's update mechanism nor works with this const binding. Call useState at the top of the component, not inside a condition or event handler.

In Vanilla you might update a variable and call `renderList()` yourself. In React you call the setter and let React schedule the render. The variable inside the currently running handler still belongs to its current render; the new value is used on the next render.

## F. Event handling

From `TransactionFilter.jsx`:

```jsx
function handleChange(event) {
  onTypeChange(event.target.value);
}

<select id="transaction-type" value={selectedType} onChange={handleChange}>
```

When the user selects Income, `event.target.value` is `'income'`. The handler sends that value to the callback prop. `onChange={handleChange}` passes a function to React; it does not run it while rendering.

The familiar Vanilla equivalent is:

```js
const select = document.querySelector('#transaction-type');
select.addEventListener('change', event => {
  selectedType = event.target.value;
  renderList();
});
```

React connects the handler using JSX. Because the select's `value` comes from state, it is called a controlled input: state determines what is selected. The child does not need its own duplicate state.

## G. map() and filter()

These are ordinary JavaScript array methods, not special React commands.

From `RecentTransactions.jsx`:

```jsx
const visibleTransactions = transactions.filter(transaction =>
  selectedType === 'all' || transaction.type === selectedType
).slice(0, 5);
```

`filter()` keeps every record for All, or only matching types otherwise. `slice(0, 5)` limits the result after filtering. Neither operation mutates the mock array. The fixture already arrives newest first; this phase does not add sorting.

The list then uses this pattern from the same file:

```jsx
visibleTransactions.map(transaction => (
  <li className="dashboard-row" key={transaction.id}>
```

Each object becomes a list item. The stable ID in `key` helps React identify the same item across updates. In Vanilla you might map objects to HTML strings and assign `list.innerHTML = ...`. React maps them to JSX instead and handles DOM updates. We derive visibleTransactions during rendering rather than storing another copy in state that could become outdated.

## H. Conditional rendering

From `RecentTransactions.jsx`:

```jsx
transactions.length === 0 ? 'No transactions yet.' : 'No transactions match this filter.'
```

This expression chooses the right message when the visible list is empty. The surrounding JSX checks `visibleTransactions.length === 0` to choose between that message and the mapped list.

In Vanilla you would use `if/else` and write different text or HTML. React uses the same JavaScript decisions inside JSX. The provided sample has both types; switch to the empty example to see the first message. Exercise 4 below lets you test the second.

## I. Parent to child communication

Props carry data down this tree:

```text
App (owns sample/empty selection)
  Dashboard (receives data)
    RecentTransactions (receives transactions; owns selectedType)
      TransactionFilter (receives selectedType and onTypeChange)
```

`Dashboard.jsx` passes the mock list with:

```jsx
<RecentTransactions transactions={data.recentTransactions} />
```

RecentTransactions receives the list and chooses what to display. The child filter receives just the selection and callback it needs, not the entire dashboard. This resembles passing selected arguments to smaller Vanilla functions rather than making every function read global variables.

## J. Child to parent communication with a callback prop

A callback prop is a function supplied by the parent that the child can call. It is not a special event bus or a child reaching into its parent's variables.

Parent in `RecentTransactions.jsx`:

```jsx
function handleTypeChange(nextType) {
  setSelectedType(nextType);
}
```

Child in `TransactionFilter.jsx`:

```jsx
onTypeChange(event.target.value);
```

Trace one click:

1. Parent sends `'all'` as selectedType and handleTypeChange as onTypeChange.
2. You choose Income in the child dropdown.
3. Child's handleChange reads `'income'` and calls onTypeChange with it.
4. That invokes the parent's handleTypeChange, which calls setSelectedType.
5. React runs the parent again with selectedType equal to `'income'`.
6. filter() derives two matching records; map() describes their list items.
7. React updates the list, count, and controlled dropdown.

This is the same callback idea as passing a function to addEventListener. The difference is that the parent owns the state update, and React handles the resulting DOM changes. Events call functions upward; the new state flows back down as props.

## Try it before editing

- All: five transactions, including income and expenses.
- Income: Freelance work and Part-time work only.
- Expenses: Groceries, Study supplies, and Monthly transport pass only.
- Summary values stay unchanged while filtering.
- Switch to the empty dashboard: zero transactions, no error.
- Switch back: the selected type is preserved.
- Reload: selection returns to All, and sample data is shown.

## Small exercises — make these changes yourself

1. **Change text.** In TransactionFilter, rename the Expenses option to Money out. Keep its value as `expense`. Predict whether filtering changes. (Only the label should change.)
2. **Change initial state.** In RecentTransactions, change `useState('all')` to `useState('income')`. Reload to test the initial value; hot reload may preserve existing state.
3. **Add a prop.** Give TransactionFilter a `label` prop. Pass `label="Show transaction type"` from the parent and render it instead of the hard-coded label. Keep the label associated with the select.
4. **Test no matches.** Temporarily remove income records from the mock recentTransactions array, then choose Income. Expect No transactions match this filter. Restore the fixture afterward. These are display fixtures: totals will not recalculate automatically.
5. **Show/hide the list.** Add `showTransactions` state to RecentTransactions and a button that toggles it. Hide only the list, keeping the filter available. Observe whether the selected type remains unchanged.
6. **Change the limit.** Replace the hard-coded five with a `limit` prop on RecentTransactions. Pass three from Dashboard, and update the explanatory text. Check that filtering happens before limiting.
7. **Add a mock category.** Add an Entertainment entry to categories in dashboardData.js. Update the mock totalExpenses if needed so percentages remain meaningful. This is practice editing fixture props, not a financial-engine change.
8. **Predict before clicking.** Write down which function runs first when you select Expenses, what string is passed, which component owns state, and why SummaryCard stays unchanged. Then trace the code to check your answer.

Change one thing at a time, test it in the browser, then run `npm run build`. No backend, storage, custom hooks, or state library is needed for these exercises.

# Phase 3 — Forms and user input

The new practice section sits below the dashboard. It has its own list so we can learn forms without adding financial calculations. Practice entries do not affect the dashboard or its Phase 2 filter. Switching sample/empty data keeps practice entries; reloading removes them.

Study `src/components/TransactionForm.jsx` first, then `handleAddTransaction` and the practice list in `src/App.jsx`.

## A. Input

```jsx
<input id="practice-name" value={name} onChange={event => setName(event.target.value)} />
```

An input is an editable browser field. You type a character, the change handler reads the new text, and React updates name state. The label's htmlFor matches the input's id so clicking the label focuses the field. In Vanilla, this is still an input, but you might find it with document.querySelector and read its value yourself.

## B. Select

```jsx
<select id="practice-type" value={type} onChange={event => setType(event.target.value)}>
  <option value="">Select a type</option>
  <option value="income">Income</option>
  <option value="expense">Expense</option>
</select>
```

The user chooses an option, event.target.value contains its value (for example income), and setType updates state. The visible label Income and the stored string income are different. Vanilla also exposes select.value; React connects it to component state.

## C. Value

```jsx
value={name}
```

This tells React which text belongs in the field. On every render the input reflects name. It is not only an initial value: changing name through its setter changes the displayed value too. In Vanilla, you might assign input.value directly. Here state supplies that value.

## D. onChange

```jsx
onChange={event => setAmount(event.target.value)}
```

This function runs when the user edits the amount. It receives the event, reads the field's value, then stores it. React renders with the new amount. It fills the role of an addEventListener('input', handler) in Vanilla. Even a number input's event.target.value is a string; we keep that string so the field can be empty while editing.

## E. Controlled components

```jsx
<input id="practice-amount" type="number" step="any" value={amount}
  onChange={event => setAmount(event.target.value)} />
```

An input with value from state and an onChange handler is controlled by React. The loop is: state supplies value → user types → handler updates state → React supplies the updated value. Adding value without an onChange handler would make an ordinary controlled field effectively read-only. There is no second variable that must be kept in sync with the DOM.

## F. useState for form values

```jsx
const [name, setName] = useState('');
const [amount, setAmount] = useState('');
const [type, setType] = useState('expense');
const [category, setCategory] = useState('');
```

Each field has its own remembered value and setter. The empty strings initially show blank inputs or placeholder options. Expense is selected initially. Separate values make it easy to see which setter updates which field. Unlike a normal local variable recreated when a function runs, React remembers these values between renders. error and message are also state: changing them updates the feedback text.

## G. Form onSubmit

```jsx
<form className="transaction-form" onSubmit={handleSubmit} noValidate>
```

The browser fires a submit event when the submit button is activated, including keyboard submission. React calls handleSubmit. Using the form event, rather than only a button onClick, supports the form's normal keyboard behavior. In Vanilla you would write form.addEventListener('submit', handleSubmit).

noValidate disables the browser's automatic validation popups so this lesson can show its own simple error messages. It does not disable our JavaScript validation. The fields intentionally remain filled after a successful submission; clearing them is an exercise.

## H. event.preventDefault()

```jsx
function handleSubmit(event) {
  event.preventDefault();
```

The browser normally submits a form by navigating or reloading. preventDefault cancels that default behavior, letting our handler validate and update React state on the current page. It does not stop our handler or save anything. The same method is used in Vanilla submit handlers.

## I. Validation

```jsx
const numericAmount = Number(amount);

if (!name.trim()) {
  setError('Please enter a transaction name.');
  return;
}
if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
  setError('Please enter an amount greater than 0.');
  return;
}
```

First convert the amount string to a number. trim() makes a whitespace-only name count as empty. Reject non-finite amounts and values that are not positive. Then the code checks that type and category are selected. An invalid submission sets an error and returns before creating a transaction or calling the parent. The first error is displayed with role="alert". After correcting it, submit again to revalidate.

This is basic form practice, not the Vanilla app's complete currency/accounting validation. Decimal amounts are accepted. In Vanilla the same if statements would work; the difference is setError renders the message instead of assigning errorElement.textContent.

## J. Callback props in forms

The parent supplies a callback in App:

```jsx
<TransactionForm onAddTransaction={handleAddTransaction} />
```

After validation, the child creates an object from its current field state:

```jsx
const transaction = {
  id: crypto.randomUUID(),
  name: name.trim(),
  amount: numericAmount,
  type,
  category,
};
onAddTransaction(transaction);
```

The ID gives each submitted list item a stable key. It is created during submission, not during rendering. The callback sends the object to App; it does not send a request to a server.

App receives the object:

```jsx
function handleAddTransaction(transaction) {
  setPracticeTransactions(current => [transaction, ...current]);
}
```

The setter uses the current array and returns a new array with the transaction first. The spread syntax ...current includes all previous items. React then renders the parent's list with map(). Avoid current.push(transaction): that changes the existing array instead of giving React a new one.

Trace the complete flow:

1. App passes handleAddTransaction as a prop to TransactionForm.
2. The form owns and updates the field states while you type.
3. Submit calls preventDefault and validates those state values.
4. A valid submission calls onAddTransaction with an object.
5. App updates practiceTransactions with a new array.
6. React renders the submitted object in the practice list.

The child owns the draft; the parent owns the submitted list. In Vanilla you might create an object in a submit listener and append HTML to a list. In React you update state and describe the resulting list in JSX.

## Phase 3 exercises — try these yourself

1. Change the default transaction type from expense to income. Reload to check the initial state, since hot reload may retain state.
2. Add an Entertainment category option. Submit a mock transaction with that category.
3. Change the submit button text to Add practice entry.
4. Add a description field with its own state and controlled input. Pass it in the submitted object and display it in App's list.
5. Rewrite the empty-name error message. Submit whitespace to test it.
6. Clear the form fields after successful submission using their setters. Decide which default type and category you want afterward. Keep invalid drafts intact.
7. Display a transaction counter beside Submitted mock transactions. Derive it from the array rather than storing another count in state.
8. Explain why typing does not add a list item, but submitting does. Identify the exact callback call that crosses from child to parent.

Do one exercise at a time and test in the browser. Run `npm run build` from react afterward. Keep these experiments in react only. This phase ends here: no persistence, backend, or real financial transaction handling has been introduced.

# Phase 4 — Parent-owned state and CRUD

This section describes the current app. Phases 1–3 above document earlier learning steps: there is now one transaction list, not a separate practice list. The form callback is now onSaveTransaction because it handles both creation and editing. New submissions clear the name, amount and category fields. The full filtered list is displayed, without a five-item cap, so every record remains editable.

## A. Arrays in React state

App owns the main array:

```jsx
const [transactions, setTransactions] = useState(sampleDashboard.recentTransactions);
```

The fixture initializes state; it is not a second editable store. Every list and transaction-based dashboard value uses transactions. Reload intentionally returns to the sample fixture. The Load sample transactions and Clear demo transactions buttons explicitly replace the in-memory array. They are demo controls, not persistence features.

## B. Add with spread

From handleSaveTransaction:

```jsx
setTransactions(current => [transaction, ...current]);
```

This creates a new array containing the submitted object followed by all existing objects. The functional setter receives the latest state. Unlike `transactions.push(transaction)`, it does not change the previous array. In Vanilla you might push and then call renderList yourself; React needs a state update to schedule rendering.

## C. Update with map

```jsx
setTransactions(current => current.map(item =>
  item.id === editingId ? transaction : item
));
```

map creates a new array. Only the record with the selected ID is replaced by the form's new object. Every other record is retained, in the same order. No property of an existing record is assigned directly.

## D. Delete with filter

```jsx
setTransactions(current => current.filter(transaction => transaction.id !== id));
```

filter returns an array excluding the selected ID. App supplies this handler through Dashboard to RecentTransactions. Clicking Delete sends the ID upward, App updates state, and React removes the corresponding item from the UI. If the deleted record is being edited, App exits edit mode too.

## E. Why not mutate?

```js
// Avoid:
transactions.push(transaction);
// Use the setter and a new array instead:
setTransactions(current => [transaction, ...current]);
```

Direct mutation changes an existing state snapshot and does not tell React to render. Passing the same mutated array back can also be skipped because its reference has not changed. New arrays and new edited objects keep prior snapshots intact and make changes explicit. Props and imported fixture arrays must not be mutated either. This is ordinary JavaScript spread/map/filter combined with React's setter.

## F. Editing state and form drafts

```jsx
const [editingId, setEditingId] = useState(null);
const editingTransaction = transactions.find(transaction => transaction.id === editingId);
```

null means create mode. An ID means edit mode. We derive the selected record using find rather than storing another full transaction copy in App state. TransactionForm still owns separate name/amount/type/category draft states; typing must not modify the saved array until submission passes validation.

```jsx
<TransactionForm key={editingId ?? 'new'} initialTransaction={editingTransaction}
  onSaveTransaction={handleSaveTransaction} onCancelEdit={() => setEditingId(null)} />
```

useState uses its initial value only when a component is created. A changing key tells React to create a fresh form when switching between records or create mode. This ensures existing values populate the fields without an effect or manual DOM manipulation. `??` uses the right-hand value only when the left is null or undefined; `?.` safely reads an optional record. Saving exits edit mode. Cancel edit discards the draft without changing the array. Clicking another Edit switches to that record and discards the previous unsaved draft. The Edit link also navigates to the form heading so the form is easy to locate.

## G. IDs

```jsx
id: initialTransaction?.id ?? crypto.randomUUID(),
```

Editing preserves the existing ID; creating generates one. Names can be duplicated, so we never use them to decide which record to replace or delete. The ID also serves as the list's React key. The original date is retained on edit; newly added records use today's local date. Date editing is outside this lesson.

## H. Parent-owned state

```text
App: transactions + editingId
  TransactionForm: editable field drafts -> onSaveTransaction
  Dashboard: derived display data + callbacks
    RecentTransactions: transactions + local type filter
      TransactionFilter: selected type + callback
```

The filter remains local to the list because no other component needs its selected value. Its input is now the current App transaction array, so edits, additions and deletions immediately affect filtering. No global state library is needed.

## I. CRUD

- Create: validated form object -> callback -> spread into a new array.
- Read: current array -> filter by selected type -> map to JSX.
- Update: Edit ID -> prefilled draft -> validate -> map replacement -> leave edit mode.
- Delete: clicked ID -> filter exclusion -> UI updates.

In Vanilla, event listeners would often edit data and manually update DOM nodes. Here event callbacks update state; JSX describes what the next UI should show. State is the data model, not the HTML on screen.

## J. Single source of truth

`buildDashboardData(transactions)` calculates display values on each render. It is a normal JavaScript function, not a hook or another state store. Income and expenses are summed from the array; categories are grouped from expenses; current-month values use record dates. Insights describe those same expenses.

Savings management has not been migrated. Its summary component remains, displaying an empty goal state. The demo balance is explicitly income minus expenses, with no fictional savings deduction. This makes the CRUD lesson consistent without copying the Vanilla accounting system. Negative balances are allowed in this learning demo, and validation remains basic rather than production financial validation.

## Study order and exercises

Study App's three handlers, TransactionForm's initial values and submission, RecentTransactions' callback buttons, then buildDashboardData. The earlier phase sections explain the fundamentals used here.

Try these without copying a solution:

1. Change one starting fixture transaction and reload. Compare the list and derived totals.
2. Show a short confirmation message after Delete. Decide which component should own the message.
3. Add a total transaction counter and compare it with the filtered count.
4. Rename the Edit link to Update details.
5. Add a description field that is preserved during editing and displayed in the list.
6. Change the empty-list message and test it by deleting all records.
7. Enhance Cancel edit to announce that the draft was discarded. Confirm saved values remain unchanged.
8. Create two transactions with the same name. Edit one and delete the other. Explain why IDs make this work.

No persistence is included. Reload resets transactions; that is intentional. Stop here to practice CRUD before proceeding to another phase.

# Phase 5 — Persistence and useEffect

This section supersedes the earlier statement that transactions reset on reload. Transactions are now saved under `spendly:react:transactions`. Form drafts, edit mode and the list filter still reset. The Vanilla app and its `spendly:data` key are not connected.

Study App's initializer and effect first, then `src/data/transactionStorage.js`. The storage file contains ordinary functions, not a custom hook. Its optional storage argument is only for tests to supply a small fake localStorage object.

## A. What localStorage is

localStorage is a browser-provided store of string values addressed by keys. Values can remain after refreshing or closing a page. It belongs to an origin: protocol, hostname and port. Switching between localhost and 127.0.0.1 or changing the Vite port means using different storage. It is not a server database or an account backup, and clearing browser site data removes it.

```js
export const TRANSACTIONS_KEY = 'spendly:react:transactions';
```

A separate key prevents this lesson from replacing Vanilla Spendly's data.

## B. Why state disappears on reload

React state exists in the running page's memory. Reload starts a new JavaScript execution, recreates the component, and initializes its state again. Previously that initializer always chose the sample. Now it reads storage:

```jsx
const [transactions, setTransactions] = useState(() => loadTransactions());
```

Passing a function is lazy initialization: React calls it when initializing this component, rather than calling the loader on every render. The loader reads and validates; it does not write. In development StrictMode may call the initializer twice to help detect impurities. Both reads return equivalent data.

## C. JSON.stringify()

The save helper contains:

```js
(storage ?? window.localStorage).setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
```

transactions is an array of objects. JSON.stringify converts it to a JSON string, which localStorage can hold. It does not update React state. In the browser the optional storage argument is absent, so window.localStorage is used. This uses the same browser API as Vanilla Spendly, without copying its production reliability architecture.

## D. JSON.parse()

The loader contains:

```js
const parsed = JSON.parse(raw);
```

parse turns the stored JSON string back into JavaScript values. Invalid JSON throws, which is why reading is inside try/catch. Valid JSON is not necessarily valid transaction data: null and an object can be valid JSON too. validTransactions checks the array and required fields before the UI receives it.

## E. useEffect

App imports useEffect and contains one synchronization effect:

```jsx
useEffect(() => {
  setSaveFailed(!saveTransactions(transactions));
}, [transactions]);
```

After React commits the UI, the effect sends the current transaction array to browser storage. saveTransactions returns true or false; the failure flag controls a notice without deleting in-memory work. This flag is feedback state, not another transaction store.

An effect is for synchronizing with something outside React; localStorage is that external system. The event handlers still only update React state. In Vanilla you may explicitly call saveState after an action; here React runs the effect when its dependency changes.

## F. Dependency arrays

`[transactions]` tells React which value the effect depends on. React compares it with the previous render's value. Our immutable CRUD handlers return a new array, so the effect runs after each committed change. It also runs on initial mounting; it does not run only after user actions.

- `[transactions]`: synchronize initially and when the array changes.
- `[]`: initial mounting only; it would miss later CRUD changes.
- No dependency array: run after every committed render, including unrelated parent-state changes.

Updating saveFailed does not rerun this effect because saveFailed is not its dependency. React state setters have stable identities. The imported saveTransactions function is defined outside the component.

## G. Reading storage

```js
const raw = (storage ?? window.localStorage).getItem(TRANSACTIONS_KEY);
if (raw === null) return sampleDashboard.recentTransactions;
```

A missing key returns null, so the default sample is used. A saved `[]` is a valid empty list and is loaded as empty. Malformed JSON, missing fields, duplicate IDs, invalid types or storage access exceptions fall back to samples. Development builds log a useful warning; production builds omit it. The loader has no writes, so it cannot replace data during initialization itself.

## H. Writing storage

The effect calls saveTransactions, which stringifies and writes. The same effect handles Create, Edit, Delete, Clear and Reset; we do not repeat storage code in every handler. Reset demo data replaces React state with a fresh copy of the sample array, triggering persistence even when resetting repeatedly. Clear demo transactions saves `[]` rather than deleting the key.

In this intentionally simple lesson, the initial effect saves whichever data the loader selected. Therefore malformed saved data is replaced by sample data if saving succeeds. There is no corrupt-data backup or migration system. If writing fails, the page keeps its current array and displays a warning. A later transaction change or reset attempts another write. Closing or refreshing while unsaved may lose those latest changes.

## I. State versus persistent storage

React state is the live source for rendering. localStorage is a serialized copy used when initializing the next page load. Changing storage directly does not automatically update the current UI: there is no storage-event listener in this lesson. Editing a form field changes only its draft state; submitting changes App's transaction array and then storage.

The browser may block storage or run out of space. The basic catch prevents a crash, but this is not the Vanilla app's recovery system. There is no multi-tab stale-write protection; two tabs can overwrite each other's saved array. Use one tab for these learning exercises.

## J. Why CRUD triggers the effect

```text
Create / Edit / Delete / Reset
  -> setTransactions returns a new array
  -> React renders the updated UI
  -> [transactions] has changed
  -> useEffect calls saveTransactions
  -> JSON text is written to localStorage

Reload
  -> lazy initializer calls loadTransactions
  -> JSON.parse + validation
  -> loaded array becomes React state
  -> UI renders
  -> effect synchronizes that array
```

StrictMode may run the effect an extra time on mounting in development. Writing the same serialized array twice does not duplicate transactions; it replaces the value under the same key. There is no event listener or subscription to remove, so this effect needs no cleanup. Never clear storage in cleanup: that would undo the persistence you want.

Official reference: https://react.dev/reference/react/useEffect

## Phase 5 exercises — no solutions included

1. Change the dedicated key, reload, and explain why the previous saved records no longer load. Restore the original key afterward. Do not use Vanilla's key.
2. Add a development-only log when loading succeeds. Observe StrictMode and distinguish loading from rendering.
3. Plan a Clear saved data button. Decide whether it removes only storage or also changes the current state, and predict when the effect will write again.
4. Change a fallback transaction. Test with a missing key; explain why an existing valid save takes priority.
5. Add another field to each transaction and include it in both the form and load validation. Think about older records without that field.
6. In browser DevTools on this demo origin only, record the current value, then place invalid JSON under the React key and reload. Observe the fallback and development warning. Remember that the effect replaces the invalid data with samples.
7. Temporarily remove the dependency array, add a save log, and observe extra writes during unrelated renders. Restore `[transactions]` immediately afterward.
8. Clear the transaction list, reload, and explain why an empty saved array must differ from a missing key.

Use `npm test` for the storage helper tests and `npm run build` for production compilation. Complete the exercises here before the next phase. No backend, database, account system, synchronization service, or custom persistence hook is included.
