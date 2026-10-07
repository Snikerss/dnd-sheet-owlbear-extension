// @vitest-environment jsdom
/**
 * Регрессионные тесты сериализации/десериализации (аудит P0-1 и P0-2):
 *  1. P0-1: Инвентарь на 10 колонок не срезается (слоты 0..49 при rows=5 сохраняются).
 *  2. P0-1: Произвольное количество строк (rows=3 -> 30 слотов).
 *  3. P0-2: Папки заметок noteGroups (>=2 папки) сохраняются при minify/unminify.
 *  4. P0-1: Legacy-данные инвентаря из 25 элементов дополняются пустыми слотами до 50.
 *  5. P0-2: Legacy-данные без noteGroups корректно мигрируются через migrateCharacterData.
 */
import { describe, it, expect } from 'vitest';
import { minifyCharacter, unminifyCharacter } from './storage';
import { migrateCharacterData } from '../state/initialization';
import { makeTestCharacter } from '../state/testFixtures';
import { Currency, Rarity, InventoryItem } from '../types';
import { INVENTORY_COLUMNS } from '../constants';

const makeItem = (id: string, overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id,
  name: `Предмет ${id}`,
  description: 'Описание',
  quantity: 1,
  imageUrl: '',
  weight: 1,
  cost: { amount: 10, currency: Currency.GP },
  rarity: Rarity.Common,
  ...overrides,
});

describe('Регрессия P0-1: Сетка инвентаря 10 колонок и сохранение слотов >= 25', () => {
  it('rows=5, предмет на индексе 49 → minify→unminify → длина 50, предмет на месте, остальные не потеряны', () => {
    const item0 = makeItem('item-0');
    const item24 = makeItem('item-24');
    const item49 = makeItem('item-49');

    const inventory: (InventoryItem | null)[] = Array(5 * INVENTORY_COLUMNS).fill(null);
    inventory[0] = item0;
    inventory[24] = item24;
    inventory[49] = item49;

    const char = makeTestCharacter({
      inventoryRows: 5,
      inventory,
    });

    const min = minifyCharacter(char);
    const restored = unminifyCharacter(min);

    expect(restored.inventoryRows).toBe(5);
    expect(restored.inventory).toHaveLength(50);
    expect(restored.inventory[0]).toEqual(item0);
    expect(restored.inventory[24]).toEqual(item24);
    expect(restored.inventory[49]).toEqual(item49);
    expect(restored.inventory[1]).toBeNull();
    expect(restored.inventory[25]).toBeNull();
    expect(restored.inventory[48]).toBeNull();
  });

  it('rows=3 (30 слотов) → roundtrip → длина 30', () => {
    const item0 = makeItem('item-0');
    const item15 = makeItem('item-15');
    const item29 = makeItem('item-29');

    const inventory: (InventoryItem | null)[] = Array(3 * INVENTORY_COLUMNS).fill(null);
    inventory[0] = item0;
    inventory[15] = item15;
    inventory[29] = item29;

    const char = makeTestCharacter({
      inventoryRows: 3,
      inventory,
    });

    const min = minifyCharacter(char);
    const restored = unminifyCharacter(min);

    expect(restored.inventoryRows).toBe(3);
    expect(restored.inventory).toHaveLength(30);
    expect(restored.inventory[0]).toEqual(item0);
    expect(restored.inventory[15]).toEqual(item15);
    expect(restored.inventory[29]).toEqual(item29);
    expect(restored.inventory[1]).toBeNull();
    expect(restored.inventory[28]).toBeNull();
  });

  it('Legacy: minified-инвентарий из 25 элементов при rows=5 → unminify даёт 50 (дослано пустыми слотами null)', () => {
    const item0 = makeItem('item-legacy-0');
    const item24 = makeItem('item-legacy-24');

    // 1. Формат minified: массив { index, item } со старыми индексами до 24
    const legacyMinWithEntries = {
      inventoryRows: 5,
      inv: [
        { index: 0, item: item0 },
        { index: 24, item: item24 },
      ],
    };

    const restoredFromEntries = unminifyCharacter(legacyMinWithEntries);
    expect(restoredFromEntries.inventory).toHaveLength(50);
    expect(restoredFromEntries.inventory[0]).toEqual(item0);
    expect(restoredFromEntries.inventory[24]).toEqual(item24);
    for (let i = 25; i < 50; i++) {
      expect(restoredFromEntries.inventory[i]).toBeNull();
    }

    // 2. Формат minified: плоский legacy-массив из 25 элементов в поле inv
    const flat25: (InventoryItem | null)[] = Array(25).fill(null);
    flat25[0] = item0;
    flat25[12] = item24;
    const legacyMinFlat = {
      inventoryRows: 5,
      inv: flat25,
    };

    const restoredFromFlat = unminifyCharacter(legacyMinFlat);
    expect(restoredFromFlat.inventory).toHaveLength(50);
    expect(restoredFromFlat.inventory[0]).toEqual(item0);
    expect(restoredFromFlat.inventory[12]).toEqual(item24);
    for (let i = 25; i < 50; i++) {
      expect(restoredFromFlat.inventory[i]).toBeNull();
    }

    // 3. Формат minified: legacy-поле inventory из 25 элементов
    const legacyFullInventoryField = {
      inventoryRows: 5,
      inventory: flat25,
    };

    const restoredFromFullField = unminifyCharacter(legacyFullInventoryField);
    expect(restoredFromFullField.inventory).toHaveLength(50);
    expect(restoredFromFullField.inventory[0]).toEqual(item0);
    expect(restoredFromFullField.inventory[12]).toEqual(item24);
    for (let i = 25; i < 50; i++) {
      expect(restoredFromFullField.inventory[i]).toBeNull();
    }
  });

  it('Legacy: развёрнутый Character со срезанным инвентарём (25 элементов) нормализуется до 50', () => {
    const item0 = makeItem('item-0');
    const truncatedChar = {
      ...makeTestCharacter({ inventoryRows: 5 }),
      inventory: Array(25).fill(null),
    };
    truncatedChar.inventory[0] = item0;

    const restored = unminifyCharacter(truncatedChar);
    expect(restored.inventory).toHaveLength(50);
    expect(restored.inventory[0]).toEqual(item0);
    for (let i = 25; i < 50; i++) {
      expect(restored.inventory[i]).toBeNull();
    }
  });
});

