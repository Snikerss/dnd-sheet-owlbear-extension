import React from 'react';
import { useFocusTrap } from '../utils/useFocusTrap';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Подтвердить',
  cancelText = 'Отмена',
}) => {
  const modalRef = useFocusTrap<HTMLDivElement>(isOpen, onCancel);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-[var(--color-surface-translucent)] backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
      onClick={onCancel}
      aria-modal="true"
      role="dialog"
      aria-labelledby="confirmation-modal-title"
    >
      <div
        ref={modalRef}
        className="bg-[var(--color-surface-opaque)] rounded-xl shadow-2xl p-6 m-4 w-full max-w-md border border-[var(--color-border)]"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="confirmation-modal-title" className="text-2xl font-bold text-[var(--color-accent-tertiary)] mb-4">{title}</h2>
        <p className="text-[var(--color-text-medium)] mb-6 whitespace-pre-wrap">{message}</p>
        <div className="flex flex-col sm:flex-row-reverse gap-3">
          <button
            onClick={onConfirm}
            className="w-full sm:w-auto justify-center rounded-lg border border-transparent shadow-md px-4 py-2 bg-[var(--color-health)] text-base font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-[var(--color-surface-opaque)] transition-all duration-150 active:scale-95"
          >
            {confirmText}
          </button>
          <button
            onClick={onCancel}
            className="w-full sm:w-auto justify-center rounded-lg border border-[var(--color-border-subtle)] shadow-sm px-4 py-2 bg-transparent text-base font-medium text-[var(--color-text-medium)] hover:bg-[var(--color-surface-raised)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] sm:mt-0"
          >
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  );
};