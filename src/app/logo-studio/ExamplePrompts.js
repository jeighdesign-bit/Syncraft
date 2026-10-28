'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Images } from 'lucide-react';
import { LOGO_EXAMPLES } from '@/lib/logoExamples.mjs';
import { LOGO_STYLES } from '@/lib/logoStudio.mjs';
import Select from '@/components/Select';
import styles from './examplePrompts.module.css';

export default function ExamplePrompts({ onSelect, disabled }) {
  const dialog = useRef(null);
  const [filter, setFilter] = useState('all');
  useEffect(() => { const element = dialog.current; const close = event => { if (event.target === element) element.close(); }; element?.addEventListener('click', close); return () => element?.removeEventListener('click', close); }, []);
  return <>
    <button type="button" className={styles.trigger} disabled={disabled} onClick={() => dialog.current?.showModal()}><Images size={14} />Example Prompts</button>
    <dialog className={styles.dialog} ref={dialog} aria-label="Example Prompts">
      <header><div className={styles.filter}><Select aria-label="Filter examples by style" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All styles</option>{LOGO_STYLES.filter(style => LOGO_EXAMPLES.some(item => item.style === style.id)).map(style => <option key={style.id} value={style.id}>{style.name}</option>)}</Select></div><button type="button" aria-label="Close example prompts" onClick={() => dialog.current.close()}><X size={20} /></button></header>
      <div className={styles.grid}>{LOGO_EXAMPLES.filter(item => filter === 'all' || item.style === filter).map(item => <button type="button" key={item.id} className={styles.card} aria-label={`Use ${item.title} prompt`} onClick={() => { dialog.current.close(); onSelect(item); }}><img src={item.image} alt="" width={400} height={400} loading="lazy" /><em aria-hidden="true">Use prompt</em></button>)}</div>
    </dialog>
  </>;
}
