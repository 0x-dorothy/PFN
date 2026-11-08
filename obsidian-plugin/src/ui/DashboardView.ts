import { ItemView, type WorkspaceLeaf } from "obsidian";

import { budgetStatus, dashboard, goalProgress, monthTitle, netWorth, recent } from "../calc/aggregates";
import { formatMoney } from "../model/money";
import type PfnPlugin from "../main";
import type { Snapshot } from "../store/ledger";
import type { Transaction } from "../model/types";

export const VIEW_TYPE_PFN = "pfn-dashboard";

type Tab = "overview" | "transactions" | "budgets" | "goals" | "assets";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Обзор" },
  { id: "transactions", label: "Операции" },
  { id: "budgets", label: "Бюджеты" },
  { id: "goals", label: "Цели" },
  { id: "assets", label: "Активы" },
];

const MONTH_TABS: Tab[] = ["overview", "transactions", "budgets"];

const CLASS_LABELS: Record<string, string> = {
  investments: "Инвестиции",
  crypto: "Крипта",
  real_estate: "Недвижимость",
  vehicles: "Транспорт",
  precious_metals: "Металлы",
  other: "Прочее",
};

const RISK_LABELS: Record<string, string> = { low: "низкий", medium: "средний", high: "высокий" };

export class DashboardView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private plugin: PfnPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_PFN;
  }

  getDisplayText(): string {
    return "PFN — финансы";
  }

  getIcon(): string {
    return "wallet";
  }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("pfn");

    const snapshot = await this.plugin.ledger.load();

    if (MONTH_TABS.includes(this.plugin.activeTab)) this.renderHeader(contentEl);
    this.renderTabs(contentEl);

    switch (this.plugin.activeTab) {
      case "transactions":
        this.renderTransactions(contentEl, snapshot);
        break;
      case "budgets":
        this.renderBudgets(contentEl, snapshot);
        break;
      case "goals":
        this.renderGoals(contentEl, snapshot);
        break;
      case "assets":
        this.renderAssets(contentEl, snapshot);
        break;
      default:
        this.renderOverview(contentEl, snapshot);
    }
  }

  private money(cents: number): string {
    const { currency, locale } = this.plugin.settings;
    return formatMoney(cents, currency, locale);
  }

  private renderHeader(parent: HTMLElement): void {
    const header = parent.createDiv({ cls: "pfn-header" });

    const prev = header.createEl("button", { cls: "pfn-icon-button", text: "‹" });
    prev.addEventListener("click", () => this.shiftMonth(-1));

    header.createEl("h2", { text: monthTitle(this.plugin.activeMonth, this.plugin.settings.locale) });

    const next = header.createEl("button", { cls: "pfn-icon-button", text: "›" });
    next.addEventListener("click", () => this.shiftMonth(1));

    const now = header.createEl("button", { cls: "pfn-link", text: "текущий месяц" });
    now.addEventListener("click", () => {
      this.plugin.activeMonth = new Date().toISOString().slice(0, 7);
      void this.refresh();
    });
  }

  private renderTabs(parent: HTMLElement): void {
    const bar = parent.createDiv({ cls: "pfn-tabs" });
    for (const tab of TABS) {
      const button = bar.createEl("button", {
        cls: `pfn-tab${this.plugin.activeTab === tab.id ? " is-active" : ""}`,
        text: tab.label,
      });
      button.addEventListener("click", () => {
        this.plugin.activeTab = tab.id;
        void this.refresh();
      });
    }
  }

  private shiftMonth(delta: number): void {
    const [year, month] = this.plugin.activeMonth.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1 + delta, 1));
    this.plugin.activeMonth = date.toISOString().slice(0, 7);
    void this.refresh();
  }

  // --- обзор ---------------------------------------------------------------

  private renderOverview(parent: HTMLElement, snapshot: Snapshot): void {
    const stats = dashboard(snapshot.transactions, snapshot.categories, this.plugin.activeMonth);

    const cards = parent.createDiv({ cls: "pfn-cards" });
    this.card(cards, "Доход", this.money(stats.income), "pfn-positive");
    this.card(cards, "Расход", this.money(stats.expense), "pfn-negative");
    this.card(cards, "Баланс", this.money(stats.net), stats.net >= 0 ? "pfn-positive" : "pfn-negative");
    this.card(cards, "Норма сбережений", `${Math.round(stats.savingsRate)}%`, "");

    if (stats.byCategory.length > 0) {
      const section = parent.createDiv({ cls: "pfn-section" });
      section.createEl("h3", { text: "Расходы по категориям" });
      for (const row of stats.byCategory.slice(0, 10)) {
        this.barRow(section, row.name, this.money(row.amount), row.share, row.color);
      }
    }

    const worth = netWorth(snapshot.accounts, snapshot.transactions, snapshot.assets);
    const worthSection = parent.createDiv({ cls: "pfn-section" });
    worthSection.createEl("h3", { text: "Капитал" });
    const worthRow = worthSection.createDiv({ cls: "pfn-cards pfn-cards-sm" });
    this.card(worthRow, "Всего", this.money(worth.total), "");
    this.card(worthRow, "Деньги", this.money(worth.cash), "");
    this.card(worthRow, "Активы", this.money(worth.assets), "");

    const recentSection = parent.createDiv({ cls: "pfn-section" });
    const head = recentSection.createDiv({ cls: "pfn-section-head" });
    head.createEl("h3", { text: "Последние операции" });
    const all = head.createEl("button", { cls: "pfn-link", text: "все" });
    all.addEventListener("click", () => {
      this.plugin.activeTab = "transactions";
      void this.refresh();
    });

    const items = recent(snapshot.transactions, 8);
    if (items.length === 0) {
      recentSection.createEl("p", { cls: "pfn-empty", text: "Пока нет ни одной операции." });
    } else {
      const list = recentSection.createEl("ul", { cls: "pfn-list" });
      for (const tx of items) this.transactionRow(list, tx, snapshot);
    }

    const add = parent.createEl("button", { cls: "pfn-button", text: "Добавить операцию" });
    add.addEventListener("click", () => void this.plugin.openTransaction());
  }

  // --- операции ------------------------------------------------------------

  private renderTransactions(parent: HTMLElement, snapshot: Snapshot): void {
    const month = this.plugin.activeMonth;
    const items = snapshot.transactions
      .filter((tx) => tx.date.startsWith(month))
      .sort((a, b) => (a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date)));

    const head = parent.createDiv({ cls: "pfn-section-head" });
    head.createEl("h3", { text: `Операции · ${items.length}` });
    const add = head.createEl("button", { cls: "pfn-button pfn-button-sm", text: "+ Операция" });
    add.addEventListener("click", () => void this.plugin.openTransaction());

    if (items.length === 0) {
      parent.createEl("p", { cls: "pfn-empty", text: "В этом месяце операций нет." });
      return;
    }

    const list = parent.createEl("ul", { cls: "pfn-list" });
    for (const tx of items) this.transactionRow(list, tx, snapshot);
  }

  private transactionRow(parent: HTMLElement, tx: Transaction, snapshot: Snapshot): void {
    const item = parent.createEl("li", { cls: "pfn-row pfn-row-clickable" });
    const left = item.createDiv({ cls: "pfn-row-main" });
    left.createDiv({ cls: "pfn-row-title", text: tx.description || "Без описания" });

    const category = snapshot.categories.find((c) => c.id === tx.category);
    const account = snapshot.accounts.find((a) => a.id === tx.account);
    const parts = [tx.date.slice(5), category?.name, account?.name];
    if (tx.splits?.length) parts.push(`разбито на ${tx.splits.length}`);
    left.createDiv({ cls: "pfn-row-sub", text: parts.filter(Boolean).join(" · ") });

    const sign = tx.type === "income" ? "+" : tx.type === "transfer" ? "→" : "−";
    item.createDiv({
      cls: `pfn-row-amount ${tx.type === "income" ? "pfn-positive" : ""}`.trim(),
      text: `${sign}${this.money(tx.amount)}`,
    });

    item.addEventListener("click", () => void this.plugin.openTransaction(tx));
  }

  // --- бюджеты -------------------------------------------------------------

  private renderBudgets(parent: HTMLElement, snapshot: Snapshot): void {
    const rows = budgetStatus(snapshot.budgets, snapshot.transactions, snapshot.categories, this.plugin.activeMonth);

    const head = parent.createDiv({ cls: "pfn-section-head" });
    head.createEl("h3", { text: "Бюджеты на месяц" });
    const edit = head.createEl("button", { cls: "pfn-link", text: "изменить" });
    edit.addEventListener("click", () => void this.plugin.openNote("budgets.md"));

    if (rows.length === 0) {
      parent.createEl("p", {
        cls: "pfn-empty",
        text: "Лимитов нет. Добавьте строки в budgets.md — например: - [category:: groceries] [limit:: 30000]",
      });
      return;
    }

    for (const row of rows.sort((a, b) => b.percentUsed - a.percentUsed)) {
      const wrap = parent.createDiv({ cls: "pfn-bar-row" });
      const line = wrap.createDiv({ cls: "pfn-bar-head" });
      line.createSpan({ text: row.name });
      line.createSpan({
        cls: `pfn-bar-value ${row.over ? "pfn-negative" : ""}`.trim(),
        text: `${this.money(row.spent)} из ${this.money(row.budget.limit)}`,
      });
      const track = wrap.createDiv({ cls: "pfn-bar-track" });
      const fill = track.createDiv({ cls: "pfn-bar-fill" });
      fill.style.width = `${Math.max(2, Math.min(100, row.percentUsed))}%`;
      if (row.over) fill.addClass("pfn-bar-over");
      if (row.remaining >= 0) {
        wrap.createDiv({ cls: "pfn-row-sub", text: `осталось ${this.money(row.remaining)}` });
      } else {
        wrap.createDiv({ cls: "pfn-row-sub pfn-negative", text: `перерасход ${this.money(-row.remaining)}` });
      }
    }
  }

  // --- цели ----------------------------------------------------------------

  private renderGoals(parent: HTMLElement, snapshot: Snapshot): void {
    const head = parent.createDiv({ cls: "pfn-section-head" });
    head.createEl("h3", { text: "Цели" });
    const edit = head.createEl("button", { cls: "pfn-link", text: "изменить" });
    edit.addEventListener("click", () => void this.plugin.openNote("goals.md"));

    if (snapshot.goals.length === 0) {
      parent.createEl("p", {
        cls: "pfn-empty",
        text: "Целей нет. Добавьте в goals.md: - [id:: trip] [name:: Отпуск] [target:: 150000]",
      });
      return;
    }

    for (const goal of snapshot.goals) {
      const progress = goalProgress(goal);
      const card = parent.createDiv({ cls: "pfn-goal" });
      const top = card.createDiv({ cls: "pfn-bar-head" });
      top.createSpan({ text: goal.name });
      top.createSpan({ cls: "pfn-bar-value", text: `${Math.round(progress.percent)}%` });
      const track = card.createDiv({ cls: "pfn-bar-track" });
      const fill = track.createDiv({ cls: "pfn-bar-fill" });
      fill.style.width = `${Math.max(2, Math.min(100, progress.percent))}%`;
      card.createDiv({
        cls: "pfn-row-sub",
        text: `${this.money(progress.saved)} из ${this.money(goal.target)}${goal.due ? ` · до ${goal.due}` : ""}`,
      });
    }
  }

  // --- активы --------------------------------------------------------------

  private renderAssets(parent: HTMLElement, snapshot: Snapshot): void {
    const worth = netWorth(snapshot.accounts, snapshot.transactions, snapshot.assets);

    const cards = parent.createDiv({ cls: "pfn-cards pfn-cards-sm" });
    this.card(cards, "Капитал", this.money(worth.total), "");
    this.card(cards, "Деньги", this.money(worth.cash), "");
    this.card(cards, "Активы", this.money(worth.assets), "");

    if (worth.byClass.length > 0) {
      const section = parent.createDiv({ cls: "pfn-section" });
      section.createEl("h3", { text: "По классам" });
      for (const row of worth.byClass) {
        this.barRow(section, CLASS_LABELS[row.assetClass] ?? row.assetClass, this.money(row.value), row.share);
      }
    }

    const head = parent.createDiv({ cls: "pfn-section-head" });
    head.createEl("h3", { text: "Активы" });
    const edit = head.createEl("button", { cls: "pfn-link", text: "изменить" });
    edit.addEventListener("click", () => void this.plugin.openNote("assets.md"));

    if (snapshot.assets.length === 0) {
      parent.createEl("p", { cls: "pfn-empty", text: "Активов нет. Добавьте их в assets.md." });
      return;
    }

    const list = parent.createEl("ul", { cls: "pfn-list" });
    for (const asset of [...snapshot.assets].sort((a, b) => b.value - a.value)) {
      const item = list.createEl("li", { cls: "pfn-row" });
      const left = item.createDiv({ cls: "pfn-row-main" });
      left.createDiv({ cls: "pfn-row-title", text: asset.name });
      left.createDiv({
        cls: "pfn-row-sub",
        text: [
          CLASS_LABELS[asset.assetClass] ?? asset.assetClass,
          `риск: ${RISK_LABELS[asset.risk] ?? asset.risk}`,
          asset.asOf ? `оценка ${asset.asOf}` : undefined,
        ]
          .filter(Boolean)
          .join(" · "),
      });
      item.createDiv({ cls: "pfn-row-amount", text: this.money(asset.value) });
    }
  }

  // --- примитивы -----------------------------------------------------------

  private card(parent: HTMLElement, label: string, value: string, tone: string): void {
    const card = parent.createDiv({ cls: "pfn-card" });
    card.createDiv({ cls: "pfn-card-label", text: label });
    card.createDiv({ cls: `pfn-card-value ${tone}`.trim(), text: value });
  }

  private barRow(parent: HTMLElement, label: string, value: string, share: number, color?: string): void {
    const item = parent.createDiv({ cls: "pfn-bar-row" });
    const head = item.createDiv({ cls: "pfn-bar-head" });
    head.createSpan({ text: label });
    head.createSpan({ cls: "pfn-bar-value", text: `${value} · ${Math.round(share)}%` });
    const track = item.createDiv({ cls: "pfn-bar-track" });
    const fill = track.createDiv({ cls: "pfn-bar-fill" });
    fill.style.width = `${Math.max(2, Math.min(100, share))}%`;
    if (color) fill.style.background = color;
  }
}
