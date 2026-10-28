"use client";

import { Children, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import styles from './Select.module.css';

export default function Select({ value, onChange, children, disabled, compact = false, portal = false, displayLabel, 'aria-label': label = 'Choose an option' }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [anchor, setAnchor] = useState(null);
  const root = useRef(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const id = useId();
  const options = Children.toArray(children).filter(Boolean).map(child => ({ value: child.props.value ?? child.props.children, label: child.props.children }));
  const current = options.findIndex(option => option.value === value);
  const expanded = open && !disabled;

  useEffect(() => {
    if (!expanded) return;
    const close = event => { if (!root.current?.contains(event.target) && !menu.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    menu.current?.focus();
    return () => document.removeEventListener('pointerdown', close);
  }, [expanded]);

  const choose = index => {
    if (!options[index]) return;
    onChange?.({ target: { value: options[index].value } });
    setOpen(false);
    trigger.current?.focus();
  };
  const show = () => { if (portal) { const rect = trigger.current.getBoundingClientRect(); setAnchor({ position: 'fixed', left: Math.max(12, Math.min(rect.left, window.innerWidth - 292)), bottom: window.innerHeight - rect.top + 6, top: 'auto', right: 'auto', minWidth: rect.width }); } setActive(Math.max(0, current)); setOpen(true); };

  const renderMenu = content => portal ? createPortal(content, document.body) : content;
  return <div className={`${styles.root} ${compact ? styles.compact : ''}`} ref={root} onBlur={event => { if (!portal && !event.currentTarget.contains(event.relatedTarget) && !menu.current?.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" className={styles.trigger} disabled={disabled} aria-label={label} aria-haspopup="listbox" aria-expanded={expanded} aria-controls={expanded ? id : undefined}
      onClick={() => expanded ? setOpen(false) : show()}
      onKeyDown={event => { if (['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault(); show(); } }}>
      <span>{displayLabel || options[current]?.label || label}</span><ChevronDown size={15} aria-hidden="true" />
    </button>
    {expanded && renderMenu(<div style={portal ? anchor : undefined} id={id} ref={menu} className={styles.menu} role="listbox" aria-label={label} tabIndex={-1} aria-activedescendant={`${id}-${active}`} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
      if (event.key === 'Tab') setOpen(false);
      if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
        event.preventDefault();
        setActive(index => event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
      }
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(active); }
    }}>
      {options.map((option, index) => <div id={`${id}-${index}`} key={option.value} role="option" aria-selected={value === option.value} className={`${styles.option} ${active === index ? styles.active : ''}`} onPointerMove={() => setActive(index)} onClick={() => choose(index)}>
        <span>{option.label}</span>{value === option.value && <Check size={15} aria-hidden="true" />}
      </div>)}
    </div>)}
  </div>;
}
