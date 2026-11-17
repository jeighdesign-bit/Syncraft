"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import Select from '@/components/Select';
import { EXTRACTION_RESOLUTIONS, extractionCredits } from '@/lib/extractionResolution.mjs';
import styles from './PropertiesPanel.module.css';

export default function ExtractionGenerationSettings({ models, selectedModel, configured, resolution, anchorRef, disabled, onModelChange, onResolutionChange, children }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const trigger = useRef(null);
  const popup = useRef(null);
  const id = useId();
  const expanded = open && !disabled;
  const index = EXTRACTION_RESOLUTIONS.findIndex(option => option.value === resolution);
  const close = () => { setOpen(false); trigger.current?.focus(); };

  useEffect(() => {
    if (!expanded) return;
    const place = () => {
      const rect = (anchorRef.current || trigger.current).getBoundingClientRect();
      const width = Math.min(rect.width, window.innerWidth - 24);
      const height = popup.current.getBoundingClientRect().height;
      const above = rect.top - height - 8;
      setPosition({ width, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top: Math.max(12, above >= 12 ? above : Math.min(rect.bottom + 8, window.innerHeight - height - 12)) });
    };
    const outside = event => { if (!popup.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false); };
    place();
    const resizeObserver = new ResizeObserver(place);
    resizeObserver.observe(popup.current);
    popup.current?.querySelector('button[aria-haspopup="listbox"]')?.focus();
    document.addEventListener('pointerdown', outside);
    document.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => { resizeObserver.disconnect(); document.removeEventListener('pointerdown', outside); document.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [expanded, anchorRef]);

  const chooseResolution = value => { if (!disabled) onResolutionChange?.(value); };
  return <div className={styles.settingsRoot}>
    <button ref={trigger} type="button" className={styles.settingsTrigger} disabled={disabled} aria-label="Model and resolution settings" aria-haspopup="dialog" aria-expanded={expanded} aria-controls={expanded ? id : undefined}
      onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}>
      <span>{children}</span><ChevronDown size={12} aria-hidden="true" />
    </button>
    {expanded && createPortal(<div id={id} ref={popup} className={styles.settingsPopover} role="dialog" aria-label="Model and resolution settings" style={position || { visibility: 'hidden' }}
      onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && !trigger.current?.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}>
      <div className={styles.settingsHeader}>
        <div className={styles.settingsHeading}><span className={styles.settingsModelLabel}>Choose your model</span>
          <div className={styles.settingsModel}>
            <Select compact menuPlacement="bottom" aria-label="Choose your model" value={selectedModel.value} disabled={disabled}
              renderOption={option => {
                const model = models.find(item => item.value === option.value);
                return <span className={styles.modelOption}><span className={styles.modelOptionHeading}>{model.name}{model.badge && <span className={styles.modelBadge}>{model.badge}</span>}</span><span className={styles.modelOptionDetail}>{option.disabled ? 'Currently unavailable' : model.detail}</span></span>;
              }} onChange={event => { if (!disabled) onModelChange?.(event.target.value); }}>
              {models.map(model => <option key={model.value} value={model.value} disabled={model.value === 'openai' && !configured}>{model.name}</option>)}
            </Select>
          </div>
        </div>
      </div>
      <div className={styles.resolutionAdjustment}>
        <input type="range" className={styles.resolutionSlider} min="0" max="2" step="1" value={Math.max(0, index)} disabled={disabled}
          aria-label="Output resolution" aria-valuetext={`${resolution}, ${extractionCredits(resolution)} credits`}
          style={{ '--resolution-progress': `${Math.max(0, index) * 50}%` }} onChange={event => chooseResolution(EXTRACTION_RESOLUTIONS[Number(event.target.value)].value)} />
        <div className={styles.resolutionStops}>{EXTRACTION_RESOLUTIONS.map(option => <button key={option.value} type="button" aria-label={`Set resolution to ${option.value}`} aria-pressed={option.value === resolution}
          disabled={disabled} title={`${option.value} · ${option.credits} credits`} onClick={() => chooseResolution(option.value)}>{option.value}</button>)}</div>
        {selectedModel.value === 'openai' && resolution === '4K' && <span className={styles.resolutionHint}>4K tier · up to 8.3 MP, size follows your crop</span>}
      </div>
    </div>, document.body)}
  </div>;
}
