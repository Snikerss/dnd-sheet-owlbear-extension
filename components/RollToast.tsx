import React from 'react';
import type { RollResult } from '../types';
import { RollType } from '../types';

interface RollToastProps {
  result: RollResult;
}

export const RollToast: React.FC<RollToastProps> = ({ result }) => {
  const isCriticalSuccess = result.rollType !== RollType.Normal && result.chosenRoll === 20;
  const isCriticalFailure = result.rollType !== RollType.Normal && result.chosenRoll === 1;
  let borderColor = 'border-[var(--color-border-subtle)]';
  let titleColor = 'text-[var(--color-accent-primary)]';
  if (isCriticalSuccess) {
      borderColor = 'border-[var(--color-critical-success)]';
      titleColor = 'text-[var(--color-critical-success)]';
  }
  if (isCriticalFailure) {
      borderColor = 'border-[var(--color-critical-failure)]';
      titleColor = 'text-[var(--color-critical-failure)]';
  }

  const getRollTypeName = () => {
    switch (result.rollType) {
      case RollType.Advantage: return 'С преимуществом';
      case RollType.Disadvantage: return 'С помехой';
      default: return null;
    }
  };

  const rollTypeName = getRollTypeName();

  return (
    <div className="fixed left-1/2 -translate-x-1/2 z-50 roll-toast" role="status" aria-live="polite">
      <div 
        className={`bg-[var(--color-surface-opaque)] rounded-lg shadow-2xl p-4 min-w-[320px] max-w-sm border-2 ${borderColor}`}
      >
        <div className="text-center">
          <h2 className={`text-xl font-bold font-[var(--font-heading)] ${titleColor} mb-1 truncate`}>{result.name}</h2>
          {isCriticalSuccess && <p className="text-sm font-bold text-[var(--color-critical-success)]">Критический успех!</p>}
          {isCriticalFailure && <p className="text-sm font-bold text-[var(--color-critical-failure)]">Критический провал!</p>}
          {rollTypeName && <p className="text-sm font-semibold text-[var(--color-text-medium)] -mt-1">{rollTypeName}</p>}

          <div className="flex justify-center items-center space-x-2 my-3">
            <div className="flex flex-col items-center p-2 bg-[var(--color-surface-inset)] rounded w-24">
              <div className="flex items-baseline space-x-2">
                <span className={`text-2xl font-bold ${result.roll1 !== result.chosenRoll && result.rollType !== RollType.Normal ? 'text-[var(--color-text-muted)] line-through' : 'text-[var(--color-text-base)]'}`}>{result.roll1}</span>
                {result.roll2 !== undefined && (
                  <span className={`text-2xl font-bold ${result.roll2 !== result.chosenRoll ? 'text-[var(--color-text-muted)] line-through' : 'text-[var(--color-text-base)]'}`}>{result.roll2}</span>
                )}
              </div>
              <span className="text-xs text-[var(--color-text-muted)] uppercase">{result.diceType}</span>
            </div>
            <span className="text-2xl font-light text-[var(--color-text-subtle)]">+</span>
            <div className="flex flex-col items-center p-2 bg-[var(--color-surface-inset)] rounded min-w-[80px]">
              <span className="text-2xl font-bold text-[var(--color-text-base)]">{result.modifier}</span>
              <span className="text-xs text-[var(--color-text-muted)]">Модификатор</span>
            </div>

            {result.bonusDiceRoll !== undefined && result.bonusDiceFormula && (
              <>
                <span className="text-2xl font-light text-[var(--color-text-subtle)]">+</span>
                <div className="flex flex-col items-center p-2 bg-[var(--color-surface-inset)] rounded min-w-[80px]">
                  <span className="text-2xl font-bold text-[var(--color-text-base)]">{result.bonusDiceRoll}</span>
                  <span className="text-xs text-[var(--color-text-muted)] truncate" data-tooltip={result.bonusDiceFormula}>{result.bonusDiceFormula}</span>
                </div>
              </>
            )}

            <span className="text-2xl font-light text-[var(--color-text-subtle)]">=</span>
            <div className="flex flex-col items-center p-2 bg-[var(--color-accent-primary)]/20 rounded min-w-[80px]">
                <span className="text-3xl font-bold text-[var(--color-accent-primary)]">{result.total}</span>
                <span className="text-xs text-[var(--color-accent-primary-light)]/80">Итог</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};