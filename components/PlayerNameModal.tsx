import React, { useState, useEffect } from 'react';

interface PlayerNameModalProps {
  isOpen: boolean;
  initialName?: string;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
}

export const PlayerNameModal: React.FC<PlayerNameModalProps> = ({
  isOpen,
  initialName = '',
  onConfirm,
  onCancel,
}) => {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    setName(initialName);
  }, [initialName, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onConfirm(name.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-[var(--color-surface-opaque)] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-teal-950/80 px-6 py-4 border-b border-emerald-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">👤</span>
            <h3 className="text-lg font-bold text-emerald-300 drop-shadow">
              Имя Игрока
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-white transition-colors text-lg p-1"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <p className="text-xs text-[var(--color-text-medium)] leading-relaxed">
            Укажите ваше имя игрока. Оно будет показываться на карточках персонажей в хранилище и отображаться у ГМа на VTT-карте Owlbear.
          </p>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
              <span>Имя или Никнейм</span>
              <span className="text-emerald-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Алексей, Леголас, Player 1..."
              autoFocus
              maxLength={32}
              className="w-full px-4 py-2.5 bg-[var(--color-surface-well)] border border-slate-700 focus:border-emerald-500 rounded-xl text-sm text-[var(--color-text-base)] placeholder-slate-500 focus:outline-none transition-all shadow-inner"
            />
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-[var(--color-border-subtle)]">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-[var(--color-surface-well)] hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition-all"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
