import OBR from '@owlbear-rodeo/sdk';

/**
 * Checks if the application is running inside the Owlbear Rodeo iframe environment.
 */
export const isOwlbear = (): boolean => {
  return typeof window !== 'undefined' && window.parent !== window;
};

const LEGACY_METADATA_KEY = 'com.antigravity.dnd-sheet/characters';
const GRANULAR_KEY_PREFIX = 'com.antigravity.dnd-sheet/character/';

/**
 * Loads character data from OBR room metadata (filtering by granular keys) or local storage / Vite dev server fallback.
 */
export async function loadCharactersApi(): Promise<any> {
  if (isOwlbear()) {
    try {
      const getCharactersFromMetadata = async (metadata: any) => {
        const charactersData: Record<string, any> = {};
        let hasGranular = false;
        
        // 1. Read granular characters
        for (const [key, value] of Object.entries(metadata)) {
          if (key.startsWith(GRANULAR_KEY_PREFIX) && value !== null) {
            const charId = key.replace(GRANULAR_KEY_PREFIX, '');
            charactersData[charId] = value;
            hasGranular = true;
          }
        }

        // 2. Read and migrate legacy bulk key if no granular keys exist
        const legacyData = metadata[LEGACY_METADATA_KEY];
        if (!hasGranular && legacyData) {
          console.log('[DND Sheet] Migrating legacy characters to granular metadata keys...');
          const updateObj: Record<string, any> = {};
          for (const [charId, charData] of Object.entries(legacyData)) {
            updateObj[`${GRANULAR_KEY_PREFIX}${charId}`] = charData;
            charactersData[charId] = charData;
          }
          // Clean up legacy key by setting it to null (deletes it in OBR)
          updateObj[LEGACY_METADATA_KEY] = null;
          await OBR.room.setMetadata(updateObj);
          return charactersData;
        }

        return hasGranular ? charactersData : null;
      };

      if (OBR.isReady) {
        const metadata = await OBR.room.getMetadata();
        const data = await getCharactersFromMetadata(metadata);
        return data || loadFromLocalStorage();
      } else {
        return new Promise((resolve) => {
          OBR.onReady(async () => {
            try {
              const metadata = await OBR.room.getMetadata();
              const data = await getCharactersFromMetadata(metadata);
              resolve(data || loadFromLocalStorage());
            } catch (err) {
              console.error('Error fetching OBR metadata:', err);
              resolve(loadFromLocalStorage());
            }
          });
        });
      }
    } catch (error) {
      console.error('Owlbear loadCharacters error, falling back to LocalStorage:', error);
      return loadFromLocalStorage();
    }
  } else {
    return loadFromLocalDevApi();
  }
}

/**
 * Saves a single character's data to OBR room metadata and local storage backup.
 */
export async function saveCharacterApi(id: string, characterData: any): Promise<void> {
  // Always write to local storage backup
  const localData = loadFromLocalStorage();
  localData[id] = characterData;
  saveToLocalStorage(localData);

  if (isOwlbear()) {
    try {
      const key = `${GRANULAR_KEY_PREFIX}${id}`;
      if (OBR.isReady) {
        await OBR.room.setMetadata({ [key]: characterData });
      } else {
        await new Promise<void>((resolve) => {
          OBR.onReady(async () => {
            await OBR.room.setMetadata({ [key]: characterData });
            resolve();
          });
        });
      }
    } catch (error) {
      console.error(`Owlbear saveCharacter error for ${id}:`, error);
    }
  } else {
    await saveToLocalDevApi(localData);
  }
}

/**
 * Deletes a single character's data from OBR room metadata and local storage.
 */
export async function deleteCharacterApi(id: string): Promise<void> {
  const localData = loadFromLocalStorage();
  delete localData[id];
  saveToLocalStorage(localData);

  if (isOwlbear()) {
    try {
      const key = `${GRANULAR_KEY_PREFIX}${id}`;
      if (OBR.isReady) {
        await OBR.room.setMetadata({ [key]: null }); // Setting to null deletes the key in OBR
      } else {
        await new Promise<void>((resolve) => {
          OBR.onReady(async () => {
            await OBR.room.setMetadata({ [key]: null });
            resolve();
          });
        });
      }
    } catch (error) {
      console.error(`Owlbear deleteCharacter error for ${id}:`, error);
    }
  } else {
    await saveToLocalDevApi(localData);
  }
}

function loadFromLocalStorage(): any {
  if (typeof window === 'undefined') return {};
  const data = localStorage.getItem('dnd-characters');
  return data ? JSON.parse(data) : {};
}

function saveToLocalStorage(characters: any) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('dnd-characters', JSON.stringify(characters));
}

async function loadFromLocalDevApi(): Promise<any> {
  try {
    const res = await fetch('/api/characters');
    if (!res.ok) throw new Error("Сетевая ошибка при загрузке данных.");
    return res.json();
  } catch (err) {
    console.warn("Dev server API unavailable, falling back to LocalStorage:", err);
    return loadFromLocalStorage();
  }
}

async function saveToLocalDevApi(characters: any): Promise<any> {
  try {
    const res = await fetch('/api/characters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(characters),
    });
    if (!res.ok) throw new Error("Сетевая ошибка при сохранении данных.");
    return res.json();
  } catch (err) {
    console.warn("Dev server API unavailable, saving to LocalStorage:", err);
    saveToLocalStorage(characters);
    return { success: true };
  }
}
