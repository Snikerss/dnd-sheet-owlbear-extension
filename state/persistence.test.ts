// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { parseCharactersData, parseImageCache, serializeForCache } from './persistence';
import { makeTestCharacter } from './testFixtures';
import type { CharactersState } from './appReducer';
import { saveToLocalStorage, loadFromLocalStorage, saveCharacterApi, loadCharactersApi } from '../utils/storage';

describe('persistence: parseImageCache tolerant parser', () => {
  it('parses Map instances into new Map clone', () => {
    const original = new Map([
      ['k1', 'val1'],
      ['k2', 'val2'],
    ]);
    const parsed = parseImageCache(original);
    expect(parsed).toBeInstanceOf(Map);
    expect(parsed).not.toBe(original);
    expect(parsed.get('k1')).toBe('val1');
    expect(parsed.get('k2')).toBe('val2');
    expect(parsed.size).toBe(2);
  });

  it('parses array of tuples [string, string][]', () => {
    const input: [string, string][] = [
      ['img:ref:1', 'data:image/png;base64,AAA'],
      ['img:ref:2', 'data:image/jpeg;base64,BBB'],
    ];
    const parsed = parseImageCache(input);
    expect(parsed).toBeInstanceOf(Map);
    expect(parsed.get('img:ref:1')).toBe('data:image/png;base64,AAA');
    expect(parsed.get('img:ref:2')).toBe('data:image/jpeg;base64,BBB');
    expect(parsed.size).toBe(2);
  });

  it('parses plain object Record<string, string> (new export format)', () => {
    const input = {
      'img:ref:portrait': 'data:image/png;base64,PORTRAIT',
      'img:ref:sword': 'data:image/webp;base64,SWORD',
    };
    const parsed = parseImageCache(input);
    expect(parsed).toBeInstanceOf(Map);
    expect(parsed.get('img:ref:portrait')).toBe('data:image/png;base64,PORTRAIT');
    expect(parsed.get('img:ref:sword')).toBe('data:image/webp;base64,SWORD');
    expect(parsed.size).toBe(2);
  });

  it('parses empty object {} from legacy broken exports without throwing', () => {
    const parsed = parseImageCache({});
    expect(parsed).toBeInstanceOf(Map);
    expect(parsed.size).toBe(0);
  });

  it('returns empty Map when imageCache is missing or undefined/null', () => {
    expect(parseImageCache(undefined)).toBeInstanceOf(Map);
    expect(parseImageCache(undefined).size).toBe(0);
    expect(parseImageCache(null)).toBeInstanceOf(Map);
    expect(parseImageCache(null).size).toBe(0);
  });

  it('returns empty Map when given unexpected primitive types or corrupted data without throwing', () => {
    expect(parseImageCache('invalid-string').size).toBe(0);
    expect(parseImageCache(12345).size).toBe(0);
    expect(parseImageCache(true).size).toBe(0);
    expect(parseImageCache(['corrupted', 42]).size).toBe(0);
    expect(parseImageCache([['valid', 'data'], 'corrupted']).size).toBe(1);
    expect(parseImageCache([['valid', 'data'], 'corrupted']).get('valid')).toBe('data');
  });
});

