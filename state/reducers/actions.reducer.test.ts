import { describe, it, expect } from 'vitest';
import { actionsReducer } from './actions.reducer';
import { makeTestCharacter } from '../testFixtures';
import {
    CharacterAction,
    Feature,
    Spell,
    Note,
    Currency,
    Ability,
    RecoveryType,
    MagicSchool,
    AttackType,
    DamageType,
} from '../../types';

// Хелперы для создания сущностей
const makeFeature = (id: string, overrides: Partial<Feature> = {}): Feature => ({
    id,
    name: `Особенность ${id}`,
    description: '',
    totalUses: 3,
    currentUses: 3,
    recovery: RecoveryType.ShortRest,
    ...overrides,
});

const makeSpell = (id: string, overrides: Partial<Spell> = {}): Spell => ({
    id,
    name: `Заклинание ${id}`,
    description: '',
    level: 1,
    school: MagicSchool.Evocation,
    castingTime: '1 действие',
    range: '60 футов',
    duration: 'Мгновенная',
    isPrepared: false,
    imageUrl: '',
    isRitual: false,
    requiresConcentration: false,
    components: { verbal: true, somatic: true, material: false, materialDescription: '' },
    ...overrides,
});

const makeNote = (id: string, overrides: Partial<Note> = {}): Note => ({
    id,
    title: `Заметка ${id}`,
    content: '',
    ...overrides,
});

describe('actionsReducer — FEATURES', () => {
    it('ADD_FEATURE добавляет способность в default-группу', () => {
        const char = makeTestCharacter({ features: [], featureGroups: [{ id: 'default', name: 'Особенности', featureIds: [] }] });
        const action: CharacterAction = { type: 'ADD_FEATURE', payload: makeFeature('f1') };
        const result = actionsReducer(char, action);
        expect(result.features).toHaveLength(1);
        expect(result.featureGroups?.[0].featureIds).toContain('f1');
    });

    it('UPDATE_FEATURE обновляет существующую способность', () => {
        const char = makeTestCharacter({ features: [makeFeature('f1', { currentUses: 2 })] });
        const action: CharacterAction = { type: 'UPDATE_FEATURE', payload: makeFeature('f1', { currentUses: 1 }) };
        const result = actionsReducer(char, action);
        expect(result.features[0].currentUses).toBe(1);
    });

    it('DELETE_FEATURE удаляет способность из всех групп', () => {
        const char = makeTestCharacter({
            features: [makeFeature('f1'), makeFeature('f2')],
            featureGroups: [{ id: 'default', name: 'Особенности', featureIds: ['f1', 'f2'] }],
        });
        const action: CharacterAction = { type: 'DELETE_FEATURE', payload: 'f1' };
        const result = actionsReducer(char, action);
        expect(result.features).toHaveLength(1);
        expect(result.featureGroups?.[0].featureIds).toEqual(['f2']);
    });

    it('USE_FEATURE обновляет currentUses', () => {
        const char = makeTestCharacter({ features: [makeFeature('f1', { currentUses: 3, totalUses: 3 })] });
        const action: CharacterAction = { type: 'USE_FEATURE', payload: { id: 'f1', newUses: 1 } };
        const result = actionsReducer(char, action);
        expect(result.features[0].currentUses).toBe(1);
    });

    it('REORDER_FEATURES меняет порядок', () => {
        const char = makeTestCharacter({ features: [makeFeature('f1'), makeFeature('f2'), makeFeature('f3')] });
        const action: CharacterAction = { type: 'REORDER_FEATURES', payload: { sourceIndex: 0, destinationIndex: 2 } };
        const result = actionsReducer(char, action);
        expect(result.features.map((f) => f.id)).toEqual(['f2', 'f3', 'f1']);
    });

    it('CREATE_FEATURE_GROUP создаёт новую группу с UUID-идентификатором', () => {
        const char = makeTestCharacter({ features: [makeFeature('f1')], featureGroups: [{ id: 'default', name: 'Особенности', featureIds: ['f1'] }] });
        const action: CharacterAction = { type: 'CREATE_FEATURE_GROUP', payload: { name: 'Боевые' } };
        const result = actionsReducer(char, action);
        expect(result.featureGroups).toHaveLength(2);
        const newGroup = result.featureGroups?.[1];
        expect(newGroup?.name).toBe('Боевые');
        expect(newGroup?.id).not.toBe('default');
        expect(newGroup?.featureIds).toEqual([]);
    });

    it('MOVE_FEATURE перемещает способность между группами', () => {
        const char = makeTestCharacter({
            features: [makeFeature('f1'), makeFeature('f2')],
            featureGroups: [
                { id: 'g1', name: 'Группа 1', featureIds: ['f1'] },
                { id: 'g2', name: 'Группа 2', featureIds: ['f2'] },
            ],
        });
        const action: CharacterAction = { type: 'MOVE_FEATURE', payload: { featureId: 'f1', sourceGroupId: 'g1', targetGroupId: 'g2', targetIndex: 0 } };
        const result = actionsReducer(char, action);
        expect(result.featureGroups?.[0].featureIds).toEqual([]);
        expect(result.featureGroups?.[1].featureIds).toEqual(['f1', 'f2']);
    });
});

