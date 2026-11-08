/**
 * Разбор и запись markdown-заметок PFN.
 *
 * Формат один для всех сущностей: markdown-список, где каждая строка — запись,
 * а её свойства записаны inline-полями `[ключ:: значение]`. Такой вид читаем
 * человеком, правится руками и **напрямую виден Dataview** — плагин не нужен,
 * чтобы построить отчёт вроде «траты по категориям за месяц».
 *
 * Функции здесь чистые (текст → данные и обратно), без обращения к Obsidian:
 * именно поэтому их можно покрыть обычными юнит-тестами.
 */
import { centsToString, parseAmount } from "../model/money";
import type {
  Account,
  AccountType,
  Asset,
  AssetClass,
  AssetValuation,
  Budget,
  CapitalRole,
  Category,
  CategoryKind,
  Goal,
  GoalContribution,
  RiskLevel,
  Split,
  Transaction,
  TransactionType,
} from "../model/types";

/** `[key:: value]` — значение до закрывающей скобки, без вложенных скобок. */
const FIELD_RE = /\[([a-zA-Z][\w-]*)::\s*([^[\]]*)\]/g;

export interface ListItem {
  indent: number;
  fields: Record<string, string>;
  /** Текст строки без служебных полей. */
  text: string;
  children: ListItem[];
}

export function parseFields(line: string): { fields: Record<string, string>; text: string } {
  const fields: Record<string, string> = {};
  for (const match of line.matchAll(FIELD_RE)) {
    fields[match[1].toLowerCase()] = match[2].trim();
  }
  const text = line.replace(FIELD_RE, " ").replace(/\s{2,}/g, " ").trim();
  return { fields, text };
}

/**
 * Плоский список с отступами → дерево. Вложенность используется там, где у
 * записи есть дочерние: разбивка покупки по категориям, взносы в цель,
 * история оценок актива.
 */
export function parseList(md: string): ListItem[] {
  const roots: ListItem[] = [];
  const stack: ListItem[] = [];

  for (const rawLine of md.split(/\r?\n/)) {
    const match = /^([ \t]*)[-*]\s+(.*)$/.exec(rawLine);
    if (!match) continue;
    const indent = match[1].replace(/\t/g, "  ").length;
    const { fields, text } = parseFields(match[2]);
    const item: ListItem = { indent, fields, text, children: [] };

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
    if (stack.length === 0) roots.push(item);
    else stack[stack.length - 1].children.push(item);
    stack.push(item);
  }
  return roots;
}

function escapeText(value: string): string {
  // Квадратные скобки в описании сломали бы разбор полей.
  return value.replace(/\[/g, "(").replace(/\]/g, ")").replace(/\s+/g, " ").trim();
}

function renderFields(fields: Array<[string, string | number | undefined]>): string {
  return fields
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `[${key}:: ${value}]`)
    .join(" ");
}

function renderItem(indent: number, line: string): string {
  return `${"  ".repeat(indent)}- ${line}`;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 7);
}

// --- счета -----------------------------------------------------------------

export function parseAccounts(md: string): Account[] {
  return parseList(md)
    .filter((item) => item.fields.id)
    .map((item) => ({
      id: item.fields.id,
      name: item.fields.name || item.fields.id,
      type: (item.fields.type as AccountType) || "checking",
      currency: item.fields.currency || "RUB",
      opening: parseAmount(item.fields.opening ?? "0"),
      color: item.fields.color || undefined,
      archived: item.fields.archived === "true" || undefined,
    }));
}

export function renderAccounts(accounts: Account[]): string {
  const lines = [
    "---",
    "type: pfn-accounts",
    "---",
    "",
    "Счета PFN. Идентификатор (`id`) латиницей — он попадает в транзакции.",
    "",
  ];
  for (const account of accounts) {
    lines.push(
      renderItem(
        0,
        renderFields([
          ["id", account.id],
          ["name", escapeText(account.name)],
          ["type", account.type],
          ["currency", account.currency],
          ["opening", centsToString(account.opening)],
          ["color", account.color],
          ["archived", account.archived ? "true" : undefined],
        ]),
      ),
    );
  }
  return lines.join("\n") + "\n";
}

// --- категории -------------------------------------------------------------

export function parseCategories(md: string): Category[] {
  return parseList(md)
    .filter((item) => item.fields.id)
    .map((item) => ({
      id: item.fields.id,
      name: item.fields.name || item.fields.id,
      kind: (item.fields.kind as CategoryKind) || "expense",
      parent: item.fields.parent || undefined,
      color: item.fields.color || undefined,
    }));
}

export function renderCategories(categories: Category[]): string {
  const lines = [
    "---",
    "type: pfn-categories",
    "---",
    "",
    "Категории PFN. `parent` — идентификатор родительской категории (один уровень).",
    "",
  ];
  for (const category of categories) {
    lines.push(
      renderItem(
        0,
        renderFields([
          ["id", category.id],
          ["name", escapeText(category.name)],
          ["kind", category.kind],
          ["parent", category.parent],
          ["color", category.color],
        ]),
      ),
    );
  }
  return lines.join("\n") + "\n";
}

// --- транзакции ------------------------------------------------------------

