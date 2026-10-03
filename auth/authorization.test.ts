import { describe, it, expect } from 'vitest';
import { isAuthorizedDelete, isAuthorizedUpdate, AuthorizationContext } from './authorization';

const base: AuthorizationContext = {
  targetOwnerId: undefined,
  incomingOwnerId: undefined,
  senderPlayerId: 'player-1',
  recipientIsGM: false,
  recipientPlayerId: 'player-1',
};

describe('isAuthorizedDelete', () => {
  it('ГМ может удалять любой персонаж', () => {
    expect(isAuthorizedDelete({
      ...base,
      recipientIsGM: true,
      targetOwnerId: 'someone-else',
      senderPlayerId: '',
    })).toBe(true);
  });

  it('владелец может удалить своего персонажа', () => {
    expect(isAuthorizedDelete({
      ...base,
      targetOwnerId: 'player-1',
      senderPlayerId: 'player-1',
    })).toBe(true);
  });

  it('чужой лист игрок удалить не может', () => {
    expect(isAuthorizedDelete({
      ...base,
      targetOwnerId: 'player-2',
      senderPlayerId: 'player-1',
    })).toBe(false);
  });

  it('дыра #7a закрыта: пустой senderPlayerId не проходит проверку', () => {
    expect(isAuthorizedDelete({
      ...base,
      targetOwnerId: 'player-2',
      senderPlayerId: '',
    })).toBe(false);
  });

  it('ничейный персонаж можно удалить любому (зачистка мусора)', () => {
    expect(isAuthorizedDelete({
      ...base,
      targetOwnerId: undefined,
      senderPlayerId: 'player-9',
    })).toBe(true);
  });

  it('отправитель-владелец, но получатель — другой игрок: отказ', () => {
    expect(isAuthorizedDelete({
      ...base,
      recipientPlayerId: 'player-3',
      targetOwnerId: 'player-1',
      senderPlayerId: 'player-1',
    })).toBe(false);
  });
});

describe('isAuthorizedUpdate', () => {
  it('ГМ принимает любые обновления', () => {
    expect(isAuthorizedUpdate({
      ...base,
      recipientIsGM: true,
      targetOwnerId: 'player-2',
      senderPlayerId: 'player-2',
    })).toBe(true);
  });

  it('игрок принимает обновление СВОЕГО листа от себя', () => {
    expect(isAuthorizedUpdate({
      ...base,
      targetOwnerId: 'player-1',
      senderPlayerId: 'player-1',
    })).toBe(true);
  });

  it('игрок НЕ принимает чужой лист (проверка получателя)', () => {
    expect(isAuthorizedUpdate({
      ...base,
      targetOwnerId: 'player-2',
      senderPlayerId: 'player-2',
    })).toBe(false);
  });

  it('дыра #7a закрыта: владелец указан, но senderPlayerId пуст → отказ', () => {
    expect(isAuthorizedUpdate({
      ...base,
      targetOwnerId: 'player-1',
      senderPlayerId: '',
    })).toBe(false);
  });

  it('спуфинг: отправитель не совпадает с владельцем → отказ', () => {
    expect(isAuthorizedUpdate({
      ...base,
      targetOwnerId: 'player-1',
      senderPlayerId: 'impostor',
    })).toBe(false);
  });

  it('ничейный лист может транслировать любой клиент (усыновление)', () => {
    expect(isAuthorizedUpdate({
      ...base,
      targetOwnerId: undefined,
      incomingOwnerId: undefined,
      senderPlayerId: 'player-7',
    })).toBe(true);
  });

  it('легаси-fallback: совпадение имени владельца принимается', () => {
    expect(isAuthorizedUpdate({
      ...base,
      targetOwnerId: 'legacy-owner-id',
      incomingOwnerName: 'Алиса',
      recipientPlayerName: 'Алиса',
      senderPlayerId: 'legacy-owner-id',
      recipientPlayerId: 'new-player-id',
    })).toBe(true);
  });

  it('локальной копии нет — проверяется ownerId из входящих данных', () => {
    expect(isAuthorizedUpdate({
      ...base,
      targetOwnerId: undefined,
      incomingOwnerId: 'player-2',
      senderPlayerId: 'player-2',
    })).toBe(false); // чужой лист игроку не нужен
  });
});