describe('actionsReducer — ATTACKS', () => {
    it('ADD_ATTACK добавляет атаку', () => {
        const char = makeTestCharacter({ attacks: [] });
        const attack = {
            id: 'a1', name: 'Меч', imageUrl: '', attackType: AttackType.Melee, rangeNormal: 5, rangeLong: null,
            hitAbility: Ability.STR, damageAbility: Ability.STR as const, isProficient: true, hitBonus: 5,
            damageDice: '1d8', damageBonus: 3, damageType: DamageType.Slashing, notes: '',
        };
        const action: CharacterAction = { type: 'ADD_ATTACK', payload: attack };
        const result = actionsReducer(char, action);
        expect(result.attacks).toHaveLength(1);
    });

    it('DELETE_ATTACK удаляет атаку', () => {
        const char = makeTestCharacter({ attacks: [{ id: 'a1', name: 'Меч', imageUrl: '', attackType: AttackType.Melee, rangeNormal: 5, rangeLong: null, hitAbility: Ability.STR, damageAbility: Ability.STR, isProficient: true, hitBonus: 5, damageDice: '1d8', damageBonus: 3, damageType: DamageType.Slashing, notes: '' }] });
        const action: CharacterAction = { type: 'DELETE_ATTACK', payload: 'a1' };
        const result = actionsReducer(char, action);
        expect(result.attacks).toHaveLength(0);
    });
});

describe('actionsReducer — SPELLS', () => {
    it('ADD_SPELL добавляет заклинание', () => {
        const char = makeTestCharacter({ spells: [] });
        const action: CharacterAction = { type: 'ADD_SPELL', payload: makeSpell('s1') };
        const result = actionsReducer(char, action);
        expect(result.spells).toHaveLength(1);
    });

    it('TOGGLE_SPELL_PREPARED переключает подготовленность', () => {
        const char = makeTestCharacter({ spells: [makeSpell('s1', { isPrepared: false })] });
        const action: CharacterAction = { type: 'TOGGLE_SPELL_PREPARED', payload: 's1' };
        const result = actionsReducer(char, action);
        expect(result.spells[0].isPrepared).toBe(true);
    });

    it('SET_SPELL_SLOTS устанавливает количество ячеек', () => {
        const char = makeTestCharacter();
        const action: CharacterAction = { type: 'SET_SPELL_SLOTS', payload: { level: 1, total: 4 } };
        const result = actionsReducer(char, action);
        expect(result.spellSlots[1].total).toBe(4);
    });

    it('USE_SPELL_SLOT отмечает использованные ячейки', () => {
        const char = makeTestCharacter();
        const action: CharacterAction = { type: 'USE_SPELL_SLOT', payload: { level: 1, used: 2 } };
        const result = actionsReducer(char, action);
        expect(result.spellSlots[1].used).toBe(2);
    });

    it('MOVE_AND_REORDER_SPELL перемещает заклинание перед целевым', () => {
        const char = makeTestCharacter({ spells: [makeSpell('s1'), makeSpell('s2'), makeSpell('s3')] });
        // Вынимаем s1, вставляем на позицию s3
        const action: CharacterAction = { type: 'MOVE_AND_REORDER_SPELL', payload: { spellId: 's1', targetSpellId: 's3' } };
        const result = actionsReducer(char, action);
        expect(result.spells.map((s) => s.id)).toEqual(['s2', 's1', 's3']);
    });

    it('MOVE_AND_REORDER_SPELL меняет уровень заклинания через targetLevel', () => {
        const char = makeTestCharacter({ spells: [makeSpell('s1', { level: 1 })] });
        const action: CharacterAction = { type: 'MOVE_AND_REORDER_SPELL', payload: { spellId: 's1', targetLevel: 3 } };
        const result = actionsReducer(char, action);
        expect(result.spells[0].level).toBe(3);
    });

    it('MOVE_AND_REORDER_SPELL игнорирует, если spellId не найден', () => {
        const char = makeTestCharacter({ spells: [makeSpell('s1')] });
        const action: CharacterAction = { type: 'MOVE_AND_REORDER_SPELL', payload: { spellId: 'missing', targetSpellId: 's1' } };
        const result = actionsReducer(char, action);
        expect(result).toBe(char);
    });
});

