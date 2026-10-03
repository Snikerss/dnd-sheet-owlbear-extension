import { logger } from './logger';
/**
 * Парсер и бросатель формул костей D&D.
 *
 * Переписан по итогам аудита (#11):
 *  - умножение "2d6*2" раньше молча превращалось в "+2" — теперь считается;
 *  - процентная кость "d%" раньше тихо возвращала 0 — теперь это d100;
 *  - добавлена поддержка kh/kl ("4d6kh3" — оставить 3 старших, как при
 *    генерации характеристик);
 *  - мусорный ввод больше не проходит незамеченным: rollFormula бросает
 *    DiceFormulaError с понятным сообщением, а легаси-обёртка parseAndRoll
 *    сохраняет прежний контракт (нули + предупреждение в консоль).
 */

export interface RollResult {
  /** Итоговое значение: кости (с учётом kh/kl и множителей) плюс модификатор. */
  total: number;
  /** Сумма брошенных костей без статичного модификатора. */
  diceResult: number;
  /** Статичная числовая часть формулы. */
  modifier: number;
}

/** Формула не может быть разобрана — синтаксис неизвестен парсеру. */
export class DiceFormulaError extends Error {
  constructor(
    message: string,
    public readonly formula: string,
  ) {
    super(message);
    this.name = 'DiceFormulaError';
  }
}

const MAX_DICE_COUNT = 1000;
const MAX_MULTIPLIER = 100;
const MIN_SIDES = 2;

interface TermSpec {
  sign: 1 | -1;
  kind: 'dice' | 'num';
  /** Для костей — количество; для чисел не используется. */
  count: number;
  /** Для костей — число граней; для чисел не используется. */
  sides: number;
  keepMode?: 'kh' | 'kl';
  keepN?: number;
  multiplier: number;
  /** Значение для чистого числа. */
  value?: number;
}

/** Разбирает формулу на слагаемые. Бросает DiceFormulaError при мусоре. */
export function parseDiceTerms(formula: string): TermSpec[] {
  const s = formula.replace(/\s+/g, '').toLowerCase();
  if (!s) return [];

  const parts = s.match(/[+-]?[^+-]+/g);
  if (!parts || parts.join('') !== s) {
    throw new DiceFormulaError('Некорректный синтаксис формулы', formula);
  }

  return parts.map((raw) => {
    let sign: 1 | -1 = 1;
    let body = raw;
    if (body.startsWith('+')) {
      body = body.slice(1);
    } else if (body.startsWith('-')) {
      sign = -1;
      body = body.slice(1);
    }
    if (!body) {
      throw new DiceFormulaError('Пустое слагаемое в формуле', formula);
    }

    // Хвостовой множитель: XdY*N или число*N. Вложенные скобки/двойные '*' не поддерживаются.
    let multiplier = 1;
    const mulMatch = body.match(/^(.+?)\*(\d+)$/);
    if (mulMatch) {
      const mulBody = mulMatch[1]!;
      if (mulBody.includes('*')) {
        throw new DiceFormulaError('Множитель указан более одного раза', formula);
      }
      body = mulBody;
      multiplier = parseInt(mulMatch[2]!, 10);
      if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > MAX_MULTIPLIER) {
        throw new DiceFormulaError(`Недопустимый множитель *${mulMatch[2]}`, formula);
      }
    }

    const numOnly = /^\d+$/.exec(body);
    if (numOnly) {
      return { sign, kind: 'num' as const, count: 0, sides: 0, multiplier, value: parseInt(body, 10) };
    }

    const diceKeep = /^(\d*)d(%|\d+)(kh|kl)(\d+)$/.exec(body);
    const dicePlain = /^(\d*)d(%|\d+)$/.exec(body);
    const match = diceKeep ?? dicePlain;
    if (!match) {
      throw new DiceFormulaError(`Не удалось разобрать слагаемое «${body}»`, formula);
    }

    const count = match[1] === '' || match[1] === undefined ? 1 : parseInt(match[1], 10);
    const sides = match[2] === '%' ? 100 : parseInt(match[2]!, 10);
    if (!Number.isFinite(count) || count < 1 || count > MAX_DICE_COUNT) {
      throw new DiceFormulaError(`Недопустимое количество костей: ${match[1] || '1'}`, formula);
    }
    if (!Number.isFinite(sides) || sides < MIN_SIDES) {
      throw new DiceFormulaError(`У кости должно быть минимум ${MIN_SIDES} граней`, formula);
    }

    const term: TermSpec = { sign, kind: 'dice', count, sides, multiplier };
    if (diceKeep) {
      const keepMode = diceKeep[3] as 'kh' | 'kl';
      const keepN = parseInt(diceKeep[4]!, 10);
      if (!Number.isFinite(keepN) || keepN < 1 || keepN > count) {
        throw new DiceFormulaError(`${keepMode.toUpperCase()}${keepN}: нельзя оставить ${keepN} из ${count}`, formula);
      }
      term.keepMode = keepMode;
      term.keepN = keepN;
    }
    return term;
  });
}

/** Бросает одну кость: целое от 1 до sides включительно. */
const rollDie = (sides: number): number => Math.floor(Math.random() * sides) + 1;

/**
 * Разбирает и бросает формулу. При ошибке разбора бросает DiceFormulaError —
 * используйте для новых мест, где ошибку можно показать пользователю.
 */
export function rollFormula(formula: string): RollResult {
  const terms = parseDiceTerms(formula);

  let diceResult = 0;
  let modifier = 0;

  for (const term of terms) {
    if (term.kind === 'num') {
      modifier += term.sign * (term.value ?? 0) * term.multiplier;
      continue;
    }

    const rolls: number[] = Array.from({ length: term.count }, () => rollDie(term.sides));

    let sum: number;
    if (term.keepMode && term.keepN !== undefined) {
      const sorted = [...rolls].sort((a, b) => (term.keepMode === 'kh' ? b - a : a - b));
      sum = sorted.slice(0, term.keepN).reduce((acc, v) => acc + v, 0);
    } else {
      sum = rolls.reduce((acc, v) => acc + v, 0);
    }

    diceResult += term.sign * sum * term.multiplier;
  }

  return { total: diceResult + modifier, diceResult, modifier };
}

/**
 * Легаси-совместимая обёртка: возвращает нули вместо исключения,
 * но логирует проблему в консоль (мусор больше не теряется молча).
 */
export const parseAndRoll = (diceString: string): RollResult => {
  try {
    return rollFormula(diceString ?? '');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`[DND Sheet] Не удалось бросить кости по формуле "${diceString}": ${message}`);
    return { total: 0, diceResult: 0, modifier: 0 };
  }
};
