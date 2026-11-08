import { Card, CardContent } from "@/components/ui/Card";
import { PillSelector } from "@/components/layout/PillSelector";
import { useTranslation, type Language, type TranslationKey } from "@/lib/i18n";
import { ACCENTS, ACCENT_SWATCH, useAccent, useTheme, type Accent, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Language and theme side by side — both are pure client-side display
 * preferences (unlike currency, which is server-persisted), so pairing
 * them saves a whole card's worth of vertical space over listing each on
 * its own. Stacks back to one column on mobile.
 *
 * The accent row sits underneath because it applies to the theme above it:
 * six swatches, one click, remembered per browser. */
export function PreferencesCard() {
  const { t, language, setLanguage } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { accent, setAccent } = useAccent();

  const languageOptions: Array<{ value: Language; label: string }> = [
    { value: "ru", label: t("settings.languageRussian") },
    { value: "en", label: t("settings.languageEnglish") },
  ];
  const themeOptions: Array<{ value: Theme; label: string }> = [
    { value: "light", label: t("settings.themeLight") },
    { value: "dark", label: t("settings.themeDark") },
    { value: "system", label: t("settings.themeSystem") },
  ];
  const accentLabels: Record<Accent, TranslationKey> = {
    blue: "settings.accentBlue",
    violet: "settings.accentViolet",
    green: "settings.accentGreen",
    amber: "settings.accentAmber",
    rose: "settings.accentRose",
    graphite: "settings.accentGraphite",
  };

  return (
    <Card>
      <CardContent className="grid grid-cols-1 gap-5 divide-y divide-border pt-4 sm:grid-cols-2 sm:gap-6 sm:divide-x sm:divide-y-0 sm:pt-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t("settings.language")}</p>
          <div className="mt-2">
            <PillSelector options={languageOptions} value={language} onChange={setLanguage} />
          </div>
        </div>
        <div className="pt-5 sm:pl-6 sm:pt-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t("settings.theme")}</p>
          <div className="mt-2">
            <PillSelector options={themeOptions} value={theme} onChange={setTheme} />
          </div>
        </div>
      </CardContent>

      <div className="border-t border-border px-4 pb-4 pt-4 sm:px-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t("settings.accent")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ACCENTS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setAccent(value)}
              aria-label={t(accentLabels[value])}
              aria-pressed={accent === value}
              title={t(accentLabels[value])}
              className={cn(
                "h-8 w-8 rounded-full transition",
                "ring-offset-2 ring-offset-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                accent === value ? "ring-2 ring-accent" : "ring-1 ring-border hover:ring-text-muted"
              )}
              style={{ backgroundColor: ACCENT_SWATCH[value] }}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
