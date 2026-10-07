import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { logger } from '../utils/logger';
import OBR from '@owlbear-rodeo/sdk';
import { Character } from '../types';
import { CharactersState, CharactersAction } from '../state/appReducer';
import { characterReducer } from '../state/characterReducer';
import { parseCharactersData, serializeForCache } from '../state/persistence';
import { isOwlbear, loadFromLocalStorage, saveCharacterApi, deleteCharacterApi } from '../utils/storage';
import { localBridge, SESSION_CLIENT_ID } from '../utils/bridgeService';
import { registerCurrentRoom, saveKnownRooms } from '../utils/roomRegistry';
import { BridgeMessageType } from '../protocol/messages';
import { resolveRole } from '../auth/roleService';
import { isAuthorizedDelete } from '../auth/authorization';
import type { SyncStatusType } from '../components/SyncStatusIndicator';

interface LocalBridgeSyncDeps {
  dispatch: Dispatch<CharactersAction>;
  setSyncStatus: Dispatch<SetStateAction<SyncStatusType>>;
  isLoadingRef: MutableRefObject<boolean>;
  lastSerializedRef: MutableRefObject<Record<string, string>>;
  charactersStateRef: MutableRefObject<CharactersState>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  lastHeartbeatRef: MutableRefObject<number>;
  lastPresentRef: MutableRefObject<Record<string, Character>>;
}

