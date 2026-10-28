import styles from "./SectionBadge.module.css";

export default function SectionBadge({ children, className = "" }) {
  return <span className={`${styles.badge} ${className}`.trim()}>{children}</span>;
}
