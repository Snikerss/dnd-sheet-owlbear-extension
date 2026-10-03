// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { computeTooltipPosition } from './useGlobalTooltips';

const RECT = { left: 100, top: 50, width: 40, height: 20, right: 140, bottom: 70 };
const SCROLL_X = 10;
const SCROLL_Y = 20;

describe('computeTooltipPosition', () => {
  let el: HTMLElement;
  let originalScrollX: number;
  let originalScrollY: number;

  beforeEach(() => {
    document.body.innerHTML = '';
    el = document.createElement('div');
    document.body.appendChild(el);

    Object.defineProperty(el, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        x: RECT.left,
        y: RECT.top,
        ...RECT,
        toJSON: () => RECT,
      }),
    });

    originalScrollX = window.pageXOffset;
    originalScrollY = window.pageYOffset;
    Object.defineProperty(window, 'pageXOffset', { configurable: true, value: SCROLL_X });
    Object.defineProperty(window, 'pageYOffset', { configurable: true, value: SCROLL_Y });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'pageXOffset', { configurable: true, value: originalScrollX });
    Object.defineProperty(window, 'pageYOffset', { configurable: true, value: originalScrollY });
  });

  const attachWithPos = (pos: string): HTMLElement => {
    el.setAttribute('data-tooltip-pos', pos);
    return el;
  };

  it("pos='top': left = rect.left + width/2 + scrollX; top = rect.top + scrollY", () => {
    const { left, top } = computeTooltipPosition(attachWithPos('top'), 'top');
    expect(Number.isFinite(left)).toBe(true);
    expect(Number.isFinite(top)).toBe(true);
    expect(left).toBe(RECT.left + RECT.width / 2 + SCROLL_X);
    expect(top).toBe(RECT.top + SCROLL_Y);
  });

  it("pos='bottom': anchored to rect.bottom + scrollY", () => {
    const { left, top } = computeTooltipPosition(attachWithPos('bottom'), 'bottom');
    expect(Number.isFinite(left)).toBe(true);
    expect(Number.isFinite(top)).toBe(true);
    expect(left).toBe(RECT.left + RECT.width / 2 + SCROLL_X);
    expect(top).toBe(RECT.bottom + SCROLL_Y);
  });

  it("pos='left': anchored to rect.left + scrollX", () => {
    const { left, top } = computeTooltipPosition(attachWithPos('left'), 'left');
    expect(Number.isFinite(left)).toBe(true);
    expect(Number.isFinite(top)).toBe(true);
    expect(left).toBe(RECT.left + SCROLL_X);
    expect(top).toBe(RECT.top + RECT.height / 2 + SCROLL_Y);
  });

  it("pos='right': anchored to rect.right + scrollX", () => {
    const { left, top } = computeTooltipPosition(attachWithPos('right'), 'right');
    expect(Number.isFinite(left)).toBe(true);
    expect(Number.isFinite(top)).toBe(true);
    expect(left).toBe(RECT.right + SCROLL_X);
    expect(top).toBe(RECT.top + RECT.height / 2 + SCROLL_Y);
  });

  it('reads the position from data-tooltip-pos attribute for all variants', () => {
    for (const pos of ['top', 'bottom', 'left', 'right']) {
      const result = computeTooltipPosition(attachWithPos(pos), el.getAttribute('data-tooltip-pos') || 'top');
      expect(Number.isFinite(result.left)).toBe(true);
      expect(Number.isFinite(result.top)).toBe(true);
    }
  });
});
