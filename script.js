/* ============================================================
   SPENDLY
   1. State
   2. Small helpers (money, date, text)
   3. Elements
   4. Calculations
   5. Rendering
   6. Modal system
   7. Actions (what each modal does on submit)
   8. Toast
   9. Event listeners
   10. Start
   ============================================================ */

"use strict";


/* ---------- 1. State ---------- */

const state = {
    balance: 0,
    totalIncome: 0,
    dailyLimit: 0,
    legacyIncome: 0,
    openingBalanceAdjustment: 0,
    historyIncomplete: false,
    income: [],
    expenses: [],
    goals: []
};

/* A counter is safer than Date.now(): two items created in the
   same millisecond would otherwise share the same id. This counter
   is saved to localStorage too, so ids stay unique across reloads. */
let lastId = 0;

function createId() {
    const used = new Set([...state.income, ...state.expenses, ...state.goals].map(item => item.id));
    let next = lastId < Number.MAX_SAFE_INTEGER ? lastId + 1 : 1;
    while (used.has(next)) next += 1;
    lastId = next;
    return next;
}

/* ---------- 1b. Persistence and data integrity ---------- */

const STORAGE_KEY = "spendly:data";
const SCHEMA_VERSION = 1;
const INCOME_CATEGORIES = ["Allowance", "Part-time", "Freelance", "Gift", "Other"];
const EXPENSE_CATEGORIES = ["Food", "Transport", "Entertainment", "Shopping", "Other"];
let recoveryRequired = false;
let recoveryRaw = null;
let recoveryBackedUp = false;
let actionInProgress = false;
let pendingToast = "";
let saveFailed = false;
let syncConflict = false;
let savePending = false;
let mutationPending = false;
let loadedRaw = null;
let revision = 0;
let cleanSnapshot = "";
let needsMigration = false;
const EMPTY_STATE = JSON.stringify(state);
const WRITE_LOCK = "spendly:state-write";

function stateSnapshot() {
    return JSON.stringify({ state, lastId });
}

function hasLocalChanges() {
    // An open form is local work even before it changes the financial state.
    return saveFailed || savePending || mutationPending || actionInProgress
        || activeModal !== null || stateSnapshot() !== cleanSnapshot;
}

function markSyncConflict() {
    syncConflict = true;
    clearTimeout(toastTimer);
    ui.toast.hidden = true;
    ui.toast.textContent = "";
    renderSaveNotice();
    if (activeModal) showError("Another tab changed your data. Your local work is kept. Cancel this dialog, then choose whether to discard local changes and load the latest data.");
}

function handleStorageChange(event) {
    if (event.storageArea !== localStorage || (event.key !== STORAGE_KEY && event.key !== null)) return;
    try {
        // Events may be delayed; always read the latest value, not event.newValue.
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === loadedRaw) return;
        if (syncConflict || hasLocalChanges()) {
            markSyncConflict();
            return;
        }
        loadState(raw);
        render(); // Reading another tab's save must never write it back.
    } catch (error) {
        markSyncConflict();
    }
}

function discardLocalChanges() {
    if (savePending || mutationPending) return;
    // loadState validates first. A corrupt incoming save cannot discard local data.
    if (!loadState()) {
        render();
        return;
    }
    queuedModal = null;
    if (activeModal) closeModal();
    ui.modalForm.reset();
    render();
}

function isMoney(value, positive = false) {
    return Number.isSafeInteger(value) && value >= (positive ? 1 : 0);
}

function isValidDate(value) {
    if (typeof value !== "string") return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(value);
    if (!match || Number(match[1]) < 100) return false;
    const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return day.getFullYear() === Number(match[1])
        && day.getMonth() === Number(match[2]) - 1
        && day.getDate() === Number(match[3])
        && Number.isFinite(parseDateValue(value).getTime());
}

