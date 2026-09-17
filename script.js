let balance = 0;
let expenses = [];
let goals = [];
let dailyLimit = 0;
let totalIncome = 0;
let currentMode = "";


// UI elements

const balanceElement = document.getElementById("balance");
const expenseList = document.getElementById("expense-list");

const addBalanceButton = document.getElementById("add-balance");
const addExpenseButton = document.getElementById("add-expense");
const setLimitButton = document.getElementById("set-limit");
const addGoalButton = document.getElementById("add-goal");

const modalOverlay = document.getElementById("modal-overlay");
const modalTitle = document.getElementById("modal-title");

const closeModalButton = document.getElementById("close-modal");
const cancelModalButton = document.getElementById("cancel-modal");
const confirmModalButton = document.getElementById("confirm-modal");

const expenseForm = document.getElementById("expense-form");
const balanceForm = document.getElementById("balance-form");
const limitForm = document.getElementById("limit-form");
const goalForm = document.getElementById("goal-form");

const expenseName = document.getElementById("expense-name");
const expenseAmount = document.getElementById("expense-amount");
const expenseCategory = document.getElementById("expense-category");
const balanceAmount = document.getElementById("balance-amount");

const limitAmount = document.getElementById("limit-amount");

const goalName = document.getElementById("goal-name");
const goalTarget = document.getElementById("goal-target");

const dailyLimitValue =
    document.getElementById("daily-limit-value");

const insightsContent =
    document.getElementById("insights-content");

const goalList =
    document.getElementById("goal-list");

const summaryIncome =
    document.getElementById("summary-income");

const summaryExpenses =
    document.getElementById("summary-expenses");

const summaryRemaining =
    document.getElementById("summary-remaining");

const summaryTransactions =
    document.getElementById("summary-transactions");

const summaryCategory =
    document.getElementById("summary-category");


// Format helpers

function formatRupiah(value) {
    const number = value.replace(/\D/g, "");

    return number
        ? "Rp " + Number(number).toLocaleString("id-ID")
        : "";
}

function getNumber(value) {
    return Number(value.replace(/\D/g, ""));
}


// Update balance

function updateBalance() {
    balanceElement.textContent =
        "Rp " + balance.toLocaleString("id-ID");
}


// Show expenses

function displayExpenses() {
    expenseList.innerHTML = "";

    if (expenses.length === 0) {
        expenseList.innerHTML = `
            <div id="empty-expense">
                <p>No expenses yet</p>
                <span>Your spending will appear here.</span>
            </div>
        `;

        return;
    }

    expenses.forEach(function(expense) {
        const expenseElement =
            document.createElement("div");

        expenseElement.classList.add("expense");

        const reasonHTML = expense.reason
            ? `<div class="reason">
                Reason: ${expense.reason}
               </div>`
            : "";

        expenseElement.innerHTML = `
            <div>
                <strong>${expense.name}</strong>
                <small>${expense.category}</small>
                ${reasonHTML}
            </div>

            <div>
                <span>
                    - Rp ${expense.amount.toLocaleString("id-ID")}
                </span>

                <button
                    class="delete-button"
                    data-id="${expense.id}"
                >
                    Delete
                </button>
            </div>
        `;

        expenseList.appendChild(expenseElement);
    });
}


// Modal popups

function openModal(mode) {
    currentMode = mode;

    modalOverlay.classList.add("active");

    expenseForm.style.display = "none";
    balanceForm.style.display = "none";
    limitForm.style.display = "none";
    goalForm.style.display = "none";

    if (mode === "balance") {
        modalTitle.textContent = "Add Money";

        balanceForm.style.display = "block";

        balanceAmount.value = "";
        balanceAmount.focus();
    }

    if (mode === "expense") {
        modalTitle.textContent = "Add Expense";

        expenseForm.style.display = "block";

        expenseName.value = "";
        expenseAmount.value = "";

        expenseName.focus();
    }

    if (mode === "limit") {
        modalTitle.textContent = "Daily Spending Limit";

        limitForm.style.display = "block";

        limitAmount.value = "";
        limitAmount.focus();
    }

    if (mode === "goal") {
        modalTitle.textContent = "Create Saving Goal";

        goalForm.style.display = "block";

        goalName.value = "";
        goalTarget.value = "";

        goalName.focus();
    }
}

function closeModal() {
    modalOverlay.classList.remove("active");
    currentMode = "";
}


// Add income

function addBalance() {
    const amount = getNumber(balanceAmount.value);

    if (!amount || amount <= 0) {
        alert("Please enter a valid amount.");
        return;
    }

    balance += amount;
    totalIncome += amount;

    updateBalance();
    updateSummary();

    closeModal();
}


// Add expense

