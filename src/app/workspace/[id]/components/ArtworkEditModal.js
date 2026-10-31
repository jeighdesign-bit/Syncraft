'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Check,
  GripVertical,
  History,
  Loader2,
  MousePointerSquareDashed,
  WandSparkles,
  X,
} from 'lucide-react';
import { MAX_ARTWORK_COMMENTS } from '@/lib/artworkEditComments.mjs';
import { artworkCommentLayout } from '@/lib/artworkCommentLayout.mjs';
import { CREDIT_COST } from '@/lib/pricing';
import GenerationLoading from '@/components/GenerationLoading';
import ArtworkCommentPopover from './ArtworkCommentPopover';
import styles from './ArtworkEditModal.module.css';

const editDescription = (edit) =>
  edit.prompt ||
  edit.comments?.map((comment, index) => `${index + 1}. ${comment.text}`).join(' · ') ||
  'Original output';

const previewUrl = (url) =>
  url?.startsWith('/') && !url.startsWith('//')
    ? url
    : url
      ? `/api/proxy?url=${encodeURIComponent(url)}&preview=1`
      : '';

export default function ArtworkEditModal({
  project,
  supabase,
  userCredits,
  onClose,
  onProjectUpdated,
  onCreditsUpdated,
  onOpenTopUp,
}) {
  const dialog = useRef(null);
  const promptInput = useRef(null);
  const previewArea = useRef(null);
  const [previewBounds, setPreviewBounds] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState(null);
  const requestId = useRef(null);
  const [prompt, setPrompt] = useState('');
  const [commentMode, setCommentMode] = useState(false);
  const [comments, setComments] = useState([]);
  const [activeComment, setActiveComment] = useState(null);
  const commentInput = useRef(null);
  const commentSend = useRef(null);
  const [candidate, setCandidate] = useState(null);
  const [versions, setVersions] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [viewOriginal, setViewOriginal] = useState(false);
  const [previewStatus, setPreviewStatus] = useState(null);
  const [statusReady, setStatusReady] = useState(false);
  const [pending, setPending] = useState(null);
  const cost = CREDIT_COST.artworkEdit;
  const sourceUrl = project.generated_image_url;

  const request = useCallback(
    async (method, body) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please sign in again to edit your artwork.');
      const response = await fetch(
        `/api/artwork-edit${method === 'GET' ? `?projectId=${encodeURIComponent(project.id)}` : ''}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          // The server can spend up to 120s preparing/uploading the reference
          // and saving its provider receipt. Keep the client connected for it.
          signal: AbortSignal.timeout(130000),
          ...(body ? { body: JSON.stringify({ projectId: project.id, ...body }) } : {}),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data)
        throw Object.assign(
          new Error(
            data?.error ||
              'The edit could not be loaded. Reopen AI Edit to check its saved status.',
          ),
          { snapshot: data?.snapshot },
        );
      return data;
    },
    [supabase, project.id],
  );

  const applySnapshot = useCallback((data) => {
    setVersions(data.versions || []);
    setCandidate(data.candidate || null);
    setPending(data.pending || null);
    setStatusReady(true);
    if (!data.pending) requestId.current = null;
  }, []);

  const loadEdits = useCallback(async () => {
    const data = await request('GET');
    applySnapshot(data);
    return data;
  }, [request, applySnapshot]);

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    let disposed = false;
    setBusy('loading');
    request('GET')
      .then((data) => {
        if (disposed) return;
        setVersions(data.versions || []);
        setCandidate(data.candidate || null);
        setPending(data.pending || null);
        setStatusReady(true);
      })
      .catch((err) => {
        if (!disposed) {
          setError(err.message);
          if (err.snapshot) applySnapshot(err.snapshot);
        }
      })
      .finally(() => {
        if (!disposed) setBusy('');
      });
    return () => {
      disposed = true;
      previous?.focus?.();
    };
  }, [request, applySnapshot]);

  useEffect(() => {
    if (!pending || busy || !statusReady) return;
    let disposed = false;
    const timer = setTimeout(async () => {
      try {
        const data = await request('GET');
        if (disposed) return;
        applySnapshot(data);
        onCreditsUpdated?.();
      } catch (err) {
        if (!disposed) {
          setError(err.message);
          if (err.snapshot) {
            applySnapshot(err.snapshot);
            onCreditsUpdated?.();
          } else setStatusReady(false);
        }
      }
    }, 4000);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [pending, busy, statusReady, request, applySnapshot, onCreditsUpdated]);

  const currentUrl = viewOriginal || !candidate ? sourceUrl : candidate.imageUrl;
  useEffect(() => {
    const area = previewArea.current;
    if (!area) return;
    const observer = new ResizeObserver(([entry]) =>
      setPreviewBounds({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(area);
    return () => observer.disconnect();
  }, []);
  const previewScale = imageSize
    ? Math.min(previewBounds.width / imageSize.width, previewBounds.height / imageSize.height)
    : 0;
  const loadingBounds =
    previewScale > 0
      ? { width: imageSize.width * previewScale, height: imageSize.height * previewScale }
      : { width: 180, height: 180 };
  const imageReady = previewStatus?.url === currentUrl && previewStatus.state === 'ready';
  const imageError = previewStatus?.url === currentUrl && previewStatus.state === 'error';
  const commentsLocked =
    !!busy || !!pending || !!candidate || !statusReady || !imageReady || imageError;
  const incompleteComments = comments.some((comment) => !comment.text.trim());
  const hasInstructions = !!prompt.trim() || comments.length > 0;
  const selectedComment = comments.find((comment) => comment.id === activeComment);
  const commentPosition = artworkCommentLayout(selectedComment, loadingBounds, previewBounds);
  useEffect(() => {
    if (activeComment) commentInput.current?.focus();
  }, [activeComment]);
  const addComment = (x, y) => {
    if (commentsLocked || comments.length >= MAX_ARTWORK_COMMENTS) return;
    const id = crypto.randomUUID();
    setComments((current) => [...current, { id, x, y, text: '' }]);
    setActiveComment(id);
    requestId.current = null;
  };
  const updateComment = (text) => {
    setComments((current) =>
      current.map((comment) => (comment.id === activeComment ? { ...comment, text } : comment)),
    );
    requestId.current = null;
  };
  const deleteComment = () => {
    setComments((current) => current.filter((comment) => comment.id !== activeComment));
    setActiveComment(null);
    requestId.current = null;
  };
  const closeCommentMode = () => {
    setCommentMode(false);
    setActiveComment(null);
    setComments((current) => current.filter((comment) => comment.text.trim()));
    requestId.current = null;
  };
  useEffect(() => {
    const input = promptInput.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }, [prompt, candidate, commentMode]);

  const generate = async (event) => {
    event.preventDefault();
    if (
      busy ||
      pending ||
      !statusReady ||
      candidate ||
      !hasInstructions ||
      incompleteComments ||
      !imageReady ||
      imageError
    )
      return;
    if (userCredits !== null && userCredits < cost) {
      onClose();
      onOpenTopUp();
      return;
    }
    requestId.current ||= crypto.randomUUID();
    setBusy('generating');
    setError('');
    try {
      const data = await request('POST', {
        prompt: prompt.trim(),
        comments: comments.map(({ x, y, text }) => ({ x, y, text: text.trim() })),
        sourceUrl,
        requestId: requestId.current,
      });
      setCandidate(data.candidate);
      setPending(data.pending || null);
      setVersions(data.versions || versions);
      setViewOriginal(false);
      setCommentMode(false);
      setActiveComment(null);
      requestId.current = null;
      onCreditsUpdated?.();
    } catch (err) {
      setError(err.message);
      // Recover a saved result after an interrupted response before allowing another charge.
      if (err.snapshot) applySnapshot(err.snapshot);
      else
        await loadEdits().catch((recoveryError) => {
          if (recoveryError.snapshot) applySnapshot(recoveryError.snapshot);
          else setStatusReady(false);
        });
      onCreditsUpdated?.();
    } finally {
      setBusy('');
    }
  };

  const change = async (action, editId) => {
    if (busy || pending) return;
    setBusy(action);
    setError('');
    try {
      const data = await request('PATCH', { action, editId, sourceUrl });
      if (data.project) onProjectUpdated(data.project);
      setCandidate(data.candidate || null);
      setPending(data.pending || null);
      setVersions(data.versions || []);
      setViewOriginal(false);
      setPrompt('');
      setComments([]);
      setActiveComment(null);
      setCommentMode(false);
      requestId.current = null;
      if (action !== 'discard') onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="artwork-edit-title"
      aria-describedby="artwork-edit-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) {
          if (commentMode) closeCommentMode();
          else onClose();
        }
      }}
    >
      <header
        className={styles.header}
        style={{ width: previewScale > 0 ? Math.max(220, loadingBounds.width) : undefined }}
      >
        <div className={styles.heading}>
          <WandSparkles size={17} aria-hidden="true" />
          <h2 id="artwork-edit-title">AI Edit</h2>
        </div>
        <p id="artwork-edit-description" className={styles.srOnly}>
          Describe an edit, preview the result, then apply it to your artwork.
        </p>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          disabled={!!busy}
          aria-label="Close AI Edit"
        >
          <X size={20} />
        </button>
      </header>
      <div className={styles.body}>
        <div
          ref={previewArea}
          className={styles.preview}
          aria-busy={!!busy || (!!pending && statusReady) || !imageReady}
        >
          <img
            key={currentUrl}
            src={previewUrl(currentUrl)}
            alt={candidate && !viewOriginal ? 'Edited artwork preview' : 'Current artwork'}
            onLoad={(event) => {
              setImageSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              });
              setPreviewStatus({ url: currentUrl, state: 'ready' });
            }}
            onError={() => setPreviewStatus({ url: currentUrl, state: 'error' })}
          />
          {imageReady && !candidate && !pending && !busy && (
            <div
              className={`${styles.commentLayer} ${commentMode ? styles.commenting : ''}`}
              style={loadingBounds}
              onClick={(event) => {
                if (!commentMode || event.target !== event.currentTarget) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                addComment(
                  Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
                  Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
                );
              }}
            >
              {comments.map((comment, index) => (
                <button
                  key={comment.id}
                  type="button"
                  className={styles.commentPin}
                  style={{ left: `${comment.x * 100}%`, top: `${comment.y * 100}%` }}
                  aria-label={`Edit comment ${index + 1}: ${comment.text || 'Empty comment'}`}
                  aria-pressed={activeComment === comment.id}
                  disabled={commentsLocked}
                  onClick={() => {
                    setCommentMode(true);
                    setActiveComment(comment.id);
                  }}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          )}
          {selectedComment && commentPosition && !commentsLocked && (
            <ArtworkCommentPopover
              comment={selectedComment}
              number={comments.findIndex((comment) => comment.id === activeComment) + 1}
              position={commentPosition}
              inputRef={commentInput}
              onChange={updateComment}
              onDelete={deleteComment}
              onDone={() => {
                setActiveComment(null);
                commentSend.current?.focus();
              }}
            />
          )}
          {busy === 'generating' || (pending && statusReady) || (!imageReady && !imageError) ? (
            <div className={styles.artworkLoading} style={loadingBounds}>
              <GenerationLoading
                label={
                  busy === 'generating' || (pending && statusReady)
                    ? 'Editing your artwork'
                    : 'Loading artwork preview'
                }
              />
            </div>
          ) : (
            imageError && (
              <div className={styles.overlay} style={loadingBounds}>
                Preview could not load. Close and reopen AI Edit to retry.
              </div>
            )
          )}
        </div>
        <div className={styles.dock}>
          {!commentMode && (
            <div
              className={`${styles.toolbar} ${!candidate ? styles.floatingToolbar : ''}`}
              role={!candidate ? 'group' : undefined}
              aria-label={!candidate ? 'Artwork tools' : undefined}
            >
              {!candidate && (
                <GripVertical className={styles.toolbarGrip} size={15} aria-hidden="true" />
              )}
              {!candidate && (
                <button
                  type="button"
                  className={styles.commentToggle}
                  aria-pressed={commentMode}
                  title="Click the artwork to add comments"
                  disabled={commentsLocked}
                  onClick={() => {
                    setCommentMode((current) => !current);
                    setActiveComment(null);
                  }}
                >
                  <MousePointerSquareDashed size={17} strokeWidth={1.6} aria-hidden="true" />
                  <span>Comment{comments.length > 0 ? ` (${comments.length})` : ''}</span>
                </button>
              )}
              {candidate ? (
                <div className={styles.compare} aria-label="Compare artwork">
                  <button
                    type="button"
                    aria-pressed={viewOriginal}
                    onClick={() => setViewOriginal(true)}
                  >
                    Before
                  </button>
                  <button
                    type="button"
                    aria-pressed={!viewOriginal}
                    onClick={() => setViewOriginal(false)}
                  >
                    After
                  </button>
                </div>
              ) : null}
              {versions.length > 0 && (
                <details className={styles.history}>
                  <summary>
                    <History size={15} aria-hidden="true" /> History <span>{versions.length}</span>
                  </summary>
                  <div className={styles.historyPanel}>
                    <p className={styles.historyTitle}>Version history</p>
                    <div className={styles.versions}>
                      {versions.map((version, index) => (
                        <div key={version.id} className={styles.version}>
                          <img
                            src={previewUrl(version.imageUrl)}
                            alt={`Artwork version ${index + 1}`}
                          />
                          <p title={editDescription(version)}>{editDescription(version)}</p>
                          <button
                            type="button"
                            className={styles.secondary}
                            disabled={
                              !!busy ||
                              !!pending ||
                              !!candidate ||
                              !statusReady ||
                              version.imageUrl === sourceUrl
                            }
                            onClick={() => change('restore', version.id)}
                          >
                            {version.imageUrl === sourceUrl ? 'Current' : 'Restore'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              )}
            </div>
          )}
          {commentMode && (
            <div className={styles.commentModeBar} role="group" aria-label="Comment controls">
              <GripVertical className={styles.toolbarGrip} size={15} aria-hidden="true" />
              <button
                type="button"
                className={styles.commentInstructions}
                title="Add a comment at the center of the artwork"
                disabled={commentsLocked || comments.length >= MAX_ARTWORK_COMMENTS}
                onClick={() => addComment(0.5, 0.5)}
              >
                {comments.length >= MAX_ARTWORK_COMMENTS
                  ? '8 comments maximum. Select a pin to edit.'
                  : 'Click on the image to add comments'}
              </button>
              <button
                ref={commentSend}
                type="button"
                className={styles.commentSend}
                aria-label={`Send comments for ${cost} credits`}
                title={`Send comments · ${cost} credits`}
                disabled={commentsLocked || !comments.length || incompleteComments}
                onClick={generate}
              >
                {busy === 'generating' ? <Loader2 size={15} className={styles.spin} /> : 'Send'}
              </button>
              <button
                type="button"
                className={styles.commentExit}
                aria-label="Close comment mode"
                title="Close comment mode"
                disabled={!!busy || !!pending}
                onClick={closeCommentMode}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          )}
          {incompleteComments && !selectedComment && !commentsLocked && (
            <p className={styles.hint}>
              Select an empty pin to add its instruction, or delete it before sending.
            </p>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {!statusReady && !busy && (
            <button
              type="button"
              className={styles.secondary}
              onClick={async () => {
                setBusy('loading');
                setError('');
                try {
                  await loadEdits();
                  onCreditsUpdated?.();
                } catch (err) {
                  setError(err.message);
                  if (err.snapshot) {
                    applySnapshot(err.snapshot);
                    onCreditsUpdated?.();
                  }
                } finally {
                  setBusy('');
                }
              }}
            >
              Check saved edit
            </button>
          )}
          {candidate ? (
            <div className={styles.review}>
              <div className={styles.reviewCopy}>
                <span>Preview your edit</span>
                <p>
                  {candidate.prompt ||
                    candidate.comments
                      ?.map((comment, index) => `${index + 1}. ${comment.text}`)
                      .join(' · ') ||
                    'Review the result before applying.'}
                </p>
              </div>
              <div className={styles.buttons}>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={!!busy || !!pending}
                  onClick={() => change('discard', candidate.id)}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={!!busy || !!pending || !imageReady || imageError}
                  onClick={() => change('accept', candidate.id)}
                >
                  {busy === 'accept' ? (
                    <Loader2 size={15} className={styles.spin} />
                  ) : (
                    <Check size={15} />
                  )}
                  {busy === 'accept' ? 'Applying…' : 'Apply edit'}
                </button>
              </div>
            </div>
          ) : !commentMode ? (
            <form className={styles.form} onSubmit={generate}>
              <label htmlFor="artwork-edit-prompt" className={styles.srOnly}>
                Describe edits
              </label>
              <textarea
                ref={promptInput}
                id="artwork-edit-prompt"
                rows={1}
                value={prompt}
                onChange={(event) => {
                  setPrompt(event.target.value);
                  requestId.current = null;
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.currentTarget.form.requestSubmit();
                  }
                }}
                maxLength={1500}
                disabled={!!busy || !!pending || !statusReady}
                placeholder="Describe edits…"
              />
              <div className={styles.composerActions}>
                <span className={styles.cost}>{cost} credits</span>
                <button
                  type="submit"
                  className={styles.send}
                  aria-label={`Generate edit for ${cost} credits`}
                  title={`Generate edit · ${cost} credits`}
                  disabled={
                    !!busy ||
                    !!pending ||
                    !statusReady ||
                    !hasInstructions ||
                    incompleteComments ||
                    !imageReady ||
                    imageError
                  }
                >
                  {busy || (pending && statusReady) ? (
                    <Loader2 size={19} className={styles.spin} />
                  ) : (
                    <ArrowUp size={21} />
                  )}
                </button>
              </div>
            </form>
          ) : null}
          <p className={styles.hint} role="status">
            {pending && !statusReady
              ? 'Could not confirm the saved edit. Check its status before sending another request.'
              : busy === 'generating' || pending
                ? 'Editing your artwork… Your request is saved.'
                : candidate
                  ? 'Apply to update your artwork. HD Upscale and Vector SVG will need rebuilding.'
                  : commentMode
                    ? `${cost} credits per edit`
                    : 'Failed edits are refunded. Your current artwork stays saved.'}
          </p>
        </div>
      </div>
    </dialog>
  );
}
