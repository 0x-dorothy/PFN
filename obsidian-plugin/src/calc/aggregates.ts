/**
 * Агрегаты: те же числа, что считает настольный PFN, но по данным из vault.
 *
 * Чистые функции — вход только данные, выход только числа. Так их можно
 * проверить тестами без Obsidian и переиспользовать в любом представлении.
 */
import { percent, sum } from "../model/money";
import type { Account, Asset, Budget, Category, Goal, Transaction } from "../model/types";

export interface CategoryTotal {
  category: string;
  name: string;
  color?: string;
  amount: number;
  share: number;
}

export interface Dashboard {
  income: number;
  expense: number;
  net: number;
  /** Доля дохода, оставшаяся после расходов, в процентах. */
  savingsRate: number;
  transferredOut: number;
  byCategory: CategoryTotal[];
}

export interface AccountBalance {
  account: Account;
  balance: number;
}

export interface BudgetStatus {
  budget: Budget;
  name: string;
  spent: number;
  remaining: number;
  percentUsed: number;
  over: boolean;
}

export interface GoalProgress {
  goal: Goal;
  saved: number;
  remaining: number;
  percent: number;
  done: boolean;
}

export interface NetWorth {
  cash: number;
  assets: number;
  total: number;
  byClass: Array<{ assetClass: string; value: number; share: number }>;
  byRisk: Array<{ risk: string; value: number; share: number }>;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function inMonth(transactions: Transaction[], month: string): Transaction[] {
  return transactions.filter((tx) => monthOf(tx.date) === month);
}

/**
 * Баланс счёта: стартовый остаток плюс всё, что прошло по счёту.
 * Перевод — это расход для источника и доход для получателя.
 */
export function accountBalance(account: Account, transactions: Transaction[]): number {
  let balance = account.opening;
  for (const tx of transactions) {
    if (tx.account === account.id) {
      if (tx.type === "income") balance += tx.amount;
      else balance -= tx.amount; // expense и transfer наружу
    }
    if (tx.type === "transfer" && tx.transferTo === account.id) {
      balance += tx.amount;
    }
  }
  return balance;
}

export function balances(accounts: Account[], transactions: Transaction[]): AccountBalance[] {
  return accounts
    .filter((account) => !account.archived)
    .map((account) => ({ account, balance: accountBalance(account, transactions) }));
}

/** Разбивка суммы транзакции по категориям с учётом split-записей. */
function categoryShares(tx: Transaction): Array<{ category: string; amount: number }> {
  if (tx.splits && tx.splits.length > 0) return tx.splits;
  if (tx.category) return [{ category: tx.category, amount: tx.amount }];
  return [];
}

export function dashboard(
  transactions: Transaction[],
  categories: Category[],
  month: string,
): Dashboard {
  const monthly = inMonth(transactions, month);
  const byId = new Map(categories.map((category) => [category.id, category]));

  const income = sum(monthly.filter((tx) => tx.type === "income").map((tx) => tx.amount));
  const expense = sum(monthly.filter((tx) => tx.type === "expense").map((tx) => tx.amount));
  const transferredOut = sum(monthly.filter((tx) => tx.type === "transfer").map((tx) => tx.amount));

  const totals = new Map<string, number>();
  for (const tx of monthly) {
    if (tx.type !== "expense") continue;
    for (const share of categoryShares(tx)) {
      totals.set(share.category, (totals.get(share.category) ?? 0) + share.amount);
    }
  }

  const byCategory: CategoryTotal[] = [...totals.entries()]
    .map(([categoryId, amount]) => {
      const category = byId.get(categoryId);
      return {
        category: categoryId,
        name: category?.name ?? categoryId,
        color: category?.color,
        amount,
        share: percent(amount, expense),
      };
    })
    .sort((a, b) => b.amount - a.amount);

  return {
    income,
    expense,
    net: income - expense,
    savingsRate: percent(income - expense, income),
    transferredOut,
    byCategory,
  };
}

export function budgetStatus(
  budgets: Budget[],
  transactions: Transaction[],
  categories: Category[],
  month: string,
): BudgetStatus[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const spentByCategory = new Map<string, number>();

  for (const tx of inMonth(transactions, month)) {
    if (tx.type !== "expense") continue;
    for (const share of categoryShares(tx)) {
      spentByCategory.set(share.category, (spentByCategory.get(share.category) ?? 0) + share.amount);
    }
  }

  return budgets.map((budget) => {
    const spent = spentByCategory.get(budget.category) ?? 0;
    return {
      budget,
      name: byId.get(budget.category)?.name ?? budget.category,
      spent,
      remaining: budget.limit - spent,
      percentUsed: percent(spent, budget.limit),
      over: spent > budget.limit,
    };
  });
}

export function goalProgress(goal: Goal): GoalProgress {
  const saved = sum(goal.contributions.map((contribution) => contribution.amount));
  return {
    goal,
    saved,
    remaining: Math.max(goal.target - saved, 0),
    percent: percent(saved, goal.target),
    done: saved >= goal.target,
  };
}

export function netWorth(accounts: Account[], transactions: Transaction[], assets: Asset[]): NetWorth {
  const cash = sum(balances(accounts, transactions).map((row) => row.balance));
  const assetsValue = sum(assets.map((asset) => asset.value));
  const total = cash + assetsValue;

  const byClassMap = new Map<string, number>();
  for (const asset of assets) {
    byClassMap.set(asset.assetClass, (byClassMap.get(asset.assetClass) ?? 0) + asset.value);
  }
  const byRiskMap = new Map<string, number>();
  for (const asset of assets) {
    byRiskMap.set(asset.risk, (byRiskMap.get(asset.risk) ?? 0) + asset.value);
  }

  return {
    cash,
    assets: assetsValue,
    total,
    byClass: [...byClassMap.entries()]
      .map(([assetClass, value]) => ({ assetClass, value, share: percent(value, total) }))
      .sort((a, b) => b.value - a.value),
    byRisk: [...byRiskMap.entries()]
      .map(([risk, value]) => ({ risk, value, share: percent(value, total) }))
      .sort((a, b) => b.value - a.value),
  };
}

/** Последние N операций по всем месяцам — для блока «последние транзакции». */
export function recent(transactions: Transaction[], limit = 8): Transaction[] {
  return [...transactions]
    .sort((a, b) => (a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date)))
    .slice(0, limit);
}

/** Склонение месяца для заголовков: «Ноябрь 2026». */
export function monthTitle(month: string, locale = "ru-RU"): string {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthIndex - 1, 1));
  const label = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
