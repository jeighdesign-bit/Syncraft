'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import WorkspaceHeader from '@/components/WorkspaceHeader';
import GenerationLoading from '@/components/GenerationLoading';
import WorkspaceTabs from '@/components/WorkspaceTabs';
import TopUpModal from '@/components/TopUpModal';
import { ArrowUp, ArrowUpRight, Crop, ImagePlus, Plus, Share2, Eye, Pencil, Layers3, History, WandSparkles, Scissors, Spline, Loader2, Check, X, FolderOpen, ChevronRight, TriangleAlert } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { fetchWithAuthRetry, uploadImageToStorage } from '@/utils/uploadClient';
import { LOGO_STYLES, LOGO_COST, LOGO_ACTIVE, logoOperationCost, logoGenerationQuota, groupLogoHistory } from '@/lib/logoStudio.mjs';
import { normalizeLogoDesignSettings } from '@/lib/logoDesignSettings.mjs';
import LoginModal from '@/app/components/LoginModal';
import SketchCanvas from './SketchCanvas';
import DownloadMenu from './DownloadMenu';
import DesignControls from './DesignControls';
import ColorControls from './ColorControls';
import ExamplePrompts from './ExamplePrompts';
import SourceCropModal from './SourceCropModal';
import ShareProjectModal from '@/app/workspace/[id]/components/ShareProjectModal';
import styles from './studio.module.css';

const modeItems = [{ id: 'text', name: 'Text', label: 'Text to Logo' }, { id: 'image', name: 'Image', label: 'Image to Logo' }, { id: 'sketch', name: 'Sketch', label: 'Sketch to Logo' }];
const examplesByMode = { text: [
  { title: 'Create a wordmark', category: 'Wordmark', style: 'wordmark', prompt: 'Custom lettering for a modern coffee brand, warm and confident, with clear letterforms that read well at small sizes', brand: 'Wildbrew' },
  { title: 'Design a mascot', category: 'Mascot', style: 'mascot', prompt: 'A friendly bear holding a coffee cup, with a bold silhouette and a playful expression', brand: 'Wildbrew' },
  { title: 'Explore a monogram', category: 'Monogram', style: 'monogram', prompt: 'Interlocking S and C initials with balanced negative space for a contemporary design studio', brand: 'Studio Collective' },
], image: [
  { title: 'Simplify the subject', category: 'Pictorial', style: 'pictorial', prompt: 'Keep the recognizable subject and its defining features, simplified into a clear logo silhouette.' },
  { title: 'Make a compact icon', category: 'Icon/Emoji', style: 'icon', prompt: 'Turn the subject into a friendly compact icon with bold shapes that stay clear at small sizes.' },
  { title: 'Give it an engraved look', category: 'Engraved', style: 'engraved', prompt: 'Keep the recognizable subject and add fine etched lines with a restrained single-ink look.' },
], sketch: [
  { title: 'Clean up the lines', category: 'Line art', style: 'line', prompt: 'Smooth the drawn lines while keeping the sketch silhouette, proportions, and arrangement.' },
  { title: 'Build a simple mark', category: 'Minimalist', style: 'minimalist', prompt: 'Refine the sketch into simple balanced shapes while preserving its recognizable form.' },
  { title: 'Make it a badge', category: 'Badge', style: 'badge', prompt: 'Keep the sketched subject recognizable inside a balanced badge with clear spacing.' },
] };
const inspirationLabels = { text: 'Need a little inspiration?', image: 'Ideas for your image', sketch: 'Ideas for your sketch' };
const displayOperation = { generate: 'Original', variations: 'Variation', edit: 'AI edit', removeBg: 'Transparent', vectorize: 'Vector SVG' };
const displayStatus = { starting: 'Starting', queued: 'In queue', running: 'Creating', saving: 'Saving', refunding: 'Returning credits', failed: 'Failed' };

function StyleMark({ index = 0 }) {
  return <svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><g stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    {index === 0 ? <><path d="M10 33 24 9l14 24H10Z" /><path d="m17 33 7-12 7 12" /></>
      : index === 1 ? <><path d="M14 17c-7-9 4-13 7-5h6c3-8 14-4 7 5 5 18-25 18-20 0Z" /><path d="M20 23h.01M28 23h.01m-7 5c2 2 4 2 6 0" /></>
      : index === 2 ? <><path d="M14 18c0-14 20-14 20 0v11c0 14-20 14-20 0Z" /><path d="M19 20v3m10-3v3m-10 7c3 3 7 3 10 0M9 26l5 3m20-3 5 3" /></>
      : index === 3 ? <><path d="m24 6 15 6v14L24 42 9 26V12L24 6Z" /><path d="m17 26 7-11 7 11m-13 3h12" /></>
      : index === 4 ? <><path d="M30 12H20c-12 0-12 12 0 12h8c12 0 12 12 0 12H15" /><path d="M34 15c-17-14-24 25 0 17" /></>
      : index === 5 ? <><path d="m9 34 9-23 9 23m-15-8h12m8-16v24h10" /></>
      : index === 6 ? <><path d="M8 34c0-26 32-26 32 0H8Zm7-6c0-16 18-16 18 0H15Z" /><path d="M24 17v17" /></>
      : <><path d="m24 6 6 12 12 6-12 6-6 12-6-12-12-6 12-6 6-12Z" /><path d="m24 17 7 7-7 7-7-7 7-7Z" /></>}
  </g></svg>;
}

