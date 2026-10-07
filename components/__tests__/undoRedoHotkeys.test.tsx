// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../../App';
import { makeTestCharacter } from '../../state/testFixtures';
import type { CharacterEntry } from '../../state/appReducer';

const mockUndo = vi.fn();
const mockRedo = vi.fn();

let mockCharactersState: Record<string, CharacterEntry> = {};

vi.mock('../../state/useCharacterManager', () => ({
  useCharacterManager: () => ({
    characters: mockCharactersState,
    isLoading: false,
    syncStatus: 'synced',
    syncingCharacters: {},
    addCharacter: vi.fn(),
    deleteCharacter: vi.fn(),
    updateCharacter: vi.fn(),
    undo: mockUndo,
    redo: mockRedo,
    syncCharacter: vi.fn(),
    clearLocalCache: vi.fn(),
    exportVaultData: vi.fn(),
    importVaultData: vi.fn(),
  }),
}));

vi.mock('@owlbear-rodeo/sdk', () => ({
  default: {
    player: { id: 'p1', getName: async () => 'Игрок', getRole: async () => 'PLAYER' },
    isReady: true,
    onReady: (cb: () => void) => cb(),
    broadcast: {
      sendMessage: async () => {},
      onMessage: () => () => {},
    },
    popover: { open: async () => ({}), close: async () => {} },
    viewport: { getWidth: async () => 1024 },
    action: { setWidth: () => {}, setHeight: () => {} },
  },
}));

vi.mock('../../utils/environment', () => ({
  isOwlbear: () => false,
  SAME_ORIGIN: 'http://localhost',
  OWLBEAR_ORIGINS: [],
  isTrustedMessageOrigin: () => true,
  getOwlbearParentOrigin: () => 'http://localhost',
}));

vi.mock('../../utils/storage', () => ({
  isOwlbear: () => false,
  SESSION_CLIENT_ID: 'test-client',
  saveCharacterApi: vi.fn(async () => {}),
  deleteCharacterApi: vi.fn(async () => {}),
  broadcastCharacterSync: vi.fn(async () => {}),
  purgeLocalCharacter: vi.fn(),
  loadFromLocalStorage: () => ({}),
}));

vi.mock('../../utils/bridgeService', () => ({
  localBridge: {
    postMessage: vi.fn(),
    subscribe: () => () => {},
    isDuplicateMessage: () => false,
    reconnectStandaloneWindows: vi.fn(),
    registerChildWindow: vi.fn(),
  },
  SESSION_CLIENT_ID: 'test-client',
}));

vi.mock('../../utils/p2pBridge', () => ({
  p2pRoomBridge: {
    subscribe: () => () => {},
    broadcast: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    getActiveBoardCharacterId: () => null,
    setActiveBoardCharacter: vi.fn(),
  },
}));

vi.mock('../../hooks/useGlobalTooltips', () => ({
  useGlobalTooltips: vi.fn(),
}));

vi.mock('../CharacterSelectionScreen', () => ({
  CharacterSelectionScreen: (props: { onSelectCharacter: (id: string) => void }) => (
    <div data-testid="selection-screen">
      <button data-testid="select-c1" onClick={() => props.onSelectCharacter('c1')}>
        Выбрать c1
      </button>
    </div>
  ),
}));

vi.mock('../CharacterSheet', () => ({
  CharacterSheet: (props: { onOpenCharacterManager: () => void }) => (
    <div data-testid="character-sheet">
      <button data-testid="close-sheet" onClick={props.onOpenCharacterManager}>
        Закрыть лист
      </button>
      <input data-testid="test-input" />
      <textarea data-testid="test-textarea" />
      <select data-testid="test-select">
        <option value="1">Опция</option>
      </select>
      <div data-testid="test-contenteditable" contentEditable={true}>
        <span data-testid="child-contenteditable">Редактируемый спан</span>
      </div>
      <div data-testid="plain-div">Обычный див</div>
    </div>
  ),
}));

