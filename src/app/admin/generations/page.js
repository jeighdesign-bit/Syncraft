"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { ArrowLeft, ChevronLeft, ChevronRight, Clock3, ExternalLink, ImageIcon, RefreshCw, X } from 'lucide-react';
import styles from './history.module.css';

const tools = { mockup: 'Garment extraction', logo: 'Logo extraction', universal: 'Universal extraction', upscale: 'Upscale', bg_remover: 'Background removal' };
const mediaUrl = (id, kind = 'output', size = 'thumb') => `/api/admin/generations/media?${new URLSearchParams({ id, kind, size })}`;
const date = value => new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
const expiry = value => {
  const hours = Math.max(0, Math.ceil((Date.parse(value) - Date.now()) / 3_600_000));
  return hours > 24 ? `${Math.ceil(hours / 24)} days left` : hours ? `${hours}h left` : 'Expired';
};

function Preview({ project, kind, size = 'thumb' }) {
  const [failed, setFailed] = useState(false);
  if (failed || (kind === 'input' && !project.hasInput)) return <div className={styles.unavailable}><ImageIcon size={24} /><span>Preview unavailable</span></div>;
  // Same-origin cookies authenticate these protected images; no storage URL or
  // account credential is sent in the image URL.
  return <img src={mediaUrl(project.id, kind, size)} alt={`${kind === 'input' ? 'Input reference' : 'Saved result'}: ${project.name}`} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

function ResultDialog({ project, request, onClose }) {
  const dialog = useRef(null);
  const [details, setDetails] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    const controller = new AbortController();
    request(`?id=${project.id}`, controller.signal).then(data => setDetails(data.project)).catch(error => { if (error.name !== 'AbortError') setError(error.message); });
    return () => controller.abort();
  }, [project.id, request]);
  return <dialog ref={dialog} className={styles.dialog} onCancel={onClose} aria-labelledby="history-result-title">
    <header className={styles.dialogHeader}><div><span className={styles.eyebrow}>{tools[project.tool] || 'Generation'}</span><h2 id="history-result-title">{project.name}</h2></div><button className={styles.iconButton} aria-label="Close preview" onClick={onClose}><X size={20} /></button></header>
    <div className={styles.comparison}>{['input', 'output'].map(kind => <section key={kind}><h3>{kind === 'input' ? 'Input reference' : 'Latest saved result'}</h3><div className={styles.largePreview}><Preview project={project} kind={kind} size="preview" /></div></section>)}</div>
    <div className={styles.detailBody}>
      <div className={styles.detailRow}><span>Account</span><strong>{details?.email || project.userId}</strong></div>
      <div className={styles.detailRow}><span>Created</span><span>{date(project.createdAt)}</span></div>
      <div className={styles.detailRow}><span>Expires</span><span>{date(project.expiresAt)}</span></div>
      <p className={styles.muted}>Project ID: {project.id}</p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {details?.activity?.length > 0 && <section className={styles.activity}><h3>Recent provider activity</h3><p className={styles.muted}>Project activity may include edits made after this result was saved.</p>{details.activity.map((entry, index) => <div className={styles.activityRow} key={index}><span><strong>{entry.provider}</strong> · {entry.model}<small>{date(entry.createdAt)} · {entry.status}</small></span>{Number.isFinite(entry.costUsd) && <span>${entry.costUsd.toFixed(5)}</span>}</div>)}</section>}
      <a className={styles.button} href={mediaUrl(project.id, 'output', 'full')} target="_blank" rel="noopener noreferrer">Open full result <ExternalLink size={15} /></a>
    </div>
  </dialog>;
}

export default function GenerationHistory() {
  const [supabase] = useState(() => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tool, setTool] = useState('');
  const [userDraft, setUserDraft] = useState('');
  const [userId, setUserId] = useState('');
  const [cursors, setCursors] = useState(['']);
  const [nextCursor, setNextCursor] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState(null);
  const sessionEpoch = useRef(0);
  const cursor = cursors[cursors.length - 1];

  const request = useCallback(async (query, signal) => {
    const epoch = sessionEpoch.current;
    const response = await fetch(`/api/admin/generations${query}`, { credentials: 'same-origin', cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000) });
    const body = await response.json();
    if (epoch !== sessionEpoch.current) throw new DOMException('The account session changed.', 'AbortError');
    if (!response.ok) throw new Error(response.status === 403 ? 'This account does not have admin access.' : body.error || 'Unable to load history.');
    return body;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setItems([]); setNextCursor(null); setSelected(null);
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    if (tool) params.set('tool', tool);
    if (userId) params.set('user', userId);
    request(`?${params}`, controller.signal).then(body => {
      if (!controller.signal.aborted) { setItems(body.projects); setNextCursor(body.nextCursor); }
    }).catch(error => { if (!controller.signal.aborted && error.name !== 'AbortError') setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [request, cursor, tool, userId, refresh]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') { sessionEpoch.current++; setItems([]); setSelected(null); setNextCursor(null); setError('Sign in with your Syncraft admin account to view generation history.'); }
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!items.length) return;
    const nextExpiry = Math.min(...items.map(item => Date.parse(item.expiresAt)));
    const timer = setTimeout(() => {
      setItems(current => current.filter(item => Date.parse(item.expiresAt) > Date.now()));
      setSelected(current => current && Date.parse(current.expiresAt) > Date.now() ? current : null);
    }, Math.max(0, nextExpiry - Date.now()) + 50);
    return () => clearTimeout(timer);
  }, [items]);

  return <main className={styles.page}>
    <div className={styles.shell}>
      <header className={styles.header}><div><Link href="/admin" className={styles.back}><ArrowLeft size={15} /> Admin</Link><span className={styles.eyebrow}>SYNCRAFT · ADMIN ONLY</span><h1>Generation history</h1><p className={styles.subtitle}>Review your users’ input references and latest saved results.</p></div><button className={styles.button} disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16} className={loading ? styles.spin : ''} /> Refresh</button></header>
      <div className={styles.retention}><Clock3 size={18} /><div><strong>Available for 3 days from project creation</strong><p>Uses existing project files. Updates replace the saved result; earlier versions are not archived.</p></div></div>
      <form className={styles.filters} onSubmit={event => { event.preventDefault(); setUserId(userDraft.trim()); setCursors(['']); }}>
        <label>Feature<select value={tool} onChange={event => { setTool(event.target.value); setCursors(['']); }}><option value="">All features</option>{Object.entries(tools).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className={styles.search}>User ID <span>(optional)</span><input value={userDraft} onChange={event => setUserDraft(event.target.value)} placeholder="Paste a user UUID" pattern="[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}" /></label>
        <button className={styles.button} type="submit" disabled={loading}>Apply filter</button>
        {(userId || tool) && <button className={styles.textButton} type="button" onClick={() => { setTool(''); setUserId(''); setUserDraft(''); setCursors(['']); }}>Clear</button>}
      </form>
      {error ? <div role="alert" className={styles.empty}><ImageIcon size={28} /><h2>History unavailable</h2><p className={styles.error}>{error}</p><Link href="/workspace" className={styles.button}>Back to workspace</Link></div>
        : loading ? <div className={styles.empty} role="status"><RefreshCw className={styles.spin} size={24} /><p>Loading recent results…</p></div>
        : !items.length ? <div className={styles.empty}><ImageIcon size={30} /><h2>No saved results here</h2><p>Only completed results from unexpired projects appear here.</p></div>
        : <div className={styles.grid}>{items.map(item => <button key={item.id} className={styles.card} onClick={() => setSelected(item)} aria-label={`Preview ${item.name}`}><div className={styles.thumbnail}><Preview project={item} kind="output" /><span className={styles.expiry}>{expiry(item.expiresAt)}</span></div><div className={styles.cardBody}><span className={styles.tool}>{tools[item.tool] || 'Generation'}</span><h2>{item.name}</h2><p>User {item.userId?.slice(0, 8)}…</p><small>{date(item.createdAt)}</small></div></button>)}</div>}
      {!error && <nav className={styles.pagination} aria-label="History pages"><span>{loading ? 'Loading…' : `${items.length} results on this page`} · Page {cursors.length}</span><div><button className={styles.button} disabled={loading || cursors.length === 1} onClick={() => setCursors(current => current.slice(0, -1))}><ChevronLeft size={16} /> Previous</button><button className={styles.button} disabled={loading || !nextCursor} onClick={() => setCursors(current => [...current, nextCursor])}>Next <ChevronRight size={16} /></button></div></nav>}
    </div>
    {selected && <ResultDialog key={selected.id} project={selected} request={request} onClose={() => setSelected(null)} />}
  </main>;
}
