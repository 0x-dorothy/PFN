import { CATEGORY_ICON_OPTIONS, getCategoryIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface CategoryIconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

export function CategoryIconPicker({ value, onChange }: CategoryIconPickerProps) {
  return (
    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
      {CATEGORY_ICON_OPTIONS.map((icon) => {
        const Icon = getCategoryIcon(icon);
        const selected = icon === value;

        return (
          <button
            key={icon}
            type="button"
            aria-label={icon}
            aria-pressed={selected}
            onClick={() => onChange(icon)}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
              selected
                ? "border-accent bg-accent-soft text-accent-fg"
                : "border-border text-text-secondary hover:bg-surface-2"
            )}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </div>
  );
}
