import type { AuditLog } from '@/domain/types'
import type { Page } from '@/data/repositories/interfaces'
import { BaseService } from './context'

export class AuditService extends BaseService {
  async list(params: { page?: number; pageSize?: number; entity?: string } = {}): Promise<Page<AuditLog>> {
    return this.repos.audit.list(this.doctorId(), {
      filters: params.entity ? { entity: params.entity } : undefined,
      sort: [{ field: 'at', direction: 'desc' }],
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 15,
    })
  }
}
