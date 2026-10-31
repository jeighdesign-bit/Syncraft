export const MAX_ARTWORK_COMMENTS = 8;
export const MAX_COMMENT_LENGTH = 300;

// Positions are fractions of the actual artwork, never the letterboxed preview.
export function normalizeArtworkComments(comments = []) {
  if (!Array.isArray(comments) || comments.length > MAX_ARTWORK_COMMENTS)
    throw new Error('Add up to 8 comments per edit.');
  return comments.map((comment) => {
    if (
      !comment ||
      !Number.isFinite(comment.x) ||
      !Number.isFinite(comment.y) ||
      comment.x < 0 ||
      comment.x > 1 ||
      comment.y < 0 ||
      comment.y > 1 ||
      typeof comment.text !== 'string' ||
      !comment.text.trim() ||
      comment.text.length > MAX_COMMENT_LENGTH
    ) {
      throw new Error(
        'Each comment needs a point on the artwork and an instruction of up to 300 characters.',
      );
    }
    return { x: comment.x, y: comment.y, text: comment.text.trim() };
  });
}

export function artworkCommentInstructions(comments) {
  if (!comments.length) return '';
  return `\nLocalized edit comments (coordinates measured from the top-left of the original image, x increases rightward and y downward). Use each point to identify the nearby element to edit; keep unrelated areas unchanged. These are location references, not visible marks to draw:\n${comments.map((comment, index) => `${index + 1}. At x=${(comment.x * 100).toFixed(2)}%, y=${(comment.y * 100).toFixed(2)}%: ${comment.text}`).join('\n')}`;
}
