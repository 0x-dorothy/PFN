import { ItemView, type WorkspaceLeaf } from "obsidian";

import { dashboard, monthTitle, netWorth, recent } from "../calc/aggregates";
import { formatMoney } from "../model/money";
import type PfnPlugin from "../main";
import type { Transaction } from "../model/types";

export const VIEW_TYPE_PFN = "pfn-dashboard";

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
    const { settings } = this.plugin;
    const money = (cents: number) => formatMoney(cents, settings.currency, settings.locale);

    this.renderHeader(contentEl);

    const stats = dashboard(snapshot.transactions, snapshot.categories, this.plugin.activeMonth);

    const cards = contentEl.createDiv({ cls: "pfn-cards" });
    this.card(cards, "Доход", money(stats.income), "pfn-positive");
    this.card(cards, "Расход", money(stats.expense), "pfn-negative");
    this.card(cards, "Баланс", money(stats.net), stats.net >= 0 ? "pfn-positive" : "pfn-negative");
    this.card(cards, "Норма сбережений", `${Math.round(stats.savingsRate)}%`, "");

    if (stats.byCategory.length === 0) {
      contentEl.createEl("p", { cls: "pfn-empty", text: "За этот месяц расходов нет." });
    } else {
      const section = contentEl.createDiv({ cls: "pfn-section" });
      section.createEl("h3", { text: "Расходы по категориям" });
      for (const row of stats.byCategory.slice(0, 10)) {
        const item = section.createDiv({ cls: "pfn-bar-row" });
        const head = item.createDiv({ cls: "pfn-bar-head" });
        head.createSpan({ text: row.name });
        head.createSpan({ cls: "pfn-bar-value", text: `${money(row.amount)} · ${Math.round(row.share)}%` });
        const track = item.createDiv({ cls: "pfn-bar-track" });
        const fill = track.createDiv({ cls: "pfn-bar-fill" });
        fill.style.width = `${Math.max(2, Math.min(100, row.share))}%`;
        if (row.color) fill.style.background = row.color;
      }
    }

    const worth = netWorth(snapshot.accounts, snapshot.transactions, snapshot.assets);
    const worthSection = contentEl.createDiv({ cls: "pfn-section" });
    worthSection.createEl("h3", { text: "Капитал" });
    const worthRow = worthSection.createDiv({ cls: "pfn-cards pfn-cards-sm" });
    this.card(worthRow, "Всего", money(worth.total), "");
    this.card(worthRow, "Деньги", money(worth.cash), "");
    this.card(worthRow, "Активы", money(worth.assets), "");

    const recentList = contentEl.createDiv({ cls: "pfn-section" });
    recentList.createEl("h3", { text: "Последние операции" });
    const items = recent(snapshot.transactions, 8);
    if (items.length === 0) {
      recentList.createEl("p", { cls: "pfn-empty", text: "Пока нет ни одной операции." });
    } else {
      const list = recentList.createEl("ul", { cls: "pfn-list" });
      for (const tx of items) this.renderRow(list, tx, snapshot.categories, money);
    }

    const addButton = contentEl.createEl("button", { cls: "pfn-button", text: "Добавить транзакцию" });
    addButton.addEventListener("click", () => void this.plugin.openAddTransaction());
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

  private shiftMonth(delta: number): void {
    const [year, month] = this.plugin.activeMonth.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1 + delta, 1));
    this.plugin.activeMonth = date.toISOString().slice(0, 7);
    void this.refresh();
  }

  private card(parent: HTMLElement, label: string, value: string, tone: string): void {
    const card = parent.createDiv({ cls: "pfn-card" });
    card.createDiv({ cls: "pfn-card-label", text: label });
    card.createDiv({ cls: `pfn-card-value ${tone}`.trim(), text: value });
  }

  private renderRow(parent: HTMLElement, tx: Transaction, categories: Array<{ id: string; name: string }>, money: (cents: number) => string): void {
    const item = parent.createEl("li", { cls: "pfn-row" });
    const left = item.createDiv({ cls: "pfn-row-main" });
    left.createDiv({ cls: "pfn-row-title", text: tx.description || "Без описания" });
    const category = categories.find((c) => c.id === tx.category);
    left.createDiv({
      cls: "pfn-row-sub",
      text: [tx.date, category?.name, tx.account].filter(Boolean).join(" · "),
    });
    const sign = tx.type === "income" ? "+" : tx.type === "transfer" ? "→" : "−";
    item.createDiv({
      cls: `pfn-row-amount ${tx.type === "income" ? "pfn-positive" : ""}`.trim(),
      text: `${sign}${money(tx.amount)}`,
    });
  }
}
