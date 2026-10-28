'use client';

import styles from './WorkspaceTabs.module.css';

// Shared segmented control used by the canvas workspaces.
export default function WorkspaceTabs({ items, value, onChange, disabled = false, label = 'Workspace views', idPrefix, controlsId, className = '' }) {
  function navigate(event, index) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || disabled) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus();
    onChange(items[next].id);
  }

  return <div className={`${styles.tabs} ${className}`} role="tablist" aria-label={label}>
    {items.map((item, index) => <button key={item.id} type="button" role="tab" className={styles.tab}
      id={idPrefix ? `${idPrefix}-${item.id}` : undefined} aria-controls={controlsId}
      aria-selected={value === item.id} data-empty={item.hasContent === false ? 'true' : undefined}
      tabIndex={value === item.id ? 0 : -1} disabled={disabled}
      onClick={() => onChange(item.id)} onKeyDown={event => navigate(event, index)}>{item.label}</button>)}
  </div>;
}
