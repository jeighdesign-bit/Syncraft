'use client';

import { useRef } from 'react';
import styles from './studio.module.css';

const clamp = value => Math.max(0, Math.min(1, value));

export default function EditArea({ area, onChange, disabled }) {
  const start = useRef(null);
  const point = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) };
  };
  function move(event) {
    if (!start.current || disabled) return;
    const end = point(event);
    onChange({ x: Math.min(start.current.x, end.x), y: Math.min(start.current.y, end.y),
      width: Math.abs(end.x - start.current.x), height: Math.abs(end.y - start.current.y) });
  }
  return <div className={styles.editArea} role="group" aria-label="Choose the logo area to edit">
    <button type="button" className={styles.editAreaSurface} disabled={disabled}
      aria-label="Edit area: drag to select. Arrow keys move the selection; Shift and arrow keys resize it."
      onPointerDown={event => { if (disabled) return; event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); start.current = point(event); }}
      onPointerMove={move} onPointerUp={event => { move(event); start.current = null; }}
      onPointerCancel={() => { start.current = null; }} onLostPointerCapture={() => { start.current = null; }}
      onKeyDown={event => {
        const delta = { ArrowLeft: [-0.02, 0], ArrowRight: [0.02, 0], ArrowUp: [0, -0.02], ArrowDown: [0, 0.02] }[event.key];
        if (!delta) return;
        event.preventDefault();
        const next = { ...area };
        if (event.shiftKey) { next.width = Math.max(0.02, Math.min(1 - area.x, area.width + delta[0])); next.height = Math.max(0.02, Math.min(1 - area.y, area.height + delta[1])); }
        else { next.x = Math.max(0, Math.min(1 - area.width, area.x + delta[0])); next.y = Math.max(0, Math.min(1 - area.height, area.y + delta[1])); }
        onChange(next);
      }}>
      <span className={styles.editAreaRectangle} style={{ left: `${area.x * 100}%`, top: `${area.y * 100}%`, width: `${area.width * 100}%`, height: `${area.height * 100}%` }} />
    </button>
  </div>;
}
