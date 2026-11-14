'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import CommunityPortal from './CommunityPortal';
import styles from './community.module.css';

export default function CommunitySubmissionModal({ onClose, returnTo = '/?community=submit' }) {
  const dialog = useRef(null);
  const titleId = useId();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return <dialog ref={dialog} className={styles.modal} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => {
    if (busy || event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }}>
    <header className={styles.modalHeader}><div><span>MEET OUR COMMUNITY</span><h2 id={titleId} tabIndex={-1} autoFocus>Share your business logo</h2><p>Get featured on the Syncraft homepage after approval. Free to submit.</p></div><button type="button" className={styles.closeModal} aria-label="Close logo submission" disabled={busy} onClick={onClose}><X size={20} aria-hidden="true" /></button></header>
    <CommunityPortal embedded onBusyChange={setBusy} returnTo={returnTo} />
  </dialog>;
}
