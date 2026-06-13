/**
 * Build a `local-file://` URL for a local filesystem path so the renderer can display
 * it (e.g. `<img src={localFileUrl(path)} />`).
 *
 * The whole path is percent-encoded into a single URL path segment. This is required on
 * Windows: interpolating a raw path such as `local-file://C:\Users\…` puts the drive
 * letter in the URL authority, and Chromium then mangles the backslashes and drops the
 * colon. The main-process `local-file` protocol handler decodes this segment back into an
 * absolute path. Keep the two in sync.
 */
export function localFileUrl(path: string): string {
  return `local-file:///${encodeURIComponent(path)}`
}
