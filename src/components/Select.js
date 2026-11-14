"use client";

import { Children, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import styles from './Select.module.css';

export default function Select({ value, onChange, children, disabled, compact = false, portal = false, portalAnchorRef, menuPlacement = 'bottom', id: triggerId, displayLabel, renderOption, 'aria-label': label = 'Choose an option', 'aria-describedby': describedBy }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [anchor, setAnchor] = useState(null);
  const root = useRef(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const id = useId();
  const options = Children.toArray(children).filter(Boolean).map(child => ({ value: child.props.value ?? child.props.children, label: child.props.children, disabled: Boolean(child.props.disabled), title: child.props.title }));
  const enabledIndices = options.flatMap((option, index) => option.disabled ? [] : [index]);
  const current = options.findIndex(option => option.value === value);
  const expanded = open && !disabled;

  useEffect(() => {
    if (!expanded) return;
    const close = event => { if (!root.current?.contains(event.target) && !menu.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    menu.current?.focus();
    return () => document.removeEventListener('pointerdown', close);
  }, [expanded]);

  useEffect(() => {
    if (expanded) menu.current?.querySelector(`[data-option-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, expanded]);

  const choose = index => {
    if (!options[index] || options[index].disabled) return;
    onChange?.({ target: { value: options[index].value } });
    setOpen(false);
    trigger.current?.focus();
  };
  const show = () => {
    if (portal) {
      const anchorElement = portalAnchorRef?.current;
      const rect = (anchorElement || trigger.current).getBoundingClientRect();
      const width = Math.min(rect.width, window.innerWidth - 24);
      setAnchor({
        position: 'fixed',
        left: Math.max(12, Math.min(rect.left, window.innerWidth - (anchorElement ? width + 12 : 292))),
        bottom: window.innerHeight - rect.top + 6,
        top: 'auto', right: 'auto',
        ...(anchorElement ? { width, minWidth: width, maxWidth: width } : { minWidth: rect.width }),
      });
    }
    setActive(enabledIndices.includes(current) ? current : enabledIndices[0] ?? -1);
    setOpen(true);
  };

  const renderMenu = content => portal ? createPortal(content, document.body) : content;
  return <div className={`${styles.root} ${compact ? styles.compact : ''}`} data-menu-placement={menuPlacement} ref={root} onBlur={event => { if (!portal && !event.currentTarget.contains(event.relatedTarget) && !menu.current?.contains(event.relatedTarget)) setOpen(false); }}>
    <button id={triggerId} ref={trigger} type="button" className={styles.trigger} disabled={disabled} aria-label={label} aria-describedby={describedBy} aria-haspopup="listbox" aria-expanded={expanded} aria-controls={expanded ? id : undefined}
      onClick={() => expanded ? setOpen(false) : show()}
      onKeyDown={event => { if (['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault(); show(); } }}>
      <span>{displayLabel || options[current]?.label || label}</span><ChevronDown size={15} aria-hidden="true" />
    </button>
    {expanded && renderMenu(<div style={portal ? anchor : undefined} id={id} ref={menu} className={`${styles.menu} ${compact ? styles.compactMenu : ''}`} role="listbox" aria-label={label} tabIndex={-1} aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
      if (event.key === 'Tab') setOpen(false);
      if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
        event.preventDefault();
        setActive(index => {
          if (!enabledIndices.length) return -1;
          if (event.key === 'Home') return enabledIndices[0];
          if (event.key === 'End') return enabledIndices.at(-1);
          const position = enabledIndices.indexOf(index);
          return enabledIndices[(position + (event.key === 'ArrowDown' ? 1 : -1) + enabledIndices.length) % enabledIndices.length];
        });
      }
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(active); }
    }}>
      {options.map((option, index) => <div id={`${id}-${index}`} data-option-index={index} key={option.value} role="option" aria-selected={value === option.value} aria-disabled={option.disabled || undefined} title={option.title} className={`${styles.option} ${active === index ? styles.active : ''}`} onPointerMove={() => { if (!option.disabled) setActive(index); }} onClick={() => choose(index)}>
        <span>{renderOption ? renderOption(option) : option.label}</span>{value === option.value && <Check size={15} aria-hidden="true" />}
      </div>)}
    </div>)}
  </div>;
}
