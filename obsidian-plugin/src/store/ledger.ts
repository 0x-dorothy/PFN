/**
 * Слой хранения: превращает заметки vault в доменные объекты и обратно.
 *
 * Все записи идут через `vault.process`, а не «прочитать → изменить →
 * записать»: Obsidian может изменить файл между этими шагами (синхронизация,
 * плагин форматирования), и такая запись затрёт чужие правки.
 */
import { App, TFolder, TFile, normalizePath } from "obsidian";

import {
  parseAccounts,
  parseAssets,
  parseBudgets,
  parseCategories,
  parseGoals,
  parseLedger,
  renderAccounts,
  renderAssets,
  renderBudgets,
  renderCategories,
  renderGoals,
  renderLedger,
} from "./parse";
import { monthTitle } from "../calc/aggregates";
import {
  FILES,
  accountLedgerFile,
  type Account,
  type Asset,
  type Budget,
  type Category,
  type Goal,
  type Settings,
  type Transaction,
} from "../model/types";

export interface Snapshot {
  accounts: Account[];
  categories: Category[];
  budgets: Budget[];
  goals: Goal[];
  assets: Asset[];
  transactions: Transaction[];
}

const DEFAULT_ACCOUNTS = renderAccounts([
  { id: "main", name: "Основной", type: "checking", currency: "RUB", opening: 0, color: "#2a72cc" },
]);

const DEFAULT_CATEGORIES = renderCategories([
  { id: "housing", name: "Жильё и коммуналка", kind: "expense", color: "#2a78d6" },
  { id: "groceries", name: "Продукты", kind: "expense", color: "#1baf7a" },
  { id: "dining", name: "Кафе и рестораны", kind: "expense", color: "#eb6834" },
  { id: "transport", name: "Транспорт", kind: "expense", color: "#4a3aa7" },
  { id: "health", name: "Здоровье", kind: "expense", color: "#e34948" },
  { id: "shopping", name: "Покупки", kind: "expense", color: "#eda100" },
  { id: "subscriptions", name: "Подписки", kind: "expense", color: "#008300" },
  { id: "salary", name: "Зарплата", kind: "income", color: "#2a78d6" },
  { id: "other-income", name: "Прочий доход", kind: "income", color: "#1baf7a" },
]);

export class Ledger {
  constructor(
    private app: App,
    private settings: Settings,
  ) {}

  get folder(): string {
    return normalizePath(this.settings.folder);
  }

  path(file: string): string {
    return normalizePath(`${this.folder}/${file}`);
  }

  async ensureStructure(): Promise<void> {
    await this.ensureFolder(this.folder);
    await this.ensureFolder(this.path(FILES.ledgerDir));
    await this.ensureFile(FILES.accounts, DEFAULT_ACCOUNTS);
    await this.ensureFile(FILES.categories, DEFAULT_CATEGORIES);
    await this.ensureFile(FILES.budgets, renderBudgets([]));
    await this.ensureFile(FILES.goals, renderGoals([]));
    await this.ensureFile(FILES.assets, renderAssets([]));
  }

  private async ensureFolder(path: string): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFolder) return;
    if (existing) return;
    await this.app.vault.createFolder(path).catch(() => undefined);
  }

  private async ensureFile(file: string, content: string): Promise<void> {
    const path = this.path(file);
    if (this.app.vault.getAbstractFileByPath(path)) return;
    await this.app.vault.create(path, content);
  }

  private async read(file: string): Promise<string> {
    const path = this.path(file);
    const entry = this.app.vault.getAbstractFileByPath(path);
    if (!(entry instanceof TFile)) return "";
    return this.app.vault.read(entry);
  }

  /** Атомарная правка файла: содержимое читается в момент записи. */
  private async update(file: string, mutate: (data: string) => string): Promise<void> {
    const path = this.path(file);
    await this.ensureFolder(this.folder);
    const entry = this.app.vault.getAbstractFileByPath(path);
    if (entry instanceof TFile) {
      await this.app.vault.process(entry, mutate);
      return;
    }
    await this.app.vault.create(path, mutate(""));
  }

  /** Все месячные файлы: ledger/YYYY-MM.md. */
  ledgerFiles(): TFile[] {
    const dir = this.path(FILES.ledgerDir);
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(`${dir}/`))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async load(): Promise<Snapshot> {
    await this.ensureStructure();

    const [accountsMd, categoriesMd, budgetsMd, goalsMd, assetsMd] = await Promise.all([
      this.read(FILES.accounts),
      this.read(FILES.categories),
      this.read(FILES.budgets),
      this.read(FILES.goals),
      this.read(FILES.assets),
    ]);

    const transactions: Transaction[] = [];
    for (const file of this.ledgerFiles()) {
      const content = await this.app.vault.read(file);
      transactions.push(...parseLedger(content));
    }

    return {
      accounts: parseAccounts(accountsMd),
      categories: parseCategories(categoriesMd),
      budgets: parseBudgets(budgetsMd),
      goals: parseGoals(goalsMd),
      assets: parseAssets(assetsMd),
      transactions,
    };
  }

  async addTransaction(tx: Transaction): Promise<void> {
    const month = tx.date.slice(0, 7);
    const file = accountLedgerFile(month);
    await this.update(file, (data) => {
      const existing = data ? parseLedger(data) : [];
      return renderLedger([...existing, tx], monthTitle(month, this.settings.locale));
    });
  }

  async updateTransaction(tx: Transaction): Promise<void> {
    const month = tx.date.slice(0, 7);
    const file = accountLedgerFile(month);
    await this.update(file, (data) => {
      const existing = parseLedger(data).filter((item) => item.id !== tx.id);
      return renderLedger([...existing, tx], monthTitle(month, this.settings.locale));
    });
  }

  async deleteTransaction(tx: Transaction): Promise<void> {
    const month = tx.date.slice(0, 7);
    const file = accountLedgerFile(month);
    await this.update(file, (data) => {
      const existing = parseLedger(data).filter((item) => item.id !== tx.id);
      return renderLedger(existing, monthTitle(month, this.settings.locale));
    });
  }

  async saveAccounts(accounts: Account[]): Promise<void> {
    await this.update(FILES.accounts, () => renderAccounts(accounts));
  }

  async saveCategories(categories: Category[]): Promise<void> {
    await this.update(FILES.categories, () => renderCategories(categories));
  }

  async saveBudgets(budgets: Budget[]): Promise<void> {
    await this.update(FILES.budgets, () => renderBudgets(budgets));
  }

  async saveGoals(goals: Goal[]): Promise<void> {
    await this.update(FILES.goals, () => renderGoals(goals));
  }

  async saveAssets(assets: Asset[]): Promise<void> {
    await this.update(FILES.assets, () => renderAssets(assets));
  }
}
