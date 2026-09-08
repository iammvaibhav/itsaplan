/**
 * Paseo posts agent citations as `paseo://h/<server>/agent/<id>`. Chromium
 * silently ignores those hrefs when they open as `target="_blank"` with
 * `noopener` (a new browsing context never invokes the OS protocol handler).
 * Same-window assign is what actually hands the URL to Paseo.
 */

export function isPaseoHref(href: string | null | undefined): boolean {
  return typeof href === 'string' && /^paseo:/i.test(href);
}

type ClickTarget = {
  closest?: (selector: string) => { getAttribute: (name: string) => string | null } | null;
};

/**
 * If `href` is a Paseo deep link, prevent the native `_blank` navigation and
 * assign it on the current window. Returns whether the click was consumed.
 */
export function handlePaseoAnchorClick(
  event: {
    target: ClickTarget | EventTarget | null;
    button?: number;
    preventDefault: () => void;
  },
  assign: (href: string) => void,
): boolean {
  if ((event.button ?? 0) !== 0) return false;
  const node = event.target as ClickTarget | null;
  if (!node || typeof node.closest !== 'function') return false;
  const anchor = node.closest('a');
  const href = anchor?.getAttribute('href');
  if (!isPaseoHref(href) || !href) return false;
  event.preventDefault();
  assign(href);
  return true;
}
