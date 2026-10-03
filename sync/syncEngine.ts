import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { Character } from '../types';
import { logger } from '../utils/logger';
import OBR from '@owlbear-rodeo/sdk';
import { isOwlbear, unminifyCharacter, loadFromLocalStorage, saveToLocalStorage, restoreLocalData, SESSION_CLIENT_ID, broadcastCharacterSync, purgeLocalCharacter } from '../utils/storage';
import { imageDb } from '../utils/indexedDbStore';
import { localBridge } from '../utils/bridgeService';
import { p2pRoomBridge } from '../utils/p2pBridge';
import { SYNC_CHANNEL, parseSyncMessage, BridgeMessageType } from '../protocol/messages';
import { ChunkAssembler } from '../protocol/chunkAssembler';
import { resolveRole, getCachedRole } from '../auth/roleService';
import { isAuthorizedUpdate, isAuthorizedDelete } from '../auth/authorization';
import { isCharacter } from '../state/initialization';
import { CharactersState, CharactersAction } from '../state/appReducer';
import { parseCharactersData, serializeForCache, getTextChecksum, getImageChecksums } from '../state/persistence';
import type { NotificationType } from '../components/NotificationToast';

interface ObrSyncChannelDeps {
  charactersStateRef: MutableRefObject<CharactersState>;
  chunkAssemblerRef: MutableRefObject<ChunkAssembler>;
  dispatch: Dispatch<CharactersAction>;
  addNotification: (message: string, type?: NotificationType) => void;
  lastSerializedRef: MutableRefObject<Record<string, string>>;
  /** P0 аудита: React-слой кеша dirty-flag — чистится при удалении персонажа. */
  lastPresentRef: MutableRefObject<Record<string, Character>>;
  setSyncingCharacters: Dispatch<SetStateAction<Record<string, { status: 'images', pendingImages: string[]; startedAt?: number }>>>;
}

const isCharacterOwner = (character: any, currentUserId?: string): boolean => {
  if (!character) return false;
  const myId = currentUserId || (isOwlbear() && typeof OBR !== 'undefined' ? OBR.player?.id : '');
  const myName = typeof window !== 'undefined' ? localStorage.getItem('com.antigravity.dnd-sheet/player_name') : '';
  if (!character.ownerId) return true; // Legacy or unclaimed character
  if (!myId) return true;
  if (character.ownerId === myId) return true;
  if (myName && character.ownerName === myName) return true;
  return false;
};

