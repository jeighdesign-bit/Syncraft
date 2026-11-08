'use client';

import { useId } from 'react';
import { ChevronDown, CircleHelp, Shuffle } from 'lucide-react';
import Select from '@/components/Select';
import styles from './generationControls.module.css';

export default function GenerationControls({ value, onChange, disabled }) {
  const id = useId();
  return <details className={styles.advanced}>
    <summary><span className={styles.heading}>Generation controls<ChevronDown size={12} aria-hidden="true" /></span><span>{value.conceptMode === 'faithful' ? 'Follow brief' : 'Explore'}{value.seed !== undefined && value.seed !== '' ? ' · Fixed seed' : ''}</span></summary>
    <div className={styles.options}>
      <div className={styles.direction}><Select compact portal id={`${id}-concept`} aria-label="Concept direction" disabled={disabled} value={value.conceptMode || 'explore'} onChange={event => onChange({ ...value, conceptMode: event.target.value })}><option value="explore">Explore concepts</option><option value="faithful">Follow brief closely</option></Select></div>
      <div className={styles.seed}><label htmlFor={`${id}-seed`}>Seed</label><input id={`${id}-seed`} aria-describedby={`${id}-seed-hint`} inputMode="numeric" autoComplete="off" placeholder="Random" value={value.seed ?? ''} disabled={disabled} onChange={event => onChange({ ...value, seed: event.target.value })} /><button type="button" className={styles.random} aria-label="Use random seeds" title="Use random seeds" disabled={disabled || value.seed === undefined || value.seed === ''} onClick={() => { const { seed, ...rest } = value; onChange(rest); }}><Shuffle size={14} aria-hidden="true" /></button></div>
      <span id={`${id}-seed-hint`} className={styles.srOnly}>Optional seed from 0 to 4294967295. Leave blank for random seeds. Each option uses the next seed; exact repeats aren’t guaranteed.</span>
      <details className={styles.help} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}>
        <summary aria-label="About generation controls" title="About generation controls"><CircleHelp size={15} aria-hidden="true" /></summary>
        <div className={styles.helpPanel}><p><strong>Explore</strong> gives additional options different constructions. <strong>Follow brief</strong> keeps the same composition direction across the batch. Your idea and brand wording stay unchanged.</p><p><strong>Seed</strong> is optional. Use 0–4294967295 to compare batches with the same brief and settings. Leave blank for random seeds; exact repeats aren’t guaranteed.</p></div>
      </details>
    </div>
  </details>;
}
