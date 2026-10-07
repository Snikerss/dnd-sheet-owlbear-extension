// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveRole, getCachedRole, resolveSenderIdentity } from './roleService';
import * as env from '../utils/environment';
import OBR from '@owlbear-rodeo/sdk';

describe('RoleService - URL userRole override vs OBR room state', () => {
  const originalLocation = window.location.href;

  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    window.history.replaceState({}, '', originalLocation);
  });

  it('в standalone-режиме (без OBR) принимает userRole=GM из URL параметров', async () => {
    vi.spyOn(env, 'isOwlbear').mockReturnValue(false);
    window.history.replaceState({}, '', '/?userRole=GM');

    const role = await resolveRole();
    expect(role).toBe('GM');
    expect(getCachedRole()).toBe('GM');
  });

  it('в standalone-режиме по умолчанию возвращает PLAYER при отсутствии параметра', async () => {
    vi.spyOn(env, 'isOwlbear').mockReturnValue(false);
    window.history.replaceState({}, '', '/?userRole=INVALID');

    const role = await resolveRole();
    expect(role).toBe('PLAYER');
    expect(getCachedRole()).toBe('PLAYER');
  });

  it('в режиме Owlbear ИГНОРИРУЕТ userRole=GM из URL и берёт роль строго из OBR.player.getRole', async () => {
    vi.spyOn(env, 'isOwlbear').mockReturnValue(true);
    // Злоумышленник передал ?userRole=GM во фрейм
    window.history.replaceState({}, '', '/?userRole=GM');

    // Но OBR возвращает PLAYER
    vi.spyOn(OBR.player, 'getRole').mockResolvedValue('PLAYER');

    const role = await resolveRole();
    expect(role).toBe('PLAYER');
    expect(getCachedRole()).toBe('PLAYER');
    expect(OBR.player.getRole).toHaveBeenCalled();
  });

  it('resolveSenderIdentity в standalone возвращает role=PLAYER и isTrusted=false', async () => {
    vi.spyOn(env, 'isOwlbear').mockReturnValue(false);

    const identity = await resolveSenderIdentity('conn-123', 'player-fake');
    expect(identity.role).toBe('PLAYER');
    expect(identity.isTrusted).toBe(false);
  });
});
