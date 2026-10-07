import { useReducer, useEffect, useCallback, useState, useRef } from 'react';
import { logger } from '../utils/logger';
import OBR from '@owlbear-rodeo/sdk';
import { Character, CharacterAction } from '../types';
import { charactersReducer, CharactersState, CharacterEntry } from './appReducer';
import { parseCharactersData, serializeForCache, useSaveEffect, RawCharacterStorageData } from './persistence';
import { useObrSyncChannel } from '../sync/syncEngine';
import { useLocalBridgeSync } from '../sync/localSync';
import { useNotifier } from '../context/NotificationContext';
import { saveCharacterApi, deleteCharacterApi, isOwlbear, loadFromLocalStorage, SESSION_CLIENT_ID, broadcastCharacterSync, purgeLocalCharacter } from '../utils/storage';
import { localBridge } from '../utils/bridgeService';
import { storageRepository } from '../utils/storageRepository';
import { registerCurrentRoom, getKnownRooms, saveKnownRooms } from '../utils/roomRegistry';
import { p2pRoomBridge } from '../utils/p2pBridge';
import { SYNC_CHANNEL, SyncMessageType, BridgeMessageType, P2pMessageType } from '../protocol/messages';
import { ChunkAssembler } from '../protocol/chunkAssembler';

import type { SyncStatusType } from '../components/SyncStatusIndicator';

interface CharacterManager {
  characters: CharactersState;
  isLoading: boolean;
  syncStatus: SyncStatusType;
  syncingCharacters: Record<string, { status: 'images', pendingImages: string[] }>;
  addCharacter: (id: string, character: Character) => void;
  deleteCharacter: (id: string) => void;
  updateCharacter: (id: string, action: CharacterAction) => void;
  undo: (id: string) => void;
  redo: (id: string) => void;
  syncCharacter: (id: string) => Promise<void>;
  clearLocalCache: (id: string) => Promise<void>;
  exportVaultData: () => void;
  importVaultData: (fileContent: string) => void;
}

interface OBRRoomWithDetails {
  id: string;
  name?: string;
}

const getObrRoomDetails = (): { roomId: string; roomName: string } => {
  if (typeof OBR === 'undefined') {
    return { roomId: '', roomName: 'Owlbear Room' };
  }
  const room = (OBR as unknown as { room?: OBRRoomWithDetails }).room;
  const roomId = room?.id || '';
  const roomName = (typeof window !== 'undefined' ? window.__currentRoomName : undefined) || room?.name || 'Owlbear Room';
  return { roomId, roomName };
};

