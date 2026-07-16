import React from 'react';

interface RollContextMenuProps {
  x: number;
  y: number;
  onRollAdvantage: () => void;
  onRollDisadvantage: () => void;
  onClose: () => void;
}

export const RollContextMenu: React.FC<RollContextMenuProps> = ({ x, y, onRollAdvantage, onRollDisadvantage, onClose }) => {
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        className="absolute bg-[var(--color-surface-raised)] rounded-lg shadow-xl border border-[var(--color-border)] py-1 animate-fade-in"
        style={{ top: y, left: x }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onRollAdvantage}
          className="w-full text-left px-4 py-2 text-sm text-[var(--color-text-base)] hover:bg-[var(--color-surface-raised-hover)]"
        >
          С преимуществом
        </button>
        <button
          onClick={onRollDisadvantage}
          className="w-full text-left px-4 py-2 text-sm text-[var(--color-text-base)] hover:bg-[var(--color-surface-raised-hover)]"
        >
          С помехой
        </button>
      </div>
    </div>
  );
};
