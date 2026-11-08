import { App, Notice, PluginSettingTab, Setting } from "obsidian";

import type PfnPlugin from "../main";

const DATAVIEW_EXAMPLE = [
  "```dataview",
  "TABLE L.date AS Дата, L.amount AS Сумма, L.category AS Категория",
  'FROM "Finance/ledger"',
  "FLATTEN file.lists AS L",
  'WHERE L.amount AND L.type = "expense"',
  "SORT L.date DESC",
  "```",
].join("\n");

export class PfnSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: PfnPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "PFN — финансы" });

    new Setting(containerEl)
      .setName("Папка с данными")
      .setDesc("Относительно корня vault. Здесь появятся счета, транзакции по месяцам, бюджеты, цели и активы.")
      .addText((text) =>
        text
          .setPlaceholder("Finance")
          .setValue(this.plugin.settings.folder)
          .onChange(async (value) => {
            this.plugin.settings.folder = value.trim() || "Finance";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Валюта")
      .setDesc("Код ISO 4217: RUB, USD, EUR. Влияет только на отображение.")
      .addText((text) =>
        text
          .setPlaceholder("RUB")
          .setValue(this.plugin.settings.currency)
          .onChange(async (value) => {
            this.plugin.settings.currency = value.trim().toUpperCase() || "RUB";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Локаль для дат и чисел")
      .setDesc("Например ru-RU или en-US.")
      .addText((text) =>
        text.setValue(this.plugin.settings.locale).onChange(async (value) => {
          this.plugin.settings.locale = value.trim() || "ru-RU";
          await this.plugin.saveSettings();
        }),
      );

    containerEl.createEl("h3", { text: "Совместимость с Dataview" });
    containerEl.createEl("p", {
      text: "Транзакции — обычные пункты списка с inline-полями, поэтому Dataview читает их напрямую:",
    });
    const pre = containerEl.createEl("pre");
    pre.createEl("code", { text: DATAVIEW_EXAMPLE });

    new Setting(containerEl).addButton((button) =>
      button.setButtonText("Скопировать запрос").onClick(async () => {
        await navigator.clipboard.writeText(DATAVIEW_EXAMPLE);
        new Notice("PFN: запрос скопирован");
      }),
    );

    containerEl.createEl("h3", { text: "Структура заметок" });
    containerEl.createEl("p", {
      text: "Все данные — обычный markdown. Их можно править руками: плагин перечитает файлы при следующем открытии.",
    });
    containerEl.createEl("pre").createEl("code", {
      text: [
        "Finance/",
        "  accounts.md     счета",
        "  categories.md   категории",
        "  budgets.md      лимиты",
        "  goals.md        цели и взносы",
        "  assets.md       активы и оценки",
        "  ledger/2026-11.md   операции месяца",
      ].join("\n"),
    });
  }
}
