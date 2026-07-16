import { Character, CharacterAction, DropLocation, InventoryItem } from '../types';
import { ABILITY_NAMES, CURRENCY_ABBREVIATIONS_RU, CHARACTER_SIZE_NAMES, PROFICIENCY_LEVEL_NAMES } from '../constants';

const BONUS_FIELD_NAMES: Record<string, string> = {
    acBonus: 'Бонус КД',
    initiativeBonus: 'Бонус инициативы',
    proficiencyBonusBonus: 'Бонус мастерства',
    speedBonus: 'Бонус скорости',
    longJumpBonus: 'Бонус прыжка в длину',
    highJumpBonus: 'Бонус прыжка в высоту',
    passivePerceptionBonus: 'Бонус пассив. Восприятия',
    passiveInvestigationBonus: 'Бонус пассив. Расследования',
    passiveInsightBonus: 'Бонус пассив. Проницательности',
    maxHpBonus: 'Бонус макс. ОЗ',
    spellSaveDcBonus: 'Бонус Сл. спасброска',
    spellAttackBonusBonus: 'Бонус атаки заклинанием',
};


export const generateActionDescription = (action: CharacterAction, oldState: Character, newState: Character): string | null => {
    switch(action.type) {
        // Character Core
        case 'SET_FIELD': {
            const { field, value } = action.payload;
            const oldValue = oldState[field as keyof Character];
            if (value === oldValue) return null;

            switch (field) {
                case 'experience': return `Изменён опыт: ${oldValue} → ${value}`;
                case 'name': return `Имя изменено на "${value}"`;
                case 'characterClass': return `Класс изменён на "${value}"`;
                case 'race': return `Раса изменена на "${value}"`;
                case 'portraitUrl': return value ? `Портрет обновлён` : `Портрет удалён`;
                default: return null;
            }
        }
        case 'LEVEL_UP': return `Персонаж достиг ${newState.level} уровня!`;
        case 'SET_LEVEL': return `Уровень изменён: ${oldState.level} → ${action.payload}`;
        case 'SET_HIT_DIE': return `Кость здоровья изменена на d${action.payload}.`;
        case 'SET_CURRENT_HIT_DICE': return `Текущие кости здоровья: ${oldState.currentHitDice} → ${action.payload}`;
        case 'SET_SIZE': return `Размер изменён на ${CHARACTER_SIZE_NAMES[action.payload]}.`;
        
        // Health & Rests
        case 'APPLY_HEALTH_CHANGE': {
            const { amount, type } = action.payload;
            if (type === 'damage') return `Получено ${amount} урона`;
            if (type === 'heal') return `Восстановлено ${amount} ОЗ`;
            if (type === 'temp') return `Получено ${amount} временных ОЗ`;
            break;
        }
        case 'SHORT_REST': return `Короткий отдых. Потрачено ${action.payload.diceResults.length} костей здоровья.`;
        case 'LONG_REST': return `Длинный отдых. Силы восстановлены.`;
        case 'DAWN_RECOVERY': return `Наступил рассвет. Заряды предметов восстановлены.`;

        // Scores & Skills
        case 'SET_SCORE': {
            const { ability, score } = action.payload;
            const oldScore = oldState.scores[ability];
            return `Изменена характеристика ${ABILITY_NAMES[ability]}: ${oldScore} → ${score}`;
        }
        case 'SET_PROFICIENCY': {
            const skill = oldState.skills[action.payload];
            if (!skill) return null;
            const newSkill = newState.skills[action.payload];
            const newProf = newSkill ? newSkill.proficiency : skill.proficiency;
            return `Владение навыком '${skill.name}' изменено на "${PROFICIENCY_LEVEL_NAMES[newProf]}".`;
        }
        case 'SET_SAVING_THROW_PROF': {
            const ability = action.payload;
            const isNowProficient = newState.savingThrowProficiencies[ability];
            return `Владение спасброском ${ABILITY_NAMES[ability]} ${isNowProficient ? 'добавлено' : 'убрано'}.`;
        }

        // Bonuses
        case 'SET_BONUS': {
            const { field, value } = action.payload;
            const oldValue = (oldState as any)[field] || 0;
            if (value === oldValue) return null;
            const fieldName = BONUS_FIELD_NAMES[field] || field;
            return `${fieldName} изменён: ${oldValue} → ${value}`;
        }
        case 'SET_ABILITY_BONUS': {
            const { ability, bonus } = action.payload;
            const oldValue = oldState.abilityBonuses[ability] || 0;
            if (bonus === oldValue) return null;
            return `Бонус к ${ABILITY_NAMES[ability]} изменён: ${oldValue} → ${bonus}`;
        }
        case 'SET_SAVING_THROW_BONUS': {
            const { ability, bonus } = action.payload;
            const oldValue = oldState.savingThrowBonuses[ability] || 0;
            if (bonus === oldValue) return null;
            return `Бонус спасброска ${ABILITY_NAMES[ability]} изменён: ${oldValue} → ${bonus}`;
        }
        case 'SET_SKILL_BONUS': {
            const { skillName, bonus } = action.payload;
            const oldValue = oldState.skillBonuses[skillName] || 0;
            if (bonus === oldValue) return null;
            return `Бонус навыка '${skillName}' изменён: ${oldValue} → ${bonus}`;
        }

        // Inventory & Currency
        case 'SET_ATTUNEMENT_SLOTS': return `Кол-во слотов настройки: ${oldState.attunementSlots} → ${action.payload}`;
        case 'SET_INVENTORY_ROWS': return `Кол-во рядов инвентаря: ${oldState.inventoryRows} → ${action.payload}`;
        case 'UPDATE_ITEM': {
            const { itemData, location } = action.payload;
            
            let oldItem: InventoryItem | null | undefined = null;
            if (location.container === 'inventory') oldItem = oldState.inventory[location.index];
            else if (location.container === 'attunement') oldItem = oldState.attunementItems[location.index];
            else if (location.container === 'chest' && location.chestId) {
                const chest = [...oldState.inventory, ...oldState.attunementItems].find(i => i?.id === location.chestId);
                if (chest?.isChest && chest.chestInventory) {
                    oldItem = chest.chestInventory[location.index];
                }
            }

            if (itemData && !oldItem) return `Добавлен предмет: "${itemData.name}"`;
            if (!itemData && oldItem) return `Удалён предмет: "${oldItem.name}"`;
            if (itemData && oldItem) {
                if (itemData.name !== oldItem.name) return `Предмет "${oldItem.name}" переименован в "${itemData.name}"`;
                if (itemData.quantity !== oldItem.quantity) return `Изменено кол-во "${itemData.name}": ${oldItem.quantity} → ${itemData.quantity}`;
                return `Обновлён предмет: "${itemData.name}"`;
            }
            break;
        }
        case 'SET_ITEMS_ORDER': return null;
        case 'MOVE_ITEM': {
            const { source } = action.payload;
            let sourceList: (any | null)[] | undefined = undefined;
            if (source.container === 'inventory') sourceList = oldState.inventory;
            else if (source.container === 'attunement') sourceList = oldState.attunementItems;
            else if (source.container === 'chest' && source.chestId) {
                const chest = [...oldState.inventory, ...oldState.attunementItems].find(i => i?.id === source.chestId);
                sourceList = chest?.chestInventory;
            }
            const item = sourceList?.[source.index];
            return item ? `Предмет "${item.name}" перемещён.` : 'Предмет перемещён.';
        }
        case 'SET_CURRENCY': {
            const { currency, amount } = action.payload;
            const oldAmount = oldState.currency[currency];
            const diff = amount - oldAmount;
            if (diff === 0) return null;
            if (diff > 0) return `Добавлено ${diff} ${CURRENCY_ABBREVIATIONS_RU[currency]}`;
            if (diff < 0) return `Потрачено ${Math.abs(diff)} ${CURRENCY_ABBREVIATIONS_RU[currency]}`;
            break;
        }

        // Features
        case 'ADD_FEATURE': return `Добавлено умение: "${action.payload.name}"`;
        case 'UPDATE_FEATURE': return `Умение "${action.payload.name}" обновлено.`;
        case 'DELETE_FEATURE': {
            const feature = oldState.features.find(f => f.id === action.payload);
            return feature ? `Удалено умение: "${feature.name}"` : 'Удалено умение.';
        }
        case 'USE_FEATURE': {
            const feature = oldState.features.find(f => f.id === action.payload.id);
            if (!feature) return null;
            return `Использовано умение "${feature.name}". Осталось: ${action.payload.newUses}.`;
        }

        // Attacks
        case 'ADD_ATTACK': return `Добавлена атака: "${action.payload.name}"`;
        case 'UPDATE_ATTACK': return `Атака "${action.payload.name}" обновлена.`;
        case 'DELETE_ATTACK': {
            const attack = oldState.attacks.find(a => a.id === action.payload);
            return attack ? `Удалена атака: "${attack.name}"` : 'Удалена атака.';
        }
        case 'SET_GLOBAL_DICE_BONUS': {
            const { toHitDice, toDamageDice } = action.payload;
            const oldHit = oldState.globalAttackDiceBonusToHitDice;
            const oldDmg = oldState.globalAttackDiceBonusToDamageDice;
            const parts = [];
            if (toHitDice !== oldHit) parts.push(`Общий бонус попадания (куб) изменён на "${toHitDice || 'пусто'}"`);
            if (toDamageDice !== oldDmg) parts.push(`Общий бонус урона (куб) изменён на "${toDamageDice || 'пусто'}"`);
            return parts.length > 0 ? parts.join('. ') : null;
        }

        // Spells
        case 'ADD_SPELL': return `Добавлено заклинание: "${action.payload.name}"`;
        case 'UPDATE_SPELL': return `Заклинание "${action.payload.name}" обновлено.`;
        case 'DELETE_SPELL': {
            const spell = oldState.spells.find(s => s.id === action.payload);
            return spell ? `Удалено заклинание: "${spell.name}"` : 'Удалено заклинание.';
        }
        case 'TOGGLE_SPELL_PREPARED': {
            const spell = oldState.spells.find(s => s.id === action.payload);
            if (!spell) return null;
            return `Заклинание "${spell.name}" ${spell.isPrepared ? 'убрано из' : 'добавлено в'} подготовленные.`;
        }
        case 'SET_SPELL_SLOTS': {
            const { level, total } = action.payload;
            return `Кол-во ячеек ${level} уровня изменено на ${total}.`;
        }
        case 'USE_SPELL_SLOT': {
            const { level, used } = action.payload;
            const total = oldState.spellSlots[level]?.total || 0;
            return `Использована ячейка ${level} уровня. Осталось: ${total - used}.`;
        }
        case 'SET_SPELLCASTING_ABILITY': return `Базовая хар-ка заклинаний изменена на ${ABILITY_NAMES[action.payload]}.`;
        case 'SET_MAX_PREPARED_SPELLS': return `Лимит подготовленных заклинаний изменён на ${action.payload}.`;
    }
    return null; // For actions we don't want to log explicitly
}