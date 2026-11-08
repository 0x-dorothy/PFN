import { Modal, Notice, Setting, type App } from "obsidian";

import type PfnPlugin from "../main";
import { parseAmount } from "../model/money";
import { newId } from "../store/parse";
import type { Snapshot } from "../store/ledger";
import type { Transaction, TransactionType } from "../model/types";

/** Одна модалка на создание и правку: поля те же, при правке — заполнены. */
export class TransactionModal extends Modal {
  private type: TransactionType;
  private date: string;
  private amount: string;
  private account: string;
  private category: string;
  private transferTo: string;
  private description: string;
  private tags: string;

  constructor(
    app: App,
    private plugin: PfnPlugin,
    private snapshot: Snapshot,
    private existing?: Transaction,
  ) {
    super(app);
    this.type = existing?.type ?? "expense";
    this.date = existing?.date ?? localToday();
    this.amount = existing ? (existing.amount / 100).toString() : "";
    this.account = existing?.account ?? snapshot.accounts[0]?.id ?? "";
    this.category = existing?.category ?? "";
    this.transferTo = existing?.transferTo ?? snapshot.accounts[1]?.id ?? "";
    this.description = existing?.description ?? "";
    this.tags = existing?.tags?.join(", ") ?? "";
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("pfn-modal");
    this.contentEl.createEl("h2", { text: this.existing ? "Изменить операцию" : "Новая операция" });
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.querySelectorAll(".pfn-modal-body").forEach((node) => node.remove());
    const body = contentEl.createDiv({ cls: "pfn-modal-body" });

    new Setting(body).setName("Тип").addDropdown((dropdown) => {
      dropdown.addOption("expense", "Расход");
      dropdown.addOption("income", "Доход");
      dropdown.addOption("transfer", "Перевод");
      dropdown.setValue(this.type);
      dropdown.onChange((value) => {
        this.type = value as TransactionType;
        this.render();
      });
    });

    new Setting(body).setName("Дата").addText((text) => {
      text.inputEl.type = "date";
      text.setValue(this.date).onChange((value) => (this.date = value));
    });

    new Setting(body)
      .setName(`Сумма, ${this.plugin.settings.currency}`)
      .addText((text) => {
        text.inputEl.inputMode = "decimal";
        text.setValue(this.amount).setPlaceholder("1 250,00").onChange((value) => (this.amount = value));
      });

    new Setting(body).setName("Счёт").addDropdown((dropdown) => {
      for (const account of this.snapshot.accounts) dropdown.addOption(account.id, account.name);
      dropdown.setValue(this.account).onChange((value) => (this.account = value));
    });

    if (this.type === "transfer") {
      new Setting(body).setName("На счёт").addDropdown((dropdown) => {
        for (const account of this.snapshot.accounts) dropdown.addOption(account.id, account.name);
        dropdown.setValue(this.transferTo).onChange((value) => (this.transferTo = value));
      });
    } else {
      const kind = this.type === "income" ? "income" : "expense";
      new Setting(body).setName("Категория").addDropdown((dropdown) => {
        for (const category of this.snapshot.categories.filter((item) => item.kind === kind)) {
          dropdown.addOption(category.id, category.name);
        }
        dropdown.setValue(this.category || "").onChange((value) => (this.category = value));
      });
    }

    new Setting(body).setName("Описание").addText((text) => {
      text.setPlaceholder("Пятёрочка").setValue(this.description).onChange((value) => (this.description = value));
    });

    new Setting(body).setName("Теги").addText((text) => {
      text.setPlaceholder("через запятую").setValue(this.tags).onChange((value) => (this.tags = value));
    });

    const actions = body.createDiv({ cls: "pfn-modal-actions" });
    if (this.existing) {
      const remove = actions.createEl("button", { cls: "pfn-button pfn-button-danger", text: "Удалить" });
      remove.addEventListener("click", () => void this.remove());
    }
    const save = actions.createEl("button", { cls: "pfn-button", text: "Сохранить" });
    save.addEventListener("click", () => void this.submit());
  }

  private buildTransaction(): Transaction | null {
    const amount = parseAmount(this.amount);
    if (amount <= 0) {
      new Notice("PFN: сумма должна быть больше нуля");
      return null;
    }
    if (this.type === "transfer" && this.transferTo === this.account) {
      new Notice("PFN: счёт-получатель должен отличаться");
      return null;
    }
    return {
      id: this.existing?.id ?? newId(),
      date: this.date,
      type: this.type,
      amount,
      account: this.account,
      transferTo: this.type === "transfer" ? this.transferTo : undefined,
      category: this.type === "transfer" ? undefined : this.category || undefined,
      description: this.description.trim(),
      tags: this.tags
        ? this.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : undefined,
      splits: this.existing?.splits,
    };
  }

  private async submit(): Promise<void> {
    const tx = this.buildTransaction();
    if (!tx) return;

    if (this.existing) await this.plugin.updateTransaction(this.existing, tx);
    else await this.plugin.ledger.addTransaction(tx);

    new Notice(this.existing ? "PFN: операция изменена" : "PFN: операция добавлена");
    this.close();
    await this.plugin.refresh();
  }

  private async remove(): Promise<void> {
    if (!this.existing) return;
    await this.plugin.ledger.deleteTransaction(this.existing);
    new Notice("PFN: операция удалена");
    this.close();
    await this.plugin.refresh();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function localMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
