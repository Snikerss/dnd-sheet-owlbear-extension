import { Character, CharacterAction, ProficiencyLevel, Ability } from '../../types';
import { recalculateMaxHp } from '../../utils/characterCalculations';
import { selectEquippedBonuses } from '../../utils/selectors';
import { BONUS_FIELDS } from '../../constants';

export const abilitiesReducer = (state: Character, action: CharacterAction): Character => {
    switch (action.type) {
        case 'SET_SCORE': {
            const { ability, score } = action.payload;
            const newScores = { ...state.scores, [ability]: score };
            if (ability === Ability.CON) {
                const oldModifier = Math.floor((state.scores[Ability.CON] - 10) / 2);
                const newModifier = Math.floor((score - 10) / 2);
                const modDiff = newModifier - oldModifier;
                const hpDiff = modDiff * state.level;
                
                const newMaxHP = Math.max(1, state.maxHitPoints + hpDiff);
                const equippedBonuses = selectEquippedBonuses(state);
                const newEffectiveMaxHP = newMaxHP + (equippedBonuses.maxHp || 0);
                const newCurrentHP = Math.max(0, Math.min(newEffectiveMaxHP, state.currentHitPoints + hpDiff));
                return { ...state, scores: newScores, maxHitPoints: newMaxHP, currentHitPoints: newCurrentHP };
            }
            return { ...state, scores: newScores };
        }

        case 'SET_PROFICIENCY': {
            const skillName = action.payload;
            const existing = state.skills[skillName];
            if (!existing) return state;
            const currentProficiency = existing.proficiency;
            const newProficiency = (currentProficiency + 1) % 3;
            const newSkills = { ...state.skills, [skillName]: { ...existing, proficiency: newProficiency as ProficiencyLevel } };
            return { ...state, skills: newSkills };
        }

        case 'SET_SAVING_THROW_PROF': {
            const ability = action.payload;
            const newProfs = { ...state.savingThrowProficiencies, [ability]: !state.savingThrowProficiencies[ability] };
            return { ...state, savingThrowProficiencies: newProfs };
        }

        case 'SET_BONUS': {
            // Единая обработка всех бонусных полей из BONUS_FIELDS.
            // Исключаем maxHpBonus — он обрабатывается особо в combatReducer с пересчётом ОЗ.
            const { field, value } = action.payload;
            if (field === 'maxHpBonus') return state;
            if ((BONUS_FIELDS as readonly string[]).includes(field)) {
                 return { ...state, [field]: value };
            }
            return state;
        }

        case 'SET_ABILITY_BONUS':
            return { ...state, abilityBonuses: { ...state.abilityBonuses, [action.payload.ability]: action.payload.bonus } };

        case 'SET_SAVING_THROW_BONUS':
            return { ...state, savingThrowBonuses: { ...state.savingThrowBonuses, [action.payload.ability]: action.payload.bonus } };

        case 'SET_SKILL_BONUS':
            return { ...state, skillBonuses: { ...state.skillBonuses, [action.payload.skillName]: action.payload.bonus } };

        default:
            return state;
    }
};
