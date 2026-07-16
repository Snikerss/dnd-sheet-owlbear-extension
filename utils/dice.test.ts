import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseAndRoll } from './dice';

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
