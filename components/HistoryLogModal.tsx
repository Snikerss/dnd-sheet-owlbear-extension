import React from 'react';
import { LogEntry } from '../types';
import { useFocusTrap } from '../utils/useFocusTrap';

interface HistoryLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  log: LogEntry[];
}

export const HistoryLogModal: React.FC<HistoryLogModalProps> = ({ isOpen, onClose, log }) => {
  const modalRef = useFocusTrap<HTMLDivElement>(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-[var(--color-surface-translucent)] backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-labelledby="history-modal-title"
    >
      <div
        ref={modalRef}
        className="bg-[var(--color-surface-opaque)] rounded-xl shadow-2xl p-6 m-4 w-full max-w-lg border border-[var(--color-border)] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
            <h2 id="history-modal-title" className="text-2xl font-bold text-[var(--color-accent-primary)]">История изменений</h2>
            <button 
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--color-surface-raised)] text-[var(--color-text-medium)] hover:bg-[var(--color-surface-raised-hover)] hover:text-[var(--color-text-base)] transition-colors"
                aria-label="Закрыть"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
        
        <div className="flex-grow min-h-0 max-h-[60vh] overflow-y-auto pr-3 border-t border-[var(--color-border)]">
          {log.length > 0 ? (
            <ul className="divide-y divide-[var(--color-border-subtle)]">
              {log.map(entry => (
                <li key={entry.id} className="py-3">
                  <p className="text-sm text-[var(--color-text-base)]">{entry.description}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    {new Date(entry.timestamp).toLocaleString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-12 text-[var(--color-text-subtle)]">
              <p>История изменений пуста.</p>
              <p className="text-sm">Все ваши действия будут записаны здесь.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};