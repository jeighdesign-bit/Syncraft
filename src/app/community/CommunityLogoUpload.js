'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Upload, X, Loader2 } from 'lucide-react';
import styles from './community.module.css';

export default function CommunityLogoUpload({ file, preview, disabled, onChange }) {
  const input = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  async function choose(selected) {
    if (!selected || disabled || checking) return;
    setError('');
    if (selected.size > 2 * 1024 * 1024) { setError('This file is too large. Choose a logo under 2 MB.'); return; }
    if (selected.type !== 'image/png') { setError('Choose a PNG logo with a transparent background.'); return; }
    setChecking(true);
    const url = URL.createObjectURL(selected);
    try {
      await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          try {
            if (image.naturalWidth * image.naturalHeight > 16_000_000) throw new Error('Use a logo under 16 megapixels.');
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) throw new Error('Unable to check this image. Please try another PNG.');
            context.drawImage(image, 0, 0);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let transparent = false, visible = false;
            for (let i = 3; i < pixels.length; i += 4) {
              if (pixels[i] === 0) transparent = true;
              if (pixels[i] > 0) visible = true;
              if (transparent && visible) break;
            }
            if (!visible) throw new Error('This PNG is empty. Choose a visible logo with a transparent background.');
            if (!transparent) throw new Error('Remove the background first, then upload a transparent PNG.');
            resolve();
          } catch (error) { reject(error); }
        };
        image.onerror = () => reject(new Error('This image could not be opened. Please choose another file.'));
        image.src = url;
      });
      onChange(selected);
    } catch (error) { setError(error.message); }
    finally { URL.revokeObjectURL(url); setChecking(false); }
  }

  return <div className={styles.logoField}>
    <label htmlFor="community-logo">Company logo</label>
    <div className={styles.dropzone} data-dragging={dragging} data-invalid={Boolean(error)} onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); if (!disabled) void choose(event.dataTransfer.files?.[0]); }}>
      <input ref={input} className={styles.fileInput} id="community-logo" type="file" accept="image/png" tabIndex={-1} disabled={disabled || checking} aria-invalid={Boolean(error)} aria-describedby="community-logo-help community-logo-error" onChange={event => { void choose(event.target.files?.[0]); event.target.value = ''; }} />
      <button type="button" className={styles.uploadButton} disabled={disabled || checking} onClick={() => input.current?.click()}>
        <span className={styles.uploadIcon}>{checking ? <Loader2 size={22} className={styles.spin} aria-hidden="true" /> : preview ? <img src={preview} alt="Selected logo" /> : <Upload size={21} aria-hidden="true" />}</span>
        <span className={styles.uploadCopy}><strong>{checking ? 'Checking your logo…' : file ? file.name : 'Choose a logo or drop it here'}</strong><small>{file ? `${(file.size / 1024).toFixed(0)} KB · Click to replace` : 'Transparent PNG only · Up to 2 MB'}</small></span>
        {!file && <ImagePlus size={18} className={styles.uploadAdd} aria-hidden="true" />}
      </button>
      {file && <button type="button" className={styles.removeFile} disabled={disabled || checking} aria-label="Remove selected logo" onClick={() => { onChange(null); setError(''); }}><X size={16} aria-hidden="true" /></button>}
    </div>
    <small id="community-logo-help" className={styles.fieldHint}>Required: a PNG logo with the background removed.</small>
    <p id="community-logo-error" role="alert" className={styles.uploadError}>{error}</p>
  </div>;
}
