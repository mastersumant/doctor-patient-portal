import type { ZodType } from 'zod'
import type { AuditAction } from '@/domain/types'
import type { RepositoryRegistry } from '@/data/repositories/interfaces'
import { newId } from '@/utils/id'
import { nowIso } from '@/utils/dates'
import { UnauthorizedError, ValidationError } from './errors'

/** Who is signed in. Populated from the verified auth session, never from form input. */
export interface SessionIdentity {
  userId: string
  fullName: string
  email: string
  imageUrl: string
}

export interface Session {
  getIdentity(): SessionIdentity | null
}

export type ChangeListener = (entities: string[]) => void

/** Lightweight pub/sub so screens refresh after any write. */
export class ChangeBus {
  private readonly listeners = new Set<ChangeListener>()
  subscribe(fn: ChangeListener): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  emit(...entities: string[]): void {
    for (const fn of this.listeners) fn(entities)
  }
}

export interface ServiceDeps {
  repos: RepositoryRegistry
  session: Session
  bus: ChangeBus
  options?: { maxUploadBytes?: number }
}

export abstract class BaseService {
  protected readonly repos: RepositoryRegistry
  protected readonly session: Session
  protected readonly bus: ChangeBus
  protected readonly serviceOptions: NonNullable<ServiceDeps['options']>

  constructor(deps: ServiceDeps) {
    this.repos = deps.repos
    this.session = deps.session
    this.bus = deps.bus
    this.serviceOptions = deps.options ?? {}
  }

  /** The tenant key for every query. Derived from the session only. */
  protected doctorId(): string {
    const identity = this.session.getIdentity()
    if (!identity) throw new UnauthorizedError()
    return identity.userId
  }

  protected validate<T>(schema: ZodType<T>, input: unknown): T {
    const result = schema.safeParse(input)
    if (result.success) return result.data
    const fieldErrors: Record<string, string> = {}
    for (const issue of result.error.issues) {
      const path = issue.path.join('.')
      if (!fieldErrors[path]) fieldErrors[path] = issue.message
    }
    const first = result.error.issues[0]
    throw new ValidationError(first ? first.message : 'Check the highlighted fields', fieldErrors)
  }

  /** Audit entries record what happened to which record — never clinical values. */
  protected async audit(entity: string, entityId: string, action: AuditAction, detail = ''): Promise<void> {
    await this.repos.audit.append({
      auditId: newId('audit', 10),
      doctorId: this.doctorId(),
      entity,
      entityId,
      action,
      detail,
      at: nowIso(),
    })
  }

  protected changed(...entities: string[]): void {
    this.bus.emit(...entities)
  }
}

/** Names of fields whose values differ — used for audit detail without logging values. */
export function changedFields<T extends object>(before: T, after: Partial<T>): string[] {
  return Object.keys(after).filter(
    (k) =>
      !['updatedAt', 'createdAt'].includes(k) &&
      JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify((after as Record<string, unknown>)[k]),
  )
}

export function emptyToNull(v: string | undefined | null): string | null {
  return v && v.trim() !== '' ? v : null
}
