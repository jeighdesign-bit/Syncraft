'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2, Globe, Shapes, RefreshCw, Loader2 } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { communityFetch } from '@/utils/communityClient';
import LoginModal from '@/app/components/LoginModal';
import Select from '@/components/Select';
import CommunityLogoUpload from './CommunityLogoUpload';
import styles from './community.module.css';

const labels = { pending: 'Pending review', approved: 'Approved', changes_requested: 'Needs changes', withdrawn: 'Withdrawn' };
const statusDescriptions = {
  pending: 'Your logo is waiting for review. It is not on the homepage yet.',
  approved: 'Your logo is live on the homepage.',
  changes_requested: 'Please make the changes below, then submit your logo again.',
  withdrawn: 'Your logo is hidden. Submit it again if you want to be featured.',
};

function LogoPreview({ submission, className = styles.logoPreview }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl;
    setUrl(''); setFailed(false);
    communityFetch(`/api/community/logo?id=${submission.id}&v=${submission.revision}`)
      .then(response => response.blob()).then(blob => {
        if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
      }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [submission.id, submission.revision]);
  return <div className={className}>{url ? <img src={url} alt={`${submission.business_name} logo`} /> : <span>{failed ? 'Preview unavailable' : 'Loading logo…'}</span>}</div>;
}

function ReviewCard({ submission, busy, onReview }) {
  const [note, setNote] = useState(submission.review_note || '');
  return <article className={styles.reviewCard}>
    <LogoPreview submission={submission} />
    <div className={styles.reviewBody}>
      <div className={styles.cardHeading}><h2>{submission.business_name}</h2><span className={styles.status} data-status={submission.status}>{labels[submission.status]}</span></div>
      <a href={submission.website} target="_blank" rel="noopener noreferrer" className={styles.website}>{submission.website}<ArrowUpRight size={16} aria-hidden="true" /></a>
      <p className={styles.muted}>Submitted {new Date(submission.created_at).toLocaleDateString()}. Display permission confirmed {new Date(submission.consent_at).toLocaleDateString()}.</p>
      {submission.status !== 'withdrawn' && <>
        <label htmlFor={`note-${submission.id}`}>Review note <span>(required when requesting changes)</span></label>
        <textarea id={`note-${submission.id}`} value={note} onChange={e => setNote(e.target.value)} maxLength={500} rows={2} disabled={busy} placeholder="Explain what needs updating, or add an approval note." />
        <div className={styles.actions}>
          {submission.status !== 'approved' && <button className={styles.primary} disabled={busy} onClick={() => onReview(submission, 'approved', note)}><Check size={16} aria-hidden="true" />Approve &amp; publish</button>}
          <button className={styles.secondary} disabled={busy || !note.trim()} onClick={() => onReview(submission, 'changes_requested', note)}>{submission.status === 'approved' ? 'Unpublish & request changes' : 'Request changes'}</button>
        </div>
      </>}
    </div>
  </article>;
}