describe('persistence: parseCharactersData & Vault Roundtrip', () => {
  it('roundtrip: entry with Map of 2 entries -> exportVaultData serialization -> parseCharactersData -> Map with same 2 entries', () => {
    const testChar = makeTestCharacter({ name: 'Рейнджер Тауриэль', level: 4 });
    const imageMap = new Map<string, string>([
      ['img:ref:portrait', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='],
      ['img:ref:item1', 'data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73v/+BiOh/AAA='],
    ]);

    const state: CharactersState = {
      'char-ranger': {
        history: {
          past: [],
          present: testChar,
          future: [],
        },
        log: [{ id: 'l1', timestamp: 1000, description: 'Персонаж создан' }],
        imageCache: imageMap,
      },
    };

    // 1. Simulate exportVaultData conversion (Object.fromEntries per entry, non-mutating)
    const exportableCharacters: Record<string, unknown> = {};
    for (const [id, entry] of Object.entries(state)) {
      if (!entry) continue;
      const imageCacheRecord: Record<string, string> =
        entry.imageCache instanceof Map
          ? Object.fromEntries(entry.imageCache.entries())
          : {};
      exportableCharacters[id] = {
        ...entry,
        character: entry.history?.present,
        imageCache: imageCacheRecord,
      };
    }

    const vaultPayload = {
      version: 2,
      exportedAt: 1700000000000,
      knownRooms: [],
      characters: exportableCharacters,
    };

    // Ensure state itself was not mutated
    expect(state['char-ranger']?.imageCache).toBeInstanceOf(Map);
    expect(state['char-ranger']?.imageCache?.size).toBe(2);

    // 2. Serialize to JSON and back (as file save/load)
    const fileContent = JSON.stringify(vaultPayload, null, 2);
    const parsedFile = JSON.parse(fileContent);

    // Verify raw JSON structure has flat record for imageCache (not empty {})
    expect(parsedFile.characters['char-ranger'].imageCache).toEqual({
      'img:ref:portrait': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'img:ref:item1': 'data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73v/+BiOh/AAA=',
    });

    // 3. Simulate importVaultData parsing
    const importedState = parseCharactersData(parsedFile.characters);
    const importedEntry = importedState['char-ranger'];

    expect(importedEntry).toBeDefined();
    expect(importedEntry?.history.present.name).toBe('Рейнджер Тауриэль');
    expect(importedEntry?.log).toHaveLength(1);
    expect(importedEntry?.imageCache).toBeInstanceOf(Map);
    expect(importedEntry?.imageCache?.size).toBe(2);
    expect(importedEntry?.imageCache?.get('img:ref:portrait')).toBe(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    );
    expect(importedEntry?.imageCache?.get('img:ref:item1')).toBe(
      'data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73v/+BiOh/AAA='
    );
  });

  it('legacy broken export: imageCache: {} parses without exceptions and preserves character data with empty Map', () => {
    const testChar = makeTestCharacter({ name: 'Варвар Конан', level: 3 });

    // Payload as created by the previous broken exportVaultData (where JSON.stringify(Map) yielded {})
    const brokenVaultPayload = {
      version: 2,
      exportedAt: 1690000000000,
      characters: {
        'char-conan': {
          history: {
            past: [],
            present: testChar,
            future: [],
          },
          log: [],
          imageCache: {}, // The bug! In old version this threw: TypeError: object is not iterable
        },
      },
    };

    const fileContent = JSON.stringify(brokenVaultPayload);
    const parsedFile = JSON.parse(fileContent);

    // Must NOT throw TypeError
    expect(() => parseCharactersData(parsedFile.characters)).not.toThrow();

    const imported = parseCharactersData(parsedFile.characters);
    const importedConan = imported['char-conan'];
    expect(importedConan).toBeDefined();
    expect(importedConan?.history.present.name).toBe('Варвар Конан');
    expect(importedConan?.imageCache).toBeInstanceOf(Map);
    expect(importedConan?.imageCache?.size).toBe(0);
  });

  it('missing imageCache: parses without exceptions and sets empty Map', () => {
    const testChar = makeTestCharacter({ name: 'Плут Локи' });
    const rawData = {
      'char-loki': {
        character: testChar,
        log: [],
        // imageCache field completely absent
      },
    };

    const imported = parseCharactersData(rawData);
    const importedLoki = imported['char-loki'];
    expect(importedLoki).toBeDefined();
    expect(importedLoki?.history.present.name).toBe('Плут Локи');
    expect(importedLoki?.imageCache).toBeInstanceOf(Map);
    expect(importedLoki?.imageCache?.size).toBe(0);
  });

  it('serializeForCache works with both Map and Record imageCache', () => {
    const testChar = makeTestCharacter({ name: 'Маг Рейстлин' });
    const fromMap = serializeForCache({
      character: testChar,
      imageCache: new Map([['img:1', 'data:image/png;base64,123']]),
    });
    const fromRecord = serializeForCache({
      character: testChar,
      imageCache: { 'img:1': 'data:image/png;base64,123' },
    });
    const fromArray = serializeForCache({
      character: testChar,
      imageCache: [['img:1', 'data:image/png;base64,123']],
    });

    expect(fromMap).toBe(fromRecord);
    expect(fromMap).toBe(fromArray);
  });
});

describe('persistence: light-mirror localStorage & storage roundtrip', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saveToLocalStorage safely serializes Map without converting to broken {}', () => {
    const map = new Map([
      ['img:ref:1', 'data:image/png;base64,TEST1'],
      ['img:ref:2', 'data:image/png;base64,TEST2'],
    ]);

    saveToLocalStorage({
      'char-test': {
        name: 'Тест',
        imageCache: map,
      },
    });

    const raw = localStorage.getItem('dnd-characters');
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    expect(parsed['char-test'].imageCache).toEqual({
      'img:ref:1': 'data:image/png;base64,TEST1',
      'img:ref:2': 'data:image/png;base64,TEST2',
    });

    const localData = loadFromLocalStorage();
    const parsedCache = parseImageCache(localData['char-test']?.imageCache);
    expect(parsedCache.get('img:ref:1')).toBe('data:image/png;base64,TEST1');
    expect(parsedCache.get('img:ref:2')).toBe('data:image/png;base64,TEST2');
  });

  it('saveCharacterApi accepts entry with imageCache as Map and loads back via loadCharactersApi', async () => {
    const testChar = makeTestCharacter({ name: 'Паладин Утер' });
    const imageMap = new Map([
      ['img:ref:portrait', 'data:image/png;base64,PORTRAIT_DATA'],
    ]);

    await saveCharacterApi('char-uther', {
      character: testChar,
      log: [],
      history: { past: [], future: [] },
      imageCache: imageMap,
    });

    const loaded = await loadCharactersApi();
    expect(loaded).toBeDefined();
    expect(loaded!['char-uther']).toBeDefined();

    const parsedState = parseCharactersData(loaded);
    const parsedUther = parsedState['char-uther'];
    expect(parsedUther).toBeDefined();
    expect(parsedUther?.imageCache).toBeInstanceOf(Map);
    expect(parsedUther?.imageCache?.get('img:ref:portrait')).toBe(
      'data:image/png;base64,PORTRAIT_DATA'
    );
  });
});
