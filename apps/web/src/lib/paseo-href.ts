/**
 * Paseo posts agent citations as `paseo://h/<server>/agent/<id>`. Chromium
 * silently ignores those hrefs when they open as `target="_blank"` with
 * `noopener` (a new browsing context never invokes the OS protocol handler).
 *
 * Two follow paths:
 * - In the Paseo desktop itsaplan webview (`Electron` UA), `window.open` so
 *   the embed's setWindowOpenHandler can route the URL to openOrFocusAgent.
 * - In a regular browser, same-window assign so the OS protocol handler runs.
 */

export function isPaseoHref(href: string | null | undefined): boolean {
  return typeof href === 'string' && /^paseo:/i.test(href);
}

export function isElectronEmbed(userAgent: string): boolean {
  return /Electron/i.test(userAgent);
}

export function followPaseoHref(
  href: string,
  env: {
    userAgent: string;
    open: (url: string, target?: string) => void;
    assign: (url: string) => void;
  },
): void {
  if (isElectronEmbed(env.userAgent)) {
    env.open(href, '_blank');
    return;
  }
  env.assign(href);
}

type ClickTarget = {
  closest?: (selector: string) => { getAttribute: (name: string) => string | null } | null;
};

/**
 * If `href` is a Paseo deep link, prevent the native `_blank` navigation and
 * follow it. Returns whether the click was consumed.
 */
export function handlePaseoAnchorClick(
  event: {
    target: ClickTarget | EventTarget | null;
    button?: number;
    preventDefault: () => void;
  },
  follow: (href: string) => void,
): boolean {
  if ((event.button ?? 0) !== 0) return false;
  const node = event.target as ClickTarget | null;
  if (!node || typeof node.closest !== 'function') return false;
  const anchor = node.closest('a');
  const href = anchor?.getAttribute('href');
  if (!isPaseoHref(href) || !href) return false;
  event.preventDefault();
  follow(href);
  return true;
}
