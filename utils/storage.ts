import OBR from '@owlbear-rodeo/sdk';

/**
 * Checks if the application is running inside the Owlbear Rodeo iframe environment.
 */
export const isOwlbear = (): boolean => {
  return typeof window !== 'undefined' && window.parent !== window;
};

const METADATA_KEY = 'com.antigravity.dnd-sheet/characters';

/**
 * Loads character data from OBR room metadata or local storage / Vite dev server fallback.
 */
export async function loadCharactersApi(): Promise<any> {
  if (isOwlbear()) {
    try {
      if (OBR.isReady) {
        const metadata = await OBR.room.getMetadata();
        const data = metadata[METADATA_KEY];
        return data || loadFromLocalStorage();
      } else {
        return new Promise((resolve) => {
          OBR.onReady(async () => {
            try {
              const metadata = await OBR.room.getMetadata();
              const data = metadata[METADATA_KEY];
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
 * Saves character data to OBR room metadata or local storage / Vite dev server fallback.
 */
export async function saveCharactersApi(characters: any): Promise<any> {
  // Always write to local storage as a robust local backup
  saveToLocalStorage(characters);

  if (isOwlbear()) {
    try {
      if (OBR.isReady) {
        await OBR.room.setMetadata({
          [METADATA_KEY]: characters
        });
        return { success: true };
      } else {
        return new Promise((resolve, reject) => {
          OBR.onReady(async () => {
            try {
              await OBR.room.setMetadata({
                [METADATA_KEY]: characters
              });
              resolve({ success: true });
            } catch (err) {
              reject(err);
            }
          });
        });
      }
    } catch (error) {
      console.error('Owlbear saveCharacters error (could be size limit), saved to local backup:', error);
      return { success: true };
    }
  } else {
    return saveToLocalDevApi(characters);
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
