import { Character, CharacterAction, CharacterSize } from '../../types';
import { XP_THRESHOLDS, CHARACTER_SIZE_NAMES } from '../../constants';
import { recalculateMaxHp } from '../../utils/characterCalculations';
import { selectEquippedBonuses } from '../../utils/selectors';

export const metaReducer = (state: Character, action: CharacterAction): Character => {
  switch (action.type) {
    case 'SET_FIELD': {
      const { field, value } = action.payload;
      const coreFields = ['name', 'race', 'characterClass', 'experience', 'portraitUrl', 'speed', 'temporaryHitPoints', 'ownerId'];
      if (coreFields.includes(field)) {
        return { ...state, [field]: value };
      }
      return state;
    }

    case 'SET_LEVEL': {
      const newLevel = Math.max(1, Math.min(20, action.payload));
      if (newLevel === state.level) return state;
      
      const conModifier = Math.floor((state.scores.CON - 10) / 2);
      const averageGain = Math.floor(state.hitDie / 2) + 1;
      const levelDiff = newLevel - state.level;
      const hpChange = levelDiff * Math.max(1, averageGain + conModifier);
      
      const newMaxHP = Math.max(1, state.maxHitPoints + hpChange);
      const newExperience = XP_THRESHOLDS[newLevel - 1] ?? 0;
      const equippedBonuses = selectEquippedBonuses(state);
      const newEffectiveMaxHP = newMaxHP + (equippedBonuses.maxHp || 0);
      const newCurrentHP = Math.max(0, Math.min(newEffectiveMaxHP, state.currentHitPoints + hpChange));
      return { ...state, level: newLevel, experience: newExperience, maxHitPoints: newMaxHP, currentHitPoints: newCurrentHP, totalHitDice: newLevel, currentHitDice: newLevel };
    }

    case 'LEVEL_UP': {
      if (state.level >= 20) return state;
      const { method, hpRoll } = action.payload;
      const conModifier = Math.floor((state.scores.CON - 10) / 2);
      // Бросок кости вынесен из reducer: при method='roll' используется предвычисленный hpRoll
      // (компонент бросает кость); при method='average' берётся среднее.
      // Если hpRoll не передан при method='roll' (старый код), используем среднее как fallback.
      const rolledValue = (method === 'roll' && typeof hpRoll === 'number' && !isNaN(hpRoll))
        ? hpRoll
        : (Math.floor(state.hitDie / 2) + 1);
      const hpGain = Math.max(1, rolledValue + conModifier);
      const newLevel = state.level + 1;
      const newExperience = Math.max(state.experience, XP_THRESHOLDS[newLevel - 1] ?? state.experience);
      return { ...state, level: newLevel, maxHitPoints: state.maxHitPoints + hpGain, currentHitPoints: state.currentHitPoints + hpGain, totalHitDice: newLevel, currentHitDice: Math.min(state.currentHitDice + 1, newLevel), experience: newExperience };
    }
    
    case 'SET_SIZE':
      return { ...state, size: action.payload };

    case 'REORDER_TABS':
      return { ...state, tabOrder: action.payload };

    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.payload };

    case 'TOGGLE_TAB_COLLAPSE': {
      const collapsedTabs = state.collapsedTabs || {};
      return {
        ...state,
        collapsedTabs: {
          ...collapsedTabs,
          [action.payload]: !collapsedTabs[action.payload]
        }
      };
    }

    default:
      return state;
  }
};
