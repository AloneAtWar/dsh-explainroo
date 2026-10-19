// Text size after the player shrinks the video. Sizes already include the
// camera/group transform and are in design pixels, independent of QA scale.
export function playbackTextIssue(text, width, height, viewWidth) {
  if (!Number.isFinite(viewWidth) || viewWidth <= 0) throw new Error('view width must be a positive number');
  if (text.alpha <= 0.95 || text.x1 <= 0 || text.y1 <= 0 || text.x0 >= width || text.y0 >= height) return null;
  const size = text.size * Math.min(1, viewWidth / width);
  if (size >= 16) return null;
  return `"${text.text.slice(0, 40)}" is ${size.toFixed(1)}px at a ${viewWidth}px player width; enlarge important text or zoom in (aim for at least 16px)`;
}
