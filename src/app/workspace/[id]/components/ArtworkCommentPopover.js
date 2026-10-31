'use client';

import { Trash2 } from 'lucide-react';
import { MAX_COMMENT_LENGTH } from '@/lib/artworkEditComments.mjs';
import styles from './ArtworkEditModal.module.css';

export default function ArtworkCommentPopover({
  comment,
  number,
  position,
  inputRef,
  onChange,
  onDelete,
  onDone,
}) {
  return (
    <div
      className={styles.commentEditor}
      style={position}
      role="group"
      aria-label={`Comment ${number}`}
    >
      <label htmlFor="artwork-point-comment" className={styles.srOnly}>
        Comment {number}
      </label>
      <input
        ref={inputRef}
        id="artwork-point-comment"
        type="text"
        value={comment.text}
        maxLength={MAX_COMMENT_LENGTH}
        placeholder="Add a comment…"
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape' || (event.key === 'Enter' && comment.text.trim())) {
            event.preventDefault();
            event.stopPropagation();
            onDone();
          }
        }}
      />
      <button
        type="button"
        className={styles.commentDelete}
        aria-label="Delete selected comment"
        title="Delete comment"
        onClick={onDelete}
      >
        <Trash2 size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
