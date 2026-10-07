import { describe, it, expect } from 'vitest';
import { charactersReducer, CharactersState, CharactersAction } from './appReducer';
import { makeTestCharacter } from './testFixtures';

const makeEntry = (name: string, logTimestamp: number, extra: Record<string, unknown> = {}) => ({
    history: {
        past: [{ ...makeTestCharacter({ name }), level: 1 }],
        present: { ...makeTestCharacter({ name }), level: 2 },
        future: [],
    },
    log: [{ id: `log-${name}`, timestamp: logTimestamp, description: 'x' }],
    ...extra,
});

describe('charactersReducer — MERGE_REMOTE_CHARACTERS (баг #9)', () => {
    it('добавляет нового персонажа из внешнего снимка', () => {
        const state: CharactersState = {};
        const incoming: CharactersState = {
            'new-1': makeEntry('Новичок', 100),
        };
        const result = charactersReducer(state, { type: 'MERGE_REMOTE_CHARACTERS', payload: incoming });
        expect(result['new-1']).toBeDefined();
        expect(result['new-1']!.history.present.name).toBe('Новичок');
    });

    it('чужая версия СТРОГО новее → заменяет запись целиком', () => {
        const state: CharactersState = {
            'c1': makeEntry('Старая', 100),
        };
        const incoming: CharactersState = {
            'c1': makeEntry('Новая', 200),
        };
        const result = charactersReducer(state, { type: 'MERGE_REMOTE_CHARACTERS', payload: incoming });
        expect(result['c1']!.history.present.name).toBe('Новая');
        expect(result['c1']!.log[0]!.timestamp).toBe(200);
    });

    it('КЛЮЧЕВОЙ КЕЙС: локальная версия не моложе → запись сохранена ПО ССЫЛКЕ вместе с undo-историей', () => {
        const localEntry = makeEntry('Локальная', 300);
        localEntry.history.past = Array.from({ length: 5 }, (_, i) => makeTestCharacter({ name: `hist-${i}` }));
        const state: CharactersState = { 'c1': localEntry };
        const incoming: CharactersState = {
            'c1': makeEntry('Локальная', 300), // равное время
            'other': makeEntry('Другой', 50),
        };

        const action: CharactersAction = { type: 'MERGE_REMOTE_CHARACTERS', payload: incoming };
        const result = charactersReducer(state, action);

        // Ссылочное равенство: past/future нетронуты (undo-стек жив)
        expect(result['c1']).toBe(localEntry);
        expect(result['c1']!.history.past).toHaveLength(5);

        // Новый для нас персонаж добавлен
        expect(result['other']).toBeDefined();
    });

    it('локальная версия новее внешней → ничего не перезаписывается', () => {
        const localEntry = makeEntry('Моя свежая правка', 500);
        const state: CharactersState = { 'c1': localEntry };
        const incoming: CharactersState = {
            'c1': makeEntry('Устаревшая с диска', 400),
        };
        const result = charactersReducer(state, { type: 'MERGE_REMOTE_CHARACTERS', payload: incoming });
        expect(result['c1']).toBe(localEntry);
    });

    it('персонаж, исчезнувший из снимка, удаляется (удалён другой вкладкой)', () => {
        const state: CharactersState = {
            'keep': makeEntry('Остаётся', 100),
            'gone': makeEntry('Удалён', 100),
        };
        const incoming: CharactersState = {
            'keep': makeEntry('Остаётся', 100),
        };
        const result = charactersReducer(state, { type: 'MERGE_REMOTE_CHARACTERS', payload: incoming });
        expect(result['gone']).toBeUndefined();
        expect(result['keep']).toBeDefined();
    });

    it('битые записи без history.present пропускаются', () => {
        const state: CharactersState = {};
        const incoming = {
            'broken': { log: [] },
        } as unknown as CharactersState;
        const result = charactersReducer(state, { type: 'MERGE_REMOTE_CHARACTERS', payload: incoming });
        expect(result['broken']).toBeUndefined();
    });

    it('нет изменений → возвращается тот же объект состояния', () => {
        const entry = makeEntry('X', 100);
        const state: CharactersState = { 'c1': entry };
        const incoming: CharactersState = { 'c1': makeEntry('X', 100) };
        const result = charactersReducer(state, { type: 'MERGE_REMOTE_CHARACTERS', payload: incoming });
        expect(result).toBe(state);
    });

    it('LWW: lastModified имеет приоритет над логом — удалённая с большим lastModified побеждает', () => {
        const localEntry = makeEntry('Локальная', 500); // лог 500
        localEntry.history.present.lastModified = 100;

        const remoteEntry = makeEntry('Удалённая', 10); // лог всего 10
        remoteEntry.history.present.lastModified = 200; // но lastModified 200 > 100

        const state: CharactersState = { 'c1': localEntry };
        const incoming: CharactersState = { 'c1': remoteEntry };

        const result = charactersReducer(state, { type: 'MERGE_REMOTE_CHARACTERS', payload: incoming });
        expect(result['c1']!.history.present.name).toBe('Удалённая');
    });

    it('LWW: lastModified имеет приоритет над логом — локальная с большим lastModified сохраняется', () => {
        const localEntry = makeEntry('Локальная свежая', 10);
        localEntry.history.present.lastModified = 300;

        const remoteEntry = makeEntry('Удалённая со старым lastModified', 500); // лог 500
        remoteEntry.history.present.lastModified = 200; // lastModified 200 < 300

        const state: CharactersState = { 'c1': localEntry };
        const incoming: CharactersState = { 'c1': remoteEntry };

        const result = charactersReducer(state, { type: 'MERGE_REMOTE_CHARACTERS', payload: incoming });
        expect(result['c1']).toBe(localEntry);
    });

    it('LWW: фолбэк на верхушку лога, если lastModified отсутствует у записей', () => {
        const localEntry = makeEntry('Локальная без даты', 100);
        delete localEntry.history.present.lastModified;

        const remoteEntry = makeEntry('Удалённая без даты', 200);
        delete remoteEntry.history.present.lastModified;

        const state: CharactersState = { 'c1': localEntry };
        const incoming: CharactersState = { 'c1': remoteEntry };

        const result = charactersReducer(state, { type: 'MERGE_REMOTE_CHARACTERS', payload: incoming });
        expect(result['c1']!.history.present.name).toBe('Удалённая без даты');
    });
});
