"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ThumbsUp, MessageSquare, Search, Send } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import styles from './page.module.css';
import Select from '@/components/Select';
import ProfileAvatar from '@/components/ProfileAvatar';

const supabase = createClient();
const statuses = ['Under review','Planned','In progress','Completed','Closed'];
const blank = { title: '', body: '', category: 'feature' };

export default function FeedbackPage() {
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [admin, setAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [category, setCategory] = useState('all');
  const [commentSort, setCommentSort] = useState('newest');
  const [draft, setDraft] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [editComment, setEditComment] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const confirmationRef = useRef(null);

  useEffect(() => {
    if (!deleteTarget) return;
    const previous = document.activeElement;
    confirmationRef.current?.showModal();
    return () => { confirmationRef.current?.close(); previous?.focus?.(); };
  }, [deleteTarget]);

  const api = useCallback(async (body, method = 'GET', postId) => {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`/api/feedback${postId ? `?postId=${postId}` : ''}`, {
      method, cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load feedback.');
    return data;
  }, []);
  const load = useCallback(async () => {
    const data = await api();
    setPosts(data.posts); setAdmin(data.isAdmin);
  }, [api]);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      setLoading(true);
      try { const { data } = await supabase.auth.getSession(); if (active) setUser(data.session?.user || null); await load(); }
      catch (e) { if (active) setError(e.message); }
      finally { if (active) setLoading(false); }
    };
    void refresh();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { setTimeout(() => { if (active) void refresh(); }, 0); });
    return () => { active = false; subscription.unsubscribe(); };
  }, [load]);
  useEffect(() => {
    let active = true;
    setComments([]); setComment(''); setEditComment(null);
    if (!selected) return;
    setCommentsLoading(true);
    api(null, 'GET', selected).then(data => { if (active) setComments(data.comments); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setCommentsLoading(false); });
    return () => { active = false; };
  }, [selected, api]);
  const act = async (body, method = 'POST', after) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(body, method);
      after?.();
      setNotice(body.kind === 'vote' ? (method === 'DELETE' ? 'Like removed.' : 'Liked!') : body.kind === 'comment' ? (method === 'DELETE' ? 'Comment deleted.' : 'Comment saved.') : 'Post saved.');
      try {
        await load();
        if (selected && !(method === 'DELETE' && body.kind === 'post')) setComments((await api(null, 'GET', selected)).comments);
      } catch {
        setError('Your change was saved, but the feed could not refresh. Use Retry to reload it.');
      }
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const shown = posts.filter(p => (selected ? p.id === selected : (category === 'all' || p.category === category) && `${p.title} ${p.body}`.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => sort === 'popular' ? b.votes - a.votes || Date.parse(b.created_at) - Date.parse(a.created_at) : sort === 'trending' ? ((b.votes + b.comments * 2) / Math.pow(2 + (Date.now() - Date.parse(b.created_at)) / 86400000, 1.2)) - ((a.votes + a.comments * 2) / Math.pow(2 + (Date.now() - Date.parse(a.created_at)) / 86400000, 1.2)) : Date.parse(b.created_at) - Date.parse(a.created_at));

  return <div className={styles.page}>
    <header className={styles.topbar}>
      <Link href="/" aria-label="Syncraft home"><img src="/logo.svg" alt="Syncraft" width="126" height="32" /></Link>
    </header>
    <main className={styles.main}>
      <div className={styles.intro}><span>COMMUNITY FEEDBACK</span><h1>Help shape Syncraft.</h1><p>Suggest something useful, report a problem, or join the conversation.</p></div>
      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="Feedback boards">
          <p>BOARDS</p>
          <Link href="/feedback" className={styles.board} aria-current={selected ? undefined : 'page'} onClick={event => { event.preventDefault(); if (!busy) { setSelected(null); setSearch(''); setCategory('all'); } }}><MessageSquare size={19} aria-hidden="true" /><span><strong>Community feedback</strong><small>Ideas &amp; bug reports</small></span></Link>
          <div className={styles.boardNote}><strong>Help us improve.</strong><p>Share an idea or report a problem. Requests help guide our priorities.</p><small>Not every suggestion will be built.</small></div>
        </aside>
        <section className={styles.content} aria-label="Feedback posts">
          {notice && <div className={styles.notice} role="status">{notice}</div>}
          {error && <div className={styles.error} role="alert">{error}<button disabled={busy || loading} onClick={() => { setError(''); setLoading(true); load().catch(e => setError(e.message)).finally(() => setLoading(false)); }}>Retry</button></div>}
          {(!selected || editing) && <form className={styles.composer} onSubmit={e => { e.preventDefault(); void act({ kind: 'post', ...draft, ...(editing ? { id: editing } : {}) }, editing ? 'PATCH' : 'POST', () => { setDraft(blank); setEditing(null); }); }}>
            <div className={styles.formHeading}><Send size={17} /><h2>{editing ? 'Edit your post' : 'Share your feedback'}</h2></div>
            <label htmlFor="feedback-title">Title</label><input id="feedback-title" required minLength={5} maxLength={120} placeholder="A short, descriptive title" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} disabled={!user || busy} />
            <label htmlFor="feedback-details">Details</label><textarea id="feedback-details" required minLength={10} maxLength={4000} rows={3} placeholder="What would help? For bugs, describe what happened and how to reproduce it." value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} disabled={!user || busy} />
            <div className={styles.formFooter}><label>Category<Select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} disabled={!user || busy}><option value="feature">Feature request</option><option value="bug">Bug report</option></Select></label>
              <div>{editing && <button type="button" onClick={() => { setEditing(null); setDraft(blank); }}>Cancel</button>}<button className={styles.primary} disabled={!user || busy || loading}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create post'}</button></div>
            </div>
            <small>{user ? 'Posts are public. Keep emails, passwords, and private designs out of your feedback.' : <>Sign in from the <Link href="/">Syncraft home page</Link> to post, comment, or vote.</>}</small>
          </form>}
          {selected ? <button className={styles.backButton} disabled={busy} onClick={() => { setSelected(null); setEditing(null); }}><ArrowLeft size={17} />All feedback</button> : <div className={styles.listHeading}><div className={styles.filters}><span>Showing</span><Select aria-label="Sort posts" value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Newest</option><option value="trending">Trending</option><option value="popular">Most liked</option></Select><span>posts in</span><Select aria-label="Filter category" value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option><option value="feature">Feature requests</option><option value="bug">Bug reports</option></Select></div><label className={styles.search}><Search size={16} /><input aria-label="Search feedback" placeholder="Search feedback…" value={search} onChange={e => setSearch(e.target.value)} /></label></div>}
          {!selected && <div className={styles.formHeading}><MessageSquare size={17} aria-hidden="true" /><h2>Community posts</h2></div>}
          {loading ? <p role="status" className={styles.empty}>Loading feedback…</p> : shown.length === 0 ? <p className={styles.empty}>{error ? 'Feedback is unavailable right now.' : 'No matching posts yet. Start the conversation.'}</p> : <div className={`${styles.posts} ${selected ? styles.detail : styles.compactList}`}>{shown.map(post => <article key={post.id} className={styles.post} onClick={event => { if (!selected && !busy && !event.target.closest('button, a, input, textarea, select, [role="listbox"]')) setSelected(post.id); }}>
            <div className={styles.postMain}><div className={styles.author}><ProfileAvatar className={styles.avatar} name={post.author_name} url={post.avatarUrl} /><div><strong>{post.author_name}</strong><small>{new Date(post.created_at).toLocaleDateString()}</small></div></div><div className={styles.meta}><span>{post.category === 'bug' ? 'Bug report' : 'Feature request'}</span><span>{post.status}</span></div><h3><button className={styles.postTitle} disabled={busy} onClick={() => setSelected(post.id)}>{post.title}</button></h3><p>{post.body}</p>
              <div className={styles.counts}><span>{post.votes} {post.votes === 1 ? 'like' : 'likes'}</span><button disabled={busy} onClick={() => setSelected(selected === post.id ? null : post.id)}>{post.comments} {post.comments === 1 ? 'comment' : 'comments'}</button></div>
              <div className={styles.socialActions}><button aria-pressed={post.voted} disabled={!user || busy} onClick={() => void act({ kind: 'vote', postId: post.id }, post.voted ? 'DELETE' : 'POST')}><ThumbsUp size={19} />{post.voted ? 'Liked' : 'Like'}</button><button disabled={busy} aria-expanded={selected === post.id} onClick={() => setSelected(selected === post.id ? null : post.id)}><MessageSquare size={19} />Comment</button></div>
              <div className={styles.tools}>
                {post.canManage && <><button disabled={busy} onClick={() => { setEditing(post.id); setDraft({ title: post.title, body: post.body, category: post.category }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button><button disabled={busy} onClick={() => { setDeleteTarget({ kind: 'post', id: post.id }); }}>Delete</button></>}
                {admin && <Select aria-label={`Status for ${post.title}`} disabled={busy} value={post.status} onChange={e => void act({ kind: 'post', id: post.id, status: e.target.value }, 'PATCH')}>{statuses.map(s => <option key={s}>{s}</option>)}</Select>}
              </div>
            </div>
            {!selected && <button className={styles.listVote} aria-label={`Like ${post.title}`} aria-pressed={post.voted} disabled={!user || busy} onClick={() => void act({ kind: 'vote', postId: post.id }, post.voted ? 'DELETE' : 'POST')}><ThumbsUp size={16} />{post.votes}</button>}
            {selected === post.id && <div className={styles.thread}>
              <div className={styles.activityHeading}><h4>Activity feed</h4><Select aria-label="Sort comments" value={commentSort} onChange={e => setCommentSort(e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></Select></div>{commentsLoading ? <p role="status">Loading comments…</p> : comments.length === 0 ? <p>No comments yet.</p> : [...comments].sort((a,b) => commentSort === 'newest' ? Date.parse(b.created_at) - Date.parse(a.created_at) : Date.parse(a.created_at) - Date.parse(b.created_at)).map(c => <div className={styles.comment} key={c.id}><div className={styles.author}><ProfileAvatar className={styles.avatar} name={c.author_name} url={c.avatarUrl} /><div><strong>{c.author_name}</strong><small>{new Date(c.created_at).toLocaleDateString()}</small></div></div><p>{c.body}</p>{c.canManage && <div className={styles.tools}><button disabled={busy} onClick={() => { setEditComment(c.id); setComment(c.body); }}>Edit</button><button disabled={busy} onClick={() => { setDeleteTarget({ kind: 'comment', id: c.id }); }}>Delete</button></div>}</div>)}
              {user ? <form onSubmit={e => { e.preventDefault(); void act({ kind: 'comment', postId: post.id, body: comment, ...(editComment ? { id: editComment } : {}) }, editComment ? 'PATCH' : 'POST', () => { setComment(''); setEditComment(null); }); }}><label htmlFor="feedback-comment">{editComment ? 'Edit comment' : 'Add a comment'}</label><textarea id="feedback-comment" rows={2} required maxLength={2000} value={comment} onChange={e => setComment(e.target.value)} disabled={busy || commentsLoading} /><div className={styles.commentSubmit}>{editComment && <button type="button" onClick={() => { setEditComment(null); setComment(''); }}>Cancel</button>}<button disabled={busy || commentsLoading || !comment.trim()} type="submit"><Send size={16} />{busy ? 'Saving…' : editComment ? 'Save comment' : 'Post comment'}</button></div></form> : <p><Link href="/">Sign in to join the conversation.</Link></p>}
            </div>}
          </article>)}</div>}
          <small className={styles.note}>Showing the latest 100 posts. Keep conversations constructive and on topic.</small>
        </section>
      </div>
    </main>
    {deleteTarget && <dialog ref={confirmationRef} className={styles.confirmDialog} aria-labelledby="delete-feedback-title" aria-describedby="delete-feedback-description" onCancel={event => { event.preventDefault(); if (!busy) setDeleteTarget(null); }}>
      <h2 id="delete-feedback-title">Delete {deleteTarget.kind === 'post' ? 'this post' : 'this comment'}?</h2>
      <p id="delete-feedback-description">{deleteTarget.kind === 'post' ? 'This will permanently delete the post, its comments, and likes.' : 'This will permanently delete your comment.'} This cannot be undone.</p>
      <div className={styles.confirmActions}>
        <button type="button" autoFocus disabled={busy} onClick={() => setDeleteTarget(null)}>Cancel</button>
        <button type="button" className={styles.deleteAction} disabled={busy} onClick={() => { const target = deleteTarget; void act(target, 'DELETE', () => { setDeleteTarget(null); if (target.kind === 'post') setSelected(null); }); }}>{busy ? 'Deleting…' : 'Delete'}</button>
      </div>
      {error && <p role="alert" className={styles.confirmError}>{error}</p>}
    </dialog>}
  </div>;
}
