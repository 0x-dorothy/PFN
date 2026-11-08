import { describe, expect, it } from "vitest";

import {
  accountBalance,
  budgetStatus,
  dashboard,
  goalProgress,
  monthTitle,
  netWorth,
  recent,
} from "../src/calc/aggregates";
import type { Account, Asset, Budget, Category, Goal, Transaction } from "../src/model/types";

const accounts: Account[] = [
  { id: "main", name: "Основной", type: "checking", currency: "RUB", opening: 100000 },
  { id: "savings", name: "Накопления", type: "savings", currency: "RUB", opening: 0 },
];

const categories: Category[] = [
  { id: "groceries", name: "Продукты", kind: "expense" },
  { id: "dining", name: "Кафе", kind: "expense" },
  { id: "salary", name: "Зарплата", kind: "income" },
];

const tx = (patch: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2, 7),
  date: "2026-11-05",
  type: "expense",
  amount: 1000,
  account: "main",
  description: "операция",
  ...patch,
});

describe("баланс счёта", () => {
  it("учитывает стартовый остаток, расходы, доходы и переводы", () => {
    const transactions = [
      tx({ type: "income", amount: 500000 }),
      tx({ type: "expense", amount: 120000 }),
      tx({ type: "transfer", amount: 100000, transferTo: "savings" }),
    ];
    expect(accountBalance(accounts[0], transactions)).toBe(100000 + 500000 - 120000 - 100000);
    expect(accountBalance(accounts[1], transactions)).toBe(100000);
  });

  it("не путает чужие счета", () => {
    const transactions = [tx({ account: "savings", amount: 5000 })];
    expect(accountBalance(accounts[0], transactions)).toBe(100000);
    expect(accountBalance(accounts[1], transactions)).toBe(-5000);
  });
});

describe("дашборд", () => {
  const transactions = [
    tx({ type: "income", amount: 1000000, category: "salary", date: "2026-11-01" }),
    tx({ amount: 300000, category: "groceries", date: "2026-11-02" }),
    tx({ amount: 100000, category: "dining", date: "2026-11-03" }),
    tx({ amount: 999999, category: "groceries", date: "2026-10-15" }),
    tx({ type: "transfer", amount: 200000, date: "2026-11-04", transferTo: "savings" }),
  ];

  it("считает доход, расход, баланс и норму сбережений за месяц", () => {
    const result = dashboard(transactions, categories, "2026-11");
    expect(result.income).toBe(1000000);
    expect(result.expense).toBe(400000);
    expect(result.net).toBe(600000);
    expect(result.savingsRate).toBe(60);
    expect(result.transferredOut).toBe(200000);
  });

  it("не включает переводы в расходы", () => {
    const result = dashboard(transactions, categories, "2026-11");
    expect(result.byCategory.map((row) => row.category)).toEqual(["groceries", "dining"]);
  });

  it("складывает разбивку покупки по категориям", () => {
    const split = tx({
      amount: 4210,
      category: undefined,
      splits: [
        { category: "groceries", amount: 2000 },
        { category: "dining", amount: 2210 },
      ],
    });
    const result = dashboard([split], categories, "2026-11");
    expect(result.expense).toBe(4210);
    const groceries = result.byCategory.find((row) => row.category === "groceries");
    expect(groceries?.amount).toBe(2000);
  });
});

describe("бюджеты", () => {
  it("считают остаток и перерасход", () => {
    const budgets: Budget[] = [
      { category: "groceries", limit: 500000 },
      { category: "dining", limit: 50000 },
    ];
    const transactions = [tx({ amount: 300000, category: "groceries" }), tx({ amount: 80000, category: "dining" })];
    const [groceries, dining] = budgetStatus(budgets, transactions, categories, "2026-11");

    expect(groceries.spent).toBe(300000);
    expect(groceries.remaining).toBe(200000);
    expect(groceries.over).toBe(false);

    expect(dining.over).toBe(true);
    expect(dining.remaining).toBe(-30000);
  });
});

describe("цели", () => {
  it("складывают взносы и считают прогресс", () => {
    const goal: Goal = {
      id: "trip",
      name: "Отпуск",
      target: 1000000,
      contributions: [
        { date: "2026-01-01", amount: 250000 },
        { date: "2026-02-01", amount: 250000 },
      ],
    };
    const progress = goalProgress(goal);
    expect(progress.saved).toBe(500000);
    expect(progress.remaining).toBe(500000);
    expect(progress.percent).toBe(50);
    expect(progress.done).toBe(false);
  });
});

describe("капитал", () => {
  it("складывает деньги и активы", () => {
    const assets: Asset[] = [
      {
        id: "flat",
        name: "Квартира",
        assetClass: "real_estate",
        capitalRole: "neutral",
        risk: "low",
        value: 5000000,
        asOf: "2026-11-01",
        currency: "RUB",
        valuations: [],
      },
      {
        id: "stocks",
        name: "Брокерский",
        assetClass: "investments",
        capitalRole: "income",
        risk: "medium",
        value: 1000000,
        asOf: "2026-11-01",
        currency: "RUB",
        valuations: [],
      },
    ];
    const transactions = [tx({ type: "income", amount: 500000 })];
    const worth = netWorth(accounts, transactions, assets);

    expect(worth.cash).toBe(600000);
    expect(worth.assets).toBe(6000000);
    expect(worth.total).toBe(6600000);
    expect(worth.byClass[0].assetClass).toBe("real_estate");
  });
});

describe("вспомогательное", () => {
  it("сортирует последние операции по дате вниз", () => {
    const transactions = [
      tx({ date: "2026-11-01", description: "старая" }),
      tx({ date: "2026-11-20", description: "новая" }),
    ];
    expect(recent(transactions, 1)[0].description).toBe("новая");
  });

  it("пишет месяц по-русски с заглавной", () => {
    expect(monthTitle("2026-11", "ru-RU")).toBe("Ноябрь 2026 г.");
  });
});
