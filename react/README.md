# Spendly React — Phase 1

This is a dashboard-only learning app. The complete working Vanilla app remains in the parent directory, with its original tests and storage architecture. Keeping it there avoids breaking existing paths or moving the baseline during a UI learning exercise.

## Run

From this `react` directory:

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. For a production compilation check, run `npm run build`. `npm run preview` serves that build at http://127.0.0.1:4173.

Use a recent supported Node.js release (the project was verified with Node 24). Dependency versions are recorded in package.json and package-lock.json; `npm ci` installs the locked versions.

## Structure and reading order

```text
SPENDLYFINAL/
  index.html, script.js, style.css   existing Vanilla application
  tests/                           existing Vanilla regression tests
  react/
    index.html                     one React mount point
    package.json, package-lock.json
    vite.config.js                 Vite with the React plugin
    src/
      main.jsx                     mounts App into #root
      App.jsx                      owns demo selection and event handler
      data/dashboardData.js        sample and empty display fixtures
      formatMoney.js               shared display formatting
      styles.css                   Spendly dashboard visual styles
      components/
        Dashboard.jsx              composes the dashboard sections
        SummaryCard.jsx            reusable label + amount card
        MonthlyOverview.jsx
        SavingGoals.jsx            progress summary only
        SpendingByCategory.jsx
        RecentTransactions.jsx
        SpendingInsights.jsx
```

Start with `App.jsx`, then `Dashboard.jsx`, then `SummaryCard.jsx`. Each section component corresponds to a named region of the page. We reuse SummaryCard three times rather than duplicating its markup. We do not extract every paragraph into a component.

## Nine React ideas, using Spendly

### 1. What is JSX?

JSX is a way to describe UI inside JavaScript. It looks like HTML, but can include JavaScript expressions inside braces:

```jsx
<dd>{formatMoney(amount)}</dd>
```

Here React displays the formatted amount. Vite transforms JSX into JavaScript that the browser can run.

### 2. Why did HTML become JSX?

The old dashboard was HTML whose content was filled by `renderDashboard()`. In React, the markup lives alongside the data it displays. The outer `react/index.html` is still ordinary HTML; only the UI inside `#root` comes from React.

Two differences visible in this app: HTML `class` becomes `className`, and inline styles use an object, such as `style={{ width: '25%' }}`. Tags must be closed. The `<>...</>` fragment in SavingGoals groups several elements without adding a wrapper.

### 3. What is a component?

A component is a JavaScript function that returns JSX for a piece of UI. `SummaryCard` describes one metric card. Component names begin with capital letters, so `<SummaryCard />` means our component while `<div>` means a browser element.

### 4. What is a prop?

A prop is an input passed to a component:

```jsx
<SummaryCard label="Total expenses" amount={data.totalExpenses} />
```

`SummaryCard({ label, amount })` receives those inputs. The card displays them; it does not change them. Props let one component work with different data.

### 5. What is state?

State is a value React remembers for a component between renders. Here `showSample` remembers whether the sample dashboard or the empty example is selected. The mock financial values themselves are plain data fixtures, not a new accounting system.

### 6. Why use useState?

```jsx
const [showSample, setShowSample] = useState(true);
```

`showSample` is the current value. `setShowSample` changes it and tells React to render again. `true` is its initial value. A normal local variable would not schedule a UI update and would be recreated when the component runs again.

Our button uses `onClick={toggleExample}`. That passes the handler function; it does not call it during rendering. The handler calls `setShowSample(current => !current)` to switch the current value. Reloading starts this demo at `true` again because it deliberately does not save to localStorage.

### 7. What does map() do?

`categories.map(...)` transforms each category object into one `<li>`. RecentTransactions does the same for transactions. Each rendered item gets a stable `key` (category name or transaction ID), helping React match items across renders. We use braces to put that array of JSX inside the `<ul>`.

When an array is empty, a conditional expression renders an empty-state message instead. SavingGoals also chooses between progress and an empty message.

### 8. How does App communicate with children?

Data flows down:

```text
App chooses sampleDashboard or emptyDashboard
  -> <Dashboard data={data} />
     -> <MonthlyOverview monthly={data.monthly} />
     -> <RecentTransactions transactions={data.recentTransactions} />
```

A click changes App's state. App selects the other data object and passes it down again. React updates the displayed sections. We do not need Context, Redux, an event bus, or child-to-child communication for this.

### 9. What changed from Vanilla JS?

Vanilla code finds elements by ID, assigns textContent/innerHTML, and calls render functions. The React components describe what the UI should look like for their current props and state; React updates the DOM. There is no manual DOM editing or storage listener in this demo. React also renders strings such as transaction names as text, without building HTML strings.

## Mock data contract and limits

- September 2026 is an explicitly fixed sample period, not a live current-month report.
- The sample has Rp 5,000,000 income, Rp 1,080,000 expenses and Rp 500,000 saved, leaving Rp 3,420,000 available. Monthly income minus expenses is Rp 3,920,000 before savings transfers.
- Categories are pre-grouped, transactions are pre-sorted newest first (up to five displayed), and the descriptive insight is supplied as a string. This keeps Phase 1 focused on rendering rather than duplicating the financial engine.
- The UI calculates only presentation values: percentages and the monthly difference.
- The sample/empty toggle is an event-handling lesson, not a reset or financial action.
- No real data, persistence, imports from the Vanilla engine, transaction forms, goal actions, backend, authentication, TypeScript, or state-management library is included.
- Later phases can replace the fixtures with validated real data and migrate management screens one at a time. Integration with the existing persistence safeguards requires its own explicitly scoped phase.

## Official learning references

- React Quick Start: https://react.dev/learn
- Passing props: https://react.dev/learn/passing-props-to-a-component
- useState: https://react.dev/reference/react/useState
- Vite: https://vite.dev/guide/

