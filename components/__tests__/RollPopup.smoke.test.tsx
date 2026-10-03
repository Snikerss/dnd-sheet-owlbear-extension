// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { RollPopup } from '../RollPopup';

vi.mock('@owlbear-rodeo/sdk', () => ({
  default: {
    popover: {
      open: async () => ({}),
      close: async () => {},
    },
  },
}));

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

const setQuery = (query: string) => {
  window.history.replaceState(null, '', query);
};

describe('RollPopup (smoke)', () => {
  it('отображает игрока, персонажа и итог броска из query-параметров', () => {
    setQuery('?mode=roll-popup&playerName=Алиса&characterName=Маг&rollName=d20&total=17&rollDetails=кубик:+7');
    render(<RollPopup />);
    expect(screen.getByText('Алиса')).toBeTruthy();
    expect(screen.getByText('Маг')).toBeTruthy();
    expect(screen.getByText('17')).toBeTruthy();
  });

  it('битые параметры не ломают рендер — итог по умолчанию 0', () => {
    setQuery('?total=abc');
    render(<RollPopup />);
    expect(screen.getByText('0')).toBeTruthy();
  });
});
