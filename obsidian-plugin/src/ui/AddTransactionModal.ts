import { Modal, Notice, Setting, type App } from "obsidian";

import type PfnPlugin from "../main";
import { parseAmount } from "../model/money";
import { newId } from "../store/parse";
import type { Snapshot } from "../store/ledger";
import type { Transaction, TransactionType } from "../model/types";

export class AddTransactionModal extends Modal {
  private type: TransactionType = "expense";
  private date = new Date().toISOString().slice(0, 10);
  private amount = "";
  private account: string;
  private category = "";
  private transferTo = "";
  private description = "";
  private tags = "";

  constructor(
    app: App,
    private plugin: PfnPlugin,
    private snapshot: Snapshot,
  ) {
    super(app);
    this.account = snapshot.accounts[0]?.id ?? "";
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Новая транзакция" });

    new Setting(contentEl).setName("Тип").addDropdown((dropdown) => {
      dropdown.addOption("expense", "Расход");
      dropdown.addOption("income", "Доход");
      dropdown.addOption("transfer", "Перевод");
      dropdown.setValue(this.type);
      dropdown.onChange((value) => {
        this.type = value as TransactionType;
        this.render();
      });
    });

    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    // Перерисовываем тело, оставляя заголовок и селектор типа на месте.
    contentEl.querySelectorAll(".pfn-modal-body").forEach((node) => node.remove());
    const body = contentEl.createDiv({ cls: "pfn-modal-body" });

    new Setting(body).setName("Дата").addText((text) => {
      text.inputEl.type = "date";
      text.setValue(this.date).onChange((value) => (this.date = value));
    });

    new Setting(body)
      .setName("Сумма")
      .setDesc(`Валюта: ${this.plugin.settings.currency}`)
      .addText((text) => {
        text.inputEl.inputMode = "decimal";
        text.setPlaceholder("1 250,00").onChange((value) => (this.amount = value));
      });

    new Setting(body).setName("Счёт").addDropdown((dropdown) => {
      for (const account of this.snapshot.accounts) dropdown.addOption(account.id, account.name);
      dropdown.setValue(this.account).onChange((value) => (this.account = value));
    });

    if (this.type === "transfer") {
      new Setting(body).setName("На счёт").addDropdown((dropdown) => {
        for (const account of this.snapshot.accounts) dropdown.addOption(account.id, account.name);
        dropdown.setValue(this.transferTo || this.snapshot.accounts[1]?.id || this.account);
        dropdown.onChange((value) => (this.transferTo = value));
      });
    } else {
      const kind = this.type === "income" ? "income" : "expense";
      new Setting(body).setName("Категория").addDropdown((dropdown) => {
        for (const category of this.snapshot.categories.filter(
          (c: { kind: string }) => c.kind === kind,
        )) {
          dropdown.addOption(category.id, category.name);
        }
        dropdown.setValue(this.category || "").onChange((value) => (this.category = value));
      });
    }

    new Setting(body).setName("Описание").addText((text) => {
      text.setPlaceholder("Пятёрочка").onChange((value) => (this.description = value));
    });

    new Setting(body).setName("Теги").addText((text) => {
      text.setPlaceholder("через запятую").onChange((value) => (this.tags = value));
    });

    new Setting(body).addButton((button) => {
      button
        .setButtonText("Добавить")
        .setCta()
        .onClick(() => void this.submit());
    });
  }

  private async submit(): Promise<void> {
    const amount = parseAmount(this.amount);
    if (amount <= 0) {
      new Notice("PFN: сумма должна быть больше нуля");
      return;
    }
    if (this.type === "transfer" && this.transferTo === this.account) {
      new Notice("PFN: счёт-получатель должен отличаться");
      return;
    }

    const tx: Transaction = {
      id: newId(),
      date: this.date,
      type: this.type,
      amount,
      account: this.account,
      transferTo: this.type === "transfer" ? this.transferTo || this.snapshot.accounts[1]?.id : undefined,
      category: this.type === "transfer" ? undefined : this.category || undefined,
      description: this.description.trim(),
      tags: this.tags
        ? this.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : undefined,
    };

    await this.plugin.ledger.addTransaction(tx);
    new Notice("PFN: транзакция добавлена");
    this.close();
    await this.plugin.activateView();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