function isValidName(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function isValidIncome(item) {
    return Boolean(item) && isMoney(item.id, true) && isValidName(item.name)
        && isMoney(item.amount, true) && INCOME_CATEGORIES.includes(item.category)
        && isValidDate(item.date);
}

function isValidExpense(item) {
    return Boolean(item) && isMoney(item.id, true) && isValidName(item.name)
        && isMoney(item.amount, true) && EXPENSE_CATEGORIES.includes(item.category)
        && isValidDate(item.date)
        && (item.reason === undefined || typeof item.reason === "string");
}

function isValidGoal(item) {
    return Boolean(item) && isMoney(item.id, true) && isValidName(item.name)
        && isMoney(item.target, true) && isMoney(item.saved);
}

function exactSum(list, field = "amount") {
    return list.reduce((total, item) => total + BigInt(item[field]), 0n);
}

function validateState(candidate) {
    if (!isMoney(candidate.balance) || !isMoney(candidate.dailyLimit)
        || !isMoney(candidate.legacyIncome)
        || !Number.isSafeInteger(candidate.openingBalanceAdjustment)
        || typeof candidate.historyIncomplete !== "boolean"
        || !Array.isArray(candidate.income) || !candidate.income.every(isValidIncome)
        || !Array.isArray(candidate.expenses) || !candidate.expenses.every(isValidExpense)
        || !Array.isArray(candidate.goals) || !candidate.goals.every(isValidGoal)) {
        throw new Error("Use valid names, categories, dates, and whole-rupiah amounts within the safe numeric range.");
    }
    const items = [...candidate.income, ...candidate.expenses, ...candidate.goals];
    if (new Set(items.map(item => item.id)).size !== items.length) throw new Error("Duplicate record IDs need recovery.");
    const income = exactSum(candidate.income) + BigInt(candidate.legacyIncome);
    const expenses = exactSum(candidate.expenses);
    const savings = exactSum(candidate.goals, "saved");
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    if ([income, expenses, savings, BigInt(candidate.balance) + savings].some(value => value > max)) {
        throw new Error("The resulting total exceeds the safe whole-rupiah range.");
    }
    if (!candidate.historyIncomplete && (candidate.legacyIncome !== 0 || candidate.openingBalanceAdjustment !== 0)) {
        throw new Error("Legacy accounting metadata is inconsistent.");
    }
    if (BigInt(candidate.balance) + savings !== income - expenses + BigInt(candidate.openingBalanceAdjustment)) {
        throw new Error("The saved balance does not match its accounting records.");
    }
}

/* Keep the exact source before migration/recovery. Never overwrite a backup. */
function backupRaw(raw) {
    if (raw === null) return;
    const prefix = STORAGE_KEY + ":backup:" + Date.now() + ":" + crypto.randomUUID();
    let key = prefix;
    let suffix = 0;
    while (localStorage.getItem(key) !== null) key = prefix + ":" + (++suffix);
    localStorage.setItem(key, raw);
    if (localStorage.getItem(key) !== raw) throw new Error("Could not verify the data backup.");
}

async function saveState() {
    // Invalid state rejects before writing, so the action wrapper can roll back.
    if (recoveryRequired || actionInProgress || syncConflict || savePending) return false;
    validateState(state);
    savePending = true;
    try {
        if (!navigator.locks) throw new Error("Safe cross-tab saving requires Web Locks.");
        return await navigator.locks.request(WRITE_LOCK, async function () {
            if (localStorage.getItem(STORAGE_KEY) !== loadedRaw) {
                markSyncConflict();
                return false;
            }
            if (syncConflict || recoveryRequired) return false;
            if (!Number.isSafeInteger(revision + 1)) throw new Error("Saved revision limit reached.");
            const nextRevision = revision + 1;
            const raw = JSON.stringify({ ...state, schemaVersion: SCHEMA_VERSION, lastId, revision: nextRevision });
            localStorage.setItem(STORAGE_KEY, raw);
            loadedRaw = raw;
            revision = nextRevision;
            cleanSnapshot = stateSnapshot();
            needsMigration = false;
            saveFailed = false;
            renderSaveNotice();
            return true;
        });
    } catch (error) {
        saveFailed = true;
        clearTimeout(toastTimer);
        ui.toast.hidden = true;
        ui.toast.textContent = "";
        renderSaveNotice();
        console.warn("Spendly: could not save data.", error);
        return false;
    } finally {
        savePending = false;
    }
}

function renderSaveNotice() {
    $("save-failure-notice").hidden = !saveFailed;
    $("retry-save").hidden = !saveFailed || recoveryRequired || syncConflict;
    $("sync-conflict-notice").hidden = !syncConflict;
    $("discard-local-changes").hidden = !syncConflict;
}

async function retrySave() {
    if (await saveState()) showToast("Your changes have been saved.");
}

function loadState(raw) {
    recoveryBackedUp = false;
    try {
        recoveryRaw = arguments.length ? raw : localStorage.getItem(STORAGE_KEY);
        needsMigration = recoveryRaw === null;
        if (recoveryRaw === null) {
            Object.assign(state, JSON.parse(EMPTY_STATE));
            lastId = 0;
            loadedRaw = null;
            cleanSnapshot = stateSnapshot();
            recoveryRequired = false;
            syncConflict = false;
            saveFailed = false;
            return true;
        }
        const saved = JSON.parse(recoveryRaw);
        if (!saved || typeof saved !== "object" || Array.isArray(saved)) throw new Error("Invalid saved state.");
        if (saved.schemaVersion !== undefined && saved.schemaVersion !== SCHEMA_VERSION) throw new Error("Unsupported data version.");
        if (saved.revision !== undefined && !isMoney(saved.revision)) throw new Error("Invalid saved revision.");
        const legacy = saved.schemaVersion === undefined;
        const candidate = {
            balance: saved.balance,
            totalIncome: saved.totalIncome,
            dailyLimit: saved.dailyLimit === undefined && legacy ? 0 : saved.dailyLimit,
            income: saved.income === undefined && legacy ? [] : saved.income,
            expenses: saved.expenses === undefined && legacy ? [] : saved.expenses,
            goals: saved.goals === undefined && legacy ? [] : saved.goals,
            legacyIncome: legacy ? 0 : saved.legacyIncome,
            openingBalanceAdjustment: legacy ? 0 : saved.openingBalanceAdjustment,
            historyIncomplete: legacy ? false : saved.historyIncomplete
        };
        if (!isMoney(candidate.balance) || !isMoney(candidate.dailyLimit)
            || !Array.isArray(candidate.income) || !candidate.income.every(isValidIncome)
            || !Array.isArray(candidate.expenses) || !candidate.expenses.every(isValidExpense)
            || !Array.isArray(candidate.goals) || !candidate.goals.every(isValidGoal)
            || (saved.totalIncome !== undefined && !isMoney(saved.totalIncome))) throw new Error("Invalid saved records.");
        const items = [...candidate.income, ...candidate.expenses, ...candidate.goals];
        let counter = items.reduce((max, item) => Math.max(max, item.id), 0);
        const used = new Set();
        let repairedIds = false;
        items.forEach(item => {
            if (used.has(item.id)) {
                const allIds = new Set(items.map(record => record.id));
                let next = counter < Number.MAX_SAFE_INTEGER ? counter + 1 : 1;
                while (allIds.has(next)) next += 1;
                item.id = next;
                counter = Math.max(counter, next);
                repairedIds = true;
            }
            used.add(item.id);
        });
        if (legacy) {
            const recordedIncome = exactSum(candidate.income);
            const historicalIncome = BigInt(saved.totalIncome === undefined ? 0 : saved.totalIncome);
            candidate.legacyIncome = Number(historicalIncome > recordedIncome ? historicalIncome - recordedIncome : 0n);
            const adjustment = BigInt(candidate.balance) + exactSum(candidate.goals, "saved")
                + exactSum(candidate.expenses) - recordedIncome - BigInt(candidate.legacyIncome);
            candidate.openingBalanceAdjustment = Number(adjustment);
            candidate.historyIncomplete = saved.income === undefined || candidate.legacyIncome > 0
                || adjustment !== 0n || (saved.totalIncome !== undefined && historicalIncome !== recordedIncome);
        }
        validateState(candidate);
        if (arguments.length && loadedRaw !== null && saved.revision !== undefined
            && saved.revision <= revision) {
            markSyncConflict();
            return false;
        }
        candidate.totalIncome = Number(exactSum(candidate.income) + BigInt(candidate.legacyIncome));
        const recoveredCounter = isMoney(saved.lastId) ? Math.max(counter, saved.lastId) : counter;
        needsMigration = legacy || repairedIds || recoveredCounter !== saved.lastId || saved.revision === undefined;
        if (needsMigration) {
            backupRaw(recoveryRaw);
            recoveryBackedUp = true;
        }
        Object.assign(state, candidate);
        lastId = recoveredCounter;
        revision = Math.max(revision, saved.revision === undefined ? 0 : saved.revision);
        loadedRaw = recoveryRaw;
        cleanSnapshot = stateSnapshot();
        recoveryRequired = false;
        syncConflict = false;
        saveFailed = false;
        return true;
    } catch (error) {
        recoveryRequired = true;
        // Retain the observed source for an explicitly confirmed recovery reset.
        loadedRaw = recoveryRaw;
        console.warn("Spendly: saved data needs recovery; original data will not be overwritten.", error);
        if (recoveryRaw !== null && !recoveryBackedUp) {
            try { backupRaw(recoveryRaw); recoveryBackedUp = true; } catch (backupError) {
                console.warn("Spendly: backup unavailable; original data retained.", backupError);
            }
        }
        return false;
    }
}

/* Actions mutate in memory, then validate before any rendering or persistence. */
async function runStateAction(action) {
    if (savePending || mutationPending) return false;
    if (syncConflict) {
        showError("Another tab changed your data. Cancel this dialog and resolve the conflict before making more changes.");
        return false;
    }
    if (recoveryRequired && action !== submitResetData) {
        showError("Saved data needs recovery. Original data is retained; changes are blocked.");
        return false;
    }
    if (recoveryRequired && action === submitResetData && !recoveryBackedUp) {
        try {
            backupRaw(localStorage.getItem(STORAGE_KEY));
            recoveryBackedUp = true;
        } catch (error) {
            showError("Reset blocked: the original data could not be backed up.");
            return false;
        }
    }
    const snapshot = JSON.stringify(state);
    const previousId = lastId;
    const wasRecoveryRequired = recoveryRequired;
    const previousQueue = queuedModal;
    mutationPending = true;
    actionInProgress = true;
    pendingToast = "";
    try {
        const result = action();
        validateState(state);
        actionInProgress = false;
        if (result !== false) {
            render();
            const saved = await saveState();
            if (saved && pendingToast) showToast(pendingToast);
        }
        // This result controls modal closure, not persistence success. Retained
        // in-memory changes must not be submitted a second time after a failed save.
        return result;
    } catch (error) {
        Object.assign(state, JSON.parse(snapshot));
        lastId = previousId;
        queuedModal = previousQueue;
        recoveryRequired = wasRecoveryRequired;
        showError(error.message);
        return false;
    } finally {
        mutationPending = false;
        actionInProgress = false;
        pendingToast = "";
    }
}

/* ---------- 2. Small helpers ---------- */

/* Number -> "Rp 25.000" */
function formatRupiah(number) {
    return "Rp " + number.toLocaleString("id-ID");
}

/* "Rp 25.000" -> 25000 */
function parseRupiah(text) {
    const value = String(text).trim().replace(/^Rp\s*/, "");
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(value)) return NaN;
    const amount = Number(value.replace(/\./g, ""));
    return isMoney(amount) ? amount : NaN;
}