export default function CommunityPortal({ admin = false, embedded = false, onBusyChange, returnTo }) {
  const [supabase] = useState(createClient);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [login, setLogin] = useState(false);
  const [submission, setSubmission] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [consent, setConsent] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [filter, setFilter] = useState('pending');
  const loadVersion = useRef(0);

  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { setUser(session?.user || null); setAuthReady(true); });
    return () => subscription.unsubscribe();
  }, [supabase]);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    const response = await communityFetch(admin ? '/api/admin/community' : '/api/community?mine=1');
    const data = await response.json();
    if (version !== loadVersion.current) return;
    if (admin) setRows(data.submissions);
    else {
      setSubmission(data.submission);
      setName(data.submission?.business_name || '');
      setWebsite(data.submission?.website || '');
    }
  }, [admin]);

  useEffect(() => {
    if (!authReady) return;
    if (!user) { setSubmission(null); setRows([]); setName(''); setWebsite(''); setFile(null); setConsent(false); setNotice(''); setError(''); setLoading(false); return; }
    let active = true;
    setLoading(true); setError('');
    load().catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; loadVersion.current += 1; };
  }, [authReady, user?.id, load]);

  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function act(work) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function submit(event) {
    event.preventDefault();
    await act(async () => {
      if (!file) throw new Error('Choose a logo to submit.');
      const form = new FormData();
      form.set('businessName', name); form.set('website', website); form.set('consent', String(consent)); form.set('logo', file);
      const response = await communityFetch('/api/community', { method: 'POST', body: form });
      setSubmission((await response.json()).submission);
      setFile(null); setConsent(false); setConfirmWithdraw(false);
      setNotice('Your logo was submitted for review. It will appear on the homepage after approval.');
    });
  }

  async function review(row, status, note) {
    await act(async () => {
      const response = await communityFetch('/api/admin/community', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, revision: row.revision, status, note }) });
      const { submission: updated } = await response.json();
      setRows(current => current.map(item => item.id === updated.id ? { ...item, ...updated } : item));
      setNotice(status === 'approved' ? 'Approved. This business is now featured on the homepage.' : 'Review saved. This business is hidden from the homepage.');
    });
  }

  const Content = embedded ? 'div' : 'main';
  return <div className={`${styles.page}${embedded ? ` ${styles.embedded}` : ''}`}>
    {!embedded && <header className={styles.header}><Link href={admin ? '/admin' : '/workspace'} aria-label={admin ? 'Back to admin dashboard' : 'Back to workspace'}><ArrowLeft size={18} aria-hidden="true" /><img src="/logo.svg" alt="Syncraft" width="120" height="28" /></Link><span>COMMUNITY</span></header>}
    <Content className={styles.main}>
      {!embedded && <div className={styles.intro}><span className={styles.eyebrow}>{admin ? 'COMMUNITY REVIEW' : 'A LITTLE VISIBILITY FOR YOUR BUSINESS'}</span><h1>{admin ? 'Community submissions' : 'Meet Our Community'}</h1><p>{admin ? 'Review each business, logo and destination link before publishing. Only approve genuine, relevant businesses with permission to display their logo.' : 'Put your sublimation business in the spotlight.'}</p></div>}
      {notice && <div role="status" className={styles.notice}>{notice}</div>}
      {error && <div role="alert" className={styles.error}>{error}<button type="button" disabled={busy || loading} onClick={() => act(load)}>Refresh</button></div>}
      {!authReady || loading ? <p role="status" className={styles.empty}>Loading…</p> : !user ? <section className={styles.card}><h2>Sign in to {admin ? 'review submissions' : 'submit your logo'}</h2><p>Use your Syncraft account to continue.</p><button className={styles.primary} onClick={() => setLogin(true)}>Sign in</button></section> : admin ? <>
        <div className={styles.toolbar}><label>Show<Select value={filter} disabled={busy} onChange={e => setFilter(e.target.value)}><option value="all">All submissions</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label><button className={styles.secondary} disabled={busy} onClick={() => act(load)}><RefreshCw size={16} aria-hidden="true" />Refresh</button></div>
        <div className={styles.reviewList}>{rows.filter(row => filter === 'all' || row.status === filter).map(row => <ReviewCard key={`${row.id}-${row.revision}`} submission={row} busy={busy} onReview={review} />)}</div>
        {!rows.some(row => filter === 'all' || row.status === filter) && <p className={styles.empty}>{error ? 'Submissions could not be loaded.' : 'No submissions in this category.'}</p>}
        <p className={styles.muted}>Showing the latest 200 submissions. Withdrawn listings cannot be republished; the business must resubmit.</p>
      </> : <div className={styles.layout}>
        <form className={styles.card} onSubmit={submit}>
          <div className={styles.formIntro}><h3>{submission ? 'Update your submission' : 'Your business details'}</h3><p>{submission ? 'Choose a new PNG and submit your updated details for review.' : 'Upload your logo, add your details, then submit for review.'}</p></div>
          <fieldset disabled={busy} className={styles.fields}>
            <CommunityLogoUpload file={file} preview={preview} disabled={busy} onChange={setFile} />
            <div className={styles.inputField}><label htmlFor="community-name">Business name</label><input id="community-name" value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={100} required placeholder="e.g. Your Print Studio" autoComplete="organization" /></div>
            <div className={styles.inputField}><label htmlFor="community-website">Website or social media link</label><div className={styles.linkInput}><Globe size={17} aria-hidden="true" /><input id="community-website" value={website} onChange={e => setWebsite(e.target.value)} maxLength={500} required placeholder="https://facebook.com/yourbusiness" autoComplete="url" aria-describedby="community-link-help" /></div><small id="community-link-help" className={styles.fieldHint}>Visitors open this page when they click your logo.</small></div>
            <label className={styles.consent}><input type="checkbox" checked={consent} required onChange={e => setConsent(e.target.checked)} /><span>I represent this business and give Syncraft permission to feature its logo, name and link.</span></label>
            <div className={styles.submitArea}><button className={styles.primary} disabled={!file || !consent || name.trim().length < 2 || !website.trim()}>{busy ? <><Loader2 size={17} className={styles.spin} aria-hidden="true" />Submitting…</> : <>{submission ? 'Resubmit for review' : 'Submit for review'}<ArrowRight size={17} aria-hidden="true" /></>}</button><small><CheckCircle2 size={13} aria-hidden="true" />Free to submit. Reviewed before it goes live.</small></div>
          </fieldset>
          {submission?.status === 'approved' && <p className={styles.updateWarning}>Resubmitting hides your current logo until the update is approved.</p>}
        </form>
        <aside className={styles.details}>
          {embedded && <section className={styles.livePreview} aria-label="Homepage logo preview">
            <div className={styles.previewLabel}><span className={styles.previewDot} />HOMEPAGE PREVIEW</div>
            <h3>Meet Our Community</h3>
            <p>Your logo joins a clean, slowly scrolling row.</p>
            <div className={styles.previewStage}>
              <Shapes size={30} strokeWidth={1.3} className={styles.previewNeighbor} aria-hidden="true" />
              <div className={styles.previewLogo}>{preview ? <img src={preview} alt="Your logo in the showcase" /> : submission ? <LogoPreview submission={submission} className={styles.previewSavedLogo} /> : <Shapes size={42} strokeWidth={1.3} aria-hidden="true" />}</div>
              <Shapes size={30} strokeWidth={1.3} className={styles.previewNeighbor} aria-hidden="true" />
            </div>
            <p className={styles.previewCaption}>Logos appear in gray. Visitors click your logo to open your business link.</p>
            <ol className={styles.previewSteps}>
              <li><strong>Upload your logo</strong><span>Transparent PNG, up to 2 MB.</span></li>
              <li><strong>Add your business details</strong><span>Your name and website or social page.</span></li>
              <li><strong>We review, then publish</strong><span>Your logo appears only after approval.</span></li>
            </ol>
            <small className={styles.communityDisclaimer}>You can withdraw anytime. Being featured does not imply a partnership or endorsement.</small>
          </section>}
          {submission && <section className={styles.card}><div className={styles.cardHeading}><h2>Your submission</h2><span className={styles.status} data-status={submission.status}>{labels[submission.status]}</span></div>{!embedded && <LogoPreview submission={submission} />}<p className={styles.submissionDescription}>{statusDescriptions[submission.status]}</p><a className={styles.website} href={submission.website} target="_blank" rel="noopener noreferrer">Visit business page<ArrowUpRight size={15} aria-hidden="true" /></a>{submission.review_note && <p className={styles.reviewNote}>{submission.review_note}</p>}{submission.status !== 'withdrawn' && <div className={styles.withdraw}>{confirmWithdraw ? <><p>Remove this submission from the showcase and review queue?</p><div className={styles.actions}><button className={styles.secondary} disabled={busy} onClick={() => setConfirmWithdraw(false)}>Keep submission</button><button className={styles.secondary} disabled={busy} onClick={() => act(async () => { const response = await communityFetch('/api/community', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: submission.revision }) }); setSubmission((await response.json()).submission); setConfirmWithdraw(false); setNotice('Your submission has been withdrawn and is hidden from the homepage.'); })}>Withdraw now</button></div></> : <button className={styles.textButton} disabled={busy} onClick={() => setConfirmWithdraw(true)}>Withdraw submission</button>}</div>}</section>}
          {!embedded && <section className={styles.guidelines}><h2>A space for our community.</h2><p>We review every submission. A listing does not indicate a partnership, sponsorship or endorsement. You can withdraw at any time.</p></section>}
        </aside>
      </div>}
    </Content>
    <LoginModal show={login} onClose={() => setLogin(false)} supabase={supabase} returnTo={returnTo || (admin ? '/admin/community' : '/?community=submit')} />
  </div>;
}
