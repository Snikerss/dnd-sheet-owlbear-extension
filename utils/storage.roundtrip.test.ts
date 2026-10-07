// @vitest-environment jsdom
/**
 * ИНТЕГРАЦИОННЫЙ round-trip тест пайплайна данных (аудит, Phase 6.2).
 *
 * Полный цикл, который проходит лист при синхронизации:
 *   Character → extractImages → minifyCharacter → [сеть: чанки] →
 *   → сборка → JSON.parse → unminifyCharacter → applyImages → Character
 *
 * Тест ловит навсегда:
 *  - потерю полей при minify/unminify (тихая деградация данных);
 *  - порчу чанковой сборки (гибриды версий, порядок чанков);
 *  - регрессию бага #1 (картинки не доходят из-за рассинхрона типов сообщений).
 */
import { describe, it, expect } from 'vitest';
import { minifyCharacter, unminifyCharacter, MAX_BROADCAST_CHUNK_SIZE } from './storage';
import { applyImages, extractImages } from './imageStore';
import { ChunkAssembler } from '../protocol/chunkAssembler';
import { parseSyncMessage } from '../protocol/messages';
import { makeTestCharacter } from '../state/testFixtures';
import { Attack, AttackType, Currency, DamageType, Rarity, Spell, InventoryItem } from '../types';
import { INVENTORY_COLUMNS } from '../constants';

const PORTRAIT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const ITEM_IMG = 'data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73v/+BiOh/AAA=';

const makeItem = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `Предмет ${id}`,
  description: '<b>Описание</b>',
  quantity: 1,
  imageUrl: ITEM_IMG,
  weight: 1.5,
  cost: { amount: 10, currency: Currency.GP },
  rarity: Rarity.Common,
  ...overrides,
});

const buildRichCharacter = () => {
  const base = makeTestCharacter({ name: 'Круговорот', level: 5 });
  // Производственная семантика: инвентарь всегда полного размера сетки (10 колонок),
  // свободные слоты — null (unminifyCharacter восстанавливает сетку целиком).
  const invSize = base.inventoryRows * INVENTORY_COLUMNS;
  const inventory: (InventoryItem | null)[] = [
    makeItem('i-0', { isEquipped: true }),
    null,
    makeItem('i-2', { isChest: true, chestInventory: [makeItem('chest-0'), null] }),
  ];
  while (inventory.length < invSize) inventory.push(null);

  const char = {
    ...base,
    portraitUrl: PORTRAIT,
    ownerId: 'player-1',
    ownerName: 'Алиса',
    viewMode: 'tabs' as const,
    isGlobal: false,
    boundRooms: [{ roomId: 'room-1', roomName: 'Таверна', lastVisited: 42 }],
    tabOrder: ['combat', 'inventory', 'spells'],
    collapsedTabs: { spells: true },
    inventory,
    equippedItems: [
      makeItem('eq-1', { isEquipped: true, equippedSlot: 'mainHand' as const }),
    ],
    attacks: [
      {
        id: 'a-1',
        name: 'Длинный меч',
        imageUrl: ITEM_IMG,
        attackType: AttackType.Melee,
        rangeNormal: 5,
        rangeLong: null,
        hitAbility: 'STR',
        damageAbility: 'STR',
        isProficient: true,
        hitBonus: 2,
        damageDice: '1d8',
        damageBonus: 3,
        damageType: DamageType.Slashing,
        notes: '',
      } as unknown as Attack,
    ],
    spells: [
      {
        id: 's-1',
        name: 'Огненный снаряд',
        description: '3d6',
        level: 3,
        school: 4,
        castingTime: '1 действие',
        range: '150 футов',
        duration: 'Мгновенная',
        isPrepared: true,
        imageUrl: ITEM_IMG,
        isRitual: false,
        requiresConcentration: false,
        components: { verbal: true, somatic: true, material: true, materialDescription: 'серная пыль' },
      } as unknown as Spell,
    ],
    spellSlots: { ...base.spellSlots, 3: { total: 2, used: 1 } },
    currency: { CP: 0, SP: 2, EP: 0, GP: 50, PP: 1 },
    notes: [
      { id: 'n-1', title: 'Заметка 1', content: 'Текст заметки' },
    ],
    noteGroups: [
      { id: 'ng-1', name: 'Папка 1', noteIds: ['n-1'] },
      { id: 'ng-2', name: 'Папка 2', noteIds: [] },
    ],
  };
  return char;
};