/* Keep invalid input visible for correction instead of silently changing its meaning. */
function formatWhileTyping(text, inputType = "", data = null) {
    if (!String(text).trim()) return "";
    // Separators shift during single-key edits of an already formatted amount.
    const editingDigits = (inputType === "insertText" && /^\d$/.test(data || ""))
        || inputType === "deleteContentBackward" || inputType === "deleteContentForward";
    const value = String(text).trim().replace(/^Rp\s*/, "");
    const source = editingDigits && /^[\d.]+$/.test(value) ? value.replace(/\./g, "") : text;
    const amount = parseRupiah(source);
    return isMoney(amount) ? formatRupiah(amount) : text;
}

function formatDate(date) {
    return parseDateValue(date).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

/* Names typed by the user end up inside innerHTML, so characters
   like < and > must be neutralised first. */
function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/* Expense dates are stored either as a plain "YYYY-MM-DD" string (new
   data, from the date picker) or as a full ISO timestamp (old data,
   from before Stage 2). Handing "YYYY-MM-DD" straight to `new Date()`
   parses it as UTC midnight, which silently shifts to the previous
   day for anyone west of UTC. parseDateValue always resolves to a
   LOCAL calendar date, so day/month comparisons are correct no
   matter which format the value came from. */
function parseDateValue(value) {
    if (typeof value === "string") {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

        if (match) {
            return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        }
    }

    return new Date(value);
}

/* Date -> "YYYY-MM-DD", for <input type="date"> values and storage */
function toDateInputValue(value) {
    const date = parseDateValue(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return year + "-" + month + "-" + day;
}

function todayISODate() {
    return toDateInputValue(new Date());
}

function isSameDay(dateA, dateB) {
    return parseDateValue(dateA).toDateString() === parseDateValue(dateB).toDateString();
}

function isSameMonth(dateA, dateB) {
    const a = parseDateValue(dateA);
    const b = parseDateValue(dateB);

    return a.getMonth() === b.getMonth()
        && a.getFullYear() === b.getFullYear();
}

/* "YYYY-MM-DD" of an expense's date, used by the month filter */
function monthKeyOf(value) {
    const date = parseDateValue(value);
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
}


/* ---------- 3. Elements ---------- */

function $(id) {
    return document.getElementById(id);
}

const ui = {
    balance:            $("balance"),
    balanceIncome:      $("balance-income"),
    balanceSpent:       $("balance-spent"),

    limitValue:         $("daily-limit-value"),
    limitMeter:         $("limit-meter"),
    limitBar:           $("limit-bar"),
    limitNote:          $("limit-note"),
    setLimitButton:     $("set-limit"),

    insights:           $("insights-content"),

    incomeList:         $("income-list"),
    incomeCount:        $("income-count"),
    incomeSearch:       $("income-search"),
    incomeCategoryFilter: $("income-category-filter"),
    incomeMonthFilter:  $("income-month-filter"),
    incomeSort:         $("income-sort"),
    clearIncomeFilters: $("clear-income-filters"),

    expenseList:        $("expense-list"),
    expenseCount:       $("expense-count"),
    expenseSearch:      $("expense-search"),
    expenseCategoryFilter: $("expense-category-filter"),
    expenseMonthFilter: $("expense-month-filter"),
    expenseSort:        $("expense-sort"),
    clearFilters:       $("clear-expense-filters"),

    goalList:           $("goal-list"),

    summaryIncome:      $("summary-income"),
    summaryExpenses:    $("summary-expenses"),
    summaryRemaining:   $("summary-remaining"),
    summaryTransactions:$("summary-transactions"),
    summaryCategory:    $("summary-category"),

    overlay:            $("modal-overlay"),
    modal:              $("modal"),
    modalTitle:         $("modal-title"),
    modalDescription:   $("modal-description"),
    modalForm:          $("modal-form"),
    modalError:         $("modal-error"),
    confirmButton:      $("confirm-modal"),
    cancelButton:       $("cancel-modal"),
    closeButton:        $("close-modal"),

    deleteText:         $("delete-text"),
    toast:              $("toast")
};


/* ---------- 4. Calculations ---------- */

function sumAmount(list) {
    return list.reduce(function (total, item) {
        return total + item.amount;
    }, 0);
}

function totalsByCategory(list) {
    const totals = {};

    list.forEach(function (expense) {
        totals[expense.category] =
            (totals[expense.category] || 0) + expense.amount;
    });

    return totals;
}

function findTopCategory(totals) {
    const names = Object.keys(totals);

    if (names.length === 0) {
        return "";
    }

    return names.reduce(function (top, name) {
        return totals[name] > totals[top] ? name : top;
    });
}

function getTodayExpenses() {
    const today = new Date();

    return state.expenses.filter(function (expense) {
        return isSameDay(expense.date, today);
    });
}

function getMonthExpenses() {
    const now = new Date();

    return state.expenses.filter(function (expense) {
        return isSameMonth(expense.date, now);
    });
}

/* Search + filter + sort are pure: each takes a list and returns a
   new list, so the original state.expenses array (and localStorage)
   is never touched just because the user typed in the search box. */

function searchExpenses(list, query) {
    const q = query.trim().toLowerCase();

    if (!q) {
        return list;
    }

    return list.filter(function (expense) {
        return expense.name.toLowerCase().includes(q)
            || Boolean(expense.reason) && expense.reason.toLowerCase().includes(q);
    });
}

function filterByCategory(list, category) {
    if (!category || category === "all") {
        return list;
    }

    return list.filter(function (expense) {
        return expense.category === category;
    });
}

function filterByMonth(list, monthValue) {
    if (!monthValue) {
        return list;
    }

    return list.filter(function (expense) {
        return monthKeyOf(expense.date) === monthValue;
    });
}

function sortExpenses(list, sortBy) {
    const copy = list.slice();

    switch (sortBy) {
        case "oldest":
            copy.sort(function (a, b) {
                return parseDateValue(a.date) - parseDateValue(b.date) || a.id - b.id;
            });
            break;

        case "highest":
            copy.sort(function (a, b) {
                return b.amount - a.amount || parseDateValue(b.date) - parseDateValue(a.date);
            });
            break;

        case "lowest":
            copy.sort(function (a, b) {
                return a.amount - b.amount || parseDateValue(b.date) - parseDateValue(a.date);
            });
            break;

        default: /* "newest" */
            copy.sort(function (a, b) {
                return parseDateValue(b.date) - parseDateValue(a.date) || b.id - a.id;
            });
    }

    return copy;
}

/* What should actually be drawn on screen right now, after search,
   filters and sorting are applied. state.expenses itself never
   changes because of this. */
function getVisibleExpenses() {
    let list = state.expenses.slice();

    list = searchExpenses(list, ui.expenseSearch.value);
    list = filterByCategory(list, ui.expenseCategoryFilter.value);
    list = filterByMonth(list, ui.expenseMonthFilter.value);
    list = sortExpenses(list, ui.expenseSort.value);

    return list;
}

function getMonthIncome() {
    const now = new Date();

    return state.income.filter(function (income) {
        return isSameMonth(income.date, now);
    });
}

/* Search + filter + sort are pure here too: they never touch
   state.income or localStorage just because the user is typing. */

function searchIncome(list, query) {
    const q = query.trim().toLowerCase();

    if (!q) {
        return list;
    }

    return list.filter(function (income) {
        return income.name.toLowerCase().includes(q)
            || income.category.toLowerCase().includes(q);
    });
}

function filterIncomeByCategory(list, category) {
    if (!category || category === "all") {
        return list;
    }

    return list.filter(function (income) {
        return income.category === category;
    });
}

function filterIncomeByMonth(list, monthValue) {
    if (!monthValue) {
        return list;
    }

    return list.filter(function (income) {
        return monthKeyOf(income.date) === monthValue;
    });
}

function sortIncome(list, sortBy) {
    const copy = list.slice();

    switch (sortBy) {
        case "oldest":
            copy.sort(function (a, b) {
                return parseDateValue(a.date) - parseDateValue(b.date) || a.id - b.id;
            });
            break;

        case "highest":
            copy.sort(function (a, b) {
                return b.amount - a.amount || parseDateValue(b.date) - parseDateValue(a.date);
            });
            break;

        case "lowest":
            copy.sort(function (a, b) {
                return a.amount - b.amount || parseDateValue(b.date) - parseDateValue(a.date);
            });
            break;

        default: /* "newest" */
            copy.sort(function (a, b) {
                return parseDateValue(b.date) - parseDateValue(a.date) || b.id - a.id;
            });
    }

    return copy;
}

/* What should actually be drawn on screen right now, after search,
   filters and sorting are applied. state.income itself never
   changes because of this. */
function getVisibleIncome() {
    let list = state.income.slice();

    list = searchIncome(list, ui.incomeSearch.value);
    list = filterIncomeByCategory(list, ui.incomeCategoryFilter.value);
    list = filterIncomeByMonth(list, ui.incomeMonthFilter.value);
    list = sortIncome(list, ui.incomeSort.value);

    return list;
}

function findIncome(id) {
    return state.income.find(function (income) {
        return income.id === id;
    });
}

function findExpense(id) {
    return state.expenses.find(function (expense) {
        return expense.id === id;
    });
}

function findGoal(id) {
    return state.goals.find(function (goal) {
        return goal.id === id;
    });
}


/* ---------- 5. Rendering ---------- */

/* One entry point. Every action just calls render() instead of
   remembering which four update functions it needs. */
function render() {
    if (actionInProgress) return;
    const notice = $("data-integrity-notice");
    notice.hidden = !recoveryRequired && !state.historyIncomplete;
    notice.textContent = recoveryRequired
        ? "Saved data needs recovery. Original data is retained and changes are blocked. Restore a valid save, or use Reset data to start over after a backup is secured."
        : "Legacy history is incomplete. Historical income and the saved balance are preserved separately; monthly totals include recorded transactions only.";
    /* Undated legacy income stays separate from recorded transactions. */
    state.totalIncome = Number(exactSum(state.income) + BigInt(state.legacyIncome));

    renderBalance();
    renderDailyLimit();
    renderIncome();
    renderExpenses();
    renderInsights();
    renderGoals();
    renderSummary();
    renderDashboard();
    renderSaveNotice();
}

// Derived display data only: no dashboard values are written to storage.
function getDashboardData() {
    const monthlyIncome = sumAmount(getMonthIncome());
    const monthlyExpenses = sumAmount(getMonthExpenses());
    const categories = Object.entries(totalsByCategory(state.expenses))
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const saved = exactSum(state.goals, "saved");
    const target = exactSum(state.goals, "target");
    return {
        balance: state.balance,
        income: exactSum(state.income),
        expenses: exactSum(state.expenses),
        saved, target,
        progress: target ? Math.min(100, Number(saved * 100n / target)) : 0,
        monthlyIncome, monthlyExpenses, remaining: monthlyIncome - monthlyExpenses,
        categories,
        highestExpense: state.expenses.reduce((top, item) => !top || item.amount > top.amount ? item : top, null),
        recent: [...state.income.map(item => ({ ...item, type: "Income" })),
            ...state.expenses.map(item => ({ ...item, type: "Expense" }))]
            .sort((a, b) => parseDateValue(b.date) - parseDateValue(a.date) || b.id - a.id).slice(0, 5)
    };
}

function renderDashboard() {
    const data = getDashboardData();
    $("dashboard-balance").textContent = formatRupiah(data.balance);
    $("dashboard-income").textContent = formatRupiah(data.income);
    $("dashboard-expenses").textContent = formatRupiah(data.expenses);
    $("dashboard-month-label").textContent = new Date().toLocaleDateString("en", { month: "long", year: "numeric" });
    $("dashboard-month-income").textContent = formatRupiah(data.monthlyIncome);
    $("dashboard-month-expenses").textContent = formatRupiah(data.monthlyExpenses);
    $("dashboard-month-remaining").textContent = formatRupiah(data.remaining);
    $("dashboard-goals").innerHTML = state.goals.length
        ? `<p class="goal-numbers">${formatRupiah(data.saved)} saved of ${formatRupiah(data.target)}</p>
           <div class="meter-bar" role="progressbar" aria-label="Overall saving progress" aria-valuenow="${data.progress}" aria-valuemin="0" aria-valuemax="100"><span style="width:${data.progress}%"></span></div>
           <p class="dashboard-note">${data.progress}% of your combined targets · ${state.goals.length} ${state.goals.length === 1 ? "goal" : "goals"}</p>`
        : '<p class="empty">No saving goals yet. Create a goal below to track your progress.</p>';
    $("dashboard-categories").innerHTML = data.categories.length
        ? data.categories.map(([category, amount]) => {
            const percent = Math.round(Number(BigInt(amount) * 10000n / data.expenses) / 100);
            return `<li><div class="dashboard-row"><span>${escapeHtml(category)}</span><strong>${formatRupiah(amount)} · ${percent}%</strong></div>
                <div class="meter-bar" aria-hidden="true"><span style="width:${percent}%"></span></div></li>`;
        }).join("") : '<li class="empty">No expenses yet. Your category breakdown will appear here.</li>';
    $("dashboard-recent").innerHTML = data.recent.length
        ? data.recent.map(item => `<li class="dashboard-row"><div><strong>${escapeHtml(item.name)}</strong>
            <p class="dashboard-note">${item.type} · ${escapeHtml(item.category)} · ${escapeHtml(toDateInputValue(item.date))}</p></div>
            <strong class="dashboard-${item.type.toLowerCase()}">${item.type === "Income" ? "+" : "−"}${formatRupiah(item.amount)}</strong></li>`).join("")
        : '<li class="empty">No transactions yet. Add income or an expense below to get started.</li>';
    const comparison = data.monthlyIncome === 0 && data.monthlyExpenses === 0
        ? "No recorded income or expenses this month."
        : data.remaining >= 0
            ? `This month's recorded income covers expenses with ${formatRupiah(data.remaining)} remaining before savings transfers.`
            : `This month's expenses exceed recorded income by ${formatRupiah(-data.remaining)}.`;
    $("dashboard-insight").textContent = data.highestExpense
        ? `${data.categories[0][0]} is your largest all-time spending category (${formatRupiah(data.categories[0][1])}). Your highest expense is ${data.highestExpense.name} (${formatRupiah(data.highestExpense.amount)}). ${comparison}`
        : `Add an expense to see spending insights. ${comparison}`;
}

function renderBalance() {
    ui.balance.textContent = formatRupiah(state.balance);
    ui.balanceIncome.textContent = formatRupiah(state.totalIncome);
    ui.balanceSpent.textContent = formatRupiah(sumAmount(state.expenses));
}

function renderDailyLimit() {
    ui.setLimitButton.textContent = state.dailyLimit ? "Edit limit" : "Set limit";

    if (!state.dailyLimit) {
        ui.limitValue.textContent = "No limit set yet.";
        ui.limitValue.classList.remove("is-over");
        ui.limitMeter.hidden = true;
        return;
    }

    const spentToday = sumAmount(getTodayExpenses());
    const percent = Math.min(Math.round((spentToday / state.dailyLimit) * 100), 100);
    const isOver = spentToday > state.dailyLimit;

    ui.limitValue.textContent =
        formatRupiah(spentToday) + " of " + formatRupiah(state.dailyLimit) + " today";
    ui.limitValue.classList.toggle("is-over", isOver);

    ui.limitMeter.hidden = false;
    ui.limitBar.style.width = percent + "%";
    ui.limitBar.classList.toggle("is-warning", !isOver && percent >= 80);
    ui.limitBar.classList.toggle("is-over", isOver);

    if (isOver) {
        ui.limitNote.textContent =
            "Over by " + formatRupiah(spentToday - state.dailyLimit) + ".";
    } else {
        ui.limitNote.textContent =
            formatRupiah(state.dailyLimit - spentToday) + " left for today.";
    }
}

function renderIncome() {
    /* Same reasoning as the expense count badge: always the true
       total, regardless of active filters. */
    ui.incomeCount.textContent = state.income.length;

    if (state.income.length === 0) {
        ui.incomeList.innerHTML = `
            <li class="empty">
                <p>No income yet</p>
                <span>Add income to start tracking money coming in.</span>
            </li>
        `;
        return;
    }

    const visible = getVisibleIncome();

    if (visible.length === 0) {
        ui.incomeList.innerHTML = `
            <li class="empty">
                <p>No income found</p>
                <span>Try a different search, category, or month.</span>
            </li>
        `;
        return;
    }

    ui.incomeList.innerHTML = visible.map(function (income) {
        return `
            <li class="expense">
                <div class="expense-main">
                    <p class="expense-name">${escapeHtml(income.name)}</p>
                    <p class="expense-meta">
                        <span class="tag">${escapeHtml(income.category)}</span>
                        <span>${formatDate(income.date)}</span>
                    </p>
                </div>

                <div class="expense-side">
                    <span class="expense-amount is-income">+${formatRupiah(income.amount)}</span>
                    <button class="icon-button edit-button"
                            data-edit-income="${income.id}"
                            aria-label="Edit ${escapeHtml(income.name)}">✎</button>
                    <button class="delete-button"
                            data-delete-income="${income.id}"
                            aria-label="Delete ${escapeHtml(income.name)}">×</button>
                </div>
            </li>
        `;
    }).join("");
}

function renderExpenses() {
    /* The badge always shows the true total, regardless of active
       filters, so it still answers "how many expenses do I have". */
    ui.expenseCount.textContent = state.expenses.length;

    if (state.expenses.length === 0) {
        ui.expenseList.innerHTML = `
            <li class="empty">
                <p>No expenses yet</p>
                <span>Add one to start tracking your spending.</span>
            </li>
        `;
        return;
    }

    const visible = getVisibleExpenses();

    if (visible.length === 0) {
        ui.expenseList.innerHTML = `
            <li class="empty">
                <p>No expenses found</p>
                <span>Try a different search, category, or month.</span>
            </li>
        `;
        return;
    }

    ui.expenseList.innerHTML = visible.map(function (expense) {
        const reason = expense.reason
            ? `<p class="reason">Reason: ${escapeHtml(expense.reason)}</p>`
            : "";

        return `
            <li class="expense">
                <div class="expense-main">
                    <p class="expense-name">${escapeHtml(expense.name)}</p>
                    <p class="expense-meta">
                        <span class="tag">${escapeHtml(expense.category)}</span>
                        <span>${formatDate(expense.date)}</span>
                    </p>
                    ${reason}
                </div>

                <div class="expense-side">
                    <span class="expense-amount">−${formatRupiah(expense.amount)}</span>
                    <button class="icon-button edit-button"
                            data-edit-expense="${expense.id}"
                            aria-label="Edit ${escapeHtml(expense.name)}">✎</button>
                    <button class="delete-button"
                            data-delete-expense="${expense.id}"
                            aria-label="Delete ${escapeHtml(expense.name)}">×</button>
                </div>
            </li>
        `;
    }).join("");
}

function renderInsights() {
    if (state.expenses.length === 0) {
        ui.insights.innerHTML = `
            <div class="empty">
                <p>Nothing to analyse yet</p>
                <span>Insights appear after your first expense.</span>
            </div>
        `;
        return;
    }

    const total = sumAmount(state.expenses);
    const totals = totalsByCategory(state.expenses);
    const topCategory = findTopCategory(totals);
    const share = Math.round((totals[topCategory] / total) * 100);
    const average = Math.round(total / state.expenses.length);

    const rows = [
        { label: "Transactions", value: state.expenses.length },
        { label: "Biggest category", value: topCategory + " (" + share + "%)" },
        { label: "Average expense", value: formatRupiah(average) }
    ];

    ui.insights.innerHTML = rows.map(function (row) {
        return `
            <p class="insight">
                <span>${escapeHtml(row.label)}</span>
                <strong>${escapeHtml(String(row.value))}</strong>
            </p>
        `;
    }).join("");
}

function renderGoals() {
    if (state.goals.length === 0) {
        ui.goalList.innerHTML = `
            <div class="empty">
                <p>No saving goals yet</p>
                <span>Set a target and move money towards it.</span>
            </div>
        `;
        return;
    }

    ui.goalList.innerHTML = state.goals.map(function (goal) {
        const percent = Math.min(Math.round((goal.saved / goal.target) * 100), 100);
        const isDone = goal.saved >= goal.target;

        const footer = isDone
            ? `<p class="goal-done">Goal reached</p>`
            : `<button class="btn btn-quiet btn-sm" data-add-savings="${goal.id}">Add savings</button>`;

        return `
            <div class="goal">
                <div class="goal-head">
                    <p class="goal-name">${escapeHtml(goal.name)}</p>
                    <span class="goal-percent">${percent}%</span>
                </div>

                <p class="goal-numbers">
                    ${formatRupiah(goal.saved)} of ${formatRupiah(goal.target)}
                </p>

                <div class="meter-bar" role="progressbar"
                     aria-label="${escapeHtml(goal.name)} progress"
                     aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100">
                    <span style="width: ${percent}%"></span>
                </div>

                ${footer}
                <button class="btn btn-quiet btn-sm" data-withdraw-savings="${goal.id}"
                        aria-label="Withdraw from ${escapeHtml(goal.name)}">Withdraw</button>
            </div>
        `;
    }).join("");
}

function renderSummary() {
    const monthExpenses = getMonthExpenses();
    const monthIncome = getMonthIncome();
    const monthIncomeTotal = sumAmount(monthIncome);
    const monthExpenseTotal = sumAmount(monthExpenses);
    const totals = totalsByCategory(monthExpenses);
    const topCategory = findTopCategory(totals);

    ui.summaryIncome.textContent = formatRupiah(monthIncomeTotal);
    ui.summaryExpenses.textContent = formatRupiah(monthExpenseTotal);
    ui.summaryRemaining.textContent = formatRupiah(monthIncomeTotal - monthExpenseTotal);
    ui.summaryTransactions.textContent = monthExpenses.length;

    ui.summaryCategory.textContent =
        "Top category: " + (topCategory || "none yet");
}


/* ---------- 6. Modal system ----------

   Every modal shares the same markup. This object describes what
   changes between them, so openModal() stays short and adding a
   new modal means adding one entry here.                        */

const MODALS = {
    addIncome: {
        title: "Add income",
        description: "Money you received. It goes straight into your balance.",
        panel: "form-income",
        confirm: "Add income",
        focus: "income-name",
        onOpen: function () {
            $("income-date").value = todayISODate();
        },
        onSubmit: submitAddIncome
    },

    editIncome: {
        title: "Edit income",
        description: "Update the details of this income.",
        panel: "form-edit-income",
        confirm: "Save changes",
        focus: "edit-income-name",
        onOpen: function (incomeId) {
            const income = findIncome(incomeId);

            $("edit-income-name").value = income.name;
            $("edit-income-amount").value = formatRupiah(income.amount);
            $("edit-income-category").value = income.category;
            $("edit-income-date").value = toDateInputValue(income.date);
        },
        onSubmit: submitEditIncome
    },

    addExpense: {
        title: "Add expense",
        description: "Record something you spent money on.",
        panel: "form-expense",
        confirm: "Add expense",
        focus: "expense-name",
        onOpen: function () {
            $("expense-date").value = todayISODate();
        },
        onSubmit: submitAddExpense
    },

    editExpense: {
        title: "Edit expense",
        description: "Update the details of this expense.",
        panel: "form-edit-expense",
        confirm: "Save changes",
        focus: "edit-expense-name",
        onOpen: function (expenseId) {
            const expense = findExpense(expenseId);

            $("edit-expense-name").value = expense.name;
            $("edit-expense-amount").value = formatRupiah(expense.amount);
            $("edit-expense-category").value = expense.category;
            $("edit-expense-date").value = toDateInputValue(expense.date);
            $("edit-expense-reason").value = expense.reason || "";
        },
        onSubmit: submitEditExpense
    },

    setLimit: {
        title: "Daily spending limit",
        description: "Spendly asks for a reason when you go past this amount.",
        panel: "form-limit",
        confirm: "Save limit",
        focus: "limit-amount",
        onOpen: function () {
            $("limit-amount").value = state.dailyLimit
                ? formatRupiah(state.dailyLimit)
                : "";
        },
        onSubmit: submitSetLimit
    },

    addGoal: {
        title: "New saving goal",
        description: "Something you are saving up for.",
        panel: "form-goal",
        confirm: "Create goal",
        focus: "goal-name",
        onSubmit: submitAddGoal
    },

    addSavings: {
        title: "Add savings",
        description: "This moves money out of your balance and into the goal.",
        panel: "form-savings",
        confirm: "Move money",
        focus: "savings-amount",
        onOpen: function (goalId) {
            const goal = findGoal(goalId);
            const left = Math.max(goal.target - goal.saved, 0);

            ui.modalDescription.textContent =
                goal.name + " — " + formatRupiah(left) + " to go.";
        },
        onSubmit: submitAddSavings
    },

    withdrawSavings: {
        title: "Withdraw savings",
        description: "Move saved money back into your available balance.",
        panel: "form-withdrawal",
        confirm: "Withdraw",
        focus: "withdrawal-amount",
        onOpen: function (goalId) {
            const goal = findGoal(goalId);
            ui.modalDescription.textContent = goal
                ? goal.name + " — " + formatRupiah(goal.saved) + " available to withdraw."
                : "This saving goal is no longer available.";
        },
        onSubmit: submitWithdrawSavings
    },

    reason: {
        title: "You passed your daily limit",
        description: "Write down why, so you can spot the pattern later.",
        panel: "form-reason",
        confirm: "Save reason",
        cancel: "Skip",
        focus: "reason-text",
        onSubmit: submitReason,
        onCancel: skipReason
    },

    deleteExpense: {
        title: "Delete this expense?",
        description: "The amount goes back into your balance.",
        panel: "form-delete",
        confirm: "Delete",
        confirmStyle: "btn-danger",
        focus: "cancel-modal",
        onOpen: function (expenseId) {
            const expense = findExpense(expenseId);

            ui.deleteText.textContent =
                expense.name + " — " + formatRupiah(expense.amount);
        },
        onSubmit: submitDeleteExpense
    },

    deleteIncome: {
        title: "Delete this income?",
        description: "The amount is removed from your balance.",
        panel: "form-delete",
        confirm: "Delete",
        confirmStyle: "btn-danger",
        focus: "cancel-modal",
        onOpen: function (incomeId) {
            const income = findIncome(incomeId);

            ui.deleteText.textContent =
                income.name + " — " + formatRupiah(income.amount);
        },
        onSubmit: submitDeleteIncome
    },

    resetData: {
        title: "Reset all data?",
        description:
            "This clears your balance, income, expenses, goals, and daily " +
            "limit, and cannot be undone.",
        panel: "form-reset",
        confirm: "Reset everything",
        confirmStyle: "btn-danger",
        focus: "cancel-modal",
        onSubmit: submitResetData
    }
};

let activeModal = null;      /* name of the modal currently open */
let modalContext = null;     /* extra data, e.g. which goal or expense */
let lastFocused = null;      /* element to focus again after closing */
let queuedModal = null;      /* modal to open right after this one closes */

function openModal(name, context) {
    if (savePending || mutationPending || syncConflict) return;
    const config = MODALS[name];

    activeModal = name;
    modalContext = context !== undefined ? context : null;
    lastFocused = document.activeElement;

    ui.modalTitle.textContent = config.title;
    ui.modalDescription.textContent = config.description;
    ui.confirmButton.textContent = config.confirm;
    ui.cancelButton.textContent = config.cancel || "Cancel";

    ui.confirmButton.className = "btn " + (config.confirmStyle || "btn-accent");

    /* Show only this modal's fields, and clear them */
    document.querySelectorAll(".form-panel").forEach(function (panel) {
        panel.hidden = panel.id !== config.panel;
    });

    ui.modalForm.reset();
    hideError();

    if (config.onOpen) {
        config.onOpen(modalContext);
    }

    ui.overlay.hidden = false;
    $(config.focus).focus();
}

function restoreModalFocus(name, context) {
    const targets = {
        editIncome: ["data-edit-income", "income-search"],
        deleteIncome: ["data-delete-income", "income-search"],
        editExpense: ["data-edit-expense", "expense-search"],
        deleteExpense: ["data-delete-expense", "expense-search"],
        withdrawSavings: ["data-withdraw-savings", null],
        addSavings: ["data-add-savings", null]
    };
    const target = targets[name];
    const candidates = [lastFocused];
    if (target) {
        const [attribute, fallbackId] = target;
        if (Number.isSafeInteger(context)) {
            candidates.push(document.querySelector(`[${attribute}="${context}"]`));
        }
        // A deleted row has no replacement. Stay in its list if possible.
        candidates.push(document.querySelector(`[${attribute}]`));
        candidates.push(fallbackId ? $(fallbackId) : document.querySelector('[data-modal="addGoal"]'));
    }
    for (const element of candidates) {
        if (element && element.isConnected && !element.disabled && element.getClientRects().length) {
            element.focus();
            return;
        }
    }
}

function closeModal() {
    ui.overlay.hidden = true;
    restoreModalFocus(activeModal, modalContext);
    activeModal = null;
    modalContext = null;

    /* Used by the expense -> reason flow */
    if (queuedModal) {
        const next = queuedModal;
        queuedModal = null;
        openModal(next.name, next.context);
    }
}

async function cancelModal() {
    if (savePending || mutationPending) return;
    const config = MODALS[activeModal];

    if (config && config.onCancel) {
        await runStateAction(config.onCancel);
    }

    closeModal();
}

function showError(message) {
    ui.modalError.textContent = message;
    ui.modalError.hidden = false;
}

function hideError() {
    ui.modalError.hidden = true;
}


/* ---------- 7. Actions ----------

   Each function returns true when the modal should close, and
   false when something is wrong and the user should try again.  */

function submitAddIncome() {
    const name = $("income-name").value.trim();
    const amount = parseRupiah($("income-amount").value);
    const category = $("income-category").value;

    if (!name) {
        showError("Give the income a source.");
        return false;
    }

    if (!isMoney(amount, true)) {
        showError("Enter a positive whole-rupiah amount within the safe numeric range.");
        return false;
    }

    const dateValue = $("income-date").value || todayISODate();

    const income = {
        id: createId(),
        name: name,
        amount: amount,
        category: category,
        date: dateValue
    };

    state.income.push(income);
    state.balance += amount;

    render();
    showToast(formatRupiah(amount) + " added to your balance.");
    return true;
}

function submitEditIncome() {
    const income = findIncome(modalContext);

    if (!income) {
        return true;
    }

    const name = $("edit-income-name").value.trim();
    const amount = parseRupiah($("edit-income-amount").value);
    const category = $("edit-income-category").value;
    const dateValue = $("edit-income-date").value || todayISODate();

    if (!name) {
        showError("Give the income a source.");
        return false;
    }

    if (!isMoney(amount, true)) {
        showError("Enter a positive whole-rupiah amount within the safe numeric range.");
        return false;
    }

    /* Only the DIFFERENCE between the old and new amount should move
       in or out of the balance — not the full new amount. Unlike an
       expense, a bigger income is good news (balance goes up); a
       smaller one takes money back out. */
    const delta = amount - income.amount;

    if (delta < 0 && Math.abs(delta) > state.balance) {
        showError(
            "Lowering this would take your balance below Rp 0."
        );
        return false;
    }

    state.balance += delta;
    income.name = name;
    income.amount = amount;
    income.category = category;
    income.date = dateValue;

    render();
    showToast("Income updated.");
    return true;
}

function submitDeleteIncome() {
    const index = state.income.findIndex(function (income) {
        return income.id === modalContext;
    });

    if (index === -1) {
        return true;
    }

    const income = state.income[index];

    if (income.amount > state.balance) {
        showError(
            "Deleting this would take your balance below Rp 0."
        );
        return false;
    }

    state.balance -= income.amount;
    state.income.splice(index, 1);

    render();
    showToast(income.name + " deleted. " + formatRupiah(income.amount) + " removed.");
    return true;
}

function submitAddExpense() {
    const name = $("expense-name").value.trim();
    const amount = parseRupiah($("expense-amount").value);
    const category = $("expense-category").value;

    if (!name) {
        showError("Give the expense a name.");
        return false;
    }

    if (!isMoney(amount, true)) {
        showError("Enter a positive whole-rupiah amount within the safe numeric range.");
        return false;
    }

    if (amount > state.balance) {
        showError(
            "That is more than your balance of " + formatRupiah(state.balance) + "."
        );
        return false;
    }

    const dateValue = $("expense-date").value || todayISODate();

    const expense = {
        id: createId(),
        name: name,
        amount: amount,
        category: category,
        date: dateValue,
        reason: ""
    };

    state.expenses.push(expense);
    state.balance -= amount;

    render();
    showToast(formatRupiah(amount) + " recorded.");

    /* Ask for a reason only when this expense is dated today AND it
       pushes today's spending over the limit. A backdated expense
       shouldn't trigger a prompt about "today". */
    const isToday = isSameDay(dateValue, new Date());

    if (isToday && state.dailyLimit && sumAmount(getTodayExpenses()) > state.dailyLimit) {
        queuedModal = { name: "reason", context: expense.id };
    }

    return true;
}

function submitEditExpense() {
    const expense = findExpense(modalContext);

    if (!expense) {
        return true;
    }

    const name = $("edit-expense-name").value.trim();
    const amount = parseRupiah($("edit-expense-amount").value);
    const category = $("edit-expense-category").value;
    const dateValue = $("edit-expense-date").value || todayISODate();
    const reason = $("edit-expense-reason").value.trim();

    if (!name) {
        showError("Give the expense a name.");
        return false;
    }

    if (!isMoney(amount, true)) {
        showError("Enter a positive whole-rupiah amount within the safe numeric range.");
        return false;
    }

    /* Only the DIFFERENCE between the old and new amount should move
       in or out of the balance — not the full new amount. */
    const delta = amount - expense.amount;

    if (delta > state.balance) {
        showError(
            "That is more than your balance of " + formatRupiah(state.balance) + "."
        );
        return false;
    }

    state.balance -= delta;
    expense.name = name;
    expense.amount = amount;
    expense.category = category;
    expense.date = dateValue;
    expense.reason = reason;

    render();
    showToast("Expense updated.");
    return true;
}

function submitSetLimit() {
    const amount = parseRupiah($("limit-amount").value);

    if (!isMoney(amount, true)) {
        showError("Enter a positive whole-rupiah limit within the safe numeric range.");
        return false;
    }

    state.dailyLimit = amount;

    render();
    showToast("Daily limit set to " + formatRupiah(amount) + ".");
    return true;
}

function submitAddGoal() {
    const name = $("goal-name").value.trim();
    const target = parseRupiah($("goal-target").value);

    if (!name) {
        showError("Give the goal a name.");
        return false;
    }

    if (!isMoney(target, true)) {
        showError("Enter a positive whole-rupiah target within the safe numeric range.");
        return false;
    }

    state.goals.push({
        id: createId(),
        name: name,
        target: target,
        saved: 0
    });

    render();
    showToast("Goal “" + name + "” created.");
    return true;
}

function submitAddSavings() {
    const goal = findGoal(modalContext);
    const amount = parseRupiah($("savings-amount").value);

    if (!isMoney(amount, true)) {
        showError("Enter a positive whole-rupiah amount within the safe numeric range.");
        return false;
    }

    if (amount > state.balance) {
        showError(
            "That is more than your balance of " + formatRupiah(state.balance) + "."
        );
        return false;
    }

    state.balance -= amount;
    goal.saved += amount;

    render();
    showToast(formatRupiah(amount) + " moved into " + goal.name + ".");
    return true;
}

function submitWithdrawSavings() {
    const goal = findGoal(modalContext);
    const amount = parseRupiah($("withdrawal-amount").value);

    if (!goal) {
        showError("This saving goal is no longer available.");
        return false;
    }
    if (!isMoney(amount, true)) {
        showError("Enter a positive whole-rupiah amount within the safe numeric range.");
        return false;
    }
    if (amount > goal.saved) {
        showError("You can withdraw up to " + formatRupiah(goal.saved) + " from this goal.");
        return false;
    }
    if (!isMoney(state.balance + amount)) {
        showError("The resulting balance exceeds the safe whole-rupiah range.");
        return false;
    }

    goal.saved -= amount;
    state.balance += amount;

    render();
    showToast(formatRupiah(amount) + " withdrawn from " + goal.name + " into your balance.");
    return true;
}

function submitReason() {
    const expense = findExpense(modalContext);
    const reason = $("reason-text").value.trim();

    expense.reason = reason || "No reason given";

    render();
    return true;
}

function skipReason() {
    const expense = findExpense(modalContext);
    expense.reason = "No reason given";
    render();
}

function submitDeleteExpense() {
    const index = state.expenses.findIndex(function (expense) {
        return expense.id === modalContext;
    });

    if (index === -1) {
        return true;
    }

    const expense = state.expenses[index];

    state.balance += expense.amount;
    state.expenses.splice(index, 1);

    render();
    showToast(expense.name + " deleted. " + formatRupiah(expense.amount) + " returned.");
    return true;
}

function submitResetData() {
    state.balance = 0;
    state.totalIncome = 0;
    state.dailyLimit = 0;
    state.legacyIncome = 0;
    state.openingBalanceAdjustment = 0;
    state.historyIncomplete = false;
    recoveryRequired = false;
    state.income = [];
    state.expenses = [];
    state.goals = [];
    lastId = 0;

    render();
    showToast("All data has been reset.");
    return true;
}


/* ---------- 8. Toast ---------- */

let toastTimer = null;

function showToast(message) {
    if (actionInProgress) { pendingToast = message; return; }
    if (saveFailed || recoveryRequired || syncConflict) return;
    ui.toast.textContent = message;
    ui.toast.hidden = false;

    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
        ui.toast.hidden = true;
    }, 2600);
}


