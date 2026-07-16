/**
 * Изоляция base64-изображений от истории undo/redo (баг #11).
 *
 * Проблема: персонаж содержит большие data: URLs (base64-картинки) в полях
 * portraitUrl, inventory[].imageUrl и т.д. История undo/redo хранит до 20
 * полных копий состояния, дублируя эти мегабайты → огромный расход памяти
 * и тормоза. Один персонаж с 13MB картинок → до 260MB в истории.
 *
 * Решение: перед помещением состояния в историю (past[]/future[]) извлекаем
 * все data: URLs в отдельную карту и заменяем на лёгкие токены-ссылки.
 * При undo/redo — подставляем изображения обратно из актуального кэша.
 * Таким образом история хранит лёгкие копии, а изображения — только один раз.
 */
import { Character, InventoryItem, Attack, Spell } from '../types';

const TOKEN_PREFIX = 'img:ref:';

/**
 * Карта токен → исходный data: URL.
 */
export type ImageMap = Map<string, string>;

const isDataUrl = (value: string | undefined): value is string => {
    return typeof value === 'string' && value.startsWith('data:');
};

/**
 * Рекурсивно обходит предмет (включая содержимое сундука), извлекая data: URLs.
 * Возвращает новый предмет с заменёнными URL на токены; карты пополняется.
 */
const processItem = (item: InventoryItem | null, images: ImageMap): InventoryItem | null => {
    if (!item) return null;

    const newItem: InventoryItem = { ...item };

    if (isDataUrl(item.imageUrl)) {
        const token = `${TOKEN_PREFIX}${item.id}`;
        images.set(token, item.imageUrl);
        newItem.imageUrl = token;
    }

    // Рекурсивно для сундуков
    if (item.isChest && Array.isArray(item.chestInventory)) {
        newItem.chestInventory = item.chestInventory.map((sub) => processItem(sub, images));
    }

    return newItem;
};

/**
 * Рекурсивно подставляет изображения обратно: заменяет токены на data: URLs.
 */
const restoreItem = (item: InventoryItem | null, images: ImageMap): InventoryItem | null => {
    if (!item) return null;

    const newItem: InventoryItem = { ...item };

    if (typeof item.imageUrl === 'string' && item.imageUrl.startsWith(TOKEN_PREFIX)) {
        const original = images.get(item.imageUrl);
        newItem.imageUrl = original ?? '';
    }

    if (item.isChest && Array.isArray(item.chestInventory)) {
        newItem.chestInventory = item.chestInventory.map((sub) => restoreItem(sub, images));
    }

    return newItem;
};

/**
 * Извлекает все base64-изображения из персонажа, заменяя их на лёгкие токены.
 *
 * @param character Исходное состояние персонажа (с data: URLs).
 * @returns Объект с лёгкой версией персонажа (токены вместо base64) и картой изображений.
 */
export const extractImages = (character: Character): { light: Character; images: ImageMap } => {
    const images: ImageMap = new Map();

    // Если data: URLs отсутствуют вообще — no-op для производительности
    const hasAnyDataUrl =
        isDataUrl(character.portraitUrl) ||
        character.inventory.some((i) => isDataUrl(i?.imageUrl)) ||
        character.attunementItems.some((i) => isDataUrl(i?.imageUrl)) ||
        (character.equippedItems || []).some((i) => isDataUrl(i?.imageUrl)) ||
        character.attacks.some((a) => isDataUrl(a.imageUrl)) ||
        character.spells.some((s) => isDataUrl(s.imageUrl));

    if (!hasAnyDataUrl) {
        return { light: character, images };
    }

    const light: Character = { ...character };

    // portraitUrl
    if (isDataUrl(character.portraitUrl)) {
        const token = `${TOKEN_PREFIX}portrait`;
        images.set(token, character.portraitUrl);
        light.portraitUrl = token;
    }

    // inventory
    light.inventory = character.inventory.map((item) => processItem(item, images));

    // attunementItems
    light.attunementItems = character.attunementItems.map((item) => processItem(item, images));

    // equippedItems
    light.equippedItems = (character.equippedItems || []).map((item) => processItem(item, images)) as InventoryItem[];

    // attacks
    light.attacks = character.attacks.map((attack: Attack): Attack => {
        if (isDataUrl(attack.imageUrl)) {
            const token = `${TOKEN_PREFIX}attack:${attack.id}`;
            images.set(token, attack.imageUrl);
            return { ...attack, imageUrl: token };
        }
        return attack;
    });

    // spells
    light.spells = character.spells.map((spell: Spell): Spell => {
        if (isDataUrl(spell.imageUrl)) {
            const token = `${TOKEN_PREFIX}spell:${spell.id}`;
            images.set(token, spell.imageUrl);
            return { ...spell, imageUrl: token };
        }
        return spell;
    });

    return { light, images };
};

/**
 * Подставляет изображения обратно в персонажа: заменяет токены на data: URLs.
 *
 * @param character Лёгкая версия персонажа (с токенами).
 * @param images Карта изображений из extractImages.
 * @returns Полная версия персонажа с data: URLs.
 */
export const applyImages = (character: Character, images: ImageMap): Character => {
    if (images.size === 0) return character;

    const full: Character = { ...character };

    if (typeof character.portraitUrl === 'string' && character.portraitUrl.startsWith(TOKEN_PREFIX)) {
        full.portraitUrl = images.get(character.portraitUrl) ?? '';
    }

    full.inventory = character.inventory.map((item) => restoreItem(item, images));
    full.attunementItems = character.attunementItems.map((item) => restoreItem(item, images));
    full.equippedItems = (character.equippedItems || [])
        .map((item) => restoreItem(item, images))
        .filter((i): i is InventoryItem => i !== null);

    full.attacks = character.attacks.map((attack: Attack): Attack => {
        if (typeof attack.imageUrl === 'string' && attack.imageUrl.startsWith(TOKEN_PREFIX)) {
            return { ...attack, imageUrl: images.get(attack.imageUrl) ?? '' };
        }
        return attack;
    });

    full.spells = character.spells.map((spell: Spell): Spell => {
        if (typeof spell.imageUrl === 'string' && spell.imageUrl.startsWith(TOKEN_PREFIX)) {
            return { ...spell, imageUrl: images.get(spell.imageUrl) ?? '' };
        }
        return spell;
    });

    return full;
};

/**
 * Объединяет две карты изображений (для обновления кэша при новых data: URLs).
 */
export const mergeImageMaps = (base: ImageMap, additions: ImageMap): ImageMap => {
    const merged = new Map(base);
    for (const [key, value] of additions) {
        merged.set(key, value);
    }
    return merged;
};
