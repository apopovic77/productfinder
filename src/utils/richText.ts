/**
 * Rich-text helpers for LIUS description HTML (shared by the product
 * dialogs): sanitized inline rendering + video-link detection.
 */

export function sanitizeInlineHtml(html: string): string {
  const ALLOWED = new Set(['A', 'B', 'STRONG', 'I', 'EM', 'U', 'SPAN', 'SUP', 'SUB']);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      const div = document.createElement('div');
      div.textContent = node.textContent || '';
      return div.innerHTML; // re-escaped text
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as HTMLElement;
    // Executable/embedded containers vanish INCLUDING their content.
    if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT'].includes(el.tagName)) return '';
    const inner = Array.from(el.childNodes).map(walk).join('');
    if (!ALLOWED.has(el.tagName)) return inner;
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') || '';
      if (!/^https?:\/\//i.test(href)) return inner;
      const div = document.createElement('div');
      div.textContent = href;
      return `<a href="${div.innerHTML}" target="_blank" rel="noopener noreferrer" style="color:#ff5a1f;text-decoration:underline;">${inner}</a>`;
    }
    return `<${el.tagName.toLowerCase()}>${inner}</${el.tagName.toLowerCase()}>`;
  };
  return Array.from(doc.body.childNodes).map(walk).join('');
}

/** YouTube ids referenced anywhere in a description (watch/short/embed URLs). */
export function extractYouTubeIds(text: string): string[] {
  const ids: string[] = [];
  const re = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?[^"'\s]*?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}