/* ---------- 9. Event listeners ---------- */

/* Any button with data-modal opens that modal */
$("retry-save").addEventListener("click", retrySave);
$("discard-local-changes").addEventListener("click", discardLocalChanges);
window.addEventListener("storage", handleStorageChange);

document.querySelectorAll("[data-modal]").forEach(function (button) {
    button.addEventListener("click", function () {
        openModal(button.dataset.modal);
    });
});

/* One submit handler for every modal */
ui.modalForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    hideError();

    const config = MODALS[activeModal];

    if (config && await runStateAction(config.onSubmit)) {
        closeModal();
    }
});

ui.cancelButton.addEventListener("click", cancelModal);
ui.closeButton.addEventListener("click", cancelModal);

/* Click on the dark area closes the modal */
ui.overlay.addEventListener("click", function (event) {
    if (event.target === ui.overlay) {
        cancelModal();
    }
});

/* Escape closes, Tab stays inside the modal */
document.addEventListener("keydown", function (event) {
    if (ui.overlay.hidden) {
        return;
    }

    if (event.key === "Escape") {
        cancelModal();
        return;
    }

    if (event.key === "Tab") {
        keepFocusInsideModal(event);
    }
});

function keepFocusInsideModal(event) {
    const focusable = ui.modal.querySelectorAll(
        "button, input, select, textarea"
    );

    const visible = Array.prototype.filter.call(focusable, function (element) {
        return element.offsetParent !== null;
    });

    if (visible.length === 0) {
        return;
    }

    const first = visible[0];
    const last = visible[visible.length - 1];

    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

/* Enter moves to the next field when the input declares data-next */
ui.modalForm.addEventListener("keydown", function (event) {
    if (event.key !== "Enter") {
        return;
    }

    const next = event.target.dataset.next;

    if (next) {
        event.preventDefault();
        $(next).focus();
    }
});

/* Live "Rp" formatting for every money input */
document.querySelectorAll("[data-currency]").forEach(function (input) {
    input.addEventListener("input", function (event) {
        input.value = formatWhileTyping(input.value, event.inputType, event.data);
    });
});

/* Delegated clicks: delete an expense, add savings to a goal */
document.addEventListener("click", function (event) {
    const deleteButton = event.target.closest("[data-delete-expense]");

    if (deleteButton) {
        openModal("deleteExpense", Number(deleteButton.dataset.deleteExpense));
        return;
    }

    const editButton = event.target.closest("[data-edit-expense]");

    if (editButton) {
        openModal("editExpense", Number(editButton.dataset.editExpense));
        return;
    }

    const deleteIncomeButton = event.target.closest("[data-delete-income]");

    if (deleteIncomeButton) {
        openModal("deleteIncome", Number(deleteIncomeButton.dataset.deleteIncome));
        return;
    }

    const editIncomeButton = event.target.closest("[data-edit-income]");

    if (editIncomeButton) {
        openModal("editIncome", Number(editIncomeButton.dataset.editIncome));
        return;
    }

    const savingsButton = event.target.closest("[data-add-savings]");

    if (savingsButton) {
        openModal("addSavings", Number(savingsButton.dataset.addSavings));
        return;
    }

    const withdrawalButton = event.target.closest("[data-withdraw-savings]");
    if (withdrawalButton) {
        openModal("withdrawSavings", Number(withdrawalButton.dataset.withdrawSavings));
    }
});


/* Search/filter/sort only change what's displayed, not state itself,
   so these call renderExpenses() directly instead of the full
   render() — no reason to re-run every other render step or write
   to localStorage just because someone typed in the search box. */
ui.expenseSearch.addEventListener("input", renderExpenses);
ui.expenseCategoryFilter.addEventListener("change", renderExpenses);
ui.expenseMonthFilter.addEventListener("change", renderExpenses);
ui.expenseSort.addEventListener("change", renderExpenses);

ui.clearFilters.addEventListener("click", function () {
    ui.expenseSearch.value = "";
    ui.expenseCategoryFilter.value = "all";
    ui.expenseMonthFilter.value = "";
    ui.expenseSort.value = "newest";
    renderExpenses();
});

ui.incomeSearch.addEventListener("input", renderIncome);
ui.incomeCategoryFilter.addEventListener("change", renderIncome);
ui.incomeMonthFilter.addEventListener("change", renderIncome);
ui.incomeSort.addEventListener("change", renderIncome);

ui.clearIncomeFilters.addEventListener("click", function () {
    ui.incomeSearch.value = "";
    ui.incomeCategoryFilter.value = "all";
    ui.incomeMonthFilter.value = "";
    ui.incomeSort.value = "newest";
    renderIncome();
});


/* ---------- 10. Start ---------- */

async function initializePersistence() {
    const loaded = loadState();
    render();
    // Existing revisioned saves are read-only on startup, avoiding write loops.
    if (loaded && needsMigration) await saveState();
}

const startup = initializePersistence();