export const useObrSyncChannel = (deps: ObrSyncChannelDeps): void => {
    const { charactersStateRef, chunkAssemblerRef, dispatch, addNotification, lastSerializedRef, lastPresentRef, setSyncingCharacters } = deps;

  // 2.5. Real-time peer-to-peer synchronization via broadcast channels
  useEffect(() => {
    if (isOwlbear()) {
      let unsub: (() => void) | null = null;

      const setupListener = () => {
        // Прогреваем кэш роли: hot-path проверки используют getCachedRole().
        void resolveRole();

        const handleMessage = async (event: { data: unknown }) => {
          // Единая точка входа: валидация конверта zod-схемой протокола.
          // Битые/чужие пакеты отбрасываются с логом (parseSyncMessage).
          const msg = parseSyncMessage(event.data);
          if (!msg) return;

          // Собственные пакеты не приходят через OBR.broadcast, но защита
          // нужна на случай эха через мосты.
          if (msg.senderClientId === SESSION_CLIENT_ID) return;

          if (msg.type === 'REQUEST_FULL_CHARACTERS') {
            // Someone requested full sheets (e.g. GM joined). Broadcast all our owned sheets!
            try {
              const localData = loadFromLocalStorage();
              const cachedVersions = msg.cachedVersions || {};
              const myId = isOwlbear() && typeof OBR !== 'undefined' ? OBR.player?.id : '';
              // Фикс бага #2 аудита: роль из roleService вместо window.__userRole,
              // который никогда нигде не записывался и всегда был undefined.
              const isGM = isOwlbear() && typeof OBR !== 'undefined' ? (getCachedRole() === 'GM') : false;
              const activeBroadcastId = p2pRoomBridge.getActiveBoardCharacterId();

              for (const [id, charData] of Object.entries(localData)) {
                if (!charData || !(charData as any).character) continue;
                const fullChar = unminifyCharacter((charData as any).character);
                if (!isCharacterOwner(fullChar, myId)) continue;

                // Only broadcast to GM if GM Broadcast toggle is ON for this character
                if (!isGM && activeBroadcastId !== id) {
                  logger.debug(`[DND Sheet] Skipping GM broadcast for character ${id} (GM Broadcast toggle is OFF).`);
                  continue;
                }

                const requesterVersion = cachedVersions[id] as
                  | { textChecksum?: string; imageChecksums?: Record<string, string> }
                  | undefined;

                  if (requesterVersion && typeof requesterVersion === 'object') {
                    const currentTextHash = getTextChecksum(charData);
                    const currentImgHashes = getImageChecksums(charData);

                    const textMatch = requesterVersion.textChecksum === currentTextHash;

                    // Find which images the requester needs
                    const requesterImgHashes = requesterVersion.imageChecksums || {};
                    const missingOrChangedImages: string[] = [];
                    for (const [imgId, imgHash] of Object.entries(currentImgHashes)) {
                      if (requesterImgHashes[imgId] !== imgHash) {
                        missingOrChangedImages.push(imgId);
                      }
                    }

                    if (textMatch && missingOrChangedImages.length === 0) {
                      logger.debug(`[DND Sheet] Requester already has up-to-date character ${id}. Skipping sync.`);
                      continue;
                    }

                    logger.debug(`[DND Sheet] Checksum mismatch for character ${id}: Text match: ${textMatch} (Requester text: "${requesterVersion.textChecksum}", Current: "${currentTextHash}"). Requester needs ${missingOrChangedImages.length} images: ${JSON.stringify(missingOrChangedImages)}. Syncing...`);

                    // Broadcast character sheet with only the images the requester needs
                    await broadcastCharacterSync(id, charData, missingOrChangedImages);
                  } else {
                    // Legacy or clean client: send everything!
                    logger.debug(`[DND Sheet] Requester has no version info for ${id}. Syncing everything.`);
                    await broadcastCharacterSync(id, charData, true);
                  }
                }
            } catch (err) {
              logger.error('[DND Sheet] Failed to respond to sheet request:', err);
            }
          } else if (msg.type === 'CHARACTER_CHUNK_SYNC') {
            const charId = msg.id;

            // Сборка чанков через чистый ассемблер: updatedAt для GC, различение
            // передач по syncId, валидация границ (баги #3/#10 аудита).
            const assembledVal = chunkAssemblerRef.current.push(`char-sheet/${charId}`, msg);
            if (!assembledVal) return;

              try {
                const incomingData = JSON.parse(assembledVal);
                const rawChar = incomingData.character ? unminifyCharacter(incomingData.character) : incomingData;
                const isRawValid = isCharacter(rawChar);
                const fullChar = rawChar;
                const charName = fullChar?.name || incomingData.name || charId;
                const myId = isOwlbear() && typeof OBR !== 'undefined' ? OBR.player?.id : '';
                const isGM = (await resolveRole()) === 'GM';

                const existingEntry = charactersStateRef.current[charId];
                const existingChar = existingEntry?.history.present;
                const senderPlayerId = (incomingData as any).senderPlayerId || msg.senderPlayerId || '';

                // RECEIVER-SIDE VERIFICATION FOR UPDATES:
                // Единая функция авторизации закрывает дыры аудита (#7):
                // пустой senderPlayerId больше не проходит; игрок не может
                // протолкнуть чужой лист; получатель-игрок принимает только свои листы.
                const authorized = isAuthorizedUpdate({
                  targetOwnerId: existingChar?.ownerId,
                  incomingOwnerId: fullChar?.ownerId,
                  incomingOwnerName: fullChar?.ownerName,
                  senderPlayerId,
                  recipientIsGM: isGM,
                  recipientPlayerId: myId || '',
                  recipientPlayerName: typeof window !== 'undefined'
                    ? localStorage.getItem('com.antigravity.dnd-sheet/player_name') || undefined
                    : undefined,
                });
                if (!authorized) {
                  logger.warn(`[DND Sheet] Rejected unauthorized P2P character update for ${charId} from sender ${senderPlayerId || '<empty>'}.`);
                  return;
                }

                if (!isRawValid && isGM) {
                  logger.warn(`[DND Sheet] Received corrupted character sheet structure for "${charName}". Auto-repairing...`);
                  addNotification(`[Синхронизация] Внимание: Полученные сетевые данные персонажа "${charName}" повреждены и были автоматически восстановлены.`, 'warning');
                }

                const localData = loadFromLocalStorage();

                // Unminify and restore images if we have them cached locally
                const restoredCloud = restoreLocalData({ [charId]: incomingData }, localData);
                const parsedState = parseCharactersData(restoredCloud);
                const entry = parsedState[charId];

                if (entry) {
                  logger.debug(`[DND Sheet] Received fully assembled remote character sync via P2P for ${charId}. Merging...`);

                  if (Array.isArray(incomingData.syncImageIds) && incomingData.syncImageIds.length > 0) {
                    const neededImages = incomingData.syncImageIds.filter((imgId: string) => {
                      const localImage = entry.imageCache?.get(imgId);
                      return !localImage || !localImage.startsWith('data:');
                    });

                    if (neededImages.length > 0) {
                      logger.debug(`[DND Sheet] Waiting for ${neededImages.length} remote images for ${charId}...`);
                      setSyncingCharacters(prev => ({
                        ...prev,
                        [charId]: {
                          status: 'images',
                          pendingImages: neededImages,
                          // P2 аудита: метка старта — для таймаута зависшего индикатора
                          startedAt: Date.now(),
                        }
                      }));
                    }
                  }

                  dispatch({
                    type: 'SYNC_REMOTE_CHARACTER',
                    payload: {
                      id: charId,
                      entry
                    }
                  });
                  // Broadcast to local channel for standalone tab syncing
                  const imageCacheArray = entry.imageCache
                    ? Array.from(entry.imageCache.entries())
                    : [];
                  const syncPayload = {
                    type: BridgeMessageType.CHARACTER_SYNC,
                    charId,
                    entry: {
                      ...entry,
                      imageCache: imageCacheArray
                    },
                    senderClientId: SESSION_CLIENT_ID,
                    senderId: SESSION_CLIENT_ID
                  };

                  try {
                    localBridge.postMessage(syncPayload);
                  } catch (e) {}

                  // (Мёртвый блок __dndOpenedWindows удалён: дочерние окна
                  // получают рассылку через localBridge.registerChildWindow.)

                  // Cache to our local LocalStorage
                  try {
                    const currentLocal = loadFromLocalStorage();
                    currentLocal[charId] = restoredCloud[charId];
                    saveToLocalStorage(currentLocal);
                  } catch (err) {
                    logger.error('Failed to cache remote character to LocalStorage:', err);
                  }
                  // Also update serialization cache to match so we don't trigger save
                  const obrCharData = {
                    character: entry.history.present,
                    log: entry.log || [],
                    history: { past: [], future: [] },
                    imageCache: entry.imageCache ? Array.from(entry.imageCache.entries()) : []
                  };
                  lastSerializedRef.current[charId] = serializeForCache(obrCharData);
                } else if (isGM) {
                  addNotification(`[Синхронизация] Ошибка: Не удалось загрузить персонажа (${charName}). Данные не прошли валидацию.`, 'error');
                }
              } catch (err) {
                logger.error('[DND Sheet] Failed to parse unified character sync JSON:', err);
                addNotification(`[Синхронизация] Ошибка: Получены поврежденные данные персонажа (${charId}). Синхронизация отменена.`, 'error');
              }
          } else if (msg.type === 'CHARACTER_IMAGE_CHUNK_SYNC') {
            // Фикс бага #1 аудита: приёмник слушает ровно тот же литерал типа,
            // что шлёт отправитель ('CHARACTER_IMAGE_CHUNK_SYNC').
            const charId = msg.id;
            const imgId = msg.imgId;
            const isPortrait = imgId === 'img:ref:portrait';

            // Сборка через чистый ассемблер: updatedAt оживляет GC (#3),
            // syncId не даёт смешаться передачам (#10).
            const assembledVal = chunkAssemblerRef.current.push(`char-img/${charId}/${imgId}`, msg);
            if (!assembledVal) return;

              setSyncingCharacters(prev => {
                const current = prev[charId];
                if (!current) return prev;
                const pending = current.pendingImages.filter((id: string) => id !== imgId);
                if (pending.length === 0) {
                  logger.debug(`[DND Sheet] All remote images for character ${charId} received successfully!`);
                  const next = { ...prev };
                  delete next[charId];
                  return next;
                }
                return {
                  ...prev,
                  [charId]: {
                    ...current,
                    pendingImages: pending
                  }
                };
              });

              const saveImageToDbAndCache = async (imgIdKey: string, imgVal: string) => {
                try {
                  const currentLocal = loadFromLocalStorage();
                  if (currentLocal[charId]) {
                    const imageCacheList = Array.isArray(currentLocal[charId].imageCache) ? currentLocal[charId].imageCache : [];
                    const map = new Map<string, string>(imageCacheList);
                    map.set(imgIdKey, imgVal);
                    const updatedList = Array.from(map.entries());
                    currentLocal[charId].imageCache = updatedList;
                    saveToLocalStorage(currentLocal);
                    await imageDb.set('char-images/' + charId, updatedList);
                  }
                } catch (err) {
                  logger.error(`Failed to cache remote image ${imgIdKey} to IndexedDB:`, err);
                }
              };

              if (isPortrait) {
                logger.debug(`[DND Sheet] Received fully assembled remote portrait for ${charId}.`);
                dispatch({
                  type: 'SYNC_REMOTE_CHARACTER_PORTRAIT',
                  payload: { id: charId, portraitUrl: assembledVal }
                });
                saveImageToDbAndCache('img:ref:portrait', assembledVal);
              } else {
                logger.debug(`[DND Sheet] Received fully assembled remote image ${imgId} for ${charId}.`);
                dispatch({
                  type: 'SYNC_REMOTE_CHARACTER_IMAGE',
                  payload: { id: charId, imgId, imgVal: assembledVal }
                });
                saveImageToDbAndCache(imgId, assembledVal);
              }
          } else if (msg.type === 'DELETE_CHARACTER_SYNC') {
            const charId = msg.id;

            const myId = isOwlbear() && typeof OBR !== 'undefined' ? OBR.player?.id : '';
            const isGM = (await resolveRole()) === 'GM';

            const existingEntry = charactersStateRef.current[charId];
            const existingChar = existingEntry?.history.present;

            // RECEIVER-SIDE AUTHORIZATION CHECK FOR DELETION:
            // Общая функция закрывает дыру #7a: пустой senderPlayerId больше
            // не проходит проверку; чужой лист игрок удалить не может.
            const authorized = isAuthorizedDelete({
              targetOwnerId: existingChar?.ownerId,
              senderPlayerId: msg.senderPlayerId,
              recipientIsGM: isGM,
              recipientPlayerId: myId || '',
            });
            if (!authorized) {
              logger.warn(`[DND Sheet] Rejected unauthorized DELETE_CHARACTER_SYNC for character ${charId} from sender ${msg.senderPlayerId || '<empty>'}.`);
              return;
            }

            logger.debug(`[DND Sheet] Received authorized remote deletion sync via P2P for ${charId}. Removing...`);
            dispatch({ type: 'DELETE_CHARACTER', payload: { id: charId } });

            // P0 аудита: полная зачистка (память + зеркала + IndexedDB-primary).
            // Раньше ветка чистила только localStorage — персонаж воскресал из
            // memory-cache и char-full/{id} после перезагрузки.
            try {
              await purgeLocalCharacter(charId);
              if (lastSerializedRef.current[charId]) {
                const newCache = { ...lastSerializedRef.current };
                delete newCache[charId];
                lastSerializedRef.current = newCache;
              }
              delete lastPresentRef.current[charId];
            } catch (err) {
              logger.error('Failed to purge character on remote deletion:', err);
            }
          }
        };

        logger.debug('[DND Sheet] Subscribing to P2P sync channel:', SYNC_CHANNEL);
        unsub = OBR.broadcast.onMessage(SYNC_CHANNEL, handleMessage);

        // Request full sheets on startup to sync with already online players
        const localData = loadFromLocalStorage();
        const cachedVersions: Record<string, any> = {};
        for (const [id, entry] of Object.entries(localData)) {
          if (entry) {
            cachedVersions[id] = {
              textChecksum: getTextChecksum(entry),
              imageChecksums: getImageChecksums(entry)
            };
          }
        }

        OBR.broadcast.sendMessage(SYNC_CHANNEL, {
          type: 'REQUEST_FULL_CHARACTERS',
          cachedVersions
        }).catch(err => logger.warn('[DND Sheet] Initial request broadcast failed:', err));
      };

      if (typeof OBR !== 'undefined' && OBR.isReady) {
        setupListener();
      } else if (typeof OBR !== 'undefined') {
        OBR.onReady(setupListener);
      }

      return () => {
        if (unsub) unsub();
      };
    }
    // Перенос эффекта как есть из useCharacterManager (план 2.6):
    // подписка устанавливается один раз при монтировании, все зависимости —
    // стабильные ref'ы/dispatch, передаются через deps-объект.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
