import { useEffect } from 'react';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

/**
 * Единственный источник правды для математики позиционирования тултипов
 * (план 7.3). Возвращает координаты в абсолютных (документных) координатах:
 * viewport-координаты getBoundingClientRect + текущая прокрутка страницы.
 *
 * Для неизвестной позиции возвращает { left: 0, top: 0 } — как в исходном
 * эффекте из App.tsx.
 */
export const computeTooltipPosition = (
  targetEl: HTMLElement,
  pos: string
): { left: number; top: number } => {
  const rect = targetEl.getBoundingClientRect();
  const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollY = window.pageYOffset || document.documentElement.scrollTop;

  let top = 0;
  let left = 0;

  if (pos === 'top') {
    left = rect.left + rect.width / 2 + scrollX;
    top = rect.top + scrollY;
  } else if (pos === 'bottom') {
    left = rect.left + rect.width / 2 + scrollX;
    top = rect.bottom + scrollY;
  } else if (pos === 'left') {
    left = rect.left + scrollX;
    top = rect.top + rect.height / 2 + scrollY;
  } else if (pos === 'right') {
    left = rect.right + scrollX;
    top = rect.top + rect.height / 2 + scrollY;
  }

  return { left, top };
};

/**
 * Глобальная система тултипов [data-tooltip] с вариантами позиций
 * top/bottom/left/right. Перенесена из App.tsx без изменений поведения:
 * пересчёт при scroll (capture) / resize, отключение на touch-устройствах,
 * force-reflow через offsetHeight перед показом.
 */
export const useGlobalTooltips = (): void => {
  useEffect(() => {
    const tooltipEl = document.createElement('div');
    tooltipEl.className = 'global-tooltip';
    document.body.appendChild(tooltipEl);

    let activeEl: HTMLElement | null = null;

    const handleMouseOver = (e: MouseEvent) => {
      // Disable mouse-over tooltips on touch screens to prevent phantom tooltips and layout shifts
      if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        return;
      }
      const target = e.target as HTMLElement;
      const tooltipTarget = target.closest('[data-tooltip]') as HTMLElement | null;

      if (!tooltipTarget) {
        if (activeEl) {
          tooltipEl.classList.remove('visible');
          activeEl = null;
        }
        return;
      }

      if (tooltipTarget === activeEl) return;
      activeEl = tooltipTarget;

      const text = tooltipTarget.getAttribute('data-tooltip');
      if (!text) {
        tooltipEl.classList.remove('visible');
        return;
      }

      const pos = tooltipTarget.getAttribute('data-tooltip-pos') || 'top';

      tooltipEl.textContent = text;
      tooltipEl.className = `global-tooltip global-tooltip-${pos}`;

      const { top, left } = computeTooltipPosition(tooltipTarget, pos);

      tooltipEl.style.left = `${left}px`;
      tooltipEl.style.top = `${top}px`;

      // Force reflow
      void tooltipEl.offsetHeight;
      tooltipEl.classList.add('visible');
    };

    const handleMouseOut = (e: MouseEvent) => {
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      if (activeEl && (!relatedTarget || !activeEl.contains(relatedTarget))) {
        tooltipEl.classList.remove('visible');
        activeEl = null;
      }
    };

    const handleScrollOrResize = () => {
      if (activeEl) {
        const pos = activeEl.getAttribute('data-tooltip-pos') || 'top';
        const { top, left } = computeTooltipPosition(activeEl, pos);

        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${top}px`;
      }
    };

    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      if (document.body.contains(tooltipEl)) {
        document.body.removeChild(tooltipEl);
      }
    };
  }, []);
};
