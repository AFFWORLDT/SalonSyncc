/** Requests per minute per IP on the public links; the PDF costs CPU to draw, so it gets fewer. */
export const PUBLIC_LIMITS = { pub: 60, pdf: 10 } as const;

/** The minute a request counts in (fixed windows). */
export const minuteWindow = (at: number) => Math.floor(at / 60_000);
