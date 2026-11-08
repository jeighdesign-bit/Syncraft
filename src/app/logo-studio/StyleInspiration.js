'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import Select from '@/components/Select';
import styles from './generationControls.module.css';

export default function StyleInspiration({ file, missing, onFile, match, onMatch, disabled }) {
  const input = useRef(null);
  const id = useId();
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file); setPreview({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <details className={styles.inspiration} open={file || missing ? true : undefined}>
    <summary>Style inspiration <span>{file ? 'Attached' : missing ? 'Reattach image' : 'Optional'}</span></summary>
    <p>Text to Logo only. Use an image you own or can use to guide drawing style and finish. Your idea defines the subject; brand fields define the wording.</p>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className={styles.fileInput} aria-label="Upload style inspiration" disabled={disabled} onChange={event => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ''; }} />
    {file && <div className={styles.reference}>{preview?.file === file && <img src={preview.url} alt="Style inspiration preview" />}<span>{file.name}</span><button type="button" aria-label="Remove style inspiration" disabled={disabled} onClick={() => onFile(null)}><X size={16} /></button></div>}
    {missing && <p className={styles.warning} role="status">Reattach the original style image to use this saved recipe.</p>}
    <button type="button" className={styles.attach} disabled={disabled} onClick={() => input.current?.click()}><ImagePlus size={14} />{file || missing ? 'Replace style image' : 'Add style image'}</button>
    {missing && <button type="button" className={styles.attach} disabled={disabled} onClick={() => onFile(null)}>Continue without inspiration</button>}
    {file && <label htmlFor={`${id}-match`}>Style matching<Select portal id={`${id}-match`} aria-label="Style inspiration matching" disabled={disabled} value={match || 'flexible'} onChange={event => onMatch(event.target.value)}><option value="flexible">Flexible · general drawing language</option><option value="precise">Precise · closer style matching</option></Select></label>}
    {file && <p>Guides drawing style and finish. Your brief and color settings take priority, but reference colors or motifs can still carry over. Review the result.</p>}
  </details>;
}
