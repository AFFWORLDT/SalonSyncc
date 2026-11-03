/** Google Analytics events (no-op without GA). Resolves once GA has sent the hit, or after 800 ms, so a redirect can follow. */
type Gtag = (...args: unknown[]) => void;

export function track(event: string, params: Record<string, string | number> = {}): Promise<void> {
  const gtag = typeof window === "undefined" ? undefined : (window as unknown as { gtag?: Gtag }).gtag;
  if (!gtag) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(resolve, 800);
    gtag("event", event, { ...params, transport_type: "beacon", event_callback: () => (clearTimeout(t), resolve()) });
  });
}