function addExpense() {
    const name = expenseName.value.trim();
    const amount = getNumber(expenseAmount.value);
    const category = expenseCategory.value;

    if (!name || !amount || amount <= 0) {
        alert("Please fill in all fields.");
        return;
    }

    if (amount > balance) {
        alert("You don't have enough balance.");
        return;
    }

    const expense = {
        id: Date.now(),
        name: name,
        amount: amount,
        category: category,
        date: new Date(),
        reason: ""
    };

    expenses.push(expense);

    balance -= amount;

    updateBalance();
    displayExpenses();
    updateInsights();
    updateSummary();

    checkDailyLimit(expense);

    closeModal();
}


// Remove expense

function deleteExpense(id) {
    const index = expenses.findIndex(function(expense) {
        return expense.id === id;
    });

    if (index === -1) {
        return;
    }

    balance += expenses[index].amount;

    expenses.splice(index, 1);

    updateBalance();
    displayExpenses();
    updateInsights();
    updateSummary();
}


// Limit checks

function updateDailyLimit() {
    dailyLimitValue.textContent = dailyLimit
        ? "Rp " + dailyLimit.toLocaleString("id-ID")
        : "Not set";
}

function saveDailyLimit() {
    const amount = getNumber(limitAmount.value);

    if (!amount || amount <= 0) {
        alert("Please enter a valid limit.");
        return;
    }

    dailyLimit = amount;

    updateDailyLimit();

    closeModal();
}

function getTodayExpenses() {
    const today = new Date().toDateString();

    return expenses.filter(function(expense) {
        return new Date(expense.date).toDateString() === today;
    });
}

function checkDailyLimit(expense) {
    if (!dailyLimit) {
        return;
    }

    const todayExpenses = getTodayExpenses();

    const totalToday = todayExpenses.reduce(
        function(total, expense) {
            return total + expense.amount;
        },
        0
    );

    if (totalToday > dailyLimit) {
        const reason = prompt(
            "You've exceeded your daily spending limit.\n\n" +
            "Why did you spend this money?"
        );

        expense.reason =
            reason || "No reason provided";

        displayExpenses();
    }
}


// Spending stats

function updateInsights() {
    if (expenses.length === 0) {
        insightsContent.innerHTML =
            "<p>No insights yet.</p>";

        return;
    }

    const total = expenses.reduce(
        function(sum, expense) {
            return sum + expense.amount;
        },
        0
    );

    const categoryTotals = {};

    expenses.forEach(function(expense) {
        categoryTotals[expense.category] =
            (categoryTotals[expense.category] || 0)
            + expense.amount;
    });

    const topCategory =
        Object.keys(categoryTotals).reduce(
            function(top, category) {
                return categoryTotals[category] >
                    categoryTotals[top]
                    ? category
                    : top;
            }
        );

    const percentage = Math.round(
        (categoryTotals[topCategory] / total) * 100
    );

    insightsContent.innerHTML = `
        <p>
            You made
            <strong>${expenses.length}</strong>
            transactions.
        </p>

        <p>
            Your biggest category is
            <strong>${topCategory}</strong>.
        </p>

        <p>
            ${topCategory} represents
            <strong>${percentage}%</strong>
            of your spending.
        </p>
    `;
}


// Saving goals

function addGoal() {
    const name = goalName.value.trim();
    const target = getNumber(goalTarget.value);

    if (!name || !target || target <= 0) {
        alert("Please fill in all fields.");
        return;
    }

    goals.push({
        id: Date.now(),
        name: name,
        target: target,
        saved: 0
    });

    displayGoals();

    closeModal();
}

function displayGoals() {
    goalList.innerHTML = "";

    if (goals.length === 0) {
        goalList.innerHTML =
            "<p>No saving goals yet.</p>";

        return;
    }

    goals.forEach(function(goal) {
        const percentage = Math.min(
            Math.round((goal.saved / goal.target) * 100),
            100
        );

        const goalElement =
            document.createElement("div");

        goalElement.classList.add("goal");

        goalElement.innerHTML = `
            <div class="goal-header">
                <strong>${goal.name}</strong>
                <span>${percentage}%</span>
            </div>

            <p>
                Rp ${goal.saved.toLocaleString("id-ID")}
                /
                Rp ${goal.target.toLocaleString("id-ID")}
            </p>

            <progress
                value="${goal.saved}"
                max="${goal.target}"
            ></progress>

            <button
                class="save-button"
                data-id="${goal.id}"
            >
                Add Savings
            </button>
        `;

        goalList.appendChild(goalElement);
    });
}

