'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Crop, Loader2, X } from 'lucide-react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { createLogoSourceCrop } from '@/lib/logoSourceCrop.mjs';
import styles from './sourceCrop.module.css';

export default function SourceCropModal({ file, initialCrop, onApply, onFullImage, onClose }) {
  const dialog = useRef(null);
  const image = useRef(null);
  const active = useRef(false);
  const saving = useRef(false);
  const titleId = useId();
  const hintId = useId();
  const [url, setUrl] = useState(null);
  const [crop, setCrop] = useState(initialCrop || { unit: '%', x: 10, y: 10, width: 80, height: 80 });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    active.current = true;
    const previousFocus = document.activeElement;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    const element = dialog.current;
    element.showModal();
    return () => {
      active.current = false;
      element.close();
      URL.revokeObjectURL(objectUrl);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [file]);

  async function apply() {
    if (!ready || saving.current || !crop?.width || !crop?.height) return;
    saving.current = true;
    setBusy(true); setError('');
    try {
      const result = await createLogoSourceCrop(image.current, crop, file.name);
      if (active.current) onApply(result, crop);
    } catch (err) {
      if (active.current) setError(err.message || 'Could not crop this image. Try again.');
    } finally {
      saving.current = false;
      if (active.current) setBusy(false);
    }
  }

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} aria-describedby={hintId} onCancel={event => { if (saving.current) event.preventDefault(); else onClose(); }}>
    <header className={styles.header}><h2 id={titleId}><Crop size={17} aria-hidden="true" />Crop reference</h2><button type="button" aria-label="Close crop" disabled={busy} onClick={onClose}><X size={19} /></button></header>
    <p id={hintId} className={styles.hint}>Drag or resize the box to focus on your subject.</p>
    <div className={styles.stage}>
      {url && <ReactCrop crop={crop} onChange={(_pixels, percent) => { setCrop(percent); setError(''); }} minWidth={12} minHeight={12} disabled={busy || !ready} ruleOfThirds>
        <img ref={image} src={url} alt="Reference image to crop" draggable={false} onLoad={() => setReady(true)} onError={() => { setReady(false); setError('Could not open this image. Try uploading it again.'); }} />
      </ReactCrop>}
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <footer className={styles.footer}><button type="button" disabled={busy} onClick={onFullImage}>Use full image</button><button type="button" className={styles.apply} disabled={busy || !ready || !crop?.width || !crop?.height} onClick={apply}>{busy && <Loader2 size={14} className={styles.spin} aria-hidden="true" />}{busy ? 'Cropping…' : 'Apply crop'}</button></footer>
  </dialog>;
}
