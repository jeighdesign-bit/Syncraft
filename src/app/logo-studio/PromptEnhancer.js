'use client';

import { useEffect, useRef, useState } from 'react';
import { WandSparkles, RotateCcw, Loader2 } from 'lucide-react';
import { toast } from '@/components/Toast';
import { logoEnhancerContextKey, normalizeLogoPromptEnhancement } from '@/lib/logoPromptEnhancer.mjs';
import styles from './promptEnhancer.module.css';

export default function PromptEnhancer({ prompt, style, designSettings, palette, brand, tagline, projectId, enhancement, request, onApply, onUndo, onLoadingChange, disabled }) {
  const sequence = useRef(0);
  const busy = useRef(false);
  const undo = useRef(null);
  const [loading, setLoading] = useState(false);
  const original = enhancement?.originalPrompt || prompt;
  const input = { mode: 'text', prompt: original, style, designSettings, palette, hasBrand: Boolean(brand.trim()), hasTagline: Boolean(tagline.trim()) };
  let contextKey = '';
  try { if (original.trim()) contextKey = logoEnhancerContextKey(input); } catch { /* Invalid saved drafts must not break the workspace. */ }
  // Include the visible idea and wording in the local snapshot, while sending
  // only wording-presence flags to the model. Late replies never replace edits.
  const snapshot = JSON.stringify([contextKey, prompt, brand, tagline, projectId, disabled]);
  const latest = useRef(snapshot);
  latest.current = snapshot;

  function invalidate() {
    sequence.current += 1; busy.current = false;
    setLoading(false); onLoadingChange?.(false);
  }
  useEffect(() => { invalidate(); }, [snapshot]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { sequence.current += 1; onLoadingChange?.(false); }, [onLoadingChange]);

  async function enhance() {
    if (busy.current || disabled || !contextKey) return;
    busy.current = true;
    const attempt = ++sequence.current;
    const startedWith = snapshot;
    setLoading(true); onLoadingChange?.(true);
    try {
      const result = await request('/api/logo-studio/enhance', { method: 'POST', body: JSON.stringify({ ...input,
        requestId: crypto.randomUUID(), ...(projectId ? { projectId } : {}), ...(enhancement ? { previousSuggestion: enhancement.enhancedPrompt } : {}) }) });
      if (attempt !== sequence.current || latest.current !== startedWith) return;
      if (result.contextKey !== contextKey || result.originalPrompt !== original.trim()) throw new Error('Your idea has changed. Enhance it again.');
      const next = normalizeLogoPromptEnhancement({ version: result.version, originalPrompt: result.originalPrompt, enhancedPrompt: result.enhancedPrompt }, result.enhancedPrompt);
      undo.current = { applied: next.enhancedPrompt, prompt, enhancement };
      onApply(next);
    } catch (error) {
      if (attempt === sequence.current && latest.current === startedWith) toast.error(error.message || 'Could not enhance your idea. Try again.');
    } finally {
      if (attempt === sequence.current) { busy.current = false; setLoading(false); onLoadingChange?.(false); }
    }
  }
  function restore() {
    const previous = undo.current?.applied === prompt ? undo.current : { prompt: original, enhancement: null };
    onUndo({ prompt: previous.prompt, enhancement: previous.enhancement }); undo.current = null;
  }

  return <span className={styles.tools}>
      <button type="button" className={styles.trigger} disabled={disabled || !contextKey || loading} onClick={enhance} aria-label={loading ? 'Enhancing prompt' : 'Enhance prompt'} aria-busy={loading} title="Enhance your idea directly">{loading ? <Loader2 size={14} className={styles.spin} aria-hidden="true" /> : <WandSparkles size={14} aria-hidden="true" />}<span>{loading ? 'Enhancing…' : 'Enhance'}</span></button>
      {enhancement && <button type="button" className={styles.undo} disabled={disabled || loading} onClick={restore} aria-label="Undo prompt enhancement" title="Restore the previous idea"><RotateCcw size={13} aria-hidden="true" /><span>Undo</span></button>}
      <span className={styles.status} role="status">{loading ? 'Enhancing your prompt…' : ''}</span>
    </span>;
}
