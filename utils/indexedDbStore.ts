class ImageIndexedDB {
  private dbName = 'dnd-sheet-images';
  private storeName = 'images';
  private db: IDBDatabase | null = null;
  private memoryFallback: Map<string, any> = new Map();
  private isSupported: boolean | null = null;

  async init(): Promise<IDBDatabase | null> {
    if (this.isSupported === false) return null;
    if (this.db) return this.db;
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      this.isSupported = false;
      return null;
    }
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(this.dbName, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName);
          }
        };
        request.onsuccess = () => {
          this.db = request.result;
          this.isSupported = true;
          resolve(this.db);
        };
        request.onerror = () => {
          console.warn('[DND Sheet] IndexedDB not accessible, using in-memory fallback.');
          this.isSupported = false;
          resolve(null);
        };
      } catch (err) {
        console.warn('[DND Sheet] IndexedDB open threw exception, using in-memory fallback:', err);
        this.isSupported = false;
        resolve(null);
      }
    });
  }

  async get(key: string): Promise<any | null> {
    try {
      const db = await this.init();
      if (!db) return this.memoryFallback.get(key) || null;
      return new Promise((resolve) => {
        try {
          const transaction = db.transaction(this.storeName, 'readonly');
          const store = transaction.objectStore(this.storeName);
          const request = store.get(key);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => resolve(this.memoryFallback.get(key) || null);
        } catch (e) {
          resolve(this.memoryFallback.get(key) || null);
        }
      });
    } catch (e) {
      return this.memoryFallback.get(key) || null;
    }
  }

  async set(key: string, value: any): Promise<void> {
    this.memoryFallback.set(key, value);
    try {
      const db = await this.init();
      if (!db) return;
      return new Promise((resolve) => {
        try {
          const transaction = db.transaction(this.storeName, 'readwrite');
          const store = transaction.objectStore(this.storeName);
          const request = store.put(value, key);
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
        } catch (e) {
          resolve();
        }
      });
    } catch (e) {
      return;
    }
  }

  async delete(key: string): Promise<void> {
    this.memoryFallback.delete(key);
    try {
      const db = await this.init();
      if (!db) return;
      return new Promise((resolve) => {
        try {
          const transaction = db.transaction(this.storeName, 'readwrite');
          const store = transaction.objectStore(this.storeName);
          const request = store.delete(key);
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
        } catch (e) {
          resolve();
        }
      });
    } catch (e) {
      return;
    }
  }

  async keys(): Promise<string[]> {
    try {
      const db = await this.init();
      if (!db) return Array.from(this.memoryFallback.keys());
      return new Promise((resolve) => {
        try {
          const transaction = db.transaction(this.storeName, 'readonly');
          const store = transaction.objectStore(this.storeName);
          const request = store.getAllKeys();
          request.onsuccess = () => resolve((request.result || []).map(String));
          request.onerror = () => resolve(Array.from(this.memoryFallback.keys()));
        } catch (e) {
          resolve(Array.from(this.memoryFallback.keys()));
        }
      });
    } catch (e) {
      return Array.from(this.memoryFallback.keys());
    }
  }
}

export const imageDb = new ImageIndexedDB();
