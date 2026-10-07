// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { restoreStrippedCharacter, restoreStrippedItemImages, mergeImageCacheEntries } from './restoreStripped';

const IMG = 'data:image/png;base64,iVBORw0KGgo=';
const TOKEN = 'img:ref:item-1';

const makeItem = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: id,
  description: '',
  imageUrl: '',
  isChest: false,
  chestInventory: undefined as Array<{ id: string; imageUrl?: string; description?: string }> | undefined,
  ...overrides,
});

describe('restoreStrippedItemImages', () => {
  it('восстанавливает картинку из data:URL, не затирая реальную облачную', () => {
    const cloud = makeItem('a', { imageUrl: TOKEN });
    restoreStrippedItemImages(cloud, makeItem('a', { imageUrl: IMG }));
    expect(cloud.imageUrl).toBe(IMG);

    const cloudReal = makeItem('b', { imageUrl: 'data:image/png;base64,OTHER' });
    restoreStrippedItemImages(cloudReal, makeItem('b', { imageUrl: IMG }));
    expect(cloudReal.imageUrl).toBe('data:image/png;base64,OTHER');
  });

  it('рекурсивно обходит сундуки', () => {
    const cloudChest = makeItem('chest', { isChest: true, chestInventory: [makeItem('inner', { imageUrl: TOKEN })] });
    const backupChest = makeItem('chest', { isChest: true, chestInventory: [makeItem('inner', { imageUrl: IMG })] });
    restoreStrippedItemImages(cloudChest, backupChest);
    expect(cloudChest.chestInventory![0]!.imageUrl).toBe(IMG);
  });

  it('дозаполняет пустое описание', () => {
    const cloud = makeItem('c', {});
    restoreStrippedItemImages(cloud, makeItem('c', { description: '<i>текст</i>' }));
    expect(cloud.description).toBe('<i>текст</i>');
  });
});

describe('restoreStrippedCharacter', () => {
  it('портрет-токен заменяется на data:URL из бэкапа', () => {
    const cloud = { portraitUrl: 'img:ref:portrait' };
    restoreStrippedCharacter(cloud, { portraitUrl: IMG });
    expect(cloud.portraitUrl).toBe(IMG);
  });

  it('минифицированный инвентарь ({index,item}) с обеих сторон — картинки восстанавливаются (дисковый путь)', () => {
    const cloud = { inventory: [{ index: 0, item: makeItem('x', { imageUrl: TOKEN }) }, null] };
    const backup = { inventory: [{ index: 0, item: makeItem('x', { imageUrl: IMG }) }, null] };
    restoreStrippedCharacter(cloud, backup, true, true);
    expect(cloud.inventory[0]!.item!.imageUrl).toBe(IMG);
  });

  it('КЛЮЧЕВОЙ КЕЙС (дефект memory-пути): облако минифицировано, бэкап — полные предметы', () => {
    const cloud = { inventory: [{ index: 0, item: makeItem('y', { imageUrl: TOKEN }) }] };
    const backup = { inventory: [makeItem('y', { imageUrl: IMG })] };
    // Раньше копия в useCharacterManager мутировала wrapper вместо item — картинка терялась.
    restoreStrippedCharacter(cloud, backup, true, false);
    expect(cloud.inventory[0]!.item.imageUrl).toBe(IMG);
  });

  it('заметки/заклинания/фичи/атаки восстанавливаются по id', () => {
    const cloud = {
      notes: [{ id: 'n1', title: '', content: '' }],
      spells: [{ id: 's1', description: '', components: {} as { materialDescription?: string } }],
      features: [{ id: 'f1', description: '' }],
      attacks: [{ id: 'a1', notes: '' }],
    };
    const backup = {
      notes: [{ id: 'n1', title: '', content: 'заметка' }],
      spells: [{ id: 's1', description: '3d6', components: { materialDescription: 'пыль' } }],
      features: [{ id: 'f1', description: 'особенность' }],
      attacks: [{ id: 'a1', notes: 'полезно' }],
    };
    restoreStrippedCharacter(cloud, backup);
    expect(cloud.notes[0]!.content).toBe('заметка');
    expect(cloud.spells[0]!.description).toBe('3d6');
    expect(cloud.spells[0]!.components.materialDescription).toBe('пыль');
    expect(cloud.features[0]!.description).toBe('особенность');
    expect(cloud.attacks[0]!.notes).toBe('полезно');
  });

  it('экипировка сопоставляется по id', () => {
    const cloud = { equippedItems: [makeItem('eq9', { imageUrl: TOKEN })] };
    const backup = { equippedItems: [makeItem('other'), makeItem('eq9', { imageUrl: IMG })] };
    restoreStrippedCharacter(cloud, backup);
    expect(cloud.equippedItems[0]!.imageUrl).toBe(IMG);
  });

  it('null-аргументы безопасны', () => {
    expect(() => restoreStrippedCharacter(null, null)).not.toThrow();
  });
});

describe('mergeImageCacheEntries', () => {
  it('бэкап дополняет облако, но не затирает валидные data:URL', () => {
    const merged = mergeImageCacheEntries(
      [['k1', 'data:image/png;base64,CLOUD'], ['k2', '']],
      [['k1', 'data:image/png;base64,BACKUP'], ['k2', IMG]],
    );
    const map = new Map(merged);
    expect(map.get('k1')).toBe('data:image/png;base64,CLOUD');
    expect(map.get('k2')).toBe(IMG);
  });

  it('игнорирует невалидные значения бэкапа', () => {
    const merged = mergeImageCacheEntries([], [['k', 'not-a-data-url']]);
    expect(merged).toEqual([]);
  });

  it('null-входы дают пустой список', () => {
    expect(mergeImageCacheEntries(null, null)).toEqual([]);
  });
});
