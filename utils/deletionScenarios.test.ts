// @vitest-environment jsdom
/**
 * Регрессионные тесты путей удаления персонажа (P0 финального аудита).
 *
 * Закрывают два критических бага:
 *  - C1: P2P/bridge-удаление чистило только localStorage — персонаж воскресал
 *    из memory-cache и IndexedDB `char-full/{id}` (primary-хранилище);
 *  - C2: отправитель bridge-delete не нёс senderPlayerId → получатель
 *    подставлял случайный SESSION_CLIENT_ID и отклонял валидное удаление.
 *
 * Инвариант для ВСЕХ путей: после purgeLocalCharacter/deleteCharacterApi
 * персонаж отсутствует НИ В ОДНОМ хранилище.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    saveCharacterApi,
    deleteCharacterApi,
    purgeLocalCharacter,
    loadFromLocalStorage,
} from './storage';
import { imageDb } from './indexedDbStore';
import { localBridge } from './bridgeService';
import { isAuthorizedDelete } from '../auth/authorization';
import { BridgeMessageType } from '../protocol/messages';
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

const GRANULAR_PREFIX = 'com.antigravity.dnd-sheet/v2/character/';

const entryFor = (id: string) => ({
    character: makeTestCharacter({ name: `Персонаж ${id}` }),
    log: [],
    history: { past: [], future: [] },
    imageCache: [] as [string, string][],
});

const expectFullyGone = async (id: string) => {
    // Главное зеркало + memory overlay
    expect(loadFromLocalStorage()[id]).toBeUndefined();
    // Granular зеркало
    expect(localStorage.getItem(GRANULAR_PREFIX + id)).toBeNull();
    // IndexedDB primary (в jsdom — memoryFallback)
    expect(await imageDb.get('char-full/' + id)).toBeNull();
};

describe('purgeLocalCharacter — полная зачистка (инвариант C1)', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('убирает персонажа из зеркала, granular-ключа и IndexedDB', async () => {
        await saveCharacterApi('victim', entryFor('V'));
        // Санити: после сохранения он везде есть
        expect(loadFromLocalStorage()['victim']).toBeDefined();

        await purgeLocalCharacter('victim');

        await expectFullyGone('victim');
    });

    it('deleteCharacterApi даёт тот же результат (тонкая обёртка над purge)', async () => {
        await saveCharacterApi('victim2', entryFor('V2'));
        await deleteCharacterApi('victim2');
        await expectFullyGone('victim2');
    });

    it('повторный purge идемпотентен и не бросает', async () => {
        await saveCharacterApi('v3', entryFor('V3'));
        await purgeLocalCharacter('v3');
        await expect(purgeLocalCharacter('v3')).resolves.toBeUndefined();
        await expectFullyGone('v3');
    });
});

describe('bridge-delete: контракт отправителя (инвариант C2)', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('postMessage несёт charId и ЯВНЫЙ senderPlayerId (не SESSION_CLIENT_ID подстановку)', () => {
        const playerId = 'player-owner-1';
        // Тот же вызов, что в useCharacterManager.deleteCharacter (шаг 4)
        localBridge.postMessage({
            type: BridgeMessageType.DELETE_CHARACTER_SYNC_BRIDGE,
            charId: 'char-x',
            senderPlayerId: playerId,
        });

        const raw = localStorage.getItem('com.antigravity.dnd-sheet/bridge_signal');
        expect(raw).toBeTruthy();
        const payload = JSON.parse(raw!);

        expect(payload.type).toBe(BridgeMessageType.DELETE_CHARACTER_SYNC_BRIDGE);
        expect(payload.charId).toBe('char-x');
        // Ключевой инвариант C2: реальный playerId присутствует в сообщении
        expect(payload.senderPlayerId).toBe(playerId);
    });
});

describe('авторизация удаления: матрица C2 на приёмнике', () => {
    const base = {
        targetOwnerId: 'player-owner-1',
        recipientIsGM: false,
        recipientPlayerId: 'player-owner-1',
    };

    it('владелец на соседней вкладке проходит (senderPlayerId = ownerId)', () => {
        expect(isAuthorizedDelete({ ...base, senderPlayerId: 'player-owner-1' })).toBe(true);
    });

    it('случайный id чужой вкладки (SESSION_CLIENT_ID-стиль) НЕ проходит', () => {
        // Ровно механика бага C2: до фикса сюда попадал senderClientId вкладки
        expect(isAuthorizedDelete({ ...base, senderPlayerId: 'tab7k2f9x1' })).toBe(false);
    });

    it('пустой senderPlayerId не проходит (дыра #7a остаётся закрытой)', () => {
        expect(isAuthorizedDelete({ ...base, senderPlayerId: '' })).toBe(false);
    });

    it('ГМ-получатель принимает любое удаление', () => {
        expect(isAuthorizedDelete({
            ...base,
            recipientIsGM: true,
            senderPlayerId: '',
        })).toBe(true);
    });
});
