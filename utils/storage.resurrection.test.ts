// @vitest-environment jsdom
/**
 * Регрессия бага аудита #5 «воскрешение персонажа» (план 6.3 остаток).
 *
 * Механика бага: clearLocalCache не чистил inMemoryCharactersCache → любой
 * следующий saveCharacterApi другого персонажа снова записывал «удалённого».
 * После фикса removeFromMemoryCache вызывается в clearLocalCache; этот тест
 * фиксирует инвариант на уровне storage: после удаления из memory+disk
 * сохранение ДРУГОГО персонажа не возвращает первого ни в один стор.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    saveCharacterApi,
    removeFromMemoryCache,
    removeCharacterMirrorKeys,
    loadFromLocalStorage,
} from './storage';
import { makeTestCharacter } from '../state/testFixtures';

vi.mock('@owlbear-rodeo/sdk', () => ({
    default: {
        isReady: true,
        onReady: (cb: () => void) => cb(),
        player: { id: 'player-test', getRole: async () => 'PLAYER', getName: async () => 'Тест' },
        room: { id: 'room-x', getMetadata: async () => ({}), setMetadata: async () => {} },
        broadcast: { sendMessage: async () => {}, onMessage: () => () => {} },
        viewport: { getWidth: async () => 1024 },
        action: { setWidth: () => {}, setHeight: () => {} },
        popover: { open: async () => ({}), close: async () => {} },
    },
}));

// jsdom: parent === window → isOwlbear() = false → saveCharacterApi пойдёт
// в dev-API fallback (fetch упадёт → saveToLocalStorage), что нам и нужно.
const entryFor = (id: string) => ({
    character: makeTestCharacter({ name: `Персонаж ${id}` }),
    log: [],
    history: { past: [], future: [] },
    imageCache: [] as [string, string][],
});

describe('Инвариант невоскрешения (баг #5)', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('после очистки копии сейв другого персонажа НЕ возвращает удалённого', async () => {
        // 1. Два персонажа живут в хранилищах
        await saveCharacterApi('char-a', entryFor('A'));
        await saveCharacterApi('char-b', entryFor('B'));
        expect(loadFromLocalStorage()['char-a']).toBeDefined();
        expect(loadFromLocalStorage()['char-b']).toBeDefined();

        // 2. Ядро clearLocalCache: память + диск + granular-ключ
        removeFromMemoryCache('char-a');
        const disk = loadFromLocalStorage();
        delete disk['char-a'];
        // saveToLocalStorage недоступен напрямую? экспортируется — но здесь
        // достаточно перезаписать через тот же путь, что использует хук:
        const { saveToLocalStorage } = await import('./storage');
        saveToLocalStorage(disk);
        removeCharacterMirrorKeys('char-a');

        // 3. Сохраняем ДРУГОГО персонажа (обновление B)
        await saveCharacterApi('char-b', { ...entryFor('B'), log: [{ id: 'l1', timestamp: Date.now(), description: 'x' }] });

        // 4. Инвариант: A не воскрес ни в зеркале, ни в памяти
        expect(loadFromLocalStorage()['char-a']).toBeUndefined();
    });

    it('контрольный: БЕЗ removeFromMemoryCache старое поведение воскрешало бы — документируем причину фикса', async () => {
        await saveCharacterApi('char-c', entryFor('C'));
        // Симулируем СТАРЫЙ clearLocalCache: чистим только диск
        const disk = loadFromLocalStorage();
        delete disk['char-c'];
        const { saveToLocalStorage } = await import('./storage');
        saveToLocalStorage(disk);

        // loadFromLocalStorage сливает memory поверх диска → «очищенный» жив
        // именно из-за inMemoryCharactersCache. Это причина, почему fix #5
        // обязан чистить память ПЕРВЫМ шагом.
        expect(loadFromLocalStorage()['char-c']).toBeDefined();
    });
});
