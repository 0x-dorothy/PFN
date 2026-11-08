import { Notice, Plugin, WorkspaceLeaf } from "obsidian";

import { DEFAULT_SETTINGS, type Settings, type Transaction } from "./model/types";
import { Ledger } from "./store/ledger";
import { DashboardView, VIEW_TYPE_PFN } from "./ui/DashboardView";
import { PfnSettingTab } from "./ui/SettingsTab";
import { TransactionModal, localMonth } from "./ui/TransactionModal";

export default class PfnPlugin extends Plugin {
  settings: Settings = DEFAULT_SETTINGS;
  ledger!: Ledger;
  /** Месяц, который показывают обзор и операции: YYYY-MM. */
  activeMonth = localMonth();
  /** Активная вкладка — запоминается между открытиями панели. */
  activeTab: "overview" | "transactions" | "budgets" | "goals" | "assets" = "overview";

  private refreshTimer: number | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.ledger = new Ledger(this.app, this.settings);
    await this.ledger.ensureStructure();

    this.registerView(VIEW_TYPE_PFN, (leaf) => new DashboardView(leaf, this));

    this.addRibbonIcon("wallet", "PFN: финансы", () => void this.activateView());

    this.addCommand({
      id: "open-dashboard",
      name: "Открыть дашборд",
      callback: () => void this.activateView(),
    });

    this.addCommand({
      id: "add-transaction",
      name: "Добавить операцию",
      callback: () => void this.openTransaction(),
    });

    this.addCommand({
      id: "open-accounts",
      name: "Открыть счета",
      callback: () => void this.openNote("accounts.md"),
    });

    this.addSettingTab(new PfnSettingTab(this.app, this));

    // Любое изменение в vault может затронуть цифры: правка заметки руками,
    // синхронизация с телефона, другой плагин. Пересчитываем с задержкой,
    // чтобы серия событий не вызывала десяток перерисовок.
    this.registerEvent(this.app.vault.on("modify", () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on("create", () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on("delete", () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on("rename", () => this.scheduleRefresh()));
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_PFN);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.ledger = new Ledger(this.app, this.settings);
    await this.ledger.ensureStructure();
    await this.refresh();
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh();
    }, 300);
  }

  async refresh(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_PFN)) {
      const view = leaf.view;
      if (view instanceof DashboardView) await view.refresh();
    }
  }

  async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_PFN);
    if (existing.length > 0) {
      await this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf: WorkspaceLeaf | null = this.app.workspace.getLeaf("tab");
    if (!leaf) {
      new Notice("PFN: не удалось открыть вкладку");
      return;
    }
    await leaf.setViewState({ type: VIEW_TYPE_PFN, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  /** Открыть заметку с данными (счета, категории, бюджеты…) в редакторе. */
  async openNote(file: string): Promise<void> {
    const path = `${this.settings.folder.replace(/\/$/, "")}/${file}`;
    const entry = this.app.vault.getAbstractFileByPath(path);
    if (!entry) {
      new Notice(`PFN: заметка ${file} не найдена`);
      return;
    }
    // Открываем в текущей вкладке — так пользователь сразу видит структуру.
    await this.app.workspace.getLeaf(false).openFile(entry as never);
  }

  async openTransaction(existing?: Transaction): Promise<void> {
    const snapshot = await this.ledger.load();
    if (snapshot.accounts.length === 0) {
      new Notice("PFN: сначала создайте счёт в accounts.md");
      return;
    }
    new TransactionModal(this.app, this, snapshot, existing).open();
  }

  /**
   * Правка операции, у которой мог смениться месяц: старую запись надо убрать
   * из прежнего файла, иначе она останется и там, и там.
   */
  async updateTransaction(previous: Transaction, next: Transaction): Promise<void> {
    const sameMonth = previous.date.slice(0, 7) === next.date.slice(0, 7);
    if (sameMonth) {
      await this.ledger.updateTransaction(next);
      return;
    }
    await this.ledger.deleteTransaction(previous);
    await this.ledger.addTransaction(next);
  }
}
