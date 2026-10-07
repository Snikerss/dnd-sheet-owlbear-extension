/**
 * Единая логика восстановления «облегчённых» данных персонажа из локального
 * бэкапа (план аудита 2.5): раньше она была продублирована почти 1-в-1 в
 * utils/storage.restoreLocalData и state/useCharacterManager.restoreFromMemory,
 * что уже привело к расхождению семантики инвентаря (память-версия молча
 * теряла картинки предметов из-за другой формы записей).
 *
 * Обе формы записи инвентаря поддерживаются явно:
 *  - минифицированная: { index, item }  (диск / сетевые данные);
 *  - полная: сам InventoryItem          (React-state / memory-бэкап).
 */

interface HasImageAndDesc {
  id?: string;
  imageUrl?: string;
  description?: string;
  notes?: string;
  isChest?: boolean;
  chestInventory?: HasImageAndDesc[];
  components?: { materialDescription?: string };
}

interface StrippedCharRecord {
  portraitUrl?: string;
  notes?: Array<{ id: string; title?: string; content?: string }>;
  spells?: Array<HasImageAndDesc>;
  features?: Array<{ id: string; description?: string }>;
  attacks?: Array<HasImageAndDesc>;
  inventory?: unknown[];
  equippedItems?: Array<HasImageAndDesc>;
  [key: string]: unknown;
}

/** Извлекает предмет из записи инвентаря любой формы. */
const unwrapInvItem = (entry: unknown, minified: boolean): HasImageAndDesc | null | undefined => {
  if (!entry || typeof entry !== 'object') return null;
  return minified ? ((entry as { item?: HasImageAndDesc }).item ?? null) : (entry as HasImageAndDesc);
};

/**
 * Восстанавливает imageUrl/description облачного предмета из бэкапа.
 * Мутация — как и раньше у обоих прежних дубликатов.
 */
export function restoreStrippedItemImages(
  cloudItem: HasImageAndDesc | null | undefined,
  backupItem: HasImageAndDesc | null | undefined,
): void {
  if (!cloudItem || !backupItem) return;
  const cloudImgIsToken = typeof cloudItem.imageUrl === 'string' && cloudItem.imageUrl.startsWith('img:ref:');
  if (backupItem.imageUrl?.startsWith('data:image/') && (!cloudItem.imageUrl || cloudImgIsToken)) {
    cloudItem.imageUrl = backupItem.imageUrl;
  }
  if (backupItem.description && !cloudItem.description) {
    cloudItem.description = backupItem.description;
  }
  if (cloudItem.isChest && Array.isArray(cloudItem.chestInventory) && Array.isArray(backupItem.chestInventory)) {
    cloudItem.chestInventory.forEach((subItem, idx: number) => {
      restoreStrippedItemImages(subItem, backupItem.chestInventory?.[idx]);
    });
  }
}

const findById = <T extends { id?: string }>(list: T[], id: string | undefined): T | undefined =>
  id ? list.find((e) => e?.id === id) : undefined;

/**
 * Глубокое восстановление stripped-полей одного персонажа.
 * @param cloudChar        входящий (сетевой/метадата) персонаж — мутируется
 * @param backupChar       локальный бэкап-персонаж (источник картинок/текстов)
 * @param minifiedCloudInventory  true если cloudChar.inventory — записи {index,item}
 * @param minifiedBackupInventory true если backupChar.inventory — записи {index,item}
 */
export function restoreStrippedCharacter(
  cloudChar: StrippedCharRecord | null | undefined,
  backupChar: StrippedCharRecord | null | undefined,
  minifiedCloudInventory = false,
  minifiedBackupInventory = false,
): void {
  if (!cloudChar || !backupChar) return;

  // 1. Портрет: восстанавливаем, если в облаке пусто или токен.
  const cloudPortraitIsToken = typeof cloudChar.portraitUrl === 'string' && cloudChar.portraitUrl.startsWith('img:ref:');
  if (backupChar.portraitUrl?.startsWith('data:image/') && (!cloudChar.portraitUrl || cloudPortraitIsToken)) {
    cloudChar.portraitUrl = backupChar.portraitUrl;
  }

  // 2. Заметки: содержимое
  if (Array.isArray(cloudChar.notes) && Array.isArray(backupChar.notes)) {
    cloudChar.notes.forEach((n) => {
      const match = backupChar.notes?.find((ln) => ln.id === n.id);
      if (match && match.content && !n.content) n.content = match.content;
    });
  }

  // 3. Заклинания: описание, материал, картинка
  if (Array.isArray(cloudChar.spells) && Array.isArray(backupChar.spells)) {
    cloudChar.spells.forEach((s) => {
      const match = findById(backupChar.spells || [], s?.id);
      if (match) {
        restoreStrippedItemImages(s, match);
        if (match.description && !s.description) s.description = match.description;
        if (s.components && match.components && match.components.materialDescription && !s.components.materialDescription) {
          s.components.materialDescription = match.components.materialDescription;
        }
      }
    });
  }

  // 4. Особенности: описание
  if (Array.isArray(cloudChar.features) && Array.isArray(backupChar.features)) {
    cloudChar.features.forEach((f) => {
      const match = findById(backupChar.features || [], f?.id);
      if (match && match.description && !f.description) f.description = match.description;
    });
  }

  // 5. Атаки: заметки и картинка
  if (Array.isArray(cloudChar.attacks) && Array.isArray(backupChar.attacks)) {
    cloudChar.attacks.forEach((a) => {
      const match = findById(backupChar.attacks || [], a?.id);
      if (match) {
        restoreStrippedItemImages(a, match);
        if (match.notes && !a.notes) a.notes = match.notes;
      }
    });
  }

  // 6. Инвентарь (позиционно, включая сундуки)
  if (Array.isArray(cloudChar.inventory) && Array.isArray(backupChar.inventory)) {
    cloudChar.inventory.forEach((invEntry, idx: number) => {
      const cloudItem = unwrapInvItem(invEntry, minifiedCloudInventory);
      const backupItem = unwrapInvItem(backupChar.inventory?.[idx], minifiedBackupInventory);
      if (cloudItem && backupItem) {
        restoreStrippedItemImages(cloudItem, backupItem);
      }
    });
  }

  // 7. Экипированные предметы (по id)
  if (Array.isArray(cloudChar.equippedItems) && Array.isArray(backupChar.equippedItems)) {
    cloudChar.equippedItems.forEach((eqItem) => {
      const match = findById(backupChar.equippedItems || [], eqItem?.id);
      if (match) {
        restoreStrippedItemImages(eqItem, match);
      }
    });
  }
}

/**
 * Сливает два списка записей imageCache: бэкап дополняет облако только
 * валидными data:image значениями и не затирает уже имеющиеся.
 */
export function mergeImageCacheEntries(
  cloudEntries: Iterable<[string, string]> | null | undefined,
  backupEntries: Iterable<[string, string]> | null | undefined,
): [string, string][] {
  const map = new Map<string, string>();
  for (const entry of cloudEntries ?? []) {
    const [k, v] = entry;
    if (k) map.set(k, v);
  }
  for (const entry of backupEntries ?? []) {
    const [k, v] = entry;
    if (k && v && v.startsWith('data:image/')) {
      const current = map.get(k);
      if (!current || !current.startsWith('data:image/')) {
        map.set(k, v);
      }
    }
  }
  return Array.from(map.entries());
}
