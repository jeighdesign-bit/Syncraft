"use client";

import { ArrowDownLeft, ArrowUpRight, Clock, History } from "lucide-react";
import styles from "./CreditHistory.module.css";

const actionNames = { generate: "Logo generation", edit: "AI edit", variations: "Logo variations", vectorize: "Vectorize logo", removeBg: "Remove background" };
function activityName(action) {
  const operation = String(action || "").match(/^Logo Studio:\s*(\w+)$/i)?.[1];
  return operation ? actionNames[operation] || action : action || "Credit activity";
}

export default function CreditHistory({ logs, loading, signedIn }) {
  const groups = new Map();
  [...logs].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).forEach(log => {
    const date = new Date(log.created_at);
    const valid = !Number.isNaN(date.getTime());
    const key = valid ? date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "Other activity";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...log, date, valid });
  });
  const message = !signedIn ? "Sign in to see your credit activity." : loading ? "Loading your activity…" : logs.length === 0 ? "Your credit activity will appear here." : null;

  return <section className={styles.section} aria-labelledby="credit-history-title">
    <header className={styles.header}>
      <div><h2 id="credit-history-title">Your credit activity</h2><p>Keep track of what you create and the credits you add.</p></div>
      <span className={styles.retention}><Clock size={12} aria-hidden="true" /> Last 3 days</span>
    </header>
    {message ? <div className={styles.empty} role="status"><History size={25} strokeWidth={1.5} aria-hidden="true" /><p>{message}</p></div> :
      <div className={styles.groups}>{[...groups].map(([date, entries]) => <section key={date} className={styles.group} aria-label={date}>
        <h3>{date}<span>{entries.length} {entries.length === 1 ? "activity" : "activities"}</span></h3>
        <ul className={styles.list}>{entries.map(log => {
          const amount = Number(log.amount) || 0;
          const added = amount > 0;
          const Icon = added ? ArrowDownLeft : ArrowUpRight;
          return <li key={log.id} className={styles.row}>
            <span className={`${styles.icon}${added ? ` ${styles.addedIcon}` : ""}`}><Icon size={16} aria-hidden="true" /></span>
            <div className={styles.activity}><strong>{activityName(log.action)}</strong><span>{log.valid ? <time dateTime={log.date.toISOString()}>{log.date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</time> : "Time unavailable"}{" · "}{added ? "Credits received" : amount < 0 ? "Credits used" : "No credit change"}</span></div>
            <div className={`${styles.amount}${added ? ` ${styles.added}` : ""}`}><strong>{added ? "+" : ""}{amount}</strong><span>credits</span></div>
          </li>;
        })}</ul>
      </section>)}</div>}
    <p className={styles.note}>Activity records are automatically deleted after three days.</p>
  </section>;
}