describe('App — Undo / Redo Hotkeys (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('com.antigravity.dnd-sheet/player_id', 'p1');
    mockCharactersState = {
      c1: {
        history: {
          past: [],
          present: makeTestCharacter({ name: 'Герой', ownerId: 'p1' }),
          future: [],
        },
        log: [],
        imageCache: new Map(),
      },
    };
  });

  it('1. Лист закрыт (activeCharacterId == null) → хоткеи не вызывают undo/redo', () => {
    render(<App />);

    expect(screen.getByTestId('selection-screen')).toBeDefined();

    // Нажатие Ctrl+Z на окне
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(mockUndo).not.toHaveBeenCalled();

    // Нажатие Ctrl+Y на окне
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    expect(mockRedo).not.toHaveBeenCalled();

    // Нажатие Ctrl+Shift+Z на окне
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(mockRedo).not.toHaveBeenCalled();
  });

  it('2. Лист открыт: Ctrl+Z на обычном элементе / body → handleUndo вызван', () => {
    render(<App />);

    // Открываем лист
    fireEvent.click(screen.getByTestId('select-c1'));
    expect(screen.getByTestId('character-sheet')).toBeDefined();

    // Ctrl+Z на обычном элементе
    const plainDiv = screen.getByTestId('plain-div');
    fireEvent.keyDown(plainDiv, { key: 'z', ctrlKey: true });

    expect(mockUndo).toHaveBeenCalledTimes(1);
    expect(mockUndo).toHaveBeenCalledWith('c1');
  });

  it('3. Лист открыт: Ctrl+Z с фокусом в input / textarea / select / [contenteditable] → handleUndo НЕ вызван (DOM undo защищён)', () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('select-c1'));

    const input = screen.getByTestId('test-input');
    const textarea = screen.getByTestId('test-textarea');
    const select = screen.getByTestId('test-select');
    const contentEditable = screen.getByTestId('test-contenteditable');
    const childEditable = screen.getByTestId('child-contenteditable');

    // 1. input
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
    expect(mockUndo).not.toHaveBeenCalled();

    // 2. textarea
    fireEvent.keyDown(textarea, { key: 'z', ctrlKey: true });
    expect(mockUndo).not.toHaveBeenCalled();

    // 3. select
    fireEvent.keyDown(select, { key: 'z', ctrlKey: true });
    expect(mockUndo).not.toHaveBeenCalled();

    // 4. contenteditable div
    fireEvent.keyDown(contentEditable, { key: 'z', ctrlKey: true });
    expect(mockUndo).not.toHaveBeenCalled();

    // 5. child inside contenteditable
    fireEvent.keyDown(childEditable, { key: 'z', ctrlKey: true });
    expect(mockUndo).not.toHaveBeenCalled();
  });

  it('4. Лист открыт: Ctrl+Y и Ctrl+Shift+Z → handleRedo вызван', () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('select-c1'));

    // Ctrl+Y
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    expect(mockRedo).toHaveBeenCalledTimes(1);
    expect(mockRedo).toHaveBeenCalledWith('c1');

    mockRedo.mockClear();

    // Ctrl+Shift+Z
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(mockRedo).toHaveBeenCalledTimes(1);
    expect(mockRedo).toHaveBeenCalledWith('c1');

    // Ctrl+Shift+Z (uppercase key 'Z')
    mockRedo.mockClear();
    fireEvent.keyDown(window, { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(mockRedo).toHaveBeenCalledTimes(1);
    expect(mockRedo).toHaveBeenCalledWith('c1');
  });

  it('5. Закрытие листа → слушатель снимается, хоткеи перестают работать', () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('select-c1'));
    expect(screen.getByTestId('character-sheet')).toBeDefined();

    // Закрываем лист
    fireEvent.click(screen.getByTestId('close-sheet'));
    expect(screen.getByTestId('selection-screen')).toBeDefined();

    // Ctrl+Z / Ctrl+Y больше не вызывают undo/redo
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });

    expect(mockUndo).not.toHaveBeenCalled();
    expect(mockRedo).not.toHaveBeenCalled();
  });

  it('6. Read-only персонаж → handleUndo и handleRedo блокируются гейтом', () => {
    // Владелец p2, текущий игрок p1, не GM -> read-only
    mockCharactersState = {
      c1: {
        history: {
          past: [],
          present: makeTestCharacter({ name: 'Чужой', ownerId: 'p2' }),
          future: [],
        },
        log: [],
        imageCache: new Map(),
      },
    };

    render(<App />);

    fireEvent.click(screen.getByTestId('select-c1'));

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });

    expect(mockUndo).not.toHaveBeenCalled();
    expect(mockRedo).not.toHaveBeenCalled();
  });
});
