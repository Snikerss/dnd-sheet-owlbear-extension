/**
 * Парсит строку с формулой костей (например, "2d6 + 1d4 - 2") и совершает бросок.
 * @param diceString Строка с формулой.
 * @returns Объект с итогом, результатом броска костей и статичным модификатором.
 */
export const parseAndRoll = (diceString: string): { total: number, diceResult: number, modifier: number } => {
  if (!diceString) {
    return { total: 0, diceResult: 0, modifier: 0 };
  }
  const normalized = diceString.replace(/\s/g, '');
  let diceResult = 0;
  let modifier = 0;
  const parts = normalized.match(/[+-]?(\d*d\d+|\d+)/g) || [];

  for (const part of parts) {
    if (part.includes('d')) {
      const [countStr, sidesStr] = part.replace(/^[+-]/, '').split('d');
      const count = parseInt(countStr ?? '1', 10) || 1;
      const sides = parseInt(sidesStr ?? '0', 10);
      if (!sides) continue;
      const sign = part.startsWith('-') ? -1 : 1;
      for (let i = 0; i < count; i++) {
        diceResult += (Math.floor(Math.random() * sides) + 1) * sign;
      }
    } else {
      modifier += parseInt(part, 10);
    }
  }
  return { total: diceResult + modifier, diceResult, modifier };
};
