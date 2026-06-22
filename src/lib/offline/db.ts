const DB_NAME = 'cmsports-offline'
const DB_VERSION = 1
const STORE_JUGADORES = 'jugadoresCache'
const STORE_QUEUE = 'asistenciaQueue'

export type AsistenciaPendiente = {
  id: string
  clubId: string
  jugadorId: string
  fecha: string
  hora: string
  jugadorNombre: string
  creadoEn: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_JUGADORES)) {
        db.createObjectStore(STORE_JUGADORES, { keyPath: 'clubId' })
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest | void
): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const store = tx.objectStore(storeName)
    const req = fn(store)
    tx.oncomplete = () => resolve((req as IDBRequest)?.result as T)
    tx.onerror = () => reject(tx.error)
  })
}

export async function guardarJugadoresCache(clubId: string, jugadores: unknown[]): Promise<void> {
  try {
    await withStore(STORE_JUGADORES, 'readwrite', (store) =>
      store.put({ clubId, jugadores, actualizadoEn: Date.now() })
    )
  } catch {}
}

export async function obtenerJugadoresCache(clubId: string): Promise<unknown[] | null> {
  try {
    const result = await withStore<{ jugadores: unknown[] } | undefined>(
      STORE_JUGADORES,
      'readonly',
      (store) => store.get(clubId)
    )
    return result?.jugadores ?? null
  } catch {
    return null
  }
}

export async function encolarAsistencia(item: AsistenciaPendiente): Promise<void> {
  await withStore(STORE_QUEUE, 'readwrite', (store) => store.put(item))
}

export async function obtenerCola(): Promise<AsistenciaPendiente[]> {
  try {
    return await withStore<AsistenciaPendiente[]>(STORE_QUEUE, 'readonly', (store) => store.getAll())
  } catch {
    return []
  }
}

export async function quitarDeCola(id: string): Promise<void> {
  await withStore(STORE_QUEUE, 'readwrite', (store) => store.delete(id))
}