## Verification for Phase 1

- `npm run build`: passed (Vite compiles JSX and bundles production assets).
- Existing Vanilla suite: 51/51 passed; original Vanilla files and test file verified unchanged by SHA-256 hashes.
- Browser at http://127.0.0.1:5173: all dashboard sections render with the expected sample amounts, three categories, five transactions and 25% savings progress.
- Sample-to-empty click and empty-to-sample keyboard Enter: passed; empty messages and zero amounts render correctly.
- Desktop and 390px viewport checks: passed; no horizontal overflow in the narrow viewport. Temporary viewport override restored.
- Reload: renders the sample fixture, as intended for non-persistent demo state.
- Browser console: no errors or warnings observed.
- No new automated React unit suite was introduced for this small display-only phase. Browser coverage is one browser environment, not physical-device or cross-browser testing.

## Phase 2: interactive transaction filter

RecentTransactions now owns a simple `selectedType` state value. Its TransactionFilter child receives the value and a callback prop; All, Income and Expenses filter only the recent list. The mock dataset and dashboard totals remain unchanged. The selection survives the sample/empty switch and resets on page reload.

Read [LEARNING-GUIDE.md](./LEARNING-GUIDE.md) for the code walkthrough, Vanilla comparisons, and exercises. No persistence or financial management features were added.

## Phase 2 verification

- Production build passed; all 51 existing Vanilla tests passed.
- SHA-256 comparison confirmed the Vanilla HTML, JavaScript, CSS, tests and integrity document were unchanged.
- Browser: All (5), Income (2), Expenses (3), empty dataset (0), preserved selection across sample/empty switching, keyboard selection, and reload-to-All passed. Summary amounts remained unchanged while filtering.
- Desktop and 390px viewport had no horizontal overflow; mobile dropdown and focus outline inspected visually.
- A temporary Vite hot-reload error occurred while the new imported component file was being created. The completed app loaded and filtered in a fresh tab with no console errors or warnings.
- Browser verification used one browser environment, not physical mobile devices. No automated React test framework was added in this learning phase.

## Phase 3: forms practice

TransactionForm uses separate controlled field states, onChange, onSubmit, preventDefault, basic validation, and an onAddTransaction callback. App owns the submitted practice list. This separate learning list leaves the dashboard fixtures and Phase 2 filter unchanged. Entries are in memory only and disappear on reload. Fields remain filled after success; clearing them is a guide exercise. Read the Phase 3 section of LEARNING-GUIDE.md.

Phase 3 verification: production build passed; existing Vanilla tests passed 51/51; SHA-256 comparisons confirmed Vanilla files/tests unchanged. Browser verified controlled text/amount edits, both selects, empty/whitespace name, empty/zero/negative amount, missing type/category, successful expense and income submissions (including Enter), displayed records, existing Phase 2 filter, and reload clearing practice state. No console errors/warnings observed. Desktop and 390px viewport had no horizontal overflow. Testing used one browser environment; no physical-device testing or new automated React test suite was added.

## Phase 4: current behavior

App now owns one transactions array plus an editing ID. TransactionForm creates/edits records; RecentTransactions reads and filters the same array and exposes Edit/Delete. The old separate practice list is removed. Dashboard values are derived by buildDashboardData rather than copied into state. Savings remain an empty summary because goal management is outside this lesson. New records use today's date; edits retain the original date. All matching rows are shown so every record can be managed.

The demo controls replace the array with sample or empty data; reload restores sample data. Edit links lead to the inline form; Save/Cancel exit editing. Changing the edited record discards the previous draft. See Phase 4 in LEARNING-GUIDE.md; earlier sections describe the earlier phases, not the current callback names or data flow.

Phase 4 verification: production build passed; all 51 Vanilla tests passed and original file/test hashes remained unchanged. Browser checks passed for create/read/edit/delete, prefilled edit values, type changes affecting filters, cancel without saving, deletion of the record currently being edited, empty state, demo sample/clear controls, and basic form validation. Totals followed CRUD changes and returned to their baseline after deleting the test record. No console errors or warnings; desktop and 390px viewport had no horizontal overflow. Coverage is one browser environment; no physical-device testing or automated React CRUD suite was added. No persistence or backend was introduced.

## Phase 5: current persistence behavior

Transactions now load through a lazy useState initializer and save through one useEffect dependent on transactions. The dedicated key is `spendly:react:transactions`. Valid saved arrays (including empty arrays) load; missing or invalid data falls back to samples. The initial effect writes that selected array, replacing malformed data with samples if the write succeeds. Read/write exceptions are caught; development warnings aid debugging and a failed-write notice preserves the current in-memory work.

Reset demo data restores and saves samples. Clear demo transactions saves an empty array. Form drafts, edit selection and filters are not persisted. Earlier phase sections describing reload-to-samples are historical. This educational implementation has no backup, migration, cross-tab conflict handling or server synchronization. Use one tab while learning.

Run `npm test` for five storage tests, `npm run build` for production compilation, and `npm run dev` to use the demo. Read Phase 5 in LEARNING-GUIDE.md for the initializer, JSON, effect dependency explanation and exercises.

Phase 5 verification: production build passed; 5/5 storage tests and 51/51 Vanilla tests passed. Vanilla source/test hashes remained unchanged. Real browser checks passed for creation, editing, deletion, an empty saved list, and reset surviving refresh; type filters, basic validation and cancel edit remained functional. Desktop and 390px layout had no horizontal overflow; no console errors/warnings appeared during normal browser checks. Malformed/missing storage and simulated storage-access/write failures were verified in helper tests, not injected in-browser. Coverage is one browser environment. Browser test records were removed and the dedicated React save reset to samples.
