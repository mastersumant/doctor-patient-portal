import type { RepositoryRegistry, StorageType } from './interfaces'
import { createMemoryRepositories } from './memory/memoryRepositories'

/**
 * The single place that knows which storage implementation is in use.
 * Switching storage means adding an implementation and a case here —
 * services and UI are untouched.
 */
export async function createRepositories(storageType: StorageType): Promise<RepositoryRegistry> {
  switch (storageType) {
    case 'INDEXEDDB': {
      const { createIndexedDbRepositories } = await import('./indexeddb/indexedDbRepositories')
      return createIndexedDbRepositories()
    }
    case 'MEMORY':
      return createMemoryRepositories()
    default: {
      const unknown: never = storageType
      throw new Error(`Unsupported STORAGE_TYPE "${String(unknown)}"`)
    }
  }
}

/** IndexedDB, falling back to memory when the browser blocks it (some private modes). */
export async function createRepositoriesWithFallback(
  preferred: StorageType,
): Promise<{ repos: RepositoryRegistry; fellBack: boolean }> {
  try {
    return { repos: await createRepositories(preferred), fellBack: false }
  } catch (err) {
    if (preferred === 'MEMORY') throw err
    console.warn('Persistent storage unavailable, using in-memory storage for this tab.')
    return { repos: createMemoryRepositories(), fellBack: true }
  }
}
