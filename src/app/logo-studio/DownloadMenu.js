'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Download, Loader2 } from 'lucide-react';
import styles from './studio.module.css';

const formats = [
  { id: 'png', name: 'PNG', detail: 'High quality · Supports transparency' },
  { id: 'jpg', name: 'JPG', detail: 'White background · Easy to share' },
  { id: 'svg', name: 'SVG', detail: 'Scalable vector', vector: true },
];

export default function DownloadMenu({ downloading, hasVector, onDownload }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const escape = event => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  function navigate(event) {
    if (event.key === 'Tab') { setOpen(false); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = [...root.current.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    const current = items.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }

  return <div className={styles.downloadMenu} ref={root}>
    <button type="button" ref={trigger} className={styles.download} disabled={downloading}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => setOpen(!open)} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
      }}>
      {downloading ? <Loader2 className={styles.spin} size={15} aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
      {downloading ? 'Preparing…' : 'Download'}<ChevronDown size={13} aria-hidden="true" />
    </button>
    {open && <div id={menuId} className={styles.downloadPopover} role="menu" aria-label="Download file format" onKeyDown={navigate}>
      <div className={styles.downloadMenuLabel} role="presentation">Download file</div>
      {formats.map(format => <button type="button" role="menuitem" key={format.id} disabled={format.vector && !hasVector}
        onClick={() => { setOpen(false); trigger.current?.focus(); onDownload(format.id); }}>
        <span className={styles.downloadFormat}>{format.name}</span>
        <span className={styles.downloadFormatInfo}><strong>{`${format.name} image`}</strong><small>{format.vector && !hasVector ? 'Vectorize this logo first' : format.detail}</small></span>
      </button>)}
      {!hasVector && <p className={styles.downloadHelp}>Use Vectorize to unlock SVG.</p>}
    </div>}
  </div>;
}
