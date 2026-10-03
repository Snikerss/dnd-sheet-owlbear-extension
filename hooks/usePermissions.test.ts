import { describe, it, expect } from 'vitest';
import { computePermissions } from './usePermissions';
import { makeTestCharacter } from '../state/testFixtures';

const charOwned = (ownerId?: string, ownerName?: string) => {
    const c = makeTestCharacter();
    c.ownerId = ownerId;
    c.ownerName = ownerName;
    return c;
};

describe('computePermissions — политика плана 3.4 (ГМ правит свои листы)', () => {
    it('ГМ: ЧУЖОЙ лист read-only, canManage=true', () => {
        const perms = computePermissions(charOwned('player-1', 'Алиса'), { role: 'GM', userId: 'gm-1', userName: 'Мастер' });
        expect(perms.isReadOnly).toBe(true);
        expect(perms.canEdit).toBe(false);
        expect(perms.canManage).toBe(true);
    });

    it('ПЛАН 3.4: ГМ редактирует СОБСТВЕННЫЙ лист (ownerId === GM id)', () => {
        const perms = computePermissions(charOwned('gm-1', 'Мастер'), { role: 'GM', userId: 'gm-1', userName: 'Мастер' });
        expect(perms.isReadOnly).toBe(false);
        expect(perms.canEdit).toBe(true);
        expect(perms.canManage).toBe(true);
    });

    it('ГМ: ничейный лист — только просмотр (владелец не определён)', () => {
        const perms = computePermissions(charOwned(undefined), { role: 'GM', userId: 'gm-1' });
        expect(perms.isReadOnly).toBe(true);
        expect(perms.canManage).toBe(true);
    });

    it('игрок редактирует СВОЙ лист по id и может управлять', () => {
        const perms = computePermissions(charOwned('player-1'), { role: 'PLAYER', userId: 'player-1' });
        expect(perms).toEqual({ isReadOnly: false, canEdit: true, canManage: true });
    });

    it('легаси-fallback по имени: совпало имя → свой лист', () => {
        const perms = computePermissions(charOwned('legacy-id', 'Алиса'), { role: 'PLAYER', userId: 'new-id', userName: 'Алиса' });
        expect(perms.isReadOnly).toBe(false);
        expect(perms.canManage).toBe(true);
    });

    it('чужой лист: read-only и не управляем', () => {
        const perms = computePermissions(charOwned('player-2'), { role: 'PLAYER', userId: 'player-1' });
        expect(perms).toEqual({ isReadOnly: true, canEdit: false, canManage: false });
    });

    it('ничейный лист: редактируем и управляем любым игроком', () => {
        const perms = computePermissions(charOwned(undefined), { role: 'PLAYER', userId: 'player-9' });
        expect(perms).toEqual({ isReadOnly: false, canEdit: true, canManage: true });
    });

    it('дыра легаси-фолбэка сохранена намеренно: пустой userId → canManage=true (бит-в-бит со старой карточкой)', () => {
        // Старая формула: !currentUserId → true. Фиксировать поведение как есть.
        const perms = computePermissions(charOwned('player-2'), { role: 'PLAYER', userId: '', userName: 'Кто-то' });
        expect(perms.canManage).toBe(true);
        // Но правка чужого по-прежнему запрещена (checkIsReadOnly не имел этого фолбэка)
        expect(perms.isReadOnly).toBe(true);
    });

    it('нет персонажа: можно править (нечему), нельзя управлять', () => {
        expect(computePermissions(null, { role: 'PLAYER', userId: 'p' })).toEqual({
            isReadOnly: false,
            canEdit: true,
            canManage: false,
        });
    });

    it('роль ещё не определена (null): ведёт себя как игрок', () => {
        const own = computePermissions(charOwned('p1'), { role: null, userId: 'p1' });
        expect(own.canEdit).toBe(true);
        const foreign = computePermissions(charOwned('p2'), { role: null, userId: 'p1' });
        expect(foreign.isReadOnly).toBe(true);
    });
});
