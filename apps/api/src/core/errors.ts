export class HttpError extends Error {
  constructor(
    public status: 400 | 401 | 402 | 403 | 404 | 409 | 429,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