export const useCharacterManager = (): CharacterManager => {
  const [characters, dispatch] = useReducer(charactersReducer, {});
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatusType>('synced');
  const [syncingCharacters, setSyncingCharacters] = useState<Record<string, { status: 'images', pendingImages: string[]; startedAt?: number }>>({});
  const { addNotification } = useNotifier();

  // Track the serialized state of each character individually (indexed by character ID)
  const lastSerializedRef = useRef<Record<string, string>>({});
  // Reference-based dirty detection: последняя размеченная ссылка history.present.
  // Редьюсер иммутабелен → новая ссылка present гарантирует изменение
  // (UNDO/REDO тоже дают новую ссылку и корректно триггерят сохранение).
  const lastPresentRef = useRef<Record<string, Character>>({});
  const charactersStateRef = useRef<CharactersState>(characters);
  // Сборщик сетевых чанков: хранит updatedAt, различает передачи по syncId,
  // сам валидирует границы индексов (замена багованных incomingChunksRef).
  const chunkAssemblerRef = useRef<ChunkAssembler>(new ChunkAssembler());
  const pendingSyncRef = useRef<{ charId: string; entryRefBefore?: CharacterEntry } | null>(null);

  useEffect(() => {
    charactersStateRef.current = characters;
  }, [characters]);

  // Broadcast undo/redo state to sibling tabs via localBridge
  useEffect(() => {
    if (!pendingSyncRef.current) return;
    const { charId, entryRefBefore } = pendingSyncRef.current;
    pendingSyncRef.current = null;

    const currentEntry = characters[charId];
    if (!currentEntry || currentEntry === entryRefBefore) {
      return;
    }

    const imageCacheArray = currentEntry.imageCache
      ? (currentEntry.imageCache instanceof Map
          ? Array.from(currentEntry.imageCache.entries())
          : (Array.isArray(currentEntry.imageCache) ? currentEntry.imageCache : []))
      : [];

    try {
      localBridge.postMessage({
        type: BridgeMessageType.CHARACTER_SYNC,
        charId,
        entry: {
          ...currentEntry,
          character: currentEntry.history.present,
          history: currentEntry.history,
          log: currentEntry.log,
          imageCache: imageCacheArray,
        },
        senderClientId: SESSION_CLIENT_ID,
        senderId: SESSION_CLIENT_ID,
      });
    } catch (e) {
      logger.warn('[useCharacterManager] Failed to broadcast undo/redo sync:', e);
    }
  }, [characters]);

  // Garbage collection for stale incomplete P2P transmissions (older than 30s)
  // + таймаут зависшего индикатора «подгрузка картинок» (P2 аудита: старше 60s)
  useEffect(() => {
    const intervalId = setInterval(() => {
      const assembler = chunkAssemblerRef.current;
      const removed = assembler.collectStale();
      if (removed.length > 0) {
        logger.warn(`[DND Sheet] Garbage collected ${removed.length} stale incomplete network transmission(s):`, removed);
      }

      setSyncingCharacters(prev => {
        const now = Date.now();
        let pruned = false;
        const next: typeof prev = {};
        for (const [charId, entry] of Object.entries(prev)) {
          if (entry.startedAt && now - entry.startedAt > 60000) {
            logger.warn(`[DND Sheet] Timed out waiting for remote images of ${charId} (60s). Use manual sync to retry.`);
            pruned = true;
            continue;
          }
          next[charId] = entry;
        }
        return pruned ? next : prev;
      });
    }, 15000);
    return () => clearInterval(intervalId);
  }, []);

  // 1. Initial Load of character data
  useEffect(() => {
    storageRepository.loadCharacters()
      .then(data => {
        if (data) {
          const parsedState = parseCharactersData(data);
          const cache: Record<string, string> = {};
          for (const [id, charData] of Object.entries(data)) {
            cache[id] = serializeForCache(charData as RawCharacterStorageData);
          }
          lastSerializedRef.current = cache;
          dispatch({ type: 'SET_CHARACTERS', payload: parsedState });
        }

        if (isOwlbear()) {
          const { roomId, roomName } = getObrRoomDetails();
          if (roomId) {
            window.__currentRoomName = roomName;
            registerCurrentRoom(roomId, roomName);
          }
          try {
            logger.debug('[DND Sheet] Owlbear VTT iframe ready. Broadcasting VTT_FRAME_READY to sibling tabs...');
            localBridge.postMessage({ type: BridgeMessageType.VTT_FRAME_READY });
          } catch (e) {}
        }
        
        const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const charId = urlParams?.get('charId');

        if (!isOwlbear() && charId) {
          logger.debug(`[DND Sheet] Standalone mode: Requesting latest character data for ${charId}...`);
          setSyncStatus('connected_tab');
          
          try {
            localBridge.postMessage({
              type: BridgeMessageType.REQUEST_CHARACTER_DATA,
              charId
            });
            localBridge.postMessage({
              type: BridgeMessageType.HANDSHAKE_PING,
              charId
            });
          } catch (e) {}

          // Set a timeout to stop loading if VTT iframe doesn't respond
          const timeoutId = setTimeout(() => {
            logger.debug(`[DND Sheet] Handshake timeout. Proceeding with local data.`);
            setIsLoading(false);
          }, 1500);

          window.__handshakeTimeoutId = timeoutId;
        } else {
          setIsLoading(false);
        }
      })
      .catch(error => {
        logger.error("Failed to load characters initially:", error);
        addNotification("Ошибка: не удалось загрузить персонажей.", 'error');
        setIsLoading(false);
      });
  }, [addNotification]);



  useObrSyncChannel({ charactersStateRef, chunkAssemblerRef, dispatch, addNotification, lastSerializedRef, lastPresentRef, setSyncingCharacters });

  const { flush: flushSave } = useSaveEffect({ characters, isLoading, addNotification, lastSerializedRef, lastPresentRef });

  // --- MEMOIZED ACTION DISPATCHERS ---

  const addCharacter = useCallback((id: string, character: Character) => {
    let charToAdd = character;
    if (isOwlbear()) {
      const { roomId, roomName } = getObrRoomDetails();
      if (roomId) {
        const boundRooms = character.boundRooms || [];
        if (!boundRooms.some(r => r.roomId === roomId)) {
          charToAdd = {
            ...character,
            boundRooms: [...boundRooms, { roomId, roomName, lastVisited: Date.now() }]
          };
        }
      }
    }

    const newEntry = {
      character: charToAdd,
      log: [],
      history: { past: [], present: charToAdd, future: [] },
      imageCache: new Map()
    };

    dispatch({ type: 'ADD_CHARACTER', payload: { id, character: charToAdd } });

    // Save to LocalStorage, IndexedDB and Owlbear metadata
    saveCharacterApi(id, newEntry).catch((err) => {
      logger.error('[DND Sheet] Failed to save character:', err);
    });

    // Instantly sync newly created character to Owlbear iframe and all other open tabs!
    try {
      const syncPayload = {
        type: BridgeMessageType.CHARACTER_SYNC,
        charId: id,
        entry: {
          character: charToAdd,
          log: [],
          history: { past: [], present: charToAdd, future: [] },
          imageCache: []
        },
        senderClientId: SESSION_CLIENT_ID,
        senderId: SESSION_CLIENT_ID
      };
      localBridge.postMessage(syncPayload);
      localBridge.postMessage({ type: BridgeMessageType.STORAGE_EVENT_SYNC, senderClientId: SESSION_CLIENT_ID });
    } catch (e) {}
  }, []);

  const exportVaultData = useCallback(() => {
    flushSave();
    const state = charactersStateRef.current;
    const knownRooms = getKnownRooms();
    const exportableCharacters: Record<string, unknown> = {};

    for (const [id, entry] of Object.entries(state)) {
      if (!entry) continue;
      let imageCacheRecord: Record<string, string> = {};
      if (entry.imageCache instanceof Map) {
        imageCacheRecord = Object.fromEntries(entry.imageCache.entries());
      } else if (Array.isArray(entry.imageCache)) {
        imageCacheRecord = Object.fromEntries(
          (entry.imageCache as [string, string][]).filter(
            pair => Array.isArray(pair) && pair.length >= 2 && typeof pair[0] === 'string' && typeof pair[1] === 'string'
          )
        );
      } else if (entry.imageCache && typeof entry.imageCache === 'object') {
        imageCacheRecord = { ...(entry.imageCache as Record<string, string>) };
      }

      exportableCharacters[id] = {
        ...entry,
        character: entry.history?.present,
        imageCache: imageCacheRecord,
      };
    }

    const vaultData = {
      version: 2,
      exportedAt: Date.now(),
      knownRooms,
      characters: exportableCharacters,
    };
    const blob = new Blob([JSON.stringify(vaultData, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `Master_Vault_${new Date().toISOString().slice(0, 10)}.dndvault.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
    addNotification('Хранилище персонажей успешно экспортировано!', 'info');
  }, [addNotification, flushSave]);

  const importVaultData = useCallback((fileContent: string) => {
    try {
      const parsed = JSON.parse(fileContent);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Некорректный формат файла хранилища.');
      }
      const incomingState = parsed.characters || parsed;
      const parsedState = parseCharactersData(incomingState);

      const myId = isOwlbear() && typeof OBR !== 'undefined' ? OBR.player?.id : (typeof window !== 'undefined' ? localStorage.getItem('com.antigravity.dnd-sheet/player_id') : '');
      const myName = typeof window !== 'undefined' ? localStorage.getItem('com.antigravity.dnd-sheet/player_name') : 'Игрок';

      for (const [id, entry] of Object.entries(parsedState)) {
        if (entry && entry.history?.present) {
          if (!entry.history.present.ownerId && myId) {
            entry.history.present.ownerId = myId;
            if (myName) entry.history.present.ownerName = myName;
          }
          saveCharacterApi(id, entry).catch((err) => {
            logger.error('[DND Sheet] Failed to save imported character:', err);
          });
          try {
            const imageCacheArray = entry.imageCache ? (entry.imageCache instanceof Map ? Array.from(entry.imageCache.entries()) : entry.imageCache) : [];
            localBridge.postMessage({
              type: BridgeMessageType.CHARACTER_SYNC,
              charId: id,
              entry: {
                ...entry,
                imageCache: imageCacheArray
              },
              senderClientId: SESSION_CLIENT_ID
            });
          } catch (err) {}
        }
      }

      dispatch({ type: 'SET_CHARACTERS', payload: parsedState });
      if (Array.isArray(parsed.knownRooms)) {
        saveKnownRooms(parsed.knownRooms);
      }
      try {
        localBridge.postMessage({ type: BridgeMessageType.STORAGE_EVENT_SYNC, senderClientId: SESSION_CLIENT_ID });
      } catch (e) {}

      addNotification('Хранилище персонажей успешно импортировано и синхронизировано!', 'info');
    } catch (e) {
      logger.error('[DND Sheet] Failed to import vault:', e);
      addNotification('Ошибка при импорте файла хранилища.', 'error');
    }
  }, [addNotification]);

  const deleteCharacter = useCallback(async (id: string) => {
    flushSave();
    const charEntry = charactersStateRef.current[id];
    const fullChar = charEntry?.history.present;
    
    // Check user role & player ID
    let isGM = false;
    let myId = '';
    if (isOwlbear() && typeof OBR !== 'undefined') {
      try {
        const role = await OBR.player.getRole();
        isGM = role === 'GM';
        myId = OBR.player.id;
      } catch (e) {}
    } else if (typeof window !== 'undefined') {
      const urlRole = new URLSearchParams(window.location.search).get('userRole');
      if (urlRole === 'GM') isGM = true;
      myId = new URLSearchParams(window.location.search).get('userId') || '';
    }

    const myName = typeof window !== 'undefined' ? localStorage.getItem('com.antigravity.dnd-sheet/player_name') : 'Игрок';
    const isOwner = isGM || !fullChar?.ownerId || !myId || fullChar.ownerId === myId || (!!myName && fullChar?.ownerName === myName);
    if (!isOwner) {
      logger.warn('[DND Sheet] Blocked deleteCharacter for unowned character:', id);
      addNotification('Вы не можете удалить персонажа, принадлежащего другому игроку.', 'error');
      return;
    }

    // 1. Delete from local React state
    dispatch({ type: 'DELETE_CHARACTER', payload: { id } });

    // 2. Полная зачистка локальных хранилищ (P0 аудита): память + оба зеркала
    // + IndexedDB (картинки и полная запись) — единый хелпер для всех путей.
    try {
      await purgeLocalCharacter(id);
    } catch (err) {
      logger.error('[DND Sheet] Failed to clean local storage on delete:', err);
    }

    // 3. Explicitly remove from serialization cache
    if (lastSerializedRef.current[id]) {
      const newCache = { ...lastSerializedRef.current };
      delete newCache[id];
      lastSerializedRef.current = newCache;
    }
    delete lastPresentRef.current[id];

    // 4. Broadcast deletion across all sibling tabs via localBridge.
    // P0 аудита: senderPlayerId ОБЯЗАТЕЛЕН — получатель авторизует удаление
    // по нему; без него мост подставит случайный SESSION_CLIENT_ID вкладки
    // и владелец не сможет удалить своего персонажа на соседней вкладке.
    try {
      localBridge.postMessage({
        type: BridgeMessageType.DELETE_CHARACTER_SYNC_BRIDGE,
        charId: id,
        senderPlayerId: myId || ''
      });
    } catch (e) {}

    if (isGM) {
      // IF GM: Deletes ONLY locally on GM's machine. Do NOT broadcast deletion or delete room metadata!
      logger.debug(`[DND Sheet] GM deleted character ${id} locally. Room sync & broadcast skipped.`);
      addNotification('Локальная копия персонажа удалена у ГМа.', 'info');
    } else {
      // IF PLAYER: удаляем из локальных хранилищ и рассылаем команду удаления по комнате.
      logger.debug(`[DND Sheet] Player deleted character ${id}. Cleaning local stores & broadcasting deletion to room...`);
      void deleteCharacterApi(id);

      if (isOwlbear() && typeof OBR !== 'undefined') {
        OBR.broadcast.sendMessage(SYNC_CHANNEL, {
          type: SyncMessageType.DELETE_CHARACTER_SYNC,
          id,
          senderClientId: SESSION_CLIENT_ID,
          senderPlayerId: OBR.player?.id || ''
        }).catch(err => logger.warn('[DND Sheet] Delete broadcast failed:', err));
      }

      // (Дублирующее bridge-сообщение с полем `id` удалено (P0): гейт приёмника
      // читает payload.charId — оно было мёртвым; общего броадкаста из шага 4
      // с корректным senderPlayerId достаточно.)

      addNotification('Персонаж полностью удален.', 'info');
    }
  }, [addNotification, flushSave]);

  const updateCharacter = useCallback((id: string, action: CharacterAction) => {
    const actionRecord = action as unknown as Record<string, unknown>;
    const actionId = typeof actionRecord.actionId === 'string'
      ? actionRecord.actionId
      : Math.random().toString(36).substring(2) + Date.now().toString(36);
    const actionWithId = {
      ...action,
      actionId
    };

    dispatch({ type: 'DISPATCH_CHARACTER_ACTION', payload: { id, action: actionWithId } });

    // Broadcast to local channel & sibling windows via localBridge
    try {
      localBridge.postMessage({
        type: BridgeMessageType.CHARACTER_ACTION,
        charId: id,
        action: actionWithId
      });
    } catch (e) {}
  }, []);

  const undo = useCallback((id: string) => {
    const entryRefBefore = charactersStateRef.current[id];
    dispatch({ type: 'UNDO', payload: { id } });
    if (entryRefBefore && entryRefBefore.history.past.length > 0) {
      pendingSyncRef.current = { charId: id, entryRefBefore };
    }
  }, []);

  const redo = useCallback((id: string) => {
    const entryRefBefore = charactersStateRef.current[id];
    dispatch({ type: 'REDO', payload: { id } });
    if (entryRefBefore && entryRefBefore.history.future.length > 0) {
      pendingSyncRef.current = { charId: id, entryRefBefore };
    }
  }, []);

  const isLoadingRef = useRef(isLoading);
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  const lastHeartbeatRef = useRef<number>(Date.now());

  // Heartbeat loop for detecting Owlbear connection loss in standalone tabs & Owlbear iframe
  useEffect(() => {
    if (isOwlbear()) {
      // Broadcast heartbeat every 2s from Owlbear iframe to sibling standalone tabs
      const heartbeatInterval = setInterval(() => {
        try {
          localBridge.postMessage({ type: BridgeMessageType.VTT_HEARTBEAT, timestamp: Date.now() });
        } catch (e) {}
      }, 2000);

      const handleUnload = () => {
        try {
          localBridge.postMessage({ type: BridgeMessageType.VTT_DISCONNECTED, timestamp: Date.now() });
        } catch (e) {}
      };

      window.addEventListener('beforeunload', handleUnload);
      return () => {
        clearInterval(heartbeatInterval);
        window.removeEventListener('beforeunload', handleUnload);
      };
    } else {
      // Standalone tab: Monitor incoming heartbeats from Owlbear iframe
      const checkInterval = setInterval(() => {
        const timeSinceHeartbeat = Date.now() - lastHeartbeatRef.current;
        if (timeSinceHeartbeat > 5000) {
          setSyncStatus((prev) => (prev !== 'error' ? 'error' : prev));
        } else {
          setSyncStatus((prev) => (prev === 'error' ? 'connected_tab' : prev));
        }
      }, 2000);

      return () => clearInterval(checkInterval);
    }
  }, []);

  useLocalBridgeSync({ dispatch, setSyncStatus, isLoadingRef, lastSerializedRef, charactersStateRef, setIsLoading, lastHeartbeatRef, lastPresentRef });

  // 2.7. Heartbeat emitter & standalone window reconnect loop inside Owlbear iframe
  useEffect(() => {
    if (!isOwlbear()) return;

    const emitHeartbeat = () => {
      try {
        const { roomId, roomName } = getObrRoomDetails();
        if (roomId) {
          registerCurrentRoom(roomId, roomName);
        }
        window.localStorage.setItem('com.antigravity.dnd-sheet/vtt_heartbeat', JSON.stringify({
          roomId,
          roomName,
          timestamp: Date.now(),
          senderClientId: SESSION_CLIENT_ID
        }));

        // Re-discover and re-add child standalone windows using targetName lookups
        const activeIds = Object.keys(charactersStateRef.current);
        localBridge.reconnectStandaloneWindows(activeIds);
        localBridge.postMessage({
          type: BridgeMessageType.VTT_FRAME_READY,
          roomId,
          roomName,
          knownRooms: getKnownRooms()
        });
      } catch (e) {}
    };

    emitHeartbeat();
    const interval = setInterval(emitHeartbeat, 2000);
    return () => clearInterval(interval);
  }, []);

  const lastRemoteP2pTimeRef = useRef<number>(0);

  // 2.7. Periodic Heartbeat Emitter & Presence Responder for Owlbear mode
  useEffect(() => {
    if (!isOwlbear()) return;
    const sendHeartbeat = () => {
      try {
        const { roomId, roomName } = getObrRoomDetails();
        localBridge.postMessage({
          type: BridgeMessageType.HEARTBEAT_PING,
          roomId,
          roomName
        });
      } catch (e) {}
    };
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 3000);

    const unsubscribe = localBridge.subscribe((event) => {
      const payload = event.data;
      if (payload && typeof payload === 'object') {
        const senderId = payload.senderClientId || payload.senderId;
        if (senderId && senderId !== SESSION_CLIENT_ID && payload.type === P2pMessageType.PRESENCE_QUERY) {
          const { roomId, roomName } = getObrRoomDetails();
          p2pRoomBridge.broadcast({
            type: P2pMessageType.STATE_RESPONSE,
            roomId,
            roomName,
            activeCharacterId: p2pRoomBridge.getActiveBoardCharacterId(),
            knownRooms: getKnownRooms()
          });
        }
      }
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  // 2.8. Heartbeat monitor for standalone tab to detect connection drops
  useEffect(() => {
    if (isOwlbear()) return;

    const checkVttHeartbeat = () => {
      // 1. Если приходило любое сообщение через P2P мост менее 15 секунд назад
      if (lastRemoteP2pTimeRef.current > 0 && Date.now() - lastRemoteP2pTimeRef.current < 15000) {
        setSyncStatus('connected_tab');
        return true;
      }

      // 2. Если есть открытый родительский opener
      if (typeof window !== 'undefined' && window.opener && !window.opener.closed) {
        setSyncStatus('connected_tab');
        return true;
      }

      // 3. Иначе автономный режим
      setSyncStatus('synced');
      return false;
    };

    checkVttHeartbeat();
    const interval = setInterval(() => {
      checkVttHeartbeat();
    }, 2000);

    const unsubscribe = localBridge.subscribe((event) => {
      const payload = event.data;
      if (payload && typeof payload === 'object') {
        const senderId = payload.senderClientId || payload.senderId;
        if (senderId && senderId !== SESSION_CLIENT_ID) {
          lastRemoteP2pTimeRef.current = Date.now();
          setSyncStatus('connected_tab');

          if (payload.type === P2pMessageType.STATE_RESPONSE && payload.roomId) {
            registerCurrentRoom(payload.roomId, payload.roomName || 'Owlbear Room');
            p2pRoomBridge.connect(payload.roomId, payload.roomName);
          }
        }
      }
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  // 2.9. Connect Native Owlbear Room & Standalone Local Bridge
  useEffect(() => {
    if (isOwlbear() && typeof OBR !== 'undefined') {
      OBR.onReady(() => {
        const { roomId, roomName } = getObrRoomDetails();
        const finalRoomId = roomId || 'global_vault_bridge';
        logger.debug(`[DND Sheet P2P] Owlbear VTT Ready. Connecting bridge for room: ${finalRoomId} (${roomName})`);
        registerCurrentRoom(finalRoomId, roomName);
        p2pRoomBridge.connect(finalRoomId, roomName);
        localBridge.reconnectStandaloneWindows();
      });
    } else {
      const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const urlRoomId = urlParams?.get('roomId');
      const knownRooms = getKnownRooms();
      const initialRoom = urlRoomId || (knownRooms.length > 0 && knownRooms[0] ? knownRooms[0].roomId : 'global_vault_bridge');
      const initialRoomName = knownRooms.find(r => r?.roomId === initialRoom)?.roomName || 'Owlbear Room';

      logger.debug(`[DND Sheet P2P] Standalone mode: Connecting local P2P bridge for room: ${initialRoom}`);
      p2pRoomBridge.connect(initialRoom, initialRoomName);
      localBridge.reconnectStandaloneWindows();
    }
  }, []);

  const syncCharacter = useCallback(async (id: string) => {
    try {
      if (isOwlbear()) {
        const state = charactersStateRef.current;
        const entry = state[id];
        const fullChar = entry?.history.present;
        const myId = typeof OBR !== 'undefined' ? OBR.player?.id : '';
        const isOwner = fullChar && fullChar.ownerId && myId ? fullChar.ownerId === myId : true;

        if (isOwner && entry) {
          logger.debug(`[DND Sheet] Manual sync triggered by owner for character ${id}...`);
          const localData = loadFromLocalStorage();
          const charData = localData[id];
          if (charData) {
            await broadcastCharacterSync(id, charData, true);
            addNotification('Данные персонажа принудительно отправлены в комнату.', 'info');
            return;
          }
        }

        logger.debug(`[DND Sheet] Requesting fresh sync for character ${id} from room...`);
        await OBR.broadcast.sendMessage(SYNC_CHANNEL, {
          type: SyncMessageType.REQUEST_FULL_CHARACTERS,
          cachedVersions: {},
          requestedCharId: id,
          senderClientId: SESSION_CLIENT_ID
        });
        addNotification('Отправлен запрос на повторную синхронизацию персонажа.', 'info');
      } else {
        logger.debug(`[DND Sheet] Standalone mode: Manual sync requesting character data for ${id}...`);
        setSyncStatus('syncing');
        try {
          const localData = loadFromLocalStorage();
          const entry = charactersStateRef.current[id] || (localData[id] as unknown as CharactersState[string]);
          const imageCacheArray = entry?.imageCache instanceof Map
            ? Array.from(entry.imageCache.entries())
            : (Array.isArray(entry?.imageCache) ? entry.imageCache : []);

          localBridge.postMessage({ type: BridgeMessageType.VTT_FRAME_READY });
          localBridge.postMessage({
            type: BridgeMessageType.HANDSHAKE_PING,
            charId: id,
            entry: entry ? { ...entry, imageCache: imageCacheArray } : undefined,
            knownRooms: getKnownRooms()
          });
          localBridge.postMessage({
            type: BridgeMessageType.REQUEST_CHARACTER_DATA,
            charId: id
          });
        } catch (e) {}
        addNotification('Запрос на синхронизацию отправлен в главное окно Owlbear.', 'info');
      }
    } catch (e) {
      logger.error('[DND Sheet] Failed to trigger syncCharacter:', e);
      addNotification('Не удалось запросить синхронизацию.', 'error');
    }
  }, [addNotification]);

  const clearLocalCache = useCallback(async (id: string) => {
    flushSave();
    try {
      logger.debug(`[DND Sheet] Clearing local copy for character ${id}...`);

      // P0 аудита: единая полная зачистка хранилищ. removeFromMemoryCache
      // внутри выполняется ПЕРВЫМ шагом — иначе memory-overlay воскрешал бы
      // «очищенного» при следующем сейве другого персонажа (баг #5).
      await purgeLocalCharacter(id);

      // Clear React-layer caches
      delete lastSerializedRef.current[id];
      delete lastPresentRef.current[id];

      // Remove from local React state
      dispatch({ type: 'DELETE_CHARACTER', payload: { id } });

      addNotification('Локальная копия персонажа очищена.', 'info');
    } catch (e) {
      logger.error('[DND Sheet] Failed to clear local copy:', e);
      addNotification('Ошибка при очистке локальной копии.', 'error');
    }
  }, [addNotification, flushSave]);

  return {
    characters,
    isLoading,
    syncStatus,
    syncingCharacters,
    addCharacter,
    deleteCharacter,
    updateCharacter,
    undo,
    redo,
    syncCharacter,
    clearLocalCache,
    exportVaultData,
    importVaultData,
  };
};
