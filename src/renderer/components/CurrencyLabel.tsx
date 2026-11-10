import { currencyIcon, currencyName, formatCurrency } from "../../shared/currency-display";
import { iconUrl } from "../lib/assets";
import "./currency-label.css";

/** A currency with its in-game icon, as a name alone or an amount such as 20 Hero Mistcrest */
export function CurrencyLabel({ id, amount }: { id: string; amount?: number }) {
  const icon = currencyIcon(id);
  const url = icon ? iconUrl(icon) : null;
  return (
    <span className="currency-label">
      {url && <img src={url} alt="" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
      <span>{amount == null ? currencyName(id) : formatCurrency(id, amount)}</span>
    </span>
  );
}
