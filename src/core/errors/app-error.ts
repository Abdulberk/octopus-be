export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly recoverable = true,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