export function parseLedger(md: string): Transaction[] {
  const result: Transaction[] = [];

  for (const item of parseList(md)) {
    const f = item.fields;
    if (!f.amount) continue;

    const splits: Split[] = item.children
      .filter((child) => child.fields.category)
      .map((child) => ({ category: child.fields.category, amount: parseAmount(child.fields.amount ?? "0") }));

    result.push({
      id: f.id || newId(),
      date: f.date || "",
      type: (f.type as TransactionType) || "expense",
      amount: parseAmount(f.amount),
      account: f.account || "",
      transferTo: f.transferto || undefined,
      category: f.category || undefined,
      description: item.text,
      tags: f.tags ? f.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : undefined,
      notes: f.notes || undefined,
      splits: splits.length > 0 ? splits : undefined,
    });
  }
  return result;
}

export function renderLedger(transactions: Transaction[], title: string): string {
  const lines = ["---", "type: pfn-ledger", `month: ${title}`, "---", "", `# ${title}`, ""];
  const sorted = [...transactions].sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
  if (sorted.length === 0) lines.push("_Пока пусто._", "");

  for (const tx of sorted) {
    const head = renderFields([
      ["id", tx.id],
      ["date", tx.date],
      ["type", tx.type],
      ["amount", centsToString(tx.amount)],
      ["account", tx.account],
      ["transferto", tx.transferTo],
      ["category", tx.splits ? undefined : tx.category],
      ["tags", tx.tags?.join(", ")],
      ["notes", tx.notes ? escapeText(tx.notes) : undefined],
    ]);
    lines.push(renderItem(0, `${head} ${escapeText(tx.description)}`.trim()));

    for (const split of tx.splits ?? []) {
      lines.push(
        renderItem(1, renderFields([["category", split.category], ["amount", centsToString(split.amount)]])),
      );
    }
  }
  return lines.join("\n") + "\n";
}

// --- бюджеты ---------------------------------------------------------------

export function parseBudgets(md: string): Budget[] {
  return parseList(md)
    .filter((item) => item.fields.category && item.fields.limit)
    .map((item) => ({ category: item.fields.category, limit: parseAmount(item.fields.limit) }));
}

export function renderBudgets(budgets: Budget[]): string {
  const lines = ["---", "type: pfn-budgets", "---", "", "Месячные лимиты по категориям.", ""];
  for (const budget of budgets) {
    lines.push(renderItem(0, renderFields([["category", budget.category], ["limit", centsToString(budget.limit)]])));
  }
  return lines.join("\n") + "\n";
}

// --- цели ------------------------------------------------------------------

export function parseGoals(md: string): Goal[] {
  return parseList(md)
    .filter((item) => item.fields.id)
    .map((item) => {
      const contributions: GoalContribution[] = item.children
        .filter((child) => child.fields.amount)
        .map((child) => ({
          date: child.fields.date || "",
          amount: parseAmount(child.fields.amount),
          note: child.text || undefined,
        }));
      return {
        id: item.fields.id,
        name: item.fields.name || item.fields.id,
        target: parseAmount(item.fields.target ?? "0"),
        due: item.fields.due || undefined,
        contributions,
      };
    });
}

export function renderGoals(goals: Goal[]): string {
  const lines = ["---", "type: pfn-goals", "---", "", "Цели и взносы в них.", ""];
  for (const goal of goals) {
    lines.push(
      renderItem(
        0,
        renderFields([
          ["id", goal.id],
          ["name", escapeText(goal.name)],
          ["target", centsToString(goal.target)],
          ["due", goal.due],
        ]),
      ),
    );
    for (const contribution of goal.contributions) {
      lines.push(
        renderItem(
          1,
          `${renderFields([
            ["date", contribution.date],
            ["amount", centsToString(contribution.amount)],
          ])} ${escapeText(contribution.note ?? "")}`.trim(),
        ),
      );
    }
  }
  return lines.join("\n") + "\n";
}

// --- активы ----------------------------------------------------------------

export function parseAssets(md: string): Asset[] {
  return parseList(md)
    .filter((item) => item.fields.id)
    .map((item) => {
      const valuations: AssetValuation[] = item.children
        .filter((child) => child.fields.value)
        .map((child) => ({ date: child.fields.date || "", value: parseAmount(child.fields.value) }));
      return {
        id: item.fields.id,
        name: item.fields.name || item.fields.id,
        assetClass: (item.fields.class as AssetClass) || "other",
        capitalRole: (item.fields.role as CapitalRole) || "neutral",
        risk: (item.fields.risk as RiskLevel) || "medium",
        value: parseAmount(item.fields.value ?? "0"),
        asOf: item.fields.asof || "",
        currency: item.fields.currency || "RUB",
        monthlyCashFlow: item.fields.cashflow ? parseAmount(item.fields.cashflow) : undefined,
        notes: item.fields.notes || undefined,
        valuations,
      };
    });
}

export function renderAssets(assets: Asset[]): string {
  const lines = ["---", "type: pfn-assets", "---", "", "Активы и история оценок.", ""];
  for (const asset of assets) {
    lines.push(
      renderItem(
        0,
        renderFields([
          ["id", asset.id],
          ["name", escapeText(asset.name)],
          ["class", asset.assetClass],
          ["role", asset.capitalRole],
          ["risk", asset.risk],
          ["value", centsToString(asset.value)],
          ["asof", asset.asOf],
          ["currency", asset.currency],
          ["cashflow", asset.monthlyCashFlow !== undefined ? centsToString(asset.monthlyCashFlow) : undefined],
        ]),
      ),
    );
    for (const valuation of asset.valuations) {
      lines.push(
        renderItem(
          1,
          renderFields([
            ["date", valuation.date],
            ["value", centsToString(valuation.value)],
          ]),
        ),
      );
    }
  }
  return lines.join("\n") + "\n";
}
