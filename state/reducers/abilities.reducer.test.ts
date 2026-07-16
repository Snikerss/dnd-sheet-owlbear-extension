import { describe, it, expect } from 'vitest';
import { abilitiesReducer } from './abilities.reducer';
import { makeTestCharacter } from '../testFixtures';
import { Ability, CharacterAction, ProficiencyLevel } from '../../types';

describe('abilitiesReducer — SET_SCORE', () => {
    it('устанавливает значение характеристики', () => {
        const char = makeTestCharacter();
        const action: CharacterAction = { type: 'SET_SCORE', payload: { ability: Ability.STR, score: 18 } };
        const result = abilitiesReducer(char, action);
        expect(result.scores.STR).toBe(18);
    });

    it('пересчитывает maxHP при изменении CON', () => {
        const char = makeTestCharacter({
            level: 5,
            hitDie: 8,
            scores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
            maxHitPoints: 28,
        });
        // CON 10 → 14 (+2 мод)
        const action: CharacterAction = { type: 'SET_SCORE', payload: { ability: Ability.CON, score: 14 } };
        const result = abilitiesReducer(char, action);
        // recalculateMaxHp(5, d8, 14) = (8+2) + 4*(5+2) = 10 + 28 = 38
        expect(result.maxHitPoints).toBe(38);
        expect(result.scores.CON).toBe(14);
    });

    it('не пересчитывает HP при изменении не-CON характеристики', () => {
        const char = makeTestCharacter({ maxHitPoints: 28, level: 5 });
        const action: CharacterAction = { type: 'SET_SCORE', payload: { ability: Ability.STR, score: 18 } };
        const result = abilitiesReducer(char, action);
        expect(result.maxHitPoints).toBe(28);
    });
});

describe('abilitiesReducer — SET_PROFICIENCY', () => {
    it('циклически переключает владение навыком None→Proficient→Expert→None', () => {
        let char = makeTestCharacter({ skills: { ...makeTestCharacter().skills, 'Атлетика': { name: 'Атлетика', ability: Ability.STR, proficiency: ProficiencyLevel.None } } });

        const cycle: CharacterAction = { type: 'SET_PROFICIENCY', payload: 'Атлетика' };

        char = abilitiesReducer(char, cycle);
        expect(char.skills['Атлетика'].proficiency).toBe(ProficiencyLevel.Proficient);

        char = abilitiesReducer(char, cycle);
        expect(char.skills['Атлетика'].proficiency).toBe(ProficiencyLevel.Expert);

        char = abilitiesReducer(char, cycle);
        expect(char.skills['Атлетика'].proficiency).toBe(ProficiencyLevel.None);
    });

    it('не падает на неизвестном навыке', () => {
        const char = makeTestCharacter();
        const action: CharacterAction = { type: 'SET_PROFICIENCY', payload: 'Несуществующий навык' };
        const result = abilitiesReducer(char, action);
        expect(result).toBe(char);
    });
});

describe('abilitiesReducer — SET_SAVING_THROW_PROF', () => {
    it('переключает владение спасброском', () => {
        const char = makeTestCharacter({ savingThrowProficiencies: { STR: false, DEX: false, CON: false, INT: false, WIS: false, CHA: false } });
        const action: CharacterAction = { type: 'SET_SAVING_THROW_PROF', payload: Ability.CON };
        const result = abilitiesReducer(char, action);
        expect(result.savingThrowProficiencies.CON).toBe(true);
        // другие не затронуты
        expect(result.savingThrowProficiencies.STR).toBe(false);
    });
});

describe('abilitiesReducer — SET_BONUS', () => {
    it('устанавливает acBonus', () => {
        const char = makeTestCharacter({ acBonus: 0 });
        const action: CharacterAction = { type: 'SET_BONUS', payload: { field: 'acBonus', value: 3 } };
        const result = abilitiesReducer(char, action);
        expect(result.acBonus).toBe(3);
    });

    it('устанавливает speedBonus', () => {
        const char = makeTestCharacter({ speedBonus: 0 });
        const action: CharacterAction = { type: 'SET_BONUS', payload: { field: 'speedBonus', value: 10 } };
        const result = abilitiesReducer(char, action);
        expect(result.speedBonus).toBe(10);
    });

    it('игнорирует поля не из белого списка (maxHpBonus обрабатывается в combatReducer)', () => {
        const char = makeTestCharacter({ maxHpBonus: 0 });
        const action: CharacterAction = { type: 'SET_BONUS', payload: { field: 'maxHpBonus', value: 5 } };
        const result = abilitiesReducer(char, action);
        expect(result).toBe(char); // abilitiesReducer не обрабатывает maxHpBonus
    });

    it('обрабатывает spellSaveDcBonus через единый BONUS_FIELDS (баг #12)', () => {
        const char = makeTestCharacter({ spellSaveDcBonus: 0 });
        const action: CharacterAction = { type: 'SET_BONUS', payload: { field: 'spellSaveDcBonus', value: 3 } };
        const result = abilitiesReducer(char, action);
        expect(result.spellSaveDcBonus).toBe(3);
    });

    it('обрабатывает spellAttackBonusBonus через единый BONUS_FIELDS (баг #12)', () => {
        const char = makeTestCharacter({ spellAttackBonusBonus: 0 });
        const action: CharacterAction = { type: 'SET_BONUS', payload: { field: 'spellAttackBonusBonus', value: 2 } };
        const result = abilitiesReducer(char, action);
        expect(result.spellAttackBonusBonus).toBe(2);
    });
});

describe('abilitiesReducer — ability/savingThrow/skill bonuses', () => {
    it('SET_ABILITY_BONUS обновляет бонус характеристики', () => {
        const char = makeTestCharacter();
        const action: CharacterAction = { type: 'SET_ABILITY_BONUS', payload: { ability: Ability.STR, bonus: 2 } };
        const result = abilitiesReducer(char, action);
        expect(result.abilityBonuses.STR).toBe(2);
    });

    it('SET_SAVING_THROW_BONUS обновляет бонус спасброска', () => {
        const char = makeTestCharacter();
        const action: CharacterAction = { type: 'SET_SAVING_THROW_BONUS', payload: { ability: Ability.DEX, bonus: 4 } };
        const result = abilitiesReducer(char, action);
        expect(result.savingThrowBonuses.DEX).toBe(4);
    });

    it('SET_SKILL_BONUS обновляет бонус навыка', () => {
        const char = makeTestCharacter();
        const action: CharacterAction = { type: 'SET_SKILL_BONUS', payload: { skillName: 'Атлетика', bonus: 5 } };
        const result = abilitiesReducer(char, action);
        expect(result.skillBonuses['Атлетика']).toBe(5);
    });
});
