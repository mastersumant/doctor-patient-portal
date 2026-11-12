/**
 * The service methods reachable over HTTP, and whether each changes data.
 * Anything not listed here (internal helpers such as followUps.createForVisit,
 * or file-store access) cannot be called from the browser.
 */
export type RpcKind = 'read' | 'write'

export const RPC_METHODS = {
  doctor: {
    getCurrent: 'read',
    ensureProfile: 'write',
    updateProfile: 'write',
    setSignature: 'write',
    removeSignature: 'write',
    getSignatureDataUrl: 'read',
  },
  patients: {
    list: 'read',
    get: 'read',
    getDetail: 'read',
    search: 'read',
    options: 'read',
    counts: 'read',
    getPhoto: 'read',
    create: 'write',
    update: 'write',
    archive: 'write',
    restore: 'write',
    setPhoto: 'write',
    removePhoto: 'write',
  },
  visits: {
    list: 'read',
    listForPatient: 'read',
    get: 'read',
    vitalsHistory: 'read',
    latestForPatient: 'read',
    create: 'write',
    update: 'write',
    archive: 'write',
  },
  diagnoses: { listForPatient: 'read', listForVisit: 'read', knownNames: 'read', setStatus: 'write' },
  prescriptions: { list: 'read', get: 'read', recent: 'read', create: 'write', revise: 'write', cancel: 'write' },
  medicines: {
    list: 'read',
    searchActive: 'read',
    get: 'read',
    categories: 'read',
    create: 'write',
    update: 'write',
    setStatus: 'write',
    delete: 'write',
  },
  appointments: {
    list: 'read',
    range: 'read',
    upcoming: 'read',
    get: 'read',
    findConflicts: 'read',
    todayCount: 'read',
    create: 'write',
    update: 'write',
    reschedule: 'write',
    setStatus: 'write',
    archive: 'write',
  },
  followUps: { list: 'read', counts: 'read', get: 'read', create: 'write', update: 'write', setStatus: 'write' },
  documents: { list: 'read', listForPatient: 'read', getFile: 'read', upload: 'write', archive: 'write' },
  analytics: { dashboard: 'read', report: 'read', patientReport: 'read', timeline: 'read', notifications: 'read' },
  audit: { list: 'read' },
  data: { exportWorkbook: 'read', isEmpty: 'read', importWorkbook: 'write', loadSampleData: 'write', clearWorkspace: 'write' },
} as const satisfies Record<string, Record<string, RpcKind>>

export type RpcService = keyof typeof RPC_METHODS

export function rpcKind(service: string, method: string): RpcKind | null {
  const methods = (RPC_METHODS as Record<string, Record<string, RpcKind>>)[service]
  return methods && Object.prototype.hasOwnProperty.call(methods, method) ? methods[method] : null
}