function addSavings(id) {
    const goal = goals.find(function(goal) {
        return goal.id === id;
    });

    if (!goal) {
        return;
    }

    const amount = Number(
        prompt("How much do you want to save?")
    );

    if (!amount || amount <= 0) {
        return;
    }

    if (amount > balance) {
        alert("You don't have enough balance.");
        return;
    }

    balance -= amount;
    goal.saved += amount;

    updateBalance();
    displayGoals();
    updateSummary();
}


// Month summary

function updateSummary() {
    const now = new Date();

    const monthlyExpenses =
        expenses.filter(function(expense) {
            const date = new Date(expense.date);

            return (
                date.getMonth() === now.getMonth() &&
                date.getFullYear() === now.getFullYear()
            );
        });

    const expenseTotal =
        monthlyExpenses.reduce(
            function(total, expense) {
                return total + expense.amount;
            },
            0
        );

    const categoryTotals = {};

    monthlyExpenses.forEach(function(expense) {
        categoryTotals[expense.category] =
            (categoryTotals[expense.category] || 0)
            + expense.amount;
    });

    let topCategory = "-";

    if (monthlyExpenses.length > 0) {
        topCategory =
            Object.keys(categoryTotals).reduce(
                function(top, category) {
                    return categoryTotals[category] >
                        categoryTotals[top]
                        ? category
                        : top;
                }
            );
    }

    summaryIncome.textContent =
        "Rp " + totalIncome.toLocaleString("id-ID");

    summaryExpenses.textContent =
        "Rp " + expenseTotal.toLocaleString("id-ID");

    summaryRemaining.textContent =
        "Rp " + balance.toLocaleString("id-ID");

    summaryTransactions.textContent =
        monthlyExpenses.length;

    summaryCategory.textContent =
        "Top Category: " + topCategory;
}


// Button clicks

addBalanceButton.addEventListener(
    "click",
    () => openModal("balance")
);

addExpenseButton.addEventListener(
    "click",
    () => openModal("expense")
);

setLimitButton.addEventListener(
    "click",
    () => openModal("limit")
);

addGoalButton.addEventListener(
    "click",
    () => openModal("goal")
);

confirmModalButton.addEventListener(
    "click",
    function() {
        if (currentMode === "balance") {
            addBalance();
        }

        if (currentMode === "expense") {
            addExpense();
        }

        if (currentMode === "limit") {
            saveDailyLimit();
        }

        if (currentMode === "goal") {
            addGoal();
        }
    }
);

closeModalButton.addEventListener(
    "click",
    closeModal
);

cancelModalButton.addEventListener(
    "click",
    closeModal
);


// Delete clicks

expenseList.addEventListener(
    "click",
    function(event) {
        if (
            !event.target.classList.contains(
                "delete-button"
            )
        ) {
            return;
        }

        const id =
            Number(event.target.dataset.id);

        deleteExpense(id);
    }
);


// Goal clicks

goalList.addEventListener(
    "click",
    function(event) {
        if (
            !event.target.classList.contains(
                "save-button"
            )
        ) {
            return;
        }

        const id =
            Number(event.target.dataset.id);

        addSavings(id);
    }
);


// Format input

balanceAmount.addEventListener(
    "input",
    () => {
        balanceAmount.value =
            formatRupiah(balanceAmount.value);
    }
);

expenseAmount.addEventListener(
    "input",
    () => {
        expenseAmount.value =
            formatRupiah(expenseAmount.value);
    }
);

limitAmount.addEventListener(
    "input",
    () => {
        limitAmount.value =
            formatRupiah(limitAmount.value);
    }
);

goalTarget.addEventListener(
    "input",
    () => {
        goalTarget.value =
            formatRupiah(goalTarget.value);
    }
);


// Enter key

expenseName.addEventListener(
    "keydown",
    function(event) {
        if (event.key === "Enter") {
            expenseAmount.focus();
        }
    }
);

expenseAmount.addEventListener(
    "keydown",
    function(event) {
        if (event.key === "Enter") {
            expenseCategory.focus();
        }
    }
);

expenseCategory.addEventListener(
    "keydown",
    function(event) {
        if (event.key === "Enter") {
            confirmModalButton.click();
        }
    }
);

balanceAmount.addEventListener(
    "keydown",
    function(event) {
        if (event.key === "Enter") {
            confirmModalButton.click();
        }
    }
);

limitAmount.addEventListener(
    "keydown",
    function(event) {
        if (event.key === "Enter") {
            confirmModalButton.click();
        }
    }
);

goalName.addEventListener(
    "keydown",
    function(event) {
        if (event.key === "Enter") {
            goalTarget.focus();
        }
    }
);

goalTarget.addEventListener(
    "keydown",
    function(event) {
        if (event.key === "Enter") {
            confirmModalButton.click();
        }
    }
);


// Load data

updateBalance();
updateDailyLimit();
displayExpenses();
updateInsights();
displayGoals();
updateSummary();