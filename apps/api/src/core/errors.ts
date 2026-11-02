export class HttpError extends Error {
  constructor(
    public status: 400 | 401 | 402 | 403 | 404 | 409 | 429 | 502 | 503,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
