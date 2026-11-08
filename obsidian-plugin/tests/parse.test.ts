import { describe, expect, it } from "vitest";

import { centsToString, formatMoney, parseAmount } from "../src/model/money";
import {
  parseAccounts,
  parseAssets,
  parseBudgets,
  parseGoals,
  parseLedger,
  renderAccounts,
  renderAssets,
  renderBudgets,
  renderGoals,
  renderLedger,
} from "../src/store/parse";
import type { Account, Asset, Transaction } from "../src/model/types";

describe("деньги", () => {
  it("разбирает разные способы записи суммы", () => {
    expect(parseAmount("12.34")).toBe(1234);
    expect(parseAmount("12,34")).toBe(1234);
    expect(parseAmount("1 234,56")).toBe(123456);
    expect(parseAmount("1\u00a0234,56")).toBe(123456);
    expect(parseAmount("1290 ₽")).toBe(129000);
    expect(parseAmount("")).toBe(0);
    expect(parseAmount("abc")).toBe(0);
  });

  it("округляет до копейки, а не отбрасывает", () => {
    expect(parseAmount("0.005")).toBe(1);
    expect(parseAmount("0.004")).toBe(0);
  });

  it("пишет сумму без разделителей тысяч", () => {
    expect(centsToString(123456)).toBe("1234.56");
    expect(centsToString(5)).toBe("0.05");
    expect(centsToString(-100)).toBe("-1.00");
  });

  it("форматирует для интерфейса", () => {
    expect(formatMoney(123456, "RUB", "ru-RU")).toContain("1");
    expect(formatMoney(123456, "RUB", "ru-RU")).toMatch(/₽|руб/);
  });
});

const tx: Transaction = {
  id: "abc12",
  date: "2026-11-05",
  type: "expense",
  amount: 1234,
  account: "main",
  category: "groceries",
  description: "Пятёрочка [акция]",
  tags: ["еда", "будни"],
};

describe("транзакции", () => {
  it("переживают запись и чтение без потерь", () => {
    const md = renderLedger([tx], "Ноябрь 2026");
    const [parsed] = parseLedger(md);

    expect(parsed.id).toBe("abc12");
    expect(parsed.date).toBe("2026-11-05");
    expect(parsed.amount).toBe(1234);
    expect(parsed.account).toBe("main");
    expect(parsed.category).toBe("groceries");
    expect(parsed.tags).toEqual(["еда", "будни"]);
    // Квадратные скобки в описании не ломают разбор полей.
    expect(parsed.description).toBe("Пятёрочка (акция)");
  });

  it("сохраняют перевод с получателем", () => {
    const transfer: Transaction = {
      id: "trf01",
      date: "2026-11-06",
      type: "transfer",
      amount: 50000,
      account: "main",
      transferTo: "savings",
      description: "На накопления",
    };
    const [parsed] = parseLedger(renderLedger([transfer], "Ноябрь 2026"));
    expect(parsed.transferTo).toBe("savings");
    expect(parsed.type).toBe("transfer");
  });

  it("сохраняют разбивку покупки по категориям", () => {
    const split: Transaction = {
      id: "spl01",
      date: "2026-11-07",
      type: "expense",
      amount: 4210,
      account: "card",
      description: "Ашан",
      splits: [
        { category: "groceries", amount: 2000 },
        { category: "dining", amount: 2210 },
      ],
    };
    const [parsed] = parseLedger(renderLedger([split], "Ноябрь 2026"));
    expect(parsed.splits).toEqual([
      { category: "groceries", amount: 2000 },
      { category: "dining", amount: 2210 },
    ]);
    expect(parsed.category).toBeUndefined();
  });

  it("сортируют записи по дате", () => {
    const later: Transaction = { ...tx, id: "b", date: "2026-11-20" };
    const earlier: Transaction = { ...tx, id: "a", date: "2026-11-02" };
    const parsed = parseLedger(renderLedger([later, earlier], "Ноябрь 2026"));
    expect(parsed.map((item) => item.date)).toEqual(["2026-11-02", "2026-11-20"]);
  });
});

describe("справочники", () => {
  it("счета читаются после записи", () => {
    const accounts: Account[] = [
      { id: "main", name: "Основной", type: "checking", currency: "RUB", opening: 100000 },
      { id: "card", name: "Карта", type: "credit", currency: "RUB", opening: -50000, archived: true },
    ];
    const parsed = parseAccounts(renderAccounts(accounts));
    expect(parsed).toHaveLength(2);
    expect(parsed[0].opening).toBe(100000);
    expect(parsed[1].archived).toBe(true);
  });

  it("бюджеты читаются после записи", () => {
    const parsed = parseBudgets(renderBudgets([{ category: "groceries", limit: 3000000 }]));
    expect(parsed).toEqual([{ category: "groceries", limit: 3000000 }]);
  });

  it("цели сохраняют взносы", () => {
    const parsed = parseGoals(
      renderGoals([
        {
          id: "trip",
          name: "Отпуск",
          target: 15000000,
          due: "2027-06-01",
          contributions: [{ date: "2026-05-01", amount: 2000000, note: "первый взнос" }],
        },
      ]),
    );
    expect(parsed[0].target).toBe(15000000);
    expect(parsed[0].contributions).toEqual([{ date: "2026-05-01", amount: 2000000, note: "первый взнос" }]);
  });

  it("активы сохраняют историю оценок", () => {
    const asset: Asset = {
      id: "flat",
      name: "Квартира",
      assetClass: "real_estate",
      capitalRole: "neutral",
      risk: "low",
      value: 800000000,
      asOf: "2026-11-01",
      currency: "RUB",
      valuations: [{ date: "2026-01-01", value: 750000000 }],
    };
    const [parsed] = parseAssets(renderAssets([asset]));
    expect(parsed.value).toBe(800000000);
    expect(parsed.assetClass).toBe("real_estate");
    expect(parsed.valuations).toEqual([{ date: "2026-01-01", value: 750000000 }]);
  });
});
