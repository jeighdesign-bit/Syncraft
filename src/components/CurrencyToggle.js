"use client";

import styles from "./CurrencyToggle.module.css";

const CURRENCIES = ["PHP", "USD"];

export default function CurrencyToggle({ value, onChange }) {
  const helperText = value === "PHP"
    ? "Pay locally with QR Ph"
    : "Pay internationally by card";

  return (
    <div className={styles.bar}>
      <div className={styles.toggle} role="group" aria-label="Display currency">
        {CURRENCIES.map((currency) => (
          <button
            key={currency}
            type="button"
            className={value === currency ? styles.active : ""}
            aria-pressed={value === currency}
            onClick={() => onChange(currency)}
          >
            {currency}
          </button>
        ))}
      </div>
      <p>{helperText}</p>
    </div>
  );
}