describe('ROUND-TRIP: extract → minify → unminify → apply', () => {
  it('minify/unminify сохраняет лист без потерь (кроме токенизированных картинок)', () => {
    const char = buildRichCharacter();
    const { light } = extractImages(char);

    const min = minifyCharacter(light);
    const restored = unminifyCharacter(min);

    expect(restored).toEqual(light);
  });

  it('applyImages возвращает все data:URL на места после полного цикла', () => {
    const char = buildRichCharacter();
    const { light, images } = extractImages(char);
    const restored = unminifyCharacter(minifyCharacter(light));

    const full = applyImages(restored, images);
    expect(full).toEqual(char);
  });

  it('повторный проход не портит данные (идемпотентность токенов)', () => {
    const char = buildRichCharacter();
    const first = extractImages(char);
    const restoredOnce = unminifyCharacter(minifyCharacter(first.light));
    expect(extractImages(restoredOnce).images.size).toBe(0); // токены уже не data:
  });
});

describe('ROUND-TRIP: сетевая передача чанками (эмуляция OBR.broadcast)', () => {
  it('лист собирается из чанков, пришёдших в обратном порядке, без потерь', () => {
    const char = buildRichCharacter();
    const { light } = extractImages(char);
    // Эмулируем strippedData из broadcastCharacterSync
    const payload = {
      character: minifyCharacter(light),
      log: [],
      imageCache: [],
      syncImageIds: [],
    };
    const jsonStr = JSON.stringify(payload);

    const chunkCount = Math.ceil(jsonStr.length / MAX_BROADCAST_CHUNK_SIZE);
    const assembler = new ChunkAssembler();

    let assembled: string | null = null;
    for (let i = chunkCount - 1; i >= 0; i--) {
      const raw = {
        type: 'CHARACTER_CHUNK_SYNC',
        id: 'char-roundtrip',
        senderClientId: 'sender',
        senderPlayerId: 'player-1',
        syncId: 'sync-x',
        chunkIndex: i,
        totalChunks: chunkCount,
        chunkData: jsonStr.slice(i * MAX_BROADCAST_CHUNK_SIZE, (i + 1) * MAX_BROADCAST_CHUNK_SIZE),
      };
      const msg = parseSyncMessage(raw);
      if (msg?.type !== 'CHARACTER_CHUNK_SYNC') throw new Error('Ожидался CHARACTER_CHUNK_SYNC');
      assembled = assembler.push(`char-sheet/char-roundtrip`, msg);
    }

    expect(assembled).toBe(jsonStr);
    const parsed = JSON.parse(assembled!);
    const restored = unminifyCharacter(parsed.character);
    expect(restored).toEqual(light);
  });

  it('изображение доходит по своему каналу (регрессия бага #1)', () => {
    const imgId = 'img:ref:portrait';
    const chunks: string[] = [];
    for (let i = 0; i < PORTRAIT.length; i += MAX_BROADCAST_CHUNK_SIZE) {
      chunks.push(PORTRAIT.slice(i, i + MAX_BROADCAST_CHUNK_SIZE));
    }

    const assembler = new ChunkAssembler();
    let assembled: string | null = null;
    chunks.forEach((chunkData, i) => {
      // Тип сообщения — РОВНО тот же литерал, что слушает приёмник.
      const msg = parseSyncMessage({
        type: 'CHARACTER_IMAGE_CHUNK_SYNC',
        id: 'char-img-test',
        imgId,
        isPortrait: true,
        syncId: 'img-sync-1',
        chunkIndex: i,
        totalChunks: chunks.length,
        chunkData,
      });
      expect(msg?.type).toBe('CHARACTER_IMAGE_CHUNK_SYNC');
      if (msg?.type !== 'CHARACTER_IMAGE_CHUNK_SYNC') throw new Error('Ожидался IMAGE_CHUNK');
      assembled = assembler.push(`char-img/char-img-test/${imgId}`, msg);
    });

    expect(assembled).toBe(PORTRAIT);
  });
});
