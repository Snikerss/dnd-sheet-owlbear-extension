import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseAndRoll, rollFormula, DiceFormulaError } from './dice';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('parseAndRoll', () => {
    it('возвращает нули для пустой строки', () => {
        expect(parseAndRoll('')).toEqual({ total: 0, diceResult: 0, modifier: 0 });
    });

    it('парсит одну кость (максимальный бросок)', () => {
        // random() = 0.999 → floor(0.999 * 6) + 1 = 6
        vi.spyOn(Math, 'random').mockReturnValue(0.999);
        const result = parseAndRoll('1d6');
        expect(result.diceResult).toBe(6);
        expect(result.modifier).toBe(0);
        expect(result.total).toBe(6);
    });

    it('парсит несколько костей', () => {
        // random = 0.499 для каждого броска → floor(0.499*6)+1 = 2+1 = 3
        vi.spyOn(Math, 'random').mockReturnValue(0.499);
        const result = parseAndRoll('2d6');
        expect(result.diceResult).toBe(6); // 3 + 3
        expect(result.total).toBe(6);
    });

    it('подразумевает count=1, если число перед d отсутствует', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.999);
        const result = parseAndRoll('d8');
        expect(result.diceResult).toBe(8);
    });

    it('складывает положительные модификаторы', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.999);
        const result = parseAndRoll('1d6+5');
        expect(result.diceResult).toBe(6);
        expect(result.modifier).toBe(5);
        expect(result.total).toBe(11);
    });

    it('обрабатывает отрицательные модификаторы', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.999);
        const result = parseAndRoll('1d6-2');
        expect(result.diceResult).toBe(6);
        expect(result.modifier).toBe(-2);
        expect(result.total).toBe(4);
    });

    it('обрабатывает комплексную формулу 2d6+1d4-2', () => {
        // random=0.999 → 2d6 = 12, 1d4 = 4
        vi.spyOn(Math, 'random').mockReturnValue(0.999);
        const result = parseAndRoll('2d6+1d4-2');
        expect(result.diceResult).toBe(16); // 6+6+4
        expect(result.modifier).toBe(-2);
        expect(result.total).toBe(14);
    });

    it('обрабатывает только статичный модификатор', () => {
        const result = parseAndRoll('+7');
        expect(result.diceResult).toBe(0);
        expect(result.modifier).toBe(7);
        expect(result.total).toBe(7);
    });

    it('обрабатывает отрицательный статичный модификатор', () => {
        const result = parseAndRoll('-3');
        expect(result.diceResult).toBe(0);
        expect(result.modifier).toBe(-3);
        expect(result.total).toBe(-3);
    });

    it('игнорирует пробелы в формуле', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.999);
        const result = parseAndRoll(' 2 d 6 + 3 ');
        expect(result.diceResult).toBe(12);
        expect(result.modifier).toBe(3);
        expect(result.total).toBe(15);
    });

    it('возвращает нули для невалидной строки', () => {
        const result = parseAndRoll('abc');
        expect(result.diceResult).toBe(0);
        expect(result.modifier).toBe(0);
        expect(result.total).toBe(0);
    });

    it('бросок может давать минимум 1 (random=0)', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const result = parseAndRoll('1d20');
        expect(result.diceResult).toBe(1); // floor(0*20)+1
    });
});

describe('parseAndRoll — фиксы аудита (#11)', () => {
    it('умножение считается, а не превращается в сложение', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.999);
        const result = parseAndRoll('2d6*2');
        expect(result.diceResult).toBe(24); // 12 * 2, а не 12+2
        expect(result.total).toBe(24);
    });

    it('умножение с модификатором: 1d4*3+1', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.999);
        const result = parseAndRoll('1d4*3+1');
        expect(result.diceResult).toBe(12); // 4*3
        expect(result.modifier).toBe(1);
        expect(result.total).toBe(13);
    });

    it('процентная кость d% — это d100', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.999);
        const result = parseAndRoll('d%');
        expect(result.diceResult).toBe(100);
    });

    it('kh: 4d6kh3 оставляет три старших кости', () => {
        // Последовательность бросков: 6, 5, 4, 3 → оставляем 6+5+4=15
        const rolls = [0.999, 0.8, 0.6, 0.4];
        let i = 0;
        vi.spyOn(Math, 'random').mockImplementation(() => rolls[i++ % rolls.length]!);
        const result = rollFormula('4d6kh3');
        // броски: floor(r*6)+1 → 6, 5, 4, 3; kh3 → 6+5+4
        expect(result.diceResult).toBe(15);
    });

    it('kl: 3d6kl1 оставляет младшую кость', () => {
        // Броски: 6, 1, 4 → kl1 → 1
        const rolls = [0.999, 0.01, 0.6];
        let i = 0;
        vi.spyOn(Math, 'random').mockImplementation(() => rolls[i++ % rolls.length]!);
        const result = rollFormula('3d6kl1');
        expect(result.diceResult).toBe(1);
    });

    it('мусорный ввод: parseAndRoll возвращает нули и логирует предупреждение', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = parseAndRoll('abc');
        expect(result).toEqual({ total: 0, diceResult: 0, modifier: 0 });
        expect(warnSpy).toHaveBeenCalledOnce();
    });

    it('rollFormula бросает DiceFormulaError на мусоре (loud failure)', () => {
        expect(() => rollFormula('abc')).toThrow(DiceFormulaError);
        expect(() => rollFormula('1d6**2')).toThrow(DiceFormulaError);
        expect(() => rollFormula('1d1')).toThrow(DiceFormulaError);   // минимум 2 грани
        expect(() => rollFormula('4d6kh9')).toThrow(DiceFormulaError); // нельзя оставить больше, чем брошено
        expect(() => rollFormula('1d6*0')).toThrow(DiceFormulaError);
    });

    it('пустая формула валидна и даёт нули даже через rollFormula', () => {
        expect(rollFormula('')).toEqual({ total: 0, diceResult: 0, modifier: 0 });
        expect(rollFormula('   ')).toEqual({ total: 0, diceResult: 0, modifier: 0 });
    });

    it('отрицательный множитель слагаемого: -2d6*2 вычитает удвоенный бросок', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.999);
        const result = parseAndRoll('-2d6*2');
        expect(result.diceResult).toBe(-24);
    });
});
