"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import styles from "./ResponsivePanel.module.css";

// Native modal dialogs keep keyboard focus and background scrolling inside the drawer.
export default function ResponsivePanel({ label, icon: Icon, side = "left", children }) {
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(false);
  const dialog = useRef(null);
  const trigger = useRef(null);
  const id = useId();
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1100px)");
    const update = () => { setCompact(query.matches); setOpen(false); };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!compact || !open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [compact, open]);
  useEffect(() => {
    if (!compact) return;
    const element = dialog.current;
    if (open && !element.open) element.showModal();
    if (!open && element.open) { element.close(); trigger.current?.focus(); }
  }, [compact, open]);
  const close = () => setOpen(false);
  if (!compact) return children({ compact: false, close });
  return <>
    <button ref={trigger} type="button" className={`${styles.trigger} ${styles[side]}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={() => setOpen(true)}>
      <Icon size={18} aria-hidden="true" /><span>{label}</span>
    </button>
    <dialog ref={dialog} id={id} className={`${styles.drawer} ${styles[side]}`} aria-label={label}
      onCancel={event => { event.preventDefault(); close(); }}
      onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } }}>
      <button type="button" className={styles.close} onClick={close} aria-label={`Close ${label}`} autoFocus><X size={18} /></button>
      {children({ compact: true, close })}
    </dialog>
  </>;
}
