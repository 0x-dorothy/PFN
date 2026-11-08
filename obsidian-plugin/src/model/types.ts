/**
 * Доменная модель PFN: те же сущности, что в настольном приложении, но
 * приспособленные к жизни в markdown-заметках.
 *
 * Деньги везде хранятся в целых «копейках» (минорных единицах): сложение и
 * сравнение в числах с плавающей точкой рано или поздно даёт 0.30000000000004
 * в отчёте, и объяснять это пользователю нечем.
 */

export type AccountType = "checking" | "savings" | "cash" | "credit" | "investment";
export type CategoryKind = "expense" | "income";
export type TransactionType = "income" | "expense" | "transfer";
export type AssetClass = "investments" | "crypto" | "real_estate" | "vehicles" | "precious_metals" | "other";
export type CapitalRole = "income" | "neutral" | "drain";
export type RiskLevel = "low" | "medium" | "high";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  /** Стартовый остаток на момент начала учёта, в копейках. */
  opening: number;
  color?: string;
  archived?: boolean;
}

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  /** id родительской категории — один уровень вложенности, как в PFN. */
  parent?: string;
  color?: string;
}

export interface Split {
  category: string;
  amount: number;
}

export interface Transaction {
  id: string;
  /** ISO-дата: 2026-11-05. */
  date: string;
  type: TransactionType;
  /** Сумма в копейках, всегда положительная: знак определяется типом. */
  amount: number;
  account: string;
  /** Для переводов — счёт-получатель. */
  transferTo?: string;
  category?: string;
  description: string;
  tags?: string[];
  notes?: string;
  /** Если покупка разнесена по нескольким категориям. */
  splits?: Split[];
}

export interface Budget {
  category: string;
  /** Месячный лимит в копейках. */
  limit: number;
}

export interface Goal {
  id: string;
  name: string;
  /** Цель в копейках. */
  target: number;
  due?: string;
  contributions: GoalContribution[];
}

export interface GoalContribution {
  date: string;
  amount: number;
  note?: string;
}

export interface Asset {
  id: string;
  name: string;
  assetClass: AssetClass;
  capitalRole: CapitalRole;
  risk: RiskLevel;
  /** Текущая стоимость в копейках (последняя оценка). */
  value: number;
  /** Дата последней оценки: 2026-11-01. */
  asOf: string;
  currency: string;
  monthlyCashFlow?: number;
  notes?: string;
  valuations: AssetValuation[];
}

export interface AssetValuation {
  date: string;
  value: number;
}

export interface Settings {
  /** Куда складывать заметки, относительно корня vault. */
  folder: string;
  currency: string;
  /** Первый день недели не нужен, но локаль подписи дат — да. */
  locale: string;
}

export const DEFAULT_SETTINGS: Settings = {
  folder: "Finance",
  currency: "RUB",
  locale: "ru-RU",
};

/** Пути внутри папки плагина. */
export const FILES = {
  accounts: "accounts.md",
  categories: "categories.md",
  budgets: "budgets.md",
  goals: "goals.md",
  assets: "assets.md",
  ledgerDir: "ledger",
} as const;

export function accountLedgerFile(month: string): string {
  // month = "2026-11"
  return `${FILES.ledgerDir}/${month}.md`;
}
