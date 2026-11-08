'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Pencil, RotateCcw, X } from 'lucide-react';
import Select from '@/components/Select';
import { logoDesignFields } from '@/lib/logoDesignSettings.mjs';
import { requiresLogoBrand, supportsLogoBrandOnly } from '@/lib/logoStyleCapabilities.mjs';
import styles from './designControls.module.css';

const compactLabels = {
  letterType: 'Letters', detail: 'Detail', rendering: 'Treatment', fontFamily: 'Font', lettering: 'Lettering', composition: 'Alignment',
  characterComposition: 'Framing', outlineThickness: 'Outline', capitalization: 'Case', monogramTreatment: 'Treatment', monogramWeight: 'Weight', monogramFont: 'Font',
  structure: 'Structure', symbolConstruction: 'Mark', lineThickness: 'Thickness', lineStructure: 'Structure', badgeType: 'Type',
  badgeDirection: 'Direction', badgeSubject: 'Subject', badgeView: 'View', badgeLayout: 'Layout',
  badgeShape: 'Shape', badgeDetail: 'Detail', viewpoint: 'View', engravingStyle: 'Treatment', engravingTechnique: 'Technique',
  lineQuality: 'Line quality', mood: 'Mood', personality: 'Personality', industry: 'Industry',
  streetwearLetters: 'Letters', streetwearLayout: 'Layout', streetwearOutline: 'Outline', streetwearDepth: 'Depth',
};

export default function DesignControls({ mode, style, settings, onChange, brand, onBrandChange, tagline, onTaglineChange, disabled = false }) {
  const [textField, setTextField] = useState(null);
  const root = useRef(null);
  const track = useRef(null);
  const input = useRef(null);
  const trigger = useRef(null);
  const id = useId();
  const fields = logoDesignFields(style, { mode });
  const [expanded, setExpanded] = useState(false);
  const activeCount = fields.filter(([key]) => settings[key]).length;
  // Keep selected controls visible, even when they belong to the optional group.
  const shownFields = fields.filter(([key], index) => expanded || index < 4 || settings[key]);
  const hiddenCount = fields.length - shownFields.length;
  const hasTextChips = supportsLogoBrandOnly(style) || style === 'badge';
  const missingBrand = requiresLogoBrand(style) && !brand?.trim();

  useEffect(() => { if (textField) input.current?.focus(); }, [textField]);
  useEffect(() => {
    if (!textField) return;
    const outside = event => { if (!root.current?.contains(event.target)) setTextField(null); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [textField]);
  useEffect(() => { setTextField(null); }, [style, disabled]);
  useEffect(() => { setExpanded(false); }, [mode, style]);

  function close() { setTextField(null); trigger.current?.focus(); }
  function editText(field, event) {
    trigger.current = event.currentTarget;
    setTextField(old => old === field ? null : field);
  }
  return <div ref={root} className={styles.controls} role="group" aria-label="Logo design settings" aria-describedby={`${id}-hint`}>
    <span className={styles.srOnly} id={`${id}-hint`}>Optional design settings. Choose Auto in a menu to let the selected style guide that setting.</span>
    <div className={styles.row}>
      <div className={styles.track} ref={track}>
        {hasTextChips && <><button type="button" className={`${styles.textChip} ${missingBrand ? styles.requiredText : ''}`} disabled={disabled} aria-label={missingBrand ? 'Add required logo name' : style === 'wordmark' && !brand ? 'Logo name (optional)' : undefined} aria-expanded={textField === 'brand'} aria-controls={`${id}-text-panel`} title={missingBrand ? 'Enter the exact logo name to enable Generate' : 'Edit your main text'} onClick={event => editText('brand', event)}><Pencil size={12} aria-hidden="true" /><span>{missingBrand ? 'Logo name · Required' : brand || (style === 'wordmark' ? 'Name · Optional' : 'Your main text')}</span></button>
        <button type="button" className={styles.textChip} disabled={disabled} aria-expanded={textField === 'tagline'} aria-controls={`${id}-text-panel`} title="Edit tagline" onClick={event => editText('tagline', event)}><Pencil size={12} aria-hidden="true" /><span>{tagline || 'Tagline'}</span></button></>}
        {shownFields.map(([key, field]) => field.type === 'initials' ? <button type="button" key={key} className={styles.textChip} disabled={disabled} aria-expanded={textField === 'initials'} aria-controls={`${id}-text-panel`} title="Edit monogram letters" onClick={event => editText('initials', event)}><Pencil size={12} aria-hidden="true" /><span>{settings[key] ? `Letters: ${settings[key]}` : 'Your main letters'}</span></button> : <div key={key} className={`${styles.selectChip} ${settings[key] ? styles.chosen : ''}`} title={`${field.label}: ${field.options.find(option => option.id === settings[key])?.label || 'Auto'}`}>
          <Select compact portal displayLabel={field.options.find(option => option.id === settings[key])?.label || compactLabels[key] || field.label} aria-label={field.label} value={settings[key] || ''} disabled={disabled} onFocus={() => setTextField(null)} onChange={event => onChange({ ...settings, [key]: event.target.value })}>
            <option value="">Auto · {compactLabels[key] || field.label}</option>
            {field.options.map(option => <option value={option.id} key={option.id}>{option.label}</option>)}
          </Select>
        </div>)}
        {(hiddenCount > 0 || expanded) && <button type="button" className={styles.more} disabled={disabled} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Fewer settings' : `More settings · ${hiddenCount}`}<ChevronDown size={13} aria-hidden="true" /></button>}
      </div>
      {activeCount > 0 && <button type="button" className={styles.reset} disabled={disabled} aria-label="Reset design settings to Auto" title="Reset design settings to Auto" onClick={() => onChange(Object.fromEntries(Object.entries(settings).filter(([key]) => !fields.some(([fieldKey]) => fieldKey === key))))}><RotateCcw size={13} aria-hidden="true" /></button>}
    </div>
    {textField && !disabled && <div id={`${id}-text-panel`} className={styles.textPanel} onKeyDown={event => { if (event.key === 'Escape' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); close(); } }}>
      <div className={styles.panelHeading}><label htmlFor={`${id}-text-input`}>{textField === 'initials' ? 'Main letters' : textField === 'brand' ? 'Your main text' : 'Tagline'}</label><button type="button" onClick={close} aria-label="Close text settings"><X size={15} aria-hidden="true" /></button></div>
      <input ref={input} id={`${id}-text-input`} aria-required={textField === 'brand' && requiresLogoBrand(style)} maxLength={textField === 'initials' ? 6 : textField === 'brand' ? 100 : 160} value={textField === 'initials' ? settings.monogramLetters || '' : textField === 'brand' ? brand : tagline} placeholder={textField === 'initials' ? 'e.g. SC' : textField === 'brand' ? 'Exact words for your logo' : 'Optional supporting line'} onChange={event => textField === 'initials' ? onChange({ ...settings, monogramLetters: Array.from(event.target.value).filter(char => /[\p{L}\p{N}]/u.test(char)).slice(0, 3).join('') }) : textField === 'brand' ? onBrandChange(event.target.value) : onTaglineChange(event.target.value)} />
      <p>{textField === 'initials' ? 'Choose 1–3 letters or numbers for your monogram.' : textField === 'brand' ? 'Use the exact words you want in your logo.' : 'Keep it short so it stays readable.'}</p>
    </div>}
  </div>;
}
