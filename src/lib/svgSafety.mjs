// Shared SVG validation for display previews and PSD exports.
export function decodeXmlAttribute(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function assertSafeSvg(svgText) {
  const svg = String(svgText || '');
  if (!/<svg\b/i.test(svg) || !/<\/svg\s*>/i.test(svg)) {
    throw new Error('The vector file is not a valid SVG document.');
  }

  if (
    /<(?:script|foreignObject|iframe|object|embed)\b/i.test(svg) ||
    /<!DOCTYPE|<!ENTITY/i.test(svg)
  ) {
    throw new Error('The vector file contains unsupported active content.');
  }

  const hrefPattern = /\b(?:href|xlink:href)\s*=\s*(["'])(.*?)\1/gi;
  let hrefMatch;
  while ((hrefMatch = hrefPattern.exec(svg)) !== null) {
    const href = decodeXmlAttribute(hrefMatch[2]).trim();
    if (href && !href.startsWith('#')) {
      throw new Error('The vector file contains an external asset reference.');
    }
  }

  if (/url\(\s*["']?\s*(?:https?:|file:|\/\/)/i.test(svg)) {
    throw new Error('The vector file contains an external style reference.');
  }

  return svg;
}
