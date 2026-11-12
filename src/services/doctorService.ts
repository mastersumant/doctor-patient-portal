import type { Doctor } from '@/domain/types'
import { doctorProfileSchema, type DoctorProfileInput } from '@/validations/schemas'
import { nowIso } from '@/utils/dates'
import { toNumberOrNull } from '@/utils/clinical'
import { blobToDataUrl } from '@/utils/format'
import { BaseService, changedFields, type ServiceDeps } from './context'
import { UnauthorizedError } from './errors'
import type { FileService } from './fileService'

export class DoctorService extends BaseService {
  private readonly files: FileService

  constructor(deps: ServiceDeps, files: FileService) {
    super(deps)
    this.files = files
  }

  async getCurrent(): Promise<Doctor | null> {
    return this.repos.doctors.findById(this.doctorId())
  }

  /** Create the doctor's profile on first sign-in, using the verified identity. */
  async ensureProfile(): Promise<Doctor> {
    const identity = this.session.getIdentity()
    if (!identity) throw new UnauthorizedError()
    const existing = await this.repos.doctors.findById(identity.userId)
    if (existing) {
      // Keep the avatar in sync with the identity provider; everything else is doctor-owned.
      if (identity.imageUrl && existing.avatarUrl !== identity.imageUrl) {
        return this.repos.doctors.upsert({ ...existing, avatarUrl: identity.imageUrl })
      }
      return existing
    }
    const now = nowIso()
    const doctor: Doctor = {
      doctorId: identity.userId,
      fullName: identity.fullName,
      email: identity.email,
      avatarUrl: identity.imageUrl,
      specialization: '',
      qualifications: '',
      registrationNumber: '',
      clinicName: '',
      clinicAddress: '',
      contactNumber: '',
      experienceYears: null,
      signatureFileId: null,
      onboardingComplete: false,
      createdAt: now,
      updatedAt: now,
    }
    await this.repos.doctors.upsert(doctor)
    await this.audit('Doctor', doctor.doctorId, 'create', 'Profile created on first sign-in')
    this.changed('doctor')
    return doctor
  }

  async updateProfile(input: DoctorProfileInput): Promise<Doctor> {
    const data = this.validate(doctorProfileSchema, input)
    const current = await this.ensureProfile()
    const patch: Partial<Doctor> = {
      ...data,
      experienceYears: toNumberOrNull(data.experienceYears),
      onboardingComplete: true,
    }
    const next: Doctor = { ...current, ...patch, updatedAt: nowIso() }
    await this.repos.doctors.upsert(next)
    await this.audit('Doctor', next.doctorId, 'update', changedFields(current, patch).join(', '))
    this.changed('doctor')
    return next
  }

  async setSignature(file: Blob & { name?: string }): Promise<Doctor> {
    const current = await this.ensureProfile()
    const stored = await this.files.store(file, { imagesOnly: true })
    await this.files.remove(current.signatureFileId)
    const next = { ...current, signatureFileId: stored.fileId, updatedAt: nowIso() }
    await this.repos.doctors.upsert(next)
    await this.audit('Doctor', next.doctorId, 'update', 'signature')
    this.changed('doctor')
    return next
  }

  async removeSignature(): Promise<Doctor> {
    const current = await this.ensureProfile()
    await this.files.remove(current.signatureFileId)
    const next = { ...current, signatureFileId: null, updatedAt: nowIso() }
    await this.repos.doctors.upsert(next)
    await this.audit('Doctor', next.doctorId, 'update', 'signature removed')
    this.changed('doctor')
    return next
  }

  async getSignatureDataUrl(): Promise<string | null> {
    const doctor = await this.getCurrent()
    const file = await this.files.get(doctor?.signatureFileId)
    return file ? blobToDataUrl(file.blob) : null
  }
}
