import { Character } from '../types';
import { loadCharactersApi, saveCharacterApi, deleteCharacterApi, loadFromLocalStorage, saveToLocalStorage } from './storage';
import { imageDb } from './indexedDbStore';

export interface IStorageRepository {
  loadCharacters(): Promise<any>;
  saveCharacter(id: string, entry: any): Promise<void>;
  deleteCharacter(id: string): Promise<void>;
  clearLocalImageCache(id: string): Promise<void>;
}

export class StorageRepository implements IStorageRepository {
  public async loadCharacters(): Promise<any> {
    return await loadCharactersApi();
  }

  public async saveCharacter(id: string, entry: any): Promise<void> {
    await saveCharacterApi(id, entry);
    // Also save lightweight text backup locally
    const currentLocal = loadFromLocalStorage();
    saveToLocalStorage({
      ...currentLocal,
      [id]: entry
    });
  }

  public async deleteCharacter(id: string): Promise<void> {
    await deleteCharacterApi(id);
    await this.clearLocalImageCache(id);
  }

  public async clearLocalImageCache(id: string): Promise<void> {
    if (imageDb) {
      try {
        const keys = await imageDb.keys();
        for (const key of keys) {
          if (typeof key === 'string' && key.startsWith(`char-images/${id}`)) {
            await imageDb.delete(key);
          }
        }
      } catch (err) {
        console.warn('[StorageRepository] Error clearing image cache:', err);
      }
    }
  }
}

export const storageRepository = new StorageRepository();
