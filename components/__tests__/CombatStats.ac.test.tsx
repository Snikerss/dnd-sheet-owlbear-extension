// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { CombatStats } from '../CombatStats';
import { NotificationProvider } from '../../context/NotificationContext';
import { CharacterProvider } from '../../context/CharacterContext';
import type { CharacterAction } from '../../types';
import { makeTestCharacter } from '../../state/testFixtures';

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
    popover: {
      open: async () => ({}),
      close: async () => {},
    },
    viewport: { getWidth: async () => 1024 },
    action: { setWidth: () => {}, setHeight: () => {} },
  },
}));

vi.mock('../../utils/p2pBridge', () => ({
  p2pRoomBridge: {
    getActiveBoardCharacterId: () => 'x',
    subscribe: () => () => {},
    broadcast: () => {},
    registerWindow: () => {},
    connect: () => {},
    disconnect: () => {},
  },
}));

vi.mock('../../utils/bridgeService', () => ({
  localBridge: {
    subscribe: () => () => {},
    postMessage: () => {},
    isDuplicateMessage: () => false,
  },
}));

type CombatStatsProps = ComponentProps<typeof CombatStats>;

const noopDispatch: React.Dispatch<CharacterAction> = vi.fn();

const renderCombatStats = (
  characterId: string,
  overrides: Partial<CombatStatsProps> = {},
) => {
  const character = makeTestCharacter();
  const defaultProps: CombatStatsProps = {
    scores: character.scores,
    abilityBonuses: character.abilityBonuses,
    level: character.level,
    currentHitPoints: character.currentHitPoints,
    maxHitPoints: character.maxHitPoints,
    temporaryHitPoints: character.temporaryHitPoints,
    hitDie: character.hitDie,
    acBonus: character.acBonus,
    itemAcBonus: 0,
    initiativeBonus: character.initiativeBonus,
    itemInitiativeBonus: 0,
    proficiencyBonusBonus: character.proficiencyBonusBonus,
    itemProficiencyBonus: 0,
    maxHpBonus: character.maxHpBonus,
    itemMaxHpBonus: 0,
    baseAC: character.baseAC,
    acAbilitySources: character.acAbilitySources,
    onBonusChange: vi.fn(),
    onBaseACChange: vi.fn(),
    onToggleAbilitySource: vi.fn(),
  };

  const props: CombatStatsProps = {
    ...defaultProps,
    ...overrides,
  };

  return render(
    <NotificationProvider>
      <CharacterProvider character={character} characterId={characterId} dispatch={noopDispatch}>
        <CombatStats {...props} />
      </CharacterProvider>
    </NotificationProvider>
  );
};

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

afterEach(() => {
  cleanup();
});

describe('CombatStats — персонажная изоляция тактического AC', () => {
  it('щит пишется в персонажный ключ', () => {
    renderCombatStats('char-a');

    const shieldBtn = screen.getByTestId('ac-shield-toggle');
    fireEvent.click(shieldBtn);

    expect(localStorage.getItem('dnd_ac_shield_active_char-a')).toBe('true');
    expect(localStorage.getItem('dnd_ac_shield_active')).toBeNull();
  });

  it('состояние char-a не просачивается в char-b', () => {
    localStorage.setItem('dnd_ac_shield_active_char-a', 'true');

    renderCombatStats('char-b');

    // Ключ char-b не содержит 'true'
    expect(localStorage.getItem('dnd_ac_shield_active_char-b')).not.toBe('true');

    // Щит для char-b неактивен: в карточке КД итоговое значение базовое (10), бонус +2 отсутствует
    const acCard = screen.getByText('КД').closest('div')!;
    expect(within(acCard).getByText('10')).toBeTruthy();
    expect(within(acCard).queryByText('12')).toBeNull();
    expect(within(acCard).queryByText('+2')).toBeNull();
    expect(within(acCard).getByText('База 10')).toBeTruthy();

    // Кнопка щита находится в неактивном состоянии
    const shieldBtn = screen.getByTestId('ac-shield-toggle');
    expect(shieldBtn.className).not.toContain('bg-teal-500/20');
    expect(shieldBtn.getAttribute('data-tooltip')).toBe('Экипировать щит (+2 к КД)');
  });

  it('укрытие char-a не влияет на char-b', () => {
    localStorage.setItem('dnd_ac_cover_type_char-a', 'half');

    renderCombatStats('char-b');

    // Ключ char-b равен 'none', а ключ char-a сохранён
    expect(localStorage.getItem('dnd_ac_cover_type_char-b')).toBe('none');
    expect(localStorage.getItem('dnd_ac_cover_type_char-a')).toBe('half');

    // Итоговый AC в карточке остаётся базовым (10), бонус +2 укрытия отсутствует
    const acCard = screen.getByText('КД').closest('div')!;
    expect(within(acCard).getByText('10')).toBeTruthy();
    expect(within(acCard).queryByText('12')).toBeNull();
    expect(within(acCard).queryByText('+2')).toBeNull();
    expect(within(acCard).getByText('База 10')).toBeTruthy();

    // Кнопка укрытия находится в неактивном визуальном состоянии: бонус +2 на кнопке отсутствует
    const coverBtn = screen.getByTestId('ac-cover-toggle');
    expect(coverBtn.className).not.toContain('bg-purple-500/20');
    expect(coverBtn.getAttribute('data-tooltip')).toBe('Укрытие: нет (клик для смены)');
    expect(within(coverBtn).queryByText('+2')).toBeNull();
  });
});
