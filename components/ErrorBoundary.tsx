import React from 'react';
import { logger } from '../utils/logger';

interface ErrorBoundaryProps {
    children: React.ReactNode;
    /** 'page' — фуллскрин-заглушка (корень приложения); 'inline' — компактный оверлей для ленивых модалок. */
    variant?: 'page' | 'inline';
}

interface ErrorBoundaryState {
    hasError: boolean;
    errorMessage: string | null;
}

/**
 * Глобальный предохранитель React (архитектурный аудит: ErrorBoundary отсутствовал,
 * любая ошибка рендера убивала всё приложение без шанса на восстановление).
 *
 * Стратегия: изолированный fallback с возможностью перезагрузки; данные персонажей
 * при этом не страдают — сохранение идёт мимо React (storage/sync-слой).
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { hasError: false, errorMessage: null };

    static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
        return {
            hasError: true,
            errorMessage: error instanceof Error ? error.message : String(error),
        };
    }

    componentDidCatch(error: unknown, info: React.ErrorInfo): void {
        logger.error('Unhandled render error:', error, info.componentStack);
    }

    private handleReload = (): void => {
        window.location.reload();
    };

    render(): React.ReactNode {
        if (!this.state.hasError) return this.props.children;

        if (this.props.variant === 'inline') {
            return (
                <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="max-w-sm w-full bg-[var(--color-surface-opaque)] border border-red-500/40 rounded-xl shadow-2xl p-5 text-center space-y-3">
                        <div className="text-3xl">⚠️</div>
                        <h2 className="text-sm font-bold text-[var(--color-text-base)]">
                            Не удалось открыть окно
                        </h2>
                        <p className="text-[11px] text-[var(--color-text-muted)] break-words">
                            {this.state.errorMessage || 'Ошибка загрузки модуля'}
                        </p>
                        <p className="text-[11px] text-[var(--color-text-medium)]">
                            Данные персонажей не пострадали. Попробуйте ещё раз или перезагрузите приложение.
                        </p>
                        <button
                            type="button"
                            onClick={this.handleReload}
                            className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-lg shadow transition-all"
                        >
                            🔄 Перезагрузить приложение
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center p-6">
                <div className="max-w-md w-full bg-[var(--color-surface-opaque)] border border-red-500/40 rounded-xl shadow-2xl p-6 text-center space-y-4">
                    <div className="text-4xl">🛡️</div>
                    <h1 className="text-lg font-bold text-[var(--color-text-base)]">
                        Что-то пошло не так при отрисовке
                    </h1>
                    <p className="text-xs text-[var(--color-text-medium)] break-words">
                        {this.state.errorMessage || 'Неизвестная ошибка'}
                    </p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">
                        Данные персонажей сохранены локально и не пострадали.
                    </p>
                    <button
                        type="button"
                        onClick={this.handleReload}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-sm rounded-xl shadow transition-all"
                    >
                        🔄 Перезагрузить приложение
                    </button>
                </div>
            </div>
        );
    }
}
