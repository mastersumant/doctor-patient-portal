import type { DocumentType, MedicalDocument } from '@/domain/types'
import type { Filters, Page } from '@/data/repositories/interfaces'
import { documentSchema, type DocumentInput } from '@/validations/schemas'
import { nowIso } from '@/utils/dates'
import { newId } from '@/utils/id'
import { BaseService, emptyToNull, type ServiceDeps } from './context'
import { NotFoundError, ValidationError } from './errors'
import type { FileService } from './fileService'

export interface DocumentListParams {
  search?: string
  type?: DocumentType | ''
  patientId?: string
  page?: number
  pageSize?: number
}

export interface DocumentListItem extends MedicalDocument {
  patientName: string
}

export class DocumentService extends BaseService {
  private readonly files: FileService

  constructor(deps: ServiceDeps, files: FileService) {
    super(deps)
    this.files = files
  }

  async list(params: DocumentListParams = {}): Promise<Page<DocumentListItem>> {
    const doctorId = this.doctorId()
    const filters: Filters<MedicalDocument> = {}
    if (params.type) filters.type = params.type
    if (params.patientId) filters.patientId = params.patientId
    const [page, patients] = await Promise.all([
      this.repos.documents.list(doctorId, {
        filters,
        search: params.search ? { term: params.search, fields: ['name', 'description', 'fileName', 'documentId'] } : undefined,
        sort: [{ field: 'uploadDate', direction: 'desc' }, { field: 'createdAt', direction: 'desc' }],
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 20,
      }),
      this.repos.patients.findAll(doctorId, { includeDeleted: true }),
    ])
    const names = new Map(patients.map((p) => [p.patientId, p.fullName]))
    return { ...page, items: page.items.map((d) => ({ ...d, patientName: names.get(d.patientId) ?? 'Unknown patient' })) }
  }

  async listForPatient(patientId: string): Promise<MedicalDocument[]> {
    return this.repos.documents.findAll(this.doctorId(), {
      filters: { patientId },
      sort: [{ field: 'uploadDate', direction: 'desc' }],
    })
  }

  async upload(input: DocumentInput, file: (Blob & { name?: string }) | null | undefined): Promise<MedicalDocument> {
    const data = this.validate(documentSchema, input)
    if (!file) throw new ValidationError('Choose a file to upload', { file: 'Choose a file to upload' })
    const doctorId = this.doctorId()
    const patient = await this.repos.patients.findById(doctorId, data.patientId)
    if (!patient || patient.deletedAt) throw new NotFoundError('Patient')
    const visitId = emptyToNull(data.visitId)
    if (visitId) {
      const visit = await this.repos.visits.findById(doctorId, visitId)
      if (!visit || visit.patientId !== data.patientId) throw new ValidationError('That visit belongs to another patient')
    }
    const stored = await this.files.store(file)
    const now = nowIso()
    const doc: MedicalDocument = {
      documentId: newId('document'),
      doctorId,
      patientId: data.patientId,
      visitId,
      name: data.name,
      type: data.type,
      description: data.description,
      uploadDate: data.uploadDate,
      fileId: stored.fileId,
      fileName: stored.fileName,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    try {
      await this.repos.documents.insert(doctorId, doc)
    } catch (err) {
      await this.files.remove(stored.fileId)
      throw err
    }
    await this.audit('Document', doc.documentId, 'create', doc.type)
    this.changed('documents')
    return doc
  }

  async getFile(documentId: string): Promise<{ blob: Blob; fileName: string; mimeType: string }> {
    const doc = await this.repos.documents.findById(this.doctorId(), documentId)
    if (!doc || doc.deletedAt) throw new NotFoundError('Document')
    const file = await this.files.get(doc.fileId)
    if (!file) throw new NotFoundError('File')
    return { blob: file.blob, fileName: doc.fileName, mimeType: doc.mimeType }
  }

  /** Soft delete. The binary is retained with the archived record. */
  async archive(documentId: string): Promise<void> {
    const doc = await this.repos.documents.findById(this.doctorId(), documentId)
    if (!doc || doc.deletedAt) throw new NotFoundError('Document')
    await this.repos.documents.update(this.doctorId(), documentId, { deletedAt: nowIso(), updatedAt: nowIso() })
    await this.audit('Document', documentId, 'archive')
    this.changed('documents')
  }
}
