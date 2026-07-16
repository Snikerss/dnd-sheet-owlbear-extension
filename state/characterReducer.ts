import { Character, CharacterAction } from '../types';
import { defaultCharacterState } from './defaultCharacterState'; // Import the refactored default state
import { metaReducer } from './reducers/meta.reducer';
import { abilitiesReducer } from './reducers/abilities.reducer';
import { combatReducer } from './reducers/combat.reducer';
import { inventoryReducer } from './reducers/inventory.reducer';
import { actionsReducer } from './reducers/actions.reducer';

export { defaultCharacterState };

/**
 * Главный редьюсер для состояния одного персонажа.
 * 
 * Этот редьюсер использует паттерн "композиция редьюсеров". Он не содержит собственной логики
 * обработки действий, а вместо этого передает состояние и действие последовательной цепочке
 * более мелких, специализированных редьюсеров.
 * 
 * Каждый суб-редьюсер отвечает за свою часть состояния (например, боевые параметры, инвентарь)
 * и возвращает обновленное состояние. Такой подход делает код более модульным, читаемым
 * и простым для тестирования и расширения.
 * 
 * @param state - Текущее состояние персонажа.
 * @param action - Действие, которое необходимо обработать.
 * @returns Новое состояние персонажа после обработки действия.
 */
export const characterReducer = (state: Character, action: CharacterAction): Character => {
  // Последовательно применяем каждый суб-редьюсер.
  // Важно, что каждый следующий редьюсер получает состояние,
  // которое уже было обработано предыдущим. Это позволяет обрабатывать
  // связанные изменения (например, изменение Телосложения влияет на ОЗ).
  let nextState = metaReducer(state, action);
  nextState = abilitiesReducer(nextState, action);
  nextState = combatReducer(nextState, action);
  nextState = inventoryReducer(nextState, action);
  nextState = actionsReducer(nextState, action);
  
  return nextState;
};
