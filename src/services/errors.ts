/** Typed errors so the UI can react precisely (field errors, 404s, conflicts). */

export class AppError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'AppError'
  }
}

export class ValidationError extends AppError {
  readonly fieldErrors: Record<string, string>
  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super('VALIDATION_ERROR', message)
    this.fieldErrors = fieldErrors
    this.name = 'ValidationError'
  }
}

/** Also used when a record exists but belongs to another doctor, so existence is never leaked. */
export class NotFoundError extends AppError {
  constructor(entity: string) {
    super('NOT_FOUND', `${entity} not found`)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message)
    this.name = 'ConflictError'
  }
}

export class DuplicateKeyError extends AppError {
  constructor(entity: string, id: string) {
    super('DUPLICATE_KEY', `${entity} ${id} already exists`)
    this.name = 'DuplicateKeyError'
  }
}

export class UnauthorizedError extends AppError {
  constructor() {
    super('UNAUTHORIZED', 'Sign in to continue')
    this.name = 'UnauthorizedError'
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof AppError) return err.message
  if (err instanceof Error) return err.message
  return 'Something went wrong'
}