export const useLocalBridgeSync = (deps: LocalBridgeSyncDeps): void => {
  const { dispatch, setSyncStatus, isLoadingRef, lastSerializedRef, charactersStateRef, setIsLoading, lastHeartbeatRef, lastPresentRef } = deps;

  // Local bridge for multi-tab synchronization
  useEffect(() => {
    const unsubscribe = localBridge.subscribe((event) => {
      const payload = event.data;
      if (!payload || typeof payload !== 'object') return;

      const senderId = payload.senderClientId || payload.senderId;
      if (senderId === SESSION_CLIENT_ID) {
        return; // Always ignore self messages on the same tab
      }

      if (payload.type === BridgeMessageType.VTT_HEARTBEAT) {
        lastHeartbeatRef.current = Date.now();
        setSyncStatus((prev) => (prev === 'error' ? 'connected_tab' : prev));
        return;
      }

      if (payload.type === BridgeMessageType.VTT_DISCONNECTED) {
        setSyncStatus('error');
        return;
      }

      if (payload.type === BridgeMessageType.DELETE_CHARACTER_SYNC_BRIDGE && payload.charId) {
        // Авторизация удаления и через локальный мост (баг аудита #7: раньше
        // этот путь не проверял права вовсе, в отличие от P2P-пути).
        const myId = isOwlbear() && typeof OBR !== 'undefined' ? OBR.player?.id : '';
        const existingEntry = charactersStateRef.current[payload.charId];
        const targetOwnerId = existingEntry?.history.present?.ownerId;

        void resolveRole().then((role) => {
          // P0 аудита: авторизация СТРОГО по явному senderPlayerId отправителя.
          // Прежний fallback на payload.senderClientId подставлял случайный
          // id вкладки вместо playerId — владелец не мог удалить своего
          // персонажа на соседней вкладке (регрессия C2).
          const authorized = isAuthorizedDelete({
            targetOwnerId,
            senderPlayerId: payload.senderPlayerId || '',
            recipientIsGM: role === 'GM',
            recipientPlayerId: myId || '',
          });
          if (!authorized) {
            logger.warn(`[DND Sheet] Rejected unauthorized bridge DELETE for ${payload.charId} from sender ${payload.senderPlayerId || '<empty>'}.`);
            return;
          }

          logger.debug('[DND Sheet] Bridge Sync: Syncing character deletion from remote tab:', payload.charId);
          dispatch({ type: 'DELETE_CHARACTER', payload: { id: payload.charId } });
          if (lastSerializedRef.current[payload.charId]) {
            const newCache = { ...lastSerializedRef.current };
            delete newCache[payload.charId];
            lastSerializedRef.current = newCache;
          }
          delete lastPresentRef.current[payload.charId];
          // deleteCharacterApi → purgeLocalCharacter: память, зеркала, IndexedDB.
          void deleteCharacterApi(payload.charId);
        });
        return;
      }

      if (payload.type === BridgeMessageType.CHARACTER_ACTION && payload.charId && payload.action) {
        const uniqueActId = payload.action.actionId 
          ? `act-${payload.action.actionId}` 
          : (payload.msgId ? `msg-${payload.msgId}` : `raw-${payload.action.type}-${Date.now()}`);

        if (localBridge.isDuplicateMessage(uniqueActId, 1000)) {
          return;
        }

        logger.debug('[DND Sheet] Bridge Sync: Syncing action from remote tab:', payload.action);
        dispatch({
          type: 'DISPATCH_CHARACTER_ACTION',
          payload: { id: payload.charId, action: payload.action }
        });

        // Proxy incoming action from standalone tab to Owlbear VTT room network & storage
        if (isOwlbear()) {
          const currentState = charactersStateRef.current;
          const currentEntry = currentState[payload.charId];
          if (!currentEntry) {
            logger.debug('[DND Sheet] Action received for unknown character. Requesting full sync:', payload.charId);
            localBridge.postMessage({ type: BridgeMessageType.REQUEST_CHARACTER_DATA, charId: payload.charId });
          } else if (currentEntry.history?.present) {
            const updatedPresent: Character = {
              ...characterReducer(currentEntry.history.present, payload.action),
              lastModified: Date.now(),
            };
            const updatedEntry = {
              ...currentEntry,
              history: {
                ...currentEntry.history,
                present: updatedPresent
              }
            };
            saveCharacterApi(payload.charId, updatedEntry);
          }
          setSyncStatus('connected_tab');
        }
      } else if (payload.type === BridgeMessageType.CHARACTER_SYNC && payload.charId && payload.entry) {
        logger.debug('[DND Sheet] Bridge Sync: Syncing full character:', payload.charId);
        
        const rawChar = payload.entry.character || payload.entry.history?.present;
        if (!rawChar) return;

        const localEntry = charactersStateRef.current[payload.charId];
        const remoteEntry = payload.entry as { lastModified?: number };
        const remoteTime = Number(rawChar.lastModified ?? remoteEntry.lastModified) || 0;

        let shouldUpdate = true;
        if (localEntry && localEntry.history?.present) {
          const localTime = Number(localEntry.history.present.lastModified) || 0;
          if (localTime > remoteTime) {
            logger.debug(`[DND Sheet] Keeping local character ${payload.charId} (local version is newer or equal).`);
            shouldUpdate = false;
          }
        }

        if (shouldUpdate) {
          // Если удалённая запись несла lastModified на уровне entry, проставляем его и в объект персонажа
          const charWithLastModified: Character = remoteTime > 0 && rawChar.lastModified !== remoteTime
            ? { ...rawChar, lastModified: remoteTime }
            : rawChar;

          const imageMap = Array.isArray(payload.entry.imageCache) 
            ? new Map(payload.entry.imageCache) 
            : (payload.entry.imageCache instanceof Map ? payload.entry.imageCache : new Map());

          const entryWithHistory = {
            character: charWithLastModified,
            log: payload.entry.log || [],
            history: payload.entry.history && payload.entry.history.present
              ? { ...payload.entry.history, present: charWithLastModified }
              : { past: [], present: charWithLastModified, future: [] },
            imageCache: imageMap
          };

          const serialized = serializeForCache(entryWithHistory);
          if (lastSerializedRef.current[payload.charId] !== serialized) {
            lastSerializedRef.current[payload.charId] = serialized;
            dispatch({
              type: 'SYNC_REMOTE_CHARACTER',
              payload: { id: payload.charId, entry: entryWithHistory }
            });
            saveCharacterApi(payload.charId, entryWithHistory).catch((err) => {
              logger.error('[LocalSync] Failed to save character:', err);
            });
          }
        }

        const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const urlCharId = urlParams?.get('charId');
        if (payload.charId === urlCharId) {
          if (isLoadingRef.current) {
            logger.debug('[DND Sheet] Received requested character data. Stopping loading.');
            if (window.__handshakeTimeoutId) {
              clearTimeout(window.__handshakeTimeoutId);
              delete window.__handshakeTimeoutId;
            }
            setIsLoading(false);
          }
          setSyncStatus('connected_tab');
        }
      } else if (payload.type === BridgeMessageType.REQUEST_CHARACTER_DATA && payload.charId) {
        logger.debug('[DND Sheet] Bridge Sync: Received request for character data:', payload.charId);

        const state = charactersStateRef.current;
        const entry = state[payload.charId];
        if (entry) {
          const imageCacheArray = entry.imageCache 
            ? (entry.imageCache instanceof Map ? Array.from(entry.imageCache.entries()) : entry.imageCache) 
            : [];
          localBridge.postMessage({
            type: BridgeMessageType.CHARACTER_SYNC,
            charId: payload.charId,
            entry: {
              ...entry,
              imageCache: imageCacheArray
            }
          });
        } else {
          // Fallback: read directly from local storage if state is still initializing
          const localData = loadFromLocalStorage();
          const localEntry = localData[payload.charId];
          if (localEntry) {
            localBridge.postMessage({
              type: BridgeMessageType.CHARACTER_SYNC,
              charId: payload.charId,
              entry: localEntry
            });
          }
        }
        if (isOwlbear()) {
          setSyncStatus('connected_tab');
        }
      } else if (payload.type === BridgeMessageType.VTT_FRAME_READY || payload.type === BridgeMessageType.HANDSHAKE_PING) {
        if (payload.roomId) {
          registerCurrentRoom(payload.roomId, payload.roomName || 'Доска Owlbear');
        }
        if (Array.isArray(payload.knownRooms)) {
          saveKnownRooms(payload.knownRooms);
        }
        setSyncStatus('connected_tab');

        // Bidirectional Handshake: Broadcast all local characters to sibling tab so both tabs merge missing/updated characters!
        const state = charactersStateRef.current;
        for (const [id, entry] of Object.entries(state)) {
          if (entry && entry.history?.present) {
            const imageCacheArray = entry.imageCache 
              ? (entry.imageCache instanceof Map ? Array.from(entry.imageCache.entries()) : entry.imageCache) 
              : [];
            localBridge.postMessage({
              type: BridgeMessageType.CHARACTER_SYNC,
              charId: id,
              entry: {
                ...entry,
                imageCache: imageCacheArray
              }
            });
          }
        }
      } else if (payload.type === BridgeMessageType.STORAGE_EVENT_SYNC) {
        try {
          const data = loadFromLocalStorage();
          const parsedState = parseCharactersData(data);
          // Слияние вместо полной замены: undo-история нетронутых персонажей
          // сохраняется (баг аудита #9).
          dispatch({ type: 'MERGE_REMOTE_CHARACTERS', payload: parsedState });
        } catch (e) {}
      }
    });

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'dnd-characters' || e.key === null || e.key === 'com.antigravity.dnd-sheet/bridge_signal') {
        try {
          const data = loadFromLocalStorage();
          const parsedState = parseCharactersData(data);
          // Слияние вместо полной замены: past/future живых записей не трогаем,
          // реально обновлённые/удалённые чужими вкладками применяем.
          dispatch({ type: 'MERGE_REMOTE_CHARACTERS', payload: parsedState });
        } catch (err) {}
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageChange);
    }

    return () => {
      unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorageChange);
      }
    };
    // Перенос эффекта как есть из useCharacterManager (план 2.6):
    // подписка устанавливается один раз при монтировании, все зависимости —
    // стабильные ref'ы/dispatch/setter'ы, передаются через deps-объект.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
