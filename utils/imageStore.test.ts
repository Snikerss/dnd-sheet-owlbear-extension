import { describe, it, expect } from 'vitest';
import { extractImages, applyImages, mergeImageMaps } from './imageStore';
import { makeTestCharacter } from '../state/testFixtures';
import { InventoryItem, Currency, Rarity, Attack, Spell } from '../types';

const makeItemWithImage = (id: string, imageUrl: string): InventoryItem => ({
    id,
    name: `Предмет ${id}`,
    description: '',
    quantity: 1,
    imageUrl,
    weight: 0,
    cost: { amount: 0, currency: Currency.GP },
    rarity: Rarity.Common,
});

describe('imageStore — extractImages & applyImages (баг #11)', () => {
    it('no-op, если нет ни одного data: URL', () => {
        const char = makeTestCharacter({
            portraitUrl: 'https://external.com/pic.png', // не data:
            inventory: [makeItemWithImage('i1', 'https://external.com/item.png')],
        });
        const { light, images } = extractImages(char);
        // Должно вернуть тот же объект ссылочно, карта пустая
        expect(light).toBe(char);
        expect(images.size).toBe(0);
    });

    it('извлекает portraitUrl и imageUrl предметов', () => {
        const char = makeTestCharacter({
            portraitUrl: 'data:image/png;base64,portrait_data',
            inventory: [
                makeItemWithImage('i1', 'data:image/png;base64,item_1_data'),
                null,
                makeItemWithImage('i2', 'https://external.com/non-data.png'),
            ],
            equippedItems: [
                makeItemWithImage('i3', 'data:image/png;base64,item_3_data'),
            ],
        });

        const { light, images } = extractImages(char);

        // Картинки заменены на токены
        expect(light.portraitUrl).toBe('img:ref:portrait');
        expect(light.inventory[0]?.imageUrl).toBe('img:ref:i1');
        expect(light.inventory[2]?.imageUrl).toBe('https://external.com/non-data.png'); // не затронут
        expect(light.equippedItems?.[0].imageUrl).toBe('img:ref:i3');

        // Карта содержит правильные соответствия
        expect(images.get('img:ref:portrait')).toBe('data:image/png;base64,portrait_data');
        expect(images.get('img:ref:i1')).toBe('data:image/png;base64,item_1_data');
        expect(images.get('img:ref:i3')).toBe('data:image/png;base64,item_3_data');
        expect(images.size).toBe(3);
    });

    it('applyImages корректно восстанавливает из токенов', () => {
        const char = makeTestCharacter({
            portraitUrl: 'data:image/png;base64,portrait_data',
            inventory: [makeItemWithImage('i1', 'data:image/png;base64,item_1_data')],
        });

        const { light, images } = extractImages(char);
        const restored = applyImages(light, images);

        expect(restored.portraitUrl).toBe('data:image/png;base64,portrait_data');
        expect(restored.inventory[0]?.imageUrl).toBe('data:image/png;base64,item_1_data');
    });

    it('рекурсивно обрабатывает сундуки (chestInventory)', () => {
        const innerItem = makeItemWithImage('inner1', 'data:image/png;base64,inner_data');
        const chest = makeItemWithImage('chest1', 'data:image/png;base64,chest_icon');
        chest.isChest = true;
        chest.chestInventory = [innerItem];

        const char = makeTestCharacter({ inventory: [chest] });

        const { light, images } = extractImages(char);

        // Иконка сундука и иконка предмета внутри извлечены
        expect(light.inventory[0]?.imageUrl).toBe('img:ref:chest1');
        expect(light.inventory[0]?.chestInventory?.[0]?.imageUrl).toBe('img:ref:inner1');

        expect(images.get('img:ref:chest1')).toBe('data:image/png;base64,chest_icon');
        expect(images.get('img:ref:inner1')).toBe('data:image/png;base64,inner_data');

        // Восстановление
        const restored = applyImages(light, images);
        expect(restored.inventory[0]?.imageUrl).toBe('data:image/png;base64,chest_icon');
        expect(restored.inventory[0]?.chestInventory?.[0]?.imageUrl).toBe('data:image/png;base64,inner_data');
    });
});
