import React, { useEffect } from 'react';

export type NotificationType = 'error' | 'warning' | 'info' | 'success';

interface NotificationToastProps {
  message: string;
  type: NotificationType;
  onClose: () => void;
}

const ICONS: Record<NotificationType, React.ReactElement> = {
  error: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  warning: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  info: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  success: (
     <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const BORDER_COLORS: Record<NotificationType, string> = {
  error: 'border-[var(--color-critical-failure)]',
  warning: 'border-[var(--color-accent-secondary)]',
  info: 'border-[var(--color-info)]',
  success: 'border-[var(--color-critical-success)]',
};

const TEXT_COLORS: Record<NotificationType, string> = {
  error: 'text-[var(--color-critical-failure)]',
  warning: 'text-[var(--color-accent-secondary)]',
  info: 'text-[var(--color-info)]',
  success: 'text-[var(--color-critical-success)]',
};

export const NotificationToast: React.FC<NotificationToastProps> = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000); // 5 seconds
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`bg-[var(--color-surface-opaque)] rounded-lg shadow-2xl p-4 w-full max-w-sm border-2 ${BORDER_COLORS[type]} animate-fade-in`}
      role="alert"
    >
      <div className="flex items-start">
        <div className={`flex-shrink-0 ${TEXT_COLORS[type]}`}>{ICONS[type]}</div>
        <div className="ml-3 flex-1 pt-0.5">
          <p className="text-sm font-medium text-[var(--color-text-base)]">{message}</p>
        </div>
        <div className="ml-4 flex-shrink-0 flex">
          <button
            onClick={onClose}
            className="rounded-md inline-flex text-[var(--color-text-muted)] hover:text-[var(--color-text-base)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-[var(--color-surface-opaque)]"
          >
            <span className="sr-only">Закрыть</span>
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};