'use client';

import { useRef } from 'react';
import { Eye, X, RotateCcw } from 'lucide-react';
import { logoReviewContext, logoReviewOptions } from '@/lib/logoReview.mjs';
import { logoDesignFields, LOGO_COLOR_ROLES } from '@/lib/logoDesignSettings.mjs';
import { LOGO_STYLES } from '@/lib/logoStudio.mjs';
import styles from './logoReview.module.css';

export default function LogoReview({ selected, jobs, imageSrc, onSelect, onReuse, disabled, canReuse = true }) {
  const dialog = useRef(null);
  const context = logoReviewContext(selected, jobs);
  const options = logoReviewOptions(selected, jobs);
  const fields = logoDesignFields(context.style, { mode: context.mode });
  const chosen = fields.filter(([key]) => context.designSettings[key]);
  const colorEntries = Object.entries(LOGO_COLOR_ROLES).filter(([key]) => context.designSettings[key]);
  return <>
    <button type="button" disabled={disabled} onClick={() => { dialog.current?.showModal(); dialog.current?.scrollTo({ top: 0 }); }}><Eye size={15} aria-hidden="true" />Review & brief</button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="logo-review-heading" onClick={event => { if (event.target === event.currentTarget) dialog.current.close(); }}>
      <header><div><h2 id="logo-review-heading">Review your logo</h2><p>Check the design before refining or exporting.</p></div><button type="button" aria-label="Close logo review" onClick={() => dialog.current.close()}><X size={20} /></button></header>
      <div className={styles.body}>
        <section className={styles.sizeSection} aria-label="Logo at actual small sizes"><h3>Does it read at small sizes?</h3><p>Check the silhouette, open gaps and spelling. These are previews of the saved artwork.</p><div className={styles.sizes}>{[32, 64, 128].map(size => <figure key={size}><div><img src={imageSrc(selected.url)} alt={`Selected logo at ${size} pixels`} width={size} height={size} /></div><figcaption>{size} px</figcaption></figure>)}</div></section>
        <section><h3>{options.isBatch ? 'Compare this batch' : 'Recent concepts'}</h3><div className={styles.options}>{options.jobs.map(job => <button type="button" key={job.id} disabled={disabled} aria-pressed={job.id === selected.id} aria-label={`Review version ${jobs.indexOf(job) + 1}`} onClick={() => onSelect(job)}><img src={imageSrc(job.url)} alt="" /><span>Version {jobs.indexOf(job) + 1}</span></button>)}</div></section>
        <section className={styles.brief}><h3>Saved brief & settings</h3><p>From this version’s saved creation context. Later edits may change the artwork.</p><dl><div><dt>Style</dt><dd>{LOGO_STYLES.find(style => style.id === context.style)?.name || context.style}</dd></div><div><dt>Idea</dt><dd>{context.prompt || 'Reference-led · no written brief'}</dd></div>{context.brand && <div><dt>Brand name</dt><dd>{context.brand}</dd></div>}{context.tagline && <div><dt>Tagline</dt><dd>{context.tagline}</dd></div>}{chosen.map(([key, field]) => <div key={key}><dt>{field.label}</dt><dd>{field.options?.find(option => option.id === context.designSettings[key])?.label || context.designSettings[key]}</dd></div>)}{colorEntries.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{context.designSettings[key]}</dd></div>)}{context.palette.length > 0 && <div><dt>Brand palette</dt><dd>{context.palette.join(', ')}</dd></div>}</dl><p>Unspecified controls use Auto. Your brand name and tagline stay separate from the idea.</p>
          {context.mode === 'text' ? <button type="button" className={styles.reuse} disabled={disabled || !canReuse} onClick={() => { dialog.current.close(); onReuse(context); }}><RotateCcw size={14} aria-hidden="true" />Use this brief & settings</button> : <p>For image or sketch creation, upload the original reference again to start a new generation. Variations use this saved logo directly.</p>}
          {context.mode === 'text' && <dl><div><dt>Concept direction</dt><dd>{context.generationOptions?.conceptMode === 'faithful' ? 'Follow brief closely' : 'Explore concepts'}</dd></div>{context.effectiveSeed !== undefined && <div><dt>Seed (this output)</dt><dd>{context.effectiveSeed}</dd></div>}<div><dt>Style inspiration</dt><dd>{context.hasStyleReference ? `Uploaded image · ${context.generationOptions?.styleMatch || 'flexible'} matching. Reattach it to create again.` : 'None'}</dd></div></dl>}
          {context.promptEnhancement && <dl><div><dt>Original idea</dt><dd>{context.promptEnhancement.originalPrompt}</dd></div></dl>}
        </section>
      </div>
    </dialog>
  </>;
}
