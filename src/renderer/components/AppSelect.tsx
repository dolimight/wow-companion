import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import "./app-select.css";

export type AppSelectOption = { value: string; label: string; disabled?: boolean };

export function AppSelect({
  value,
  options,
  onValueChange,
  className = "",
  disabled = false,
  label,
  "aria-label": ariaLabel,
}: {
  value: string;
  options: readonly AppSelectOption[];
  onValueChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
} & ({ label: string; "aria-label"?: string } | { "aria-label": string; label?: string })) {
  return (
    <Select
      value={value}
      items={options}
      disabled={disabled}
      onValueChange={(next) => {
        if (typeof next === "string") onValueChange(next);
      }}
    >
      <SelectTrigger
        aria-label={ariaLabel ?? label}
        data-value={value}
        data-option-count={options.length}
        className={`app-select-trigger ${className}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="app-select-content" align="start" alignItemWithTrigger={false}>
        {options.map((option) => (
          <SelectItem
            className="app-select-item"
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
