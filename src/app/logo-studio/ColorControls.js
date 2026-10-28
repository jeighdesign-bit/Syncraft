'use client';

import { useEffect, useRef, useState } from 'react';
import { Palette, X } from 'lucide-react';
import { LOGO_COLOR_ROLES } from '@/lib/logoDesignSettings.mjs';
import styles from './colorControls.module.css';

const swatches = ['#000000', '#FFFFFF', '#F5F1E8', '#F7BE4B', '#FF6B45', '#E91E63', '#C62828', '#8E24AA', '#5E35B1', '#1565C0', '#039BE5', '#00897B', '#2E7D32', '#7CB342', '#FFEB3B', '#795548', '#455A64', '#9E9E9E'];

export default function ColorControls({ settings, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('primaryColor');
  const root = useRef(null);
  const selected = Object.keys(LOGO_COLOR_ROLES).filter(key => settings[key]);
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') { setOpen(false); root.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  function change(key, value) {
    if ((settings[key] || '').toUpperCase() === (value || '').toUpperCase()) return;
    const next = { ...settings };
    if (value) next[key] = value;
    else delete next[key];
    onChange(next);
  }
  return <div className={styles.root} ref={root}>
    <button type="button" className={styles.trigger} disabled={disabled} aria-expanded={open} aria-label="Colors" onClick={() => setOpen(!open)}><Palette size={13} />{selected.slice(0, 3).map(key => <i key={key} style={{ background: settings[key] }} />)}<span>Colors</span></button>
    {open && <section className={styles.panel} aria-label="Optional logo colors">
      <header><span>Colors <small>Optional</small></span><button type="button" aria-label="Close colors" onClick={() => setOpen(false)}><X size={14} /></button></header>
      <div className={styles.roles}>{Object.entries(LOGO_COLOR_ROLES).map(([key, label]) => <div key={key} className={active === key ? styles.active : ''}>
        <button type="button" className={styles.role} aria-pressed={active === key} onClick={() => setActive(key)}><i style={{ background: settings[key] || 'transparent' }} /><span>{label}</span><small>{settings[key] || 'Auto'}</small></button>
        <label className={styles.custom}>Custom<input type="color" aria-label={`${label} custom color`} value={(settings[key] || '#000000').toLowerCase()} onChange={event => change(key, event.target.value)} disabled={disabled} /></label>
        {settings[key] && <button type="button" className={styles.remove} aria-label={`Remove ${label.toLowerCase()} color`} onClick={() => change(key, '')}><X size={11} /></button>}
      </div>)}</div>
      <p>Choose a swatch for {LOGO_COLOR_ROLES[active].toLowerCase()}.</p>
      <div className={styles.swatches}>{swatches.map(color => <button type="button" key={color} aria-label={`Use ${color}`} aria-pressed={settings[active]?.toUpperCase() === color.toUpperCase()} style={{ background: color }} onClick={() => change(active, color)} />)}</div>
      <footer><button type="button" onClick={() => { const next = { ...settings }; Object.keys(LOGO_COLOR_ROLES).forEach(key => delete next[key]); onChange(next); }}>Clear colors</button><small>Unselected colors stay automatic.</small></footer>
    </section>}
  </div>;
}
