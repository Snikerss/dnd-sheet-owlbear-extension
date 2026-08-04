import React, { useState, useEffect, useCallback, useMemo } from 'react';
import OBR from '@owlbear-rodeo/sdk';
import { CharacterSelectionScreen } from './components/CharacterSelectionScreen';
import { CharacterSheet } from './components/CharacterSheet';
import { ConfirmationModal } from './components/ConfirmationModal';
import { HistoryLogModal } from './components/HistoryLogModal';
import { PlayerNameModal } from './components/PlayerNameModal';
import { CharacterAction, Character, LogEntry } from './types';
import { useCharacterManager } from './state/useCharacterManager';
import { defaultCharacterState } from './state/defaultCharacterState';
import { NotificationProvider, useNotifier } from './context/NotificationContext';
import { CharacterProvider } from './context/CharacterContext';
import { generateUUID } from './utils/uuid';
import { isOwlbear, encodeBase64Sync } from './utils/storage';
import { localBridge } from './utils/bridgeService';
import { p2pRoomBridge } from './utils/p2pBridge';
import { TextFormattingContextMenu } from './components/RichTextFormatting';

const AppContent: React.FC = () => {
  const { addNotification } = useNotifier();
  const { characters, isLoading, syncStatus, syncingCharacters, addCharacter, deleteCharacter, updateCharacter, undo, redo, syncCharacter, clearLocalCache, exportVaultData, importVaultData } = useCharacterManager();
  
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null);
  const [activeBoardCharacterId, setActiveBoardCharacterId] = useState<string | null>(p2pRoomBridge.getActiveBoardCharacterId());

  useEffect(() => {
    const unsubscribe = p2pRoomBridge.subscribe((payload) => {
      if (payload && (payload.type === 'SET_ACTIVE_BOARD_CHAR' || payload.type === 'ROOM_ANNOUNCE')) {
        setActiveBoardCharacterId(payload.activeCharacterId || null);
      }
    });
    return unsubscribe;
  }, []);

  const handleToggleActiveBoardCharacter = (charId: string | null) => {
    p2pRoomBridge.setActiveBoardCharacter(charId);
    setActiveBoardCharacterId(charId);
  };

  const [characterPendingDeletion, setCharacterPendingDeletion] = useState<{id: string, name: string} | null>(null);
  const [isHistoryLogOpen, setIsHistoryLogOpen] = useState(false);
  const [editingOwnerNameCharId, setEditingOwnerNameCharId] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'GM' | 'PLAYER' | null>(null);
  const [playerName, setPlayerName] = useState<string>('');

  const [formattingMenuPos, setFormattingMenuPos] = useState<{
    x: number;
    y: number;
    target: HTMLElement;
  } | null>(null);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      const inputElement = target.closest('textarea, input[type="text"], input:not([type]), [contenteditable="true"]') as HTMLElement | null;
      if (inputElement) {
        e.preventDefault();
        setFormattingMenuPos({
          x: e.clientX,
          y: e.clientY,
          target: inputElement
        });
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  useEffect(() => {
    if (!isOwlbear() && typeof window !== 'undefined' && (!window.name || window.name === '')) {
      window.name = 'dnd_sheet_vault';
    }
  }, []);

  useEffect(() => {
    let localId = typeof window !== 'undefined' ? localStorage.getItem('com.antigravity.dnd-sheet/player_id') : null;
    if (!localId && typeof window !== 'undefined') {
      localId = 'player_' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem('com.antigravity.dnd-sheet/player_id', localId);
    }

    if (isOwlbear() && typeof OBR !== 'undefined') {
      OBR.onReady(async () => {
        const id = OBR.player.id || localId;
        const name = (await OBR.player.getName()) || 'Игрок';
        const role = await OBR.player.getRole();
        setUserId(id);
        setPlayerName(name);
        try { localStorage.setItem('com.antigravity.dnd-sheet/player_name', name); } catch (e) {}
        setUserRole(role);

        OBR.player.onChange((player) => {
          if (player && player.name) {
            setPlayerName(player.name);
            try { localStorage.setItem('com.antigravity.dnd-sheet/player_name', player.name); } catch (e) {}
          }
        });
      });
    } else {
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
      const urlUserId = params.get('userId');
      const urlUserRole = params.get('userRole') as 'GM' | 'PLAYER' | null;
      const urlPlayerName = params.get('playerName');
      const localName = typeof window !== 'undefined' ? localStorage.getItem('com.antigravity.dnd-sheet/player_name') : null;
      setUserId(urlUserId || localId);
      setUserRole(urlUserRole || 'PLAYER');
      setPlayerName(urlPlayerName || localName || 'Игрок');
    }
  }, []);

  // Sync player name changes across all characters owned by this player
  useEffect(() => {
    if (!userId || !playerName) return;
    for (const [id, entry] of Object.entries(characters)) {
      const char = entry?.history?.present;
      if (char && char.ownerId === userId && char.ownerName !== playerName) {
        updateCharacter(id, {
          type: 'SET_FIELD',
          payload: { field: 'ownerName', value: playerName }
        });
      }
    }
  }, [userId, playerName, characters, updateCharacter]);

  useEffect(() => {
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const hashParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.hash.replace(/^#/, '?')) : null;
    const urlCharId = urlParams?.get('charId') || hashParams?.get('charId');

    if (!isLoading && activeCharacterId && !characters[activeCharacterId]) {
      if (urlCharId && urlCharId === activeCharacterId) {
        // Do not reset activeCharacterId if specified via URL parameter/hash while waiting for remote sync
        return;
      }
      setActiveCharacterId(null);
    }
  }, [characters, activeCharacterId, isLoading]);

  useEffect(() => {
    const tooltipEl = document.createElement('div');
    tooltipEl.className = 'global-tooltip';
    document.body.appendChild(tooltipEl);

    let activeEl: HTMLElement | null = null;

    const handleMouseOver = (e: MouseEvent) => {
      // Disable mouse-over tooltips on touch screens to prevent phantom tooltips and layout shifts
      if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        return;
      }
      const target = e.target as HTMLElement;
      const tooltipTarget = target.closest('[data-tooltip]') as HTMLElement | null;

      if (!tooltipTarget) {
        if (activeEl) {
          tooltipEl.classList.remove('visible');
          activeEl = null;
        }
        return;
      }

      if (tooltipTarget === activeEl) return;
      activeEl = tooltipTarget;

      const text = tooltipTarget.getAttribute('data-tooltip');
      if (!text) {
        tooltipEl.classList.remove('visible');
        return;
      }

      const pos = tooltipTarget.getAttribute('data-tooltip-pos') || 'top';
      
      tooltipEl.textContent = text;
      tooltipEl.className = `global-tooltip global-tooltip-${pos}`;
      
      const rect = tooltipTarget.getBoundingClientRect();
      const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;

      let top = 0;
      let left = 0;

      if (pos === 'top') {
        left = rect.left + rect.width / 2 + scrollX;
        top = rect.top + scrollY;
      } else if (pos === 'bottom') {
        left = rect.left + rect.width / 2 + scrollX;
        top = rect.bottom + scrollY;
      } else if (pos === 'left') {
        left = rect.left + scrollX;
        top = rect.top + rect.height / 2 + scrollY;
      } else if (pos === 'right') {
        left = rect.right + scrollX;
        top = rect.top + rect.height / 2 + scrollY;
      }

      tooltipEl.style.left = `${left}px`;
      tooltipEl.style.top = `${top}px`;
      
      // Force reflow
      tooltipEl.offsetHeight;
      tooltipEl.classList.add('visible');
    };

    const handleMouseOut = (e: MouseEvent) => {
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      if (activeEl && (!relatedTarget || !activeEl.contains(relatedTarget))) {
        tooltipEl.classList.remove('visible');
        activeEl = null;
      }
    };

    const handleScrollOrResize = () => {
      if (activeEl) {
        const rect = activeEl.getBoundingClientRect();
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;
        const pos = activeEl.getAttribute('data-tooltip-pos') || 'top';

        let top = 0;
        let left = 0;

        if (pos === 'top') {
          left = rect.left + rect.width / 2 + scrollX;
          top = rect.top + scrollY;
        } else if (pos === 'bottom') {
          left = rect.left + rect.width / 2 + scrollX;
          top = rect.bottom + scrollY;
        } else if (pos === 'left') {
          left = rect.left + scrollX;
          top = rect.top + rect.height / 2 + scrollY;
        } else if (pos === 'right') {
          left = rect.right + scrollX;
          top = rect.top + rect.height / 2 + scrollY;
        }

        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${top}px`;
      }
    };

    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      if (document.body.contains(tooltipEl)) {
        document.body.removeChild(tooltipEl);
      }
    };
  }, []);

  const handleSelectCharacter = useCallback((id: string) => {
    const character = characters[id]?.history.present;
    const currentId = userId || (typeof window !== 'undefined' ? localStorage.getItem('com.antigravity.dnd-sheet/player_id') : null);
    const currentName = playerName || 'Игрок';

    if (character && !character.ownerId && currentId && userRole !== 'GM') {
      console.log(`[DND Sheet] Assigning ownership of character "${character.name}" to player:`, currentId);
      updateCharacter(id, { 
        type: 'SET_FIELD', 
        payload: { field: 'ownerId', value: currentId } 
      });
      updateCharacter(id, {
        type: 'SET_FIELD',
        payload: { field: 'ownerName', value: currentName }
      });
    }
    setActiveCharacterId(id);
  }, [characters, updateCharacter, playerName, userRole, userId]);

  const handleCreateCharacter = useCallback(() => {
    const newId = generateUUID();
    const newCharacter: Character = structuredClone(defaultCharacterState);
    newCharacter.name = 'Новый персонаж';
    
    let currentId = userId || (typeof window !== 'undefined' ? localStorage.getItem('com.antigravity.dnd-sheet/player_id') : null);
    let currentName = playerName || (typeof window !== 'undefined' ? localStorage.getItem('com.antigravity.dnd-sheet/player_name') : null) || 'Игрок';

    if (isOwlbear() && typeof OBR !== 'undefined') {
      try {
        if (!currentId && OBR.player?.id) currentId = OBR.player.id;
      } catch (e) {}
    }

    if (userRole !== 'GM' && currentId) {
      newCharacter.ownerId = currentId;
      newCharacter.ownerName = currentName;
    }

    addCharacter(newId, newCharacter);
    setActiveCharacterId(newId);
  }, [addCharacter, playerName, userId, userRole]);

  const handleDeleteCharacter = useCallback((id: string) => {
    const characterToDelete = characters[id]?.history.present;
    if (!characterToDelete) return;

    const myId = userId || (isOwlbear() && typeof OBR !== 'undefined' ? OBR.player?.id : (typeof window !== 'undefined' ? localStorage.getItem('com.antigravity.dnd-sheet/player_id') : ''));
    const isGM = userRole === 'GM';
    const isOwner = isGM || !characterToDelete.ownerId || !myId || characterToDelete.ownerId === myId || characterToDelete.ownerName === playerName;

    if (!isOwner) {
      addNotification('Вы не можете удалить персонажа, принадлежащего другому игроку.', 'error');
      return;
    }

    setCharacterPendingDeletion({ id, name: characterToDelete.name });
  }, [characters, userId, userRole, playerName, addNotification]);

  const handleDuplicateCharacter = useCallback((id: string) => {
    const characterToCopy = characters[id]?.history.present;
    if (!characterToCopy) return;

    const newId = generateUUID();
    const newCharacter: Character = structuredClone(characterToCopy);
    newCharacter.name = `${characterToCopy.name} (копия)`;

    const currentId = userId || (typeof window !== 'undefined' ? localStorage.getItem('com.antigravity.dnd-sheet/player_id') : null);
    const currentName = playerName || 'Игрок';

    if (currentId && userRole !== 'GM') {
      newCharacter.ownerId = currentId;
      newCharacter.ownerName = currentName;
    }

    addCharacter(newId, newCharacter);
    setActiveCharacterId(newId);
  }, [characters, addCharacter, playerName, userId, userRole]);

  const handleAddCharacter = useCallback((id: string, character: Character) => {
    const charWithNewOwner = { ...character };
    const currentId = userId || (typeof window !== 'undefined' ? localStorage.getItem('com.antigravity.dnd-sheet/player_id') : null);
    const currentName = playerName || 'Игрок';

    if (currentId && userRole !== 'GM') {
      charWithNewOwner.ownerId = currentId;
      charWithNewOwner.ownerName = currentName;
    }
    addCharacter(id, charWithNewOwner);
  }, [addCharacter, userId, playerName, userRole]);

  useEffect(() => {
    const unsubscribe = localBridge.subscribe((event: MessageEvent) => {
      const data = event.data;
      if (data && typeof data === 'object' && data.type === 'SELECT_CHARACTER' && data.charId) {
        setActiveCharacterId(data.charId);
      }
    });
    return unsubscribe;
  }, []);

  const handleOpenStandalone = useCallback((charId?: string) => {
    if (typeof window === 'undefined') return;
    const origin = window.location.origin;
    let path = window.location.pathname.replace(/\/index\.html.*/i, '');
    if (!path.endsWith('/')) {
      path += '/';
    }

    const currentId = userId || (isOwlbear() && typeof OBR !== 'undefined' ? OBR.player?.id : (localStorage.getItem('com.antigravity.dnd-sheet/player_id') || ''));
    const currentName = playerName || (typeof window !== 'undefined' ? localStorage.getItem('com.antigravity.dnd-sheet/player_name') : null) || 'Игрок';
    const currentRole = userRole || 'PLAYER';

    let query = `?userId=${encodeURIComponent(currentId || '')}&userRole=${encodeURIComponent(currentRole)}&playerName=${encodeURIComponent(currentName)}`;
    if (charId) {
      query += `&charId=${encodeURIComponent(charId)}`;
    }

    const cleanUrl = origin + path + query;
    console.log('[DND Sheet] Opening standalone window:', cleanUrl);
    const win = window.open(cleanUrl, '_blank');
    if (win) {
      localBridge.registerChildWindow(win);
    }
  }, [userId, userRole, playerName]);

  const isGM = userRole === 'GM';

  const checkIsReadOnly = useCallback((char?: Character | null) => {
    if (!char) return false;
    if (userRole === 'GM') return true; // GM is permanently in read-only mode for player character sheets
    if (!char.ownerId) return false; // Unowned characters are editable by players
    if (userId && char.ownerId === userId) return false;
    if (playerName && char.ownerName === playerName) return false;
    return true;
  }, [userRole, userId, playerName]);

  const handleUpdateCharacter = useCallback((action: CharacterAction) => {
    if (activeCharacterId) {
      const activeCharacterState = characters[activeCharacterId];
      const activeChar = activeCharacterState?.history.present;
      if (checkIsReadOnly(activeChar)) {
        console.warn('[DND Sheet] Blocked update for read-only character:', activeCharacterId);
        return;
      }
      updateCharacter(activeCharacterId, action);
    }
  }, [activeCharacterId, updateCharacter, characters, checkIsReadOnly]);

  const handleUndo = useCallback(() => {
    if (activeCharacterId) {
      const activeCharacterState = characters[activeCharacterId];
      const activeChar = activeCharacterState?.history.present;
      if (checkIsReadOnly(activeChar)) return;
      undo(activeCharacterId);
    }
  }, [activeCharacterId, undo, characters, checkIsReadOnly]);

  const handleRedo = useCallback(() => {
    if (activeCharacterId) {
      const activeCharacterState = characters[activeCharacterId];
      const activeChar = activeCharacterState?.history.present;
      if (checkIsReadOnly(activeChar)) return;
      redo(activeCharacterId);
    }
  }, [activeCharacterId, redo, characters, checkIsReadOnly]);

  // Преобразуем полное состояние персонажей в упрощенный Record<string, Character> для экрана выбора.
  const characterList = useMemo(() => {
    return Object.fromEntries(
      Object.entries(characters).map(([id, data]) => [id, data.history.present] as [string, Character])
    );
  }, [characters]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center text-[var(--color-text-base)]">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-[var(--color-accent-primary)] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-lg font-semibold tracking-wide">Загрузка персонажей...</p>
        </div>
      </div>
    );
  }

  const confirmDeletion = () => {
    if (characterPendingDeletion) {
      deleteCharacter(characterPendingDeletion.id);
      setCharacterPendingDeletion(null);
    }
  };

  const cancelDeletion = () => {
    setCharacterPendingDeletion(null);
  };

  const activeCharacterState = activeCharacterId ? characters[activeCharacterId] : null;
  const activeCharacter = activeCharacterState?.history.present;
  const isReadOnly = checkIsReadOnly(activeCharacter);
  const activeLog: LogEntry[] = activeCharacterState?.log || [];
  const canUndo = !isReadOnly && (activeCharacterState?.history.past.length ?? 0) > 0;
  const canRedo = !isReadOnly && (activeCharacterState?.history.future.length ?? 0) > 0;
  
  const isConnectionLost = syncStatus === 'error';

  return (
    <>
      {/* Connection Lost Warning Banner */}
      {isConnectionLost && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[10000] w-[94%] max-w-xl bg-gradient-to-r from-amber-950/95 via-slate-900/98 to-amber-950/95 border border-amber-500/60 backdrop-blur-md text-amber-200 px-4 py-3 rounded-2xl shadow-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-2.5">
            <span className="text-xl animate-pulse">⚠️</span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-amber-400">В данный момент нет соединения с Owlbear Rodeo</span>
              <span className="text-[11px] text-slate-300">Изменения сохраняются локально и автоматически отправятся ГМу при восстановлении связи.</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') window.location.reload();
            }}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow transition-all whitespace-nowrap"
          >
            🔄 Обновить
          </button>
        </div>
      )}

      <ConfirmationModal
        isOpen={!!characterPendingDeletion}
        title="Подтвердите удаление"
        message={`Вы уверены, что хотите удалить персонажа "${characterPendingDeletion?.name}"?\nЭто действие необратимо.`}
        onConfirm={confirmDeletion}
        onCancel={cancelDeletion}
        confirmText="Удалить навсегда"
        cancelText="Отмена"
      />

      <HistoryLogModal
        isOpen={isHistoryLogOpen}
        onClose={() => setIsHistoryLogOpen(false)}
        log={activeLog}
      />

      <PlayerNameModal
        isOpen={!!editingOwnerNameCharId}
        initialName={editingOwnerNameCharId ? characters[editingOwnerNameCharId]?.history?.present?.ownerName || playerName || 'Игрок' : ''}
        onCancel={() => setEditingOwnerNameCharId(null)}
        onConfirm={(newName) => {
          if (editingOwnerNameCharId) {
            updateCharacter(editingOwnerNameCharId, {
              type: 'SET_FIELD',
              payload: { field: 'ownerName', value: newName }
            });
            setPlayerName(newName);
            try { localStorage.setItem('com.antigravity.dnd-sheet/player_name', newName); } catch (e) {}
            setEditingOwnerNameCharId(null);
          }
        }}
      />

      {activeCharacter && activeCharacterId ? (
        <CharacterProvider character={activeCharacter} dispatch={handleUpdateCharacter}>
            <CharacterSheet
              key={activeCharacterId}
              onOpenCharacterManager={() => setActiveCharacterId(null)}
              onUndo={handleUndo}
              onRedo={handleRedo}
              canUndo={canUndo}
              canRedo={canRedo}
              onOpenHistoryLog={() => setIsHistoryLogOpen(true)}
              isReadOnly={!!isReadOnly}
              syncStatus={syncStatus}
              onSyncCharacter={() => syncCharacter(activeCharacterId)}
              onClearLocalCache={() => clearLocalCache(activeCharacterId)}
              onDeleteCharacter={() => handleDeleteCharacter(activeCharacterId)}
              onOpenStandalone={() => handleOpenStandalone(activeCharacterId)}
              isGM={isGM}
            />
        </CharacterProvider>
      ) : (
        <CharacterSelectionScreen
          characters={characterList}
          syncingCharacters={syncingCharacters}
          currentUserId={userId}
          currentUserName={playerName}
          activeBoardCharacterId={activeBoardCharacterId}
          onSelectActiveBoardCharacter={handleToggleActiveBoardCharacter}
          onSelectCharacter={handleSelectCharacter}
          onCreateCharacter={handleCreateCharacter}
          onDeleteCharacter={handleDeleteCharacter}
          onDuplicateCharacter={handleDuplicateCharacter}
          onAddCharacter={handleAddCharacter}
          onOpenStandalone={handleOpenStandalone}
          onSyncCharacter={syncCharacter}
          onClearLocalCache={clearLocalCache}
          onExportVault={exportVaultData}
          onImportVault={importVaultData}
          onUpdateOwnerName={(charId) => setEditingOwnerNameCharId(charId)}
          isGM={isGM}
        />
      )}

      {formattingMenuPos && (
        <TextFormattingContextMenu
          x={formattingMenuPos.x}
          y={formattingMenuPos.y}
          targetElement={formattingMenuPos.target}
          onClose={() => setFormattingMenuPos(null)}
          onApplyFormat={() => setFormattingMenuPos(null)}
        />
      )}
    </>
  );
}

interface ResizeHandleProps {
  position: 'tl' | 'tr' | 'bl' | 'br';
}

const ResizeHandle: React.FC<ResizeHandleProps> = ({ position }) => {
  if (!isOwlbear()) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const initialX = e.clientX;
    const initialY = e.clientY;
    const initialWidth = window.innerWidth;
    const initialHeight = window.innerHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - initialX;
      const deltaY = moveEvent.clientY - initialY;
      
      let newWidth = initialWidth;
      let newHeight = initialHeight;

      if (position === 'br') {
        newWidth = initialWidth + deltaX;
        newHeight = initialHeight + deltaY;
      } else if (position === 'bl') {
        newWidth = initialWidth - deltaX;
        newHeight = initialHeight + deltaY;
      } else if (position === 'tr') {
        newWidth = initialWidth + deltaX;
        newHeight = initialHeight - deltaY;
      } else if (position === 'tl') {
        newWidth = initialWidth - deltaX;
        newHeight = initialHeight - deltaY;
      }

      newWidth = Math.max(600, Math.min(1920, newWidth));
      newHeight = Math.max(400, Math.min(1080, newHeight));
      
      OBR.action.setWidth(newWidth);
      OBR.action.setHeight(newHeight);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const positionClasses = {
    tl: 'top-0 left-0 cursor-nwse-resize rounded-br border-t-2 border-l-2',
    tr: 'top-0 right-0 cursor-nesw-resize rounded-bl border-t-2 border-r-2',
    bl: 'bottom-0 left-0 cursor-nesw-resize rounded-tr border-b-2 border-l-2',
    br: 'bottom-0 right-0 cursor-nwse-resize rounded-tl border-b-2 border-r-2',
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`fixed z-[9999] w-4 h-4 border-transparent hover:border-white/30 active:border-white/50 bg-transparent hover:bg-white/5 transition-colors select-none ${positionClasses[position]}`}
      title="Изменить размер"
      aria-label={`Изменить размер (${position.toUpperCase()})`}
    />
  );
};

const App: React.FC = () => {
  return (
    <NotificationProvider>
      <AppContent />
      <ResizeHandle position="tl" />
      <ResizeHandle position="tr" />
      <ResizeHandle position="bl" />
      <ResizeHandle position="br" />
    </NotificationProvider>
  );
};

export default App;