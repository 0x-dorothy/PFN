import { Notice, Plugin, WorkspaceLeaf } from "obsidian";

import { DEFAULT_SETTINGS, type Settings } from "./model/types";
import { Ledger } from "./store/ledger";
import { AddTransactionModal } from "./ui/AddTransactionModal";
import { DashboardView, VIEW_TYPE_PFN } from "./ui/DashboardView";
import { PfnSettingTab } from "./ui/SettingsTab";

export default class PfnPlugin extends Plugin {
  settings: Settings = DEFAULT_SETTINGS;
  ledger!: Ledger;
  /** Месяц, который показывает дашборд: YYYY-MM. */
  activeMonth = new Date().toISOString().slice(0, 7);

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
      name: "Добавить транзакцию",
      callback: () => void this.openAddTransaction(),
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
    await this.refreshViews();
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.refreshViews();
    }, 300);
  }

  private async refreshViews(): Promise<void> {
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

  async openAddTransaction(): Promise<void> {
    const snapshot = await this.ledger.load();
    if (snapshot.accounts.length === 0) {
      new Notice("PFN: сначала создайте счёт в Finance/accounts.md");
      return;
    }
    new AddTransactionModal(this.app, this, snapshot).open();
  }
}
