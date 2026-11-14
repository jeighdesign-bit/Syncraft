import styles from './CreditAmount.module.css';

// The existing Syncraft bolt, shared by every credit amount.
export function CreditIcon() {
  return <svg className={styles.icon} width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
    <path d="m9.5 1.5-7 8h5l-1 5 7-8h-5l1-5Z" fill="currentColor" stroke="currentColor" strokeWidth=".7" strokeLinejoin="round" />
  </svg>;
}

export default function CreditAmount({ amount, unit = 'credits', className = '' }) {
  return <span className={`${styles.amount} ${className}`} data-credit-amount="">
    <CreditIcon />
    {amount}{unit ? ` ${unit}` : null}
    {unit === '' && <span className={styles.srOnly}> credits</span>}
  </span>;
}
