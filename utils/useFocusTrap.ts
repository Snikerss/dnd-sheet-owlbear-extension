import { useEffect, useRef } from 'react';

/**
 * Хук для создания "ловушки фокуса" внутри элемента (например, модального окна).
 * Он предотвращает выход фокуса за пределы компонента при навигации с помощью Tab,
 * позволяет закрыть компонент по клавише Escape и возвращает фокус на предыдущий элемент при закрытии.
 * @param isOpen - Состояние, показывающее, активна ли ловушка.
 * @param onClose - Функция обратного вызова для закрытия компонента.
 * @returns React ref, который должен быть прикреплен к корневому элементу модального окна.
 */
export const useFocusTrap = <T extends HTMLElement>(isOpen: boolean, onClose: () => void) => {
    const ref = useRef<T>(null);

    useEffect(() => {
        if (!isOpen || !ref.current) return;

        const modalElement = ref.current;
        // Находим все интерактивные элементы внутри модального окна
        const focusableElements = modalElement.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0]!;
        const lastElement = focusableElements[focusableElements.length - 1]!;
        
        // Сохраняем элемент, который был в фокусе до открытия модального окна
        const previouslyFocusedElement = document.activeElement as HTMLElement;

        // Устанавливаем фокус на первый интерактивный элемент при открытии
        firstElement.focus();

        const handleKeyDown = (e: KeyboardEvent) => {
            // Закрываем по Escape
            if (e.key === 'Escape') {
                onClose();
            }

            // Логика переключения по Tab
            if (e.key === 'Tab') {
                if (e.shiftKey) { // Shift + Tab (назад)
                    if (document.activeElement === firstElement) {
                        e.preventDefault();
                        lastElement.focus(); // Переводим фокус на последний элемент
                    }
                } else { // Tab (вперед)
                    if (document.activeElement === lastElement) {
                        e.preventDefault();
                        firstElement.focus(); // Переводим фокус на первый элемент
                    }
                }
            }
        };

        modalElement.addEventListener('keydown', handleKeyDown);

        // Функция очистки эффекта
        return () => {
            modalElement.removeEventListener('keydown', handleKeyDown);
            // Возвращаем фокус на элемент, который был активен до открытия окна
            previouslyFocusedElement?.focus();
        };
    }, [isOpen, onClose]);

    return ref;
};