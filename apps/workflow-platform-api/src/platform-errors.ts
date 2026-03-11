export class PlatformError extends Error {
  readonly code: string;

  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'PlatformError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function isPlatformError(error: unknown): error is PlatformError {
  return error instanceof PlatformError;
}