export default function LogoStudio({ projectId: initialId = null, initialExample = null }) {
  const router = useRouter();
  const [mobileInputsOpen, setMobileInputsOpen] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const closeShare = useCallback(() => setShowShare(false), []);
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [credits, setCredits] = useState(null);
  const [project, setProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectLoading, setProjectLoading] = useState(Boolean(initialId));
  const [mode, setMode] = useState('text');
  const [sketchMode, setSketchMode] = useState('smart');
  const [brand, setBrand] = useState('');
  const [tagline, setTagline] = useState('');
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('minimalist');
  const [palette, setPalette] = useState([]);
  const [designSettingsByStyle, setDesignSettingsByStyle] = useState({});
  const designSettings = normalizeLogoDesignSettings(designSettingsByStyle[style], style, { strict: false });
  const updateDesignSettings = next => setDesignSettingsByStyle(old => {
    const normalized = normalizeLogoDesignSettings(next, style, { strict: false });
    const current = normalizeLogoDesignSettings(old[style], style, { strict: false });
    const keys = Object.keys(normalized);
    if (keys.length === Object.keys(current).length && keys.every(key => normalized[key] === current[key])) return old;
    return { ...old, [style]: normalized };
  });
  const [count, setCount] = useState(1);
  const [source, setSource] = useState(null);
  const [sourceOriginal, setSourceOriginal] = useState(null);
  const [sourceCrop, setSourceCrop] = useState(null);
  const [showSourceCrop, setShowSourceCrop] = useState(false);
  const [sketch, setSketch] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const promptRef = useRef(null);
  const [background, setBackground] = useState('white');
  const [compare, setCompare] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState('');
  const [notice, setNotice] = useState('');
  const inputRef = useRef(null);
  const projectRef = useRef(null);
  const requestedPreviewId = useRef(null);
  const busyRef = useRef(false);
  const restored = useRef(false);
  const hadSavedDraft = useRef(false);
  const previousUserId = useRef(null);
  const draftKey = `syncraft-logo-draft:${initialId || 'new'}`;

  const acceptProject = useCallback(next => {
    // Ignore out-of-order snapshots from concurrent poll/submit responses.
    const old = projectRef.current;
    if (old?.id === next.id && (old.revision || 0) > (next.revision || 0)) return;
    projectRef.current = next; setProject(next);
    const first = [...next.jobs].reverse().find(job => job.status === 'succeeded');
    const requested = next.jobs.find(job => job.id === requestedPreviewId.current);
    if (requested && ['succeeded', 'failed'].includes(requested.status)) requestedPreviewId.current = null;
    // An empty ID means the user closed the preview; polling must keep it closed.
    // A newly requested result may reopen it when the queued job completes.
    setSelectedId(current => requested?.status === 'succeeded' ? requested.id : current ?? first?.id ?? null);
  }, []);
  const request = useCallback(async (url, options = {}) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { setShowLogin(true); throw new Error('Sign in to save and create your logos.'); }
    const { response } = await fetchWithAuthRetry(url, { ...options, headers: { 'Content-Type': 'application/json' } }, token);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
    return result;
  }, [supabase]);
  const refreshCredits = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const result = await supabase.from('profiles').select('credits').eq('id', data.user.id).single();
    if (result.data) setCredits(result.data.credits);
    window.dispatchEvent(new Event('syncraft:credits-updated'));
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user || null); setAuthReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { setUser(session?.user || null); setAuthReady(true); });
    return () => data.subscription.unsubscribe();
  }, [supabase]);
  useEffect(() => {
    try {
      const draft = initialExample ? {
        mode: 'text', brand: initialExample.brand || '', prompt: initialExample.prompt,
        style: initialExample.style, designSettingsByStyle: { [initialExample.style]: initialExample.designSettings || {} },
      } : JSON.parse(sessionStorage.getItem(draftKey) || 'null');
      hadSavedDraft.current = Boolean(draft);
      if (draft) { setMode(draft.mode || 'text'); setSketchMode(draft.sketchMode === 'precise' ? 'precise' : 'smart'); setBrand(draft.brand || ''); setTagline(draft.tagline || ''); setPrompt(draft.prompt || ''); setStyle(draft.style || 'minimalist'); setPalette(draft.palette || []); setDesignSettingsByStyle(draft.designSettingsByStyle || {}); }
    } catch {}
    restored.current = true;
  }, [draftKey, initialExample]);
  useEffect(() => {
    if (restored.current && (!initialId || !projectLoading)) sessionStorage.setItem(draftKey, JSON.stringify({ mode, sketchMode, brand, tagline, prompt, style, palette, designSettingsByStyle }));
  }, [mode, sketchMode, brand, tagline, prompt, style, palette, designSettingsByStyle, draftKey, initialId, projectLoading]);
  useEffect(() => {
    if (!authReady) return;
    if (previousUserId.current !== (user?.id || null)) {
      previousUserId.current = user?.id || null;
      setShowShare(false);
      projectRef.current = null; setProject(null); setSelectedId(null); setProjects([]);
    }
    if (!user) { setProjectLoading(false); setCredits(null); return; }
    let cancelled = false;
    refreshCredits();
    request('/api/logo-studio').then(data => { if (!cancelled) setProjects(data.projects); }).catch(err => { if (!cancelled) setError(err.message); });
    if (initialId) {
      setProjectLoading(true);
      request(`/api/logo-studio?id=${initialId}`).then(data => {
        if (cancelled) return;
        acceptProject(data.project);
        if (!hadSavedDraft.current) {
          const latest = [...data.project.jobs].reverse().find(job => ['generate', 'variations'].includes(job.operation));
          if (latest) { setMode(latest.mode || 'text'); setSketchMode(latest.sketchMode === 'precise' ? 'precise' : 'smart'); setBrand(latest.brand || ''); setTagline(latest.tagline || ''); setPrompt(latest.prompt || ''); setStyle(latest.style); setPalette(latest.palette || []); setDesignSettingsByStyle({ [latest.style]: normalizeLogoDesignSettings(latest.designSettings, latest.style, { strict: false }) }); }
        }
      })
        .catch(err => { if (!cancelled) setError(err.message); }).finally(() => { if (!cancelled) setProjectLoading(false); });
    }
    return () => { cancelled = true; };
  }, [user?.id, authReady, initialId, request, acceptProject, refreshCredits]);

  useEffect(() => {
    if (!project?.id || !user) return;
    let stopped = false; let timer;
    const poll = async () => {
      const current = projectRef.current;
      const active = current.jobs.filter(job => LOGO_ACTIVE.includes(job.status));
      try {
        // A single job per request keeps finalization bounded and safe across tabs.
        if (active.length) {
          for (const job of active) {
            if (stopped) return;
            const data = await request(`/api/logo-studio?id=${current.id}&job=${job.id}`);
            if (!stopped) acceptProject(data.project);
          }
          if (!stopped) { setPollError(''); await refreshCredits(); }
        } else {
          const data = await request(`/api/logo-studio?id=${current.id}`);
          if (!stopped) { acceptProject(data.project); setPollError(''); }
        }
      } catch (err) { if (!stopped) setPollError('Connection interrupted. Your saved jobs will resume when the connection returns.'); }
      if (!stopped) timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 2500);
    return () => { stopped = true; clearTimeout(timer); };
  }, [project?.id, user?.id, request, acceptProject, refreshCredits]);

  const jobs = project?.jobs || [];
  const quota = logoGenerationQuota(jobs);
  const generationUnitCost = logoOperationCost('generate', mode);
  const generationCount = Math.min(count, quota.remaining);
  const selected = jobs.find(job => job.id === selectedId && job.status === 'succeeded' && (job.mode || 'text') === mode);
  const parent = jobs.find(job => job.id === selected?.sourceId && job.status === 'succeeded');
  const hasActive = jobs.some(job => LOGO_ACTIVE.includes(job.status));
  const locked = busy || hasActive || projectLoading;
  const projectAccess = project?.access || 'owner';
  const canEditProject = ['owner', 'edit'].includes(projectAccess);
  const isProjectOwner = projectAccess === 'owner';
  const inputLocked = locked || !canEditProject;
  const completed = jobs.filter(job => job.status === 'succeeded');
  const hasVectorExport = selected?.format === 'svg' || jobs.some(job => job.operation === 'vectorize' && job.sourceId === selected?.id && job.status === 'succeeded' && job.format === 'svg' && job.url);
  const needsWordmarkName = style === 'wordmark' && !brand.trim();
  const needsImageMonogramText = mode === 'image' && style === 'monogram' && !brand.trim() && !designSettings.monogramLetters;
  const canGenerate = canEditProject && !showSourceCrop && quota.remaining > 0 && !needsWordmarkName && !needsImageMonogramText && (mode === 'text' ? Boolean(prompt.trim() || style === 'wordmark' && brand.trim() || style === 'monogram' && designSettings.monogramLetters) : Boolean(mode === 'image' ? source : source || sketch));
  const imageSrc = url => `/api/proxy?url=${encodeURIComponent(url)}`;

  async function uploadSource() {
    let file = source;
    if (!file && mode === 'sketch' && sketch) {
      const blob = await (await fetch(sketch)).blob(); file = new File([blob], 'sketch.png', { type: 'image/png' });
    }
    if (!file) return null;
    const { data } = await supabase.auth.getSession();
    return uploadImageToStorage(file, { token: data.session?.access_token, fileName: `${crypto.randomUUID()}.${file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1]}` });
  }
  async function run(operation = 'generate') {
    if (busyRef.current || locked) return;
    if (!canEditProject) { setError('This project is shared with view-only access.'); return; }
    if (!user) { setShowLogin(true); return; }
    if (['generate', 'variations'].includes(operation) && !quota.remaining) { setError('This project has reached its 4-logo limit. Start a new project to create more logos.'); return; }
    const requiredCredits = logoOperationCost(operation, mode) * (['generate', 'variations'].includes(operation) ? generationCount : 1);
    if (credits != null && credits < requiredCredits) { setError(`You need ${requiredCredits} credits for this request. Choose fewer options or add credits from your Syncraft account.`); return; }
    busyRef.current = true; setBusy(true); setError(''); setNotice(''); setCompare(false);
    try {
      let current = projectRef.current;
      if (!current) {
        if (initialId) throw new Error('This project could not be loaded. Open a new Logo Studio project.');
        current = (await request('/api/logo-studio', { method: 'POST', body: JSON.stringify({ action: 'create', name: brand || 'Untitled logo' }) })).project;
        acceptProject(current);
        // Keep the mounted form and sketch intact while giving the project a permanent URL.
        window.history.replaceState(null, '', `/logo-studio/${current.id}`);
      }
      const sourceUrl = operation === 'generate' && mode !== 'text' ? await uploadSource() : null;
      const total = ['generate', 'variations'].includes(operation) ? generationCount : 1;
      let lastSuccess = null;
      const errors = [];
      if (operation === 'generate' && mode === 'text') {
        const requestId = crypto.randomUUID();
        const result = await request('/api/logo-studio', { method: 'POST', body: JSON.stringify({
          action: 'generate-text-batch', projectId: current.id, requestId, operation, mode,
          count: generationCount, style, prompt, brand, tagline, palette, designSettings,
        }) });
        acceptProject(result.project);
        const batchJobs = result.project.jobs.slice(-generationCount);
        requestedPreviewId.current = batchJobs.at(-1)?.id;
        for (const job of batchJobs) {
          if (job.status === 'failed') errors.push(job.error);
          if (job.status === 'succeeded') lastSuccess = job.id;
        }
      } else {
      for (let slot = 0; slot < total; slot++) {
        try {
          const requestId = crypto.randomUUID();
          requestedPreviewId.current = requestId;
          const result = await request('/api/logo-studio', { method: 'POST', body: JSON.stringify({
            projectId: current.id, requestId, operation, mode, ...(operation === 'generate' && mode === 'sketch' ? { sketchMode } : {}),
            style: operation === 'generate' ? style : selected.style,
            prompt: operation === 'edit' ? editPrompt : operation === 'generate' ? prompt : selected.prompt,
            brand: operation === 'generate' ? brand : selected.brand,
            tagline: operation === 'generate' ? tagline : selected.tagline,
            palette: operation === 'generate' ? palette : selected.palette,
            designSettings: operation === 'generate' ? designSettings : {},
            ...(operation === 'generate' ? { sourceUrl } : { sourceId: selected.id }),
          }) });
          acceptProject(result.project);
          const newest = result.project.jobs.at(-1);
          if (newest?.status === 'failed') errors.push(newest.error);
          if (newest?.status === 'succeeded') lastSuccess = newest.id;
        } catch (err) { errors.push(err.message); break; }
      }
      }
      if (lastSuccess) setSelectedId(lastSuccess);
      if (errors.length) setError([...new Set(errors)].join(' '));
      else setNotice(operation === 'vectorize' ? 'SVG saved. Select Download to export it.' : 'Request saved. You can leave and reopen this project.');
      setEditing(false); await refreshCredits();
    } catch (err) { setError(err.message); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function download(format) {
    if (!selected || downloading) return;
    setDownloading(true); setError('');
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) { setShowLogin(true); return; }
      const { response } = await fetchWithAuthRetry('/api/logo-studio/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, jobId: selected.id, format }),
      }, data.session.access_token);
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Download failed. Please try again.');
      }
      const blob = await response.blob(); const url = URL.createObjectURL(blob);
      const name = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1];
      const link = document.createElement('a'); link.href = url; link.download = name || `logo-${selected.id.slice(0, 6)}.${format}`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) { setError(err.message); } finally { setDownloading(false); }
  }
  const [sourcePreview, setSourcePreview] = useState(null);
  useEffect(() => {
    if (!source) { setSourcePreview(null); return; }
    const url = URL.createObjectURL(source);
    setSourcePreview({ file: source, url });
    return () => URL.revokeObjectURL(url);
  }, [source]);
  function pickSource(file) {
    if (!file || inputLocked) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024) { setError('Upload a PNG, JPG or WebP up to 4 MB.'); return; }
    setSource(file); setSourceOriginal(file); setSourceCrop(null); setShowSourceCrop(mode !== 'sketch'); setSketch(null); setError('');
    if (mode === 'text') setMode('image');
  }
  function clearSource() {
    setSource(null); setSourceOriginal(null); setSourceCrop(null); setShowSourceCrop(false);
  }
  function restoreSource() {
    if (sourceOriginal) setSource(sourceOriginal);
    setSourceCrop(null); setShowSourceCrop(false);
  }
  function changeMode(next) {
    if (next === mode) return;
    requestedPreviewId.current = null;
    setMode(next); clearSource(); setSketch(null);
    setSelectedId(''); setCompare(false); setEditing(false); setEditPrompt('');
  }

  return <main className={styles.studio}>
    <WorkspaceHeader
      title="LOGO STUDIO"
      eyebrow="AI LOGO CREATION"
      user={user}
      credits={credits}
      onHome={() => router.push('/workspace')}
      onOpenTopUp={() => setShowTopUp(true)}
      onSignOut={async () => { await supabase.auth.signOut(); router.push('/'); }}
      onSignIn={() => setShowLogin(true)}
      actions={<>
        <button type="button" className={styles.newProjectButton} title="Start a new logo project" onClick={() => { try { sessionStorage.removeItem('syncraft-logo-draft:new'); } catch {} window.location.assign('/logo-studio'); }}><span className={styles.newProjectIcon}><Plus size={14} strokeWidth={1.8} aria-hidden="true" /></span><span>New project</span></button>
        {isProjectOwner ? <button type="button" className="workspace-share-button" disabled={!project?.id || projectLoading} title={project?.id ? 'Share this logo project' : 'Create a logo project before sharing'} onClick={() => setShowShare(true)}><Share2 size={14} aria-hidden="true" /><span>Share</span></button>
          : <span className="workspace-access-badge">{canEditProject ? <Pencil size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />}<span>{canEditProject ? 'Can edit' : 'View only'}</span></span>}
      </>}
    />
    <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload a logo reference" disabled={inputLocked} hidden onChange={event => { pickSource(event.target.files?.[0]); event.target.value = ''; }} />
    <button type="button" className={styles.mobileInputsToggle} aria-expanded={mobileInputsOpen} aria-controls="logo-studio-inputs" onClick={() => setMobileInputsOpen(value => !value)}>{mobileInputsOpen ? 'Close style & inputs' : 'Style, reference & brand inputs'}<ChevronRight size={16} aria-hidden="true" /></button>
    <div className={styles.workbench}>
      <aside id="logo-studio-inputs" className={styles.controls} data-mobile-open={mobileInputsOpen} aria-label="Logo styles and inputs">
        <div className={styles.intro}><span className={styles.eyebrow}>FROM AN IDEA TO AN IDENTITY</span><h2>Make your mark<span>.</span></h2></div>
        <section className={styles.sidebarSection} aria-label="Style categories">
          <div className={styles.sectionLabel}>Style categories <span>{LOGO_STYLES.length} styles</span></div>
          <div className={styles.styleGrid}>{LOGO_STYLES.map(item => <button key={item.id} disabled={inputLocked} aria-pressed={style === item.id} className={style === item.id ? styles.styleSelected : ''} onClick={() => setStyle(item.id)}><img className={styles.stylePreview} src={`/images/logo-styles/${item.id}.webp`} alt="" width={48} height={48} decoding="async" draggable={false} /><span>{item.name}</span>{style === item.id && <Check className={styles.styleCheck} size={11} />}</button>)}</div>
        </section>
        <section className={styles.sidebarSection} aria-label="Input image or sketch">
          <div className={styles.sectionLabel}>{mode === 'text' ? 'Your brief' : mode === 'image' ? 'Reference image' : 'Your sketch'}</div>
          <div id="logo-input-panel" role="tabpanel" aria-labelledby={`logo-tab-${mode}`}>
          {mode === 'sketch' && !source && <SketchCanvas onChange={setSketch} disabled={inputLocked} />}
          {mode !== 'text' && <div className={styles.upload}>
            {source && sourcePreview?.file === source ? <div className={styles.sourcePreview}><img src={sourcePreview.url} alt="Your source image" /><button disabled={inputLocked} aria-label="Remove source image" onClick={clearSource}><X size={15} /></button><span>{source.name}</span>{mode === 'image' && <div className={styles.sourceActions}><button type="button" disabled={inputLocked} onClick={() => setShowSourceCrop(true)}><Crop size={13} aria-hidden="true" />{sourceCrop ? 'Adjust crop' : 'Crop image'}</button>{sourceCrop && <button type="button" disabled={inputLocked} onClick={restoreSource}>Reset</button>}</div>}</div>
              : <button className={styles.uploadButton} disabled={inputLocked} onClick={() => inputRef.current?.click()}><ImagePlus size={22} /><strong>{mode === 'sketch' ? 'Or upload a sketch' : 'Upload your image'}</strong><span>PNG, JPG, WebP · up to 4 MB</span></button>}
          </div>}
            {mode === 'text' && <p className={styles.hint}>Describe your logo in the prompt panel below the canvas.</p>}
            {mode === 'image' && <p className={styles.hint}>Your image and selected style are enough to generate. Add a direction below only if you want to guide colors, expression, or details.</p>}
          </div>
        </section>
        <section className={styles.sidebarSection} aria-label="Brand settings">
          <label className={styles.field}>Brand name <span>{style === 'wordmark' ? 'Required for Wordmark' : mode === 'image' && style === 'monogram' ? 'Or set main letters below' : 'Optional'}</span><input value={brand} maxLength={100} disabled={inputLocked} required={style === 'wordmark' || mode === 'image' && style === 'monogram' && !designSettings.monogramLetters} placeholder={style === 'wordmark' ? 'Exact text for your wordmark' : mode === 'image' && style === 'monogram' ? 'Brand name for initials' : "What's your brand called?"} onChange={event => setBrand(event.target.value)} /></label>
          <details className={styles.details}><summary>Tagline & brand colors <Plus size={13} /></summary><label className={styles.field}>Tagline <input value={tagline} disabled={inputLocked} maxLength={160} placeholder="A few words to go with it" onChange={event => setTagline(event.target.value)} /></label><div className={styles.paletteLabel}>Palette <span>Optional · AI colors are approximate</span></div><div className={styles.colors}>{palette.map((color, index) => <div key={index} className={styles.color}><input type="color" value={color} disabled={inputLocked} aria-label={`Brand color ${index + 1}`} onChange={event => setPalette(palette.map((old, n) => n === index ? event.target.value : old))} /><button disabled={inputLocked} aria-label={`Remove color ${index + 1}`} onClick={() => setPalette(palette.filter((_, n) => n !== index))}><X size={11} /></button></div>)}{palette.length < 3 && <button disabled={inputLocked} onClick={() => setPalette([...palette, '#b8a7ff'])}><Plus size={15} /> Add color</button>}</div></details>
        </section>
        {projects.length > 0 && <div className={styles.projectList}><div className={styles.sectionLabel}><span><FolderOpen size={14} /> Your logo projects</span><small>Files expire after 3 days. Download your favorites.</small></div><div className={styles.projectItems}>{projects.map(item => <Link key={item.id} href={`/logo-studio/${item.id}`} title={item.name}><span>{item.name}</span><ArrowUpRight size={13} aria-hidden="true" /></Link>)}</div></div>}
        <footer className={styles.footer}><span><Spline size={13} /> From first concept to SVG.</span><span>Review spelling and fine details before using your logo.</span></footer>
      </aside>

      <section className={styles.canvasColumn} aria-label="Logo workspace">
        <div className={styles.canvasViewport}>
        <div className={styles.canvasTop}>
          <div className={styles.canvasProject}><span className={styles.eyebrow}>YOUR WORKSPACE</span><h2 title={project?.name || 'A fresh start.'}>{project?.name || 'A fresh start.'}</h2></div>
          <WorkspaceTabs items={modeItems} value={mode} disabled={inputLocked} label="Logo creation mode" idPrefix="logo-tab" controlsId="logo-input-panel" className={styles.canvasModes}
            onChange={changeMode} />
          <ExamplePrompts disabled={inputLocked} onSelect={example => { changeMode('text'); setSelectedId(''); setEditing(false); setCompare(false); setStyle(example.style); setPrompt(example.prompt); setBrand(example.brand); setTagline(''); setPalette([]); setDesignSettingsByStyle(old => ({ ...old, [example.style]: example.designSettings || {} })); clearSource(); setSketch(null); promptRef.current?.focus(); }} />
        </div>
        {(error || pollError) && <div role="alert" className={styles.error}><TriangleAlert size={16} /><span>{error || pollError}</span><button aria-label="Dismiss message" onClick={() => { setError(''); setPollError(''); }}><X size={15} /></button></div>}
        {notice && <div role="status" className={styles.notice}>{notice}</div>}
        {projectLoading ? <div className={styles.empty}><Loader2 className={styles.spin} size={30} /><h2>Opening your workspace…</h2></div>
          : busy || hasActive ? <div className={`${styles.previewStage} ${styles.emptyStage}`}><div className={`${styles.empty} ${styles.emptyCanvas} ${styles.generatingCanvas}`}><GenerationLoading label="Generating your logo" /></div></div>
          : selected ? <>
            <div className={styles.previewToolbar}><span>{displayOperation[selected.operation]} <b>{selected.format.toUpperCase()}</b></span><div>{parent && <button aria-pressed={compare} onClick={() => setCompare(!compare)}><Layers3 size={13} /> Compare</button>}<div className={styles.backgroundChoices} aria-label="Preview background">{['white', 'dark', 'checker'].map(value => <button key={value} aria-label={`${value} preview background`} aria-pressed={background === value} className={styles[value]} onClick={() => setBackground(value)} />)}</div></div></div>
            <div className={styles.previewStage}>
            <div className={`${styles.preview} ${styles[background]} ${compare ? styles.comparison : ''}`}>
              <button type="button" className={styles.closePreview} disabled={locked} aria-label="Close logo preview" title="Close preview and create another logo"
                onClick={() => { requestedPreviewId.current = null; setSelectedId(''); setCompare(false); setEditing(false); setPrompt(''); setEditPrompt(''); setNotice(''); promptRef.current?.focus(); }}><X size={18} aria-hidden="true" /></button>
              {compare && parent && <figure><img src={imageSrc(parent.url)} alt="Previous logo version" /><figcaption>Before</figcaption></figure>}
              <figure><img src={imageSrc(selected.url)} alt={`${brand || project.name} logo, ${displayOperation[selected.operation]}`} /><figcaption>{compare ? 'After' : ''}</figcaption></figure>
            </div>
            </div>
            <div className={styles.actions}>
              <button disabled={inputLocked} onClick={() => { setEditing(!editing); setCompare(false); }}><WandSparkles size={15} /> AI edit <small>{LOGO_COST.edit} cr</small></button>
              <button disabled={inputLocked || !quota.remaining} onClick={() => run('variations')}><Layers3 size={15} /> Variations <small>{LOGO_COST.variations * generationCount} cr</small></button>
              <button disabled={inputLocked || selected.operation === 'removeBg'} onClick={() => run('removeBg')}><Scissors size={15} /> Remove BG <small>{LOGO_COST.removeBg} cr</small></button>
              <button disabled={inputLocked || hasVectorExport} onClick={() => run('vectorize')}><Spline size={15} /> Vectorize <small>{LOGO_COST.vectorize} cr</small></button>
              <DownloadMenu downloading={downloading} hasVector={hasVectorExport} onDownload={download} />
            </div>
          </> : <div className={`${styles.previewStage} ${styles.emptyStage}`}>
          <div className={`${styles.empty} ${styles.emptyCanvas}`} role="region" aria-label="Logo canvas">
            <div className={styles.emptyArt}><div className={styles.orbit} /><div className={styles.emblem}><StyleMark index={7} /></div><span className={styles.artLabel}>YOURS TO CREATE</span></div>
            <span className={styles.eyebrow}>{hasActive ? 'A LITTLE CREATIVITY IN PROGRESS' : 'EVERY GREAT BRAND STARTS SOMEWHERE'}</span>
            <h2>{hasActive ? 'Your ideas are taking shape.' : 'An idea. A mark. Your brand.'}</h2>
            <p>{hasActive ? 'We’re creating your logos. Results will appear here and stay with your project.' : 'Choose a mode above. We’ll help you turn your idea into something that feels like you.'}</p>
            {!hasActive && <div className={styles.steps}><span>01 Describe</span><ChevronRight size={12} /><span>02 Refine</span><ChevronRight size={12} /><span>03 Export</span></div>}
          </div>
          </div>}

        {!completed.length && !editing && <div className={styles.examples}><span className={styles.sectionLabel}>{inspirationLabels[mode]}</span><div>{examplesByMode[mode].map(example => <button key={example.style} disabled={inputLocked} aria-label={`${example.category}: ${example.title}`} onClick={() => { setPrompt(example.prompt); setStyle(example.style); if (example.brand !== undefined) setBrand(example.brand); promptRef.current?.focus(); }}><span className={styles.exampleIcon}><StyleMark index={LOGO_STYLES.findIndex(item => item.id === example.style)} /></span><span>{example.title}</span><ArrowUpRight size={13} /></button>)}</div></div>}
        </div>
        <div className={styles.promptDock} aria-label="Prompt panel">
          <form className={styles.composer} aria-label={editing && selected ? 'Edit logo' : 'Create a logo'} onSubmit={event => { event.preventDefault(); if (editing && selected ? editPrompt.trim() : canGenerate) run(editing && selected ? 'edit' : 'generate'); }}>
            <div className={styles.promptInput}>
              <label className={styles.promptLabel} htmlFor="logo-prompt">{editing && selected ? 'What would you like to change?' : mode === 'image' ? 'Optional image direction' : 'Your idea'}</label>
              <textarea ref={promptRef} id="logo-prompt" aria-describedby="logo-prompt-cost" value={editing && selected ? editPrompt : prompt} maxLength={1800} disabled={inputLocked}
                placeholder={editing && selected ? 'Describe what to change. We’ll keep your original version.' : style === 'wordmark' ? 'Optional: e.g. Bold lettering, red and black…' : mode === 'text' ? 'e.g. A coffee cup with mountain peaks…' : mode === 'image' ? `Optional: guide the ${LOGO_STYLES.find(item => item.id === style)?.name || 'selected'} style, e.g. navy and orange, confident expression…` : 'Optional: e.g. Navy and orange, fierce expression…'}
                onChange={event => editing && selected ? setEditPrompt(event.target.value) : setPrompt(event.target.value)} rows={3} />
              {!(editing && selected) && <DesignControls style={style} styleName={LOGO_STYLES.find(item => item.id === style)?.name} settings={designSettings} onChange={updateDesignSettings} brand={brand} onBrandChange={setBrand} tagline={tagline} onTaglineChange={setTagline} disabled={inputLocked} />}
              <div className={styles.promptToolbar}>
                <div className={styles.promptTools}>
                  {editing && selected ? <button type="button" className={styles.promptChip} onClick={() => setEditing(false)}><X size={13} /> Cancel edit</button>
                    : <><button type="button" className={styles.attachButton} disabled={inputLocked} aria-label="Attach a reference image" title="Attach a reference image" onClick={() => inputRef.current?.click()}><Plus size={17} /></button><span className={styles.promptMode}>{source ? source.name : `${modeItems.find(item => item.id === mode)?.name} to logo`}</span>{mode === 'sketch' && <div className={styles.sketchModePicker} role="group" aria-label="How closely to follow your sketch">{[['smart', 'Smart', 'Polish the idea in your sketch'], ['precise', 'Precise', 'Keep the sketch layout closer']].map(([value, label, title]) => <button key={value} type="button" disabled={inputLocked} aria-pressed={sketchMode === value} title={title} onClick={() => setSketchMode(value)}>{label}</button>)}</div>}</>}
                </div>
                <div className={styles.composerActions}>
                  {!(editing && selected) && <ColorControls settings={designSettings} onChange={updateDesignSettings} disabled={inputLocked} />}
                  {!(editing && selected) && <div className={styles.promptOptions} role="group" aria-label="Number of logo options"><span>Options</span>{Array.from({ length: quota.remaining }, (_, index) => index + 1).map(number => <button type="button" key={number} disabled={inputLocked} aria-pressed={generationCount === number} onClick={() => setCount(number)}>{number}</button>)}</div>}
                  {editing && selected && <span className={styles.promptMode}>Original preserved</span>}
                  <span className={styles.promptCost}>{editing && selected ? LOGO_COST.edit : generationUnitCost * generationCount} cr</span>
                  <button className={styles.generate} disabled={inputLocked || (editing && selected ? !editPrompt.trim() : !canGenerate) || !authReady} type="submit"
                    aria-label={!canEditProject ? 'View-only project' : locked ? 'Creating logos' : editing && selected ? 'Apply edit' : `Generate ${generationCount} ${generationCount === 1 ? 'logo' : 'logos'}`}
                    title={!canEditProject ? 'View-only project' : locked ? 'Creating…' : editing && selected ? 'Apply edit' : `Generate ${generationCount} ${generationCount === 1 ? 'logo' : 'logos'}`} aria-busy={locked} aria-describedby="logo-prompt-cost">
                    {locked ? <Loader2 className={styles.spin} size={20} aria-hidden="true" /> : <ArrowUp size={20} strokeWidth={1.8} aria-hidden="true" />}
                  </button>
                </div>
              </div>
            </div>
            <p className={styles.billingNote} id="logo-prompt-cost">{!canEditProject ? 'View-only access · You can preview and download saved logos.' : !quota.remaining && !(editing && selected) ? "4-logo limit reached. Start a new project to create more." : <>{editing && selected ? LOGO_COST.edit : generationUnitCost * generationCount} credits · {projectAccess === 'edit' ? 'Uses your credits. ' : ''}Failed outputs are refunded.</>}</p>
          </form>
        </div>
      </section>
      <aside className={styles.historyRail} aria-label="Logo version history">
        <div className={styles.history}>
          <div className={styles.historyHeading}><h2><History size={15} aria-hidden="true" /> History</h2><span className={styles.historyCount} aria-label={`${completed.length} saved versions`}>{completed.length}</span></div>
          <p className={styles.historyHint} aria-live="polite">{quota.used}/{quota.limit} logos · {quota.remaining ? `${quota.remaining} remaining` : "Limit reached"}</p>
          {jobs.length ? <><div className={styles.historyGrid}>{groupLogoHistory(jobs).flatMap((group, groupIndex) => [
            ...(groupIndex ? [<hr key={`divider-${group.id}`} className={styles.historyGroupDivider} aria-label="Separate logo" />] : []),
            ...group.jobs.map(job => <button key={job.id} disabled={job.status !== 'succeeded'} aria-pressed={selected?.id === job.id} className={selected?.id === job.id ? styles.historySelected : ''} onClick={() => { if ((job.mode || 'text') !== mode) changeMode(job.mode || 'text'); requestedPreviewId.current = null; setSelectedId(job.id); setCompare(false); setEditing(false); }} aria-label={`Version ${jobs.indexOf(job) + 1}, ${displayOperation[job.operation]}, ${job.status}`} title={job.error || job.prompt}>
            <div className={`${styles.historyThumb} ${!job.url ? styles.historyPending : ''}`}>{job.url ? <img src={imageSrc(job.url)} alt="" loading="lazy" /> : job.status === 'failed' ? <TriangleAlert size={20} /> : <Loader2 className={styles.spin} size={20} />}{selected?.id === job.id && <span className={styles.historyCheck}><Check size={12} aria-hidden="true" /></span>}</div>
            <span className={styles.historyTitle}>{displayOperation[job.operation]}</span><small>{job.status === 'succeeded' ? `V${jobs.indexOf(job) + 1} · ${job.format.toUpperCase()}` : displayStatus[job.status]}</small>{job.error && <p>{job.error}</p>}
          </button>)])}</div><p className={styles.historyHint}>Select a version to preview.</p><hr className={styles.historyDivider} /></>
            : <div className={styles.historyEmpty}><div className={styles.historyEmptyIcon} aria-hidden="true"><Layers3 size={24} strokeWidth={1.5} /></div><h3>No versions yet</h3><p>Your logos will appear here after generation.</p></div>}
        </div>
      </aside>
    </div>
    {showSourceCrop && mode === 'image' && source && !inputLocked && <SourceCropModal file={sourceOriginal || source} initialCrop={sourceCrop} onClose={() => setShowSourceCrop(false)} onFullImage={restoreSource} onApply={(file, crop) => { setSourceOriginal(sourceOriginal || source); setSource(file); setSourceCrop(crop); setShowSourceCrop(false); }} />}
    <TopUpModal show={showTopUp} user={user} supabase={supabase} onClose={() => { setShowTopUp(false); refreshCredits(); }} />
    {project && isProjectOwner && <ShareProjectModal show={showShare} project={project} user={user} supabase={supabase} onClose={closeShare} />}
    <LoginModal show={showLogin} onClose={() => setShowLogin(false)} supabase={supabase} />
  </main>;
}
