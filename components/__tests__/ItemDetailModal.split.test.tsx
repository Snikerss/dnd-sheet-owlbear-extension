// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ItemDetailModal } from '../ItemDetailModal';
import { NotificationProvider } from '../../context/NotificationContext';
import { makeTestCharacter } from '../../state/testFixtures';
import { Currency, Rarity, type InventoryItem } from '../../types';

vi.mock('@owlbear-rodeo/sdk', () => ({
  default: {
    player: {
      id: 'p1',
      getName: async () => 'Тест',
      getRole: async () => 'PLAYER',
    },
    isReady: true,
    onReady: (cb: () => void) => cb(),
    broadcast: {
      sendMessage: async () => {},
      onMessage: (_channel: string, _cb?: unknown) => () => {},
    },
  },
}));

// Gemini не должен ходить в сеть из тестов
vi.mock('../../utils/gemini', () => ({
  generateWithGemini: vi.fn(async () => '{}'),
  getGeminiApiKey: () => '',
  setGeminiApiKey: vi.fn(),
  hasGeminiApiKey: () => false,
}));

const makeTestItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: 'i1',
  name: 'Меч-тест',
  description: '',
  quantity: 2,
  imageUrl: '',
  weight: 3,
  cost: { amount: 10, currency: Currency.GP },
  rarity: Rarity.Common,
  ...overrides,
});

const renderModal = (
  overrides: { item?: InventoryItem | null; isOpen?: boolean } = {},
) => {
  const props = {
    character: makeTestCharacter({ name: 'Барток' }),
    isOpen: true,
    onClose: vi.fn(),
    onSave: vi.fn(),
    onDelete: vi.fn(),
    item: null as InventoryItem | null,
    customIcons: [] as string[],
    onAddCustomIcon: vi.fn(),
    onDeleteCustomIcon: vi.fn(),
    ...overrides,
  };
  const utils = render(
    <NotificationProvider>
      <ItemDetailModal {...props} />
    </NotificationProvider>
  );
  return { ...utils, props };
};

afterEach(() => {
  cleanup();
});

describe('ItemDetailModal (smoke after split)', () => {
  it('рендерит поля формы и кнопки секций по простому предмету', () => {
    renderModal({ item: makeTestItem() });

    expect(screen.getByDisplayValue('Меч-тест')).toBeTruthy();
    expect(screen.getByDisplayValue('2')).toBeTruthy(); // количество
    // Кнопки/переключатели секций
    expect(screen.getByText('🔮 Импорт из API / Google AI (Gemini)')).toBeTruthy();
    expect(screen.getByText('Выбрать иконку...')).toBeTruthy();
    expect(screen.getByLabelText('Имеет заряды')).toBeTruthy();
    expect(screen.getByLabelText('Сделать сундуком')).toBeTruthy();
    expect(screen.getByLabelText('Сделать расходником')).toBeTruthy();
  });

  it('изменение количества попадает в onSave при сохранении', () => {
    const { props } = renderModal({ item: makeTestItem() });

    fireEvent.change(screen.getByLabelText('Количество'), { target: { value: '5' } });
    fireEvent.click(screen.getByText('Сохранить'));

    expect(props.onSave).toHaveBeenCalledTimes(1);
    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'i1', name: 'Меч-тест', quantity: 5 })
    );
  });

  it('включение «Имеет заряды» раскрывает редактор зарядов с дефолтом 1', () => {
    renderModal({ item: makeTestItem() });

    expect(screen.queryByLabelText('Максимум зарядов')).toBeNull();
    fireEvent.click(screen.getByLabelText('Имеет заряды'));

    const totalInput = screen.getByLabelText('Максимум зарядов') as HTMLInputElement;
    expect(totalInput.value).toBe('1');
    expect((screen.getByLabelText('Текущие заряды') as HTMLInputElement).value).toBe('1');
  });
});