describe('actionsReducer — NOTES', () => {
    it('ADD_NOTE добавляет заметку и делает её активной', () => {
        const char = makeTestCharacter({ notes: [], noteGroups: [{ id: 'default', name: 'Мои заметки', noteIds: [] }] });
        const action: CharacterAction = { type: 'ADD_NOTE', payload: makeNote('n1') };
        const result = actionsReducer(char, action);
        expect(result.notes).toHaveLength(1);
        expect(result.activeNoteId).toBe('n1');
        expect(result.noteGroups?.[0].noteIds).toContain('n1');
    });

    it('UPDATE_NOTE обновляет содержимое', () => {
        const char = makeTestCharacter({ notes: [makeNote('n1')] });
        const action: CharacterAction = { type: 'UPDATE_NOTE', payload: { id: 'n1', updates: { title: 'Новое имя' } } };
        const result = actionsReducer(char, action);
        expect(result.notes[0].title).toBe('Новое имя');
    });

    it('DELETE_NOTE удаляет заметку и переключает активную', () => {
        const char = makeTestCharacter({
            notes: [makeNote('n1'), makeNote('n2')],
            activeNoteId: 'n1',
            noteGroups: [{ id: 'default', name: 'Мои заметки', noteIds: ['n1', 'n2'] }],
        });
        const action: CharacterAction = { type: 'DELETE_NOTE', payload: 'n1' };
        const result = actionsReducer(char, action);
        expect(result.notes).toHaveLength(1);
        expect(result.notes[0].id).toBe('n2');
        expect(result.activeNoteId).toBe('n2');
    });

    it('DELETE_NOTE устанавливает activeNoteId=null, если не осталось заметок', () => {
        const char = makeTestCharacter({ notes: [makeNote('n1')], activeNoteId: 'n1', noteGroups: [{ id: 'default', name: 'Мои заметки', noteIds: ['n1'] }] });
        const action: CharacterAction = { type: 'DELETE_NOTE', payload: 'n1' };
        const result = actionsReducer(char, action);
        expect(result.notes).toHaveLength(0);
        expect(result.activeNoteId).toBeNull();
    });

    it('SET_ACTIVE_NOTE меняет активную заметку', () => {
        const char = makeTestCharacter({ notes: [makeNote('n1'), makeNote('n2')], activeNoteId: 'n1' });
        const action: CharacterAction = { type: 'SET_ACTIVE_NOTE', payload: 'n2' };
        const result = actionsReducer(char, action);
        expect(result.activeNoteId).toBe('n2');
    });
});

describe('actionsReducer — CURRENCY', () => {
    // Примечание: SET_CURRENCY обрабатывается в inventoryReducer (не здесь),
    // т.к. characterReducer компонует reducers последовательно.
    // Тесты на SET_CURRENCY находятся в inventory.reducer.test.ts
    it('actionsReducer не обрабатывает SET_CURRENCY (делегировано inventoryReducer)', () => {
        const char = makeTestCharacter();
        const action: CharacterAction = { type: 'SET_CURRENCY', payload: { currency: Currency.GP, amount: 100 } };
        const result = actionsReducer(char, action);
        // actionsReducer возвращает состояние без изменений для этого action
        expect(result).toBe(char);
    });
});
