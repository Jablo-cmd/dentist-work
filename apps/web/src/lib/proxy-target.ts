/**
 * Builds the upstream URL and refuses anything that could leave the API's `/api/` namespace.
 * Dot segments (`..`, also when percent-encoded) would otherwise be normalised away by `fetch`, letting a
 * caller reach other paths on the upstream host (e.g. other services behind a shared gateway).
 */
export function safeTarget(
  base: string,
  segments: readonly string[],
  search: string,
): string | null {
  for (const seg of segments) {
    if (
      seg === '' ||
      seg === '.' ||
      seg === '..' ||
      /[\\/]/.test(seg) ||
      [...seg].some((ch) => ch.codePointAt(0)! < 0x20)
    )
      return null;
  }
  let url: URL;
  let root: URL;
  try {
    root = new URL(base);
    url = new URL(`${base}/api/${segments.map(encodeURIComponent).join('/')}${search}`);
  } catch {
    return null;
  }
  const prefix = `${root.pathname.replace(/\/$/, '')}/api/`;
  if (url.origin !== root.origin || !url.pathname.startsWith(prefix)) return null;
  return url.toString();
}
