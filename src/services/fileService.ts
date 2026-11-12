import type { StoredFile } from '@/domain/types'
import { ALLOWED_UPLOAD_TYPES, MAX_IMAGE_BYTES, MAX_UPLOAD_BYTES } from '@/domain/constants'
import { newId } from '@/utils/id'
import { nowIso } from '@/utils/dates'
import { formatBytes } from '@/utils/format'
import { BaseService } from './context'
import { ValidationError } from './errors'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** Checks the file's leading bytes, so a renamed executable can't pass as a PDF. */
async function sniffMime(file: Blob): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const starts = (...bytes: number[]) => bytes.every((b, i) => head[i] === b)
  if (starts(0x25, 0x50, 0x44, 0x46)) return 'application/pdf' // %PDF
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'image/png'
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (starts(0x52, 0x49, 0x46, 0x46) && head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50)
    return 'image/webp'
  return null
}

export class FileService extends BaseService {
  /** Validates type (by content, not extension) and size, then stores the binary. */
  async store(file: Blob & { name?: string }, opts: { imagesOnly?: boolean } = {}): Promise<StoredFile> {
    const maxBytes = opts.imagesOnly ? MAX_IMAGE_BYTES : MAX_UPLOAD_BYTES
    if (file.size === 0) throw new ValidationError('The file is empty', { file: 'The file is empty' })
    if (file.size > maxBytes) {
      const msg = `Files must be ${formatBytes(maxBytes)} or smaller`
      throw new ValidationError(msg, { file: msg })
    }
    const detected = await sniffMime(file)
    const allowed = opts.imagesOnly ? IMAGE_TYPES : Object.keys(ALLOWED_UPLOAD_TYPES)
    if (!detected || !allowed.includes(detected)) {
      const msg = opts.imagesOnly ? 'Use a JPEG, PNG or WebP image' : 'Upload a PDF, JPEG, PNG or WebP file'
      throw new ValidationError(msg, { file: msg })
    }
    const stored: StoredFile = {
      fileId: newId('file', 10),
      doctorId: this.doctorId(),
      fileName: (file.name ?? 'file').slice(0, 200),
      mimeType: detected,
      sizeBytes: file.size,
      blob: file,
      createdAt: nowIso(),
    }
    await this.repos.files.put(stored)
    return stored
  }

  async get(fileId: string | null | undefined): Promise<StoredFile | null> {
    if (!fileId) return null
    return this.repos.files.get(this.doctorId(), fileId)
  }

  async remove(fileId: string | null | undefined): Promise<void> {
    if (fileId) await this.repos.files.remove(this.doctorId(), fileId)
  }
}