describe('Регрессия P0-2: Папки заметок noteGroups сохраняются при сериализации', () => {
  it('Кастомные noteGroups (≥2 папки с заметками) → minify→unminify → папки и заметки сохранены', () => {
    const notes = [
      { id: 'note-1', title: 'Главный квест', content: 'Найти реликвию' },
      { id: 'note-2', title: 'Трактирщик', content: 'Знает тайный проход' },
      { id: 'note-3', title: 'Заклинание телепортации', content: 'Формула рун' },
    ];
    const noteGroups = [
      { id: 'folder-quests', name: 'Квесты', noteIds: ['note-1'], isCollapsed: false },
      { id: 'folder-npcs', name: 'Персонажи', noteIds: ['note-2'], isCollapsed: true },
      { id: 'folder-lore', name: 'Лор и тайны', noteIds: ['note-3'] },
    ];

    const char = makeTestCharacter({
      notes,
      noteGroups,
    });

    const min = minifyCharacter(char);
    const restored = unminifyCharacter(min);

    expect(restored.notes).toEqual(notes);
    expect(restored.noteGroups).toBeDefined();
    expect(restored.noteGroups).toHaveLength(3);
    expect(restored.noteGroups).toEqual(noteGroups);

    // При последующем проходе через migrateCharacterData папки НЕ должны сбрасываться к дефолтной одной
    const migrated = migrateCharacterData(restored);
    expect(migrated.noteGroups).toHaveLength(3);
    expect(migrated.noteGroups).toEqual(noteGroups);
  });

  it('Legacy: minified-данные без noteGroups не затирают дефолтную папку при migrateCharacterData', () => {
    const notes = [
      { id: 'note-old-1', title: 'Старая заметка', content: 'Текст' },
    ];
    // Legacy-запись без noteGroups
    const legacyMin = {
      notes,
    };

    const restored = unminifyCharacter(legacyMin);
    expect(restored.notes).toEqual(notes);

    // migrateCharacterData инициализирует дефолтную папку «Мои заметки» со всеми заметками
    const migrated = migrateCharacterData(restored);
    expect(migrated.noteGroups).toBeDefined();
    expect(migrated.noteGroups).toHaveLength(1);
    expect(migrated.noteGroups?.[0]?.name).toBe('Мои заметки');
    expect(migrated.noteGroups?.[0]?.noteIds).toContain('note-old-1');
  });
});
