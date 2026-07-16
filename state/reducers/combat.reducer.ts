import { Character, CharacterAction, RecoveryType, Ability, InventoryItem } from '../../types';
import { recalculateMaxHp } from '../../utils/characterCalculations';
import { recoverItemCharges } from '../../utils/inventory';
import { selectEquippedBonuses } from '../../utils/selectors';

export const combatReducer = (state: Character, action: CharacterAction): Character => {
    switch (action.type) {
        case 'APPLY_HEALTH_CHANGE': {
            const { amount, type } = action.payload;
            const equippedBonuses = selectEquippedBonuses(state);
            const effectiveMaxHP = state.maxHitPoints + (equippedBonuses.maxHp || 0);
            if (type === 'temp') return { ...state, temporaryHitPoints: Math.max(state.temporaryHitPoints, amount) };
            if (type === 'heal') return { ...state, currentHitPoints: Math.min(effectiveMaxHP, state.currentHitPoints + amount) };
            if (type === 'damage') {
                const damageAfterTemp = Math.max(0, amount - state.temporaryHitPoints);
                const newTempHp = Math.max(0, state.temporaryHitPoints - amount);
                const newCurrentHp = Math.max(0, state.currentHitPoints - damageAfterTemp);
                return { ...state, currentHitPoints: newCurrentHp, temporaryHitPoints: newTempHp };
            }
            return state;
        }

        case 'SET_HIT_DIE': {
            const newHitDie = action.payload;
            if (newHitDie === state.hitDie) return state;
            const newMaxHP = recalculateMaxHp(state.level, newHitDie, state.scores.CON) + state.maxHpBonus;
            const hpDiff = newMaxHP - state.maxHitPoints;
            const equippedBonuses = selectEquippedBonuses(state);
            const newEffectiveMaxHP = newMaxHP + (equippedBonuses.maxHp || 0);
            const newCurrentHP = Math.max(0, Math.min(newEffectiveMaxHP, state.currentHitPoints + hpDiff));
            return { ...state, hitDie: newHitDie, maxHitPoints: newMaxHP, currentHitPoints: newCurrentHP };
        }
        
        case 'SET_BONUS': {
            const { field, value } = action.payload;
            if (field === 'maxHpBonus') {
                const newBonus = value;
                const hpBonusChange = newBonus - state.maxHpBonus;
                const newMaxHP = Math.max(1, state.maxHitPoints + hpBonusChange);
                const equippedBonuses = selectEquippedBonuses(state);
                const newEffectiveMaxHP = newMaxHP + (equippedBonuses.maxHp || 0);
                const newCurrentHP = Math.max(0, Math.min(newEffectiveMaxHP, state.currentHitPoints + hpBonusChange));
                return { 
                    ...state, 
                    maxHpBonus: newBonus, 
                    maxHitPoints: newMaxHP,
                    currentHitPoints: newCurrentHP
                };
            }
            return state;
        }

        case 'SHORT_REST': {
            const { diceResults, conModifier } = action.payload;
            const diceToSpend = diceResults.length;
            if (diceToSpend < 0 || diceToSpend > state.currentHitDice) return state;
            // Каждый результат кости минимум 1 + CON-модификатор, но не меньше 1 всего
            let totalHealed = 0;
            for (const roll of diceResults) {
                totalHealed += Math.max(1, roll + conModifier);
            }
            const equippedBonuses = selectEquippedBonuses(state);
            const effectiveMaxHP = state.maxHitPoints + (equippedBonuses.maxHp || 0);
            return {
                ...state,
                currentHitPoints: Math.min(effectiveMaxHP, state.currentHitPoints + totalHealed),
                currentHitDice: state.currentHitDice - diceToSpend,
                features: state.features.map(feature => {
                    if (feature.recovery === RecoveryType.ShortRest || feature.recovery === RecoveryType.ShortOrLongRest) {
                        return { ...feature, currentUses: feature.totalUses };
                    }
                    return feature;
                }),
                inventory: recoverItemCharges(state.inventory, [RecoveryType.ShortRest, RecoveryType.ShortOrLongRest]),
                attunementItems: recoverItemCharges(state.attunementItems, [RecoveryType.ShortRest, RecoveryType.ShortOrLongRest]),
            };
        }

        case 'LONG_REST': {
            const hitDiceToRegain = Math.max(1, Math.floor(state.totalHitDice / 2));
            const newSpellSlots = { ...state.spellSlots };
            for (const level in newSpellSlots) {
                const slot = newSpellSlots[level];
                if (slot) slot.used = 0;
            }
            const equippedBonuses = selectEquippedBonuses(state);
            const effectiveMaxHP = state.maxHitPoints + (equippedBonuses.maxHp || 0);
            return {
                ...state,
                currentHitPoints: effectiveMaxHP,
                temporaryHitPoints: 0,
                currentHitDice: Math.min(state.totalHitDice, state.currentHitDice + hitDiceToRegain),
                features: state.features.map(feature => {
                    if (feature.recovery === RecoveryType.LongRest || feature.recovery === RecoveryType.ShortOrLongRest) {
                        return { ...feature, currentUses: feature.totalUses };
                    }
                    return feature;
                }),
                inventory: recoverItemCharges(state.inventory, [RecoveryType.LongRest, RecoveryType.ShortOrLongRest]),
                attunementItems: recoverItemCharges(state.attunementItems, [RecoveryType.LongRest, RecoveryType.ShortOrLongRest]),
                spellSlots: newSpellSlots,
            };
        }

        case 'SET_CURRENT_HIT_DICE':
            return { ...state, currentHitDice: Math.max(0, Math.min(state.totalHitDice, action.payload)) };
        
        case 'SET_BASE_AC':
            return { ...state, baseAC: isNaN(action.payload) ? 10 : action.payload };

        case 'TOGGLE_AC_ABILITY_SOURCE': {
            const ability = action.payload;
            return {
                ...state,
                acAbilitySources: {
                    ...state.acAbilitySources,
                    [ability]: !state.acAbilitySources[ability],
                },
            };
        }

        default:
            return state;
    }
};