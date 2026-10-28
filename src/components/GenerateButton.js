import styles from "./GenerateButton.module.css";

export default function GenerateButton({ children, detail, ...props }) {
  return <button type="button" {...props} className={styles.button}>
    <span className={styles.label}>{children}</span>
    {detail && <span className={styles.detail}>{detail}</span>}
  </button>;
}
