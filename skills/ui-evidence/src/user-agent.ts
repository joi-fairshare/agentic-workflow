// Headless Chromium's default user agent says "HeadlessChrome", and apps that
// gate on browser support (Vitalize's UnsupportedBrowserError: Chrome/Edge
// 139+ or Safari 17+) block it before any step runs. Present the same
// Chromium build as ordinary desktop Chrome. UI_EVIDENCE_USER_AGENT overrides.
export function desktopChromeUserAgent(browserVersion: string, env: NodeJS.ProcessEnv = process.env): string {
  const override = env.UI_EVIDENCE_USER_AGENT;
  if (override !== undefined && override.trim() !== "") return override;
  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion} Safari/537.36`;
}
