import React, { createContext, useState, useCallback, useContext, useMemo, useEffect } from 'react';
import OBR from '@owlbear-rodeo/sdk';
import { NotificationToast, NotificationType } from '../components/NotificationToast';
import { generateUUID } from '../utils/uuid';
import { isOwlbear, SESSION_CLIENT_ID } from '../utils/storage';
import { localBridge } from '../utils/bridgeService';
import { RollResult, RollType } from '../types';

interface Notification {
  id: string;
  message: string;
  type: NotificationType;
}

interface NotificationContextType {
  addNotification: (message: string, type?: NotificationType) => void;
  broadcastRoll: (characterName: string, result: RollResult) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const ROLL_CHANNEL = 'com.antigravity.dnd-sheet/rolls';

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((message: string, type: NotificationType = 'error') => {
    const id = generateUUID();
    setNotifications(prev => [...prev, { id, message, type }]);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // Broadcast roll to all players in the room
  const broadcastRoll = useCallback(async (characterName: string, result: RollResult) => {
    if (isOwlbear()) {
      try {
        let playerName = typeof window !== 'undefined' ? localStorage.getItem('com.antigravity.dnd-sheet/player_name') || 'Игрок' : 'Игрок';
        try {
          if (typeof OBR !== 'undefined' && OBR.player) {
            const obrName = await OBR.player.getName();
            if (obrName) playerName = obrName;
          }
        } catch (e) {
          console.warn('Failed to retrieve player name from OBR:', e);
        }
        
        // Send broadcast to all other clients in the room
        console.log('[DND Sheet] Broadcasting roll data to room players:', { playerName, characterName, result });
        await OBR.broadcast.sendMessage(ROLL_CHANNEL, {
          playerName,
          characterName,
          result,
          msgId: Math.random().toString(36).substring(2) + Date.now().toString(36)
        });
      } catch (err) {
        console.error('[DND Sheet] Failed to send roll broadcast:', err);
      }
    } else {
      // Standalone mode: send via local bridge BroadcastChannel and parent window bridge
      const payload = {
        type: 'ROLL_DICE',
        characterName,
        result,
        senderId: SESSION_CLIENT_ID,
        msgId: Math.random().toString(36).substring(2) + Date.now().toString(36)
      };
      try {
        const channel = new BroadcastChannel('com.antigravity.dnd-sheet/local-bridge');
        channel.postMessage(payload);
        channel.close();
      } catch (e) {}

      if (typeof window !== 'undefined') {
        if ((window as any).sendDndMessageToOpener) {
          try {
            (window as any).sendDndMessageToOpener(payload);
          } catch (e) {}
        } else if (window.opener) {
          try {
            window.opener.postMessage(payload, '*');
          } catch (e) {}
        }
      }
    }
  }, []);

  // Listen for rolls from other players and our own broadcast
  useEffect(() => {
    if (isOwlbear()) {
      let unsub: (() => void) | null = null;

      const setupListener = () => {
        console.log('[DND Sheet] Subscribing to broadcast channel:', ROLL_CHANNEL);
        unsub = OBR.broadcast.onMessage(ROLL_CHANNEL, (event) => {
          console.log('[DND Sheet] Received broadcast message:', event);
          const payload = event.data as {
            playerName: string;
            characterName: string;
            result: RollResult;
          };

          if (payload && payload.playerName && payload.result) {
            const { result, playerName, characterName } = payload;
            const modSign = result.modifier >= 0 ? `+${result.modifier}` : `${result.modifier}`;
            
            let rollDetails = '';
            if ((result.rollType === RollType.Advantage || result.rollType === RollType.Disadvantage) && result.roll2 !== undefined) {
              const typeStr = result.rollType === RollType.Advantage ? 'Преимущество' : 'Помеха';
              rollDetails = `${typeStr}: [${result.roll1}, ${result.roll2}] -> выбор ${result.chosenRoll}`;
            } else {
              rollDetails = `кубик: ${result.chosenRoll}`;
            }

            if (result.bonusDiceRoll) {
              rollDetails += ` + бонус: ${result.bonusDiceRoll}`;
            }

            // Open a beautiful custom roll popup window at top-center of the VTT
            const pathName = window.location.pathname;
            const basePath = pathName.substring(0, pathName.lastIndexOf('/'));
            const popoverUrl = window.location.origin + basePath + 
              `/index.html?mode=roll-popup` +
              `&playerName=${encodeURIComponent(playerName)}` +
              `&characterName=${encodeURIComponent(characterName)}` +
              `&rollName=${encodeURIComponent(result.name)}` +
              `&total=${result.total}` +
              `&rollDetails=${encodeURIComponent(`${rollDetails} ${modSign}`)}`;

            const popupWidth = 260;
            const popupHeight = 260;
            
            // Calculate Top-Center positioning dynamically based on current viewport
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1024;
            const popoverX = Math.max(10, Math.floor((viewportWidth - popupWidth) / 2));
            const popoverY = 20; // 20px from top of screen

            OBR.popover.open({
              id: 'com.antigravity.dnd-sheet/roll-toast-popover',
              url: popoverUrl,
              height: popupHeight,
              width: popupWidth,
              anchorPosition: { left: popoverX, top: popoverY },
              anchorReference: 'POSITION',
              anchorOrigin: { horizontal: 'CENTER', vertical: 'TOP' },
              transformOrigin: { horizontal: 'CENTER', vertical: 'TOP' },
              disableClickAway: true
            }).catch(err => {
              console.warn('[DND Sheet] Popover failed, falling back to notification toast:', err);
              addNotification(`${playerName} (${characterName}): ${result.name} = ${result.total} (${rollDetails} ${modSign})`, 'info');
            });

            // Auto-close popover after 4.5 seconds
            setTimeout(() => {
              OBR.popover.close('com.antigravity.dnd-sheet/roll-toast-popover').catch(() => {});
            }, 4500);

            // Send notification over BroadcastChannel to any open standalone tabs
            const notifPayload = {
              type: 'SHOW_NOTIFICATION',
              message: `${playerName} (${characterName}): ${result.name} = ${result.total} (${rollDetails} ${modSign})`,
              notificationType: 'info',
              senderId: SESSION_CLIENT_ID,
              msgId: Math.random().toString(36).substring(2) + Date.now().toString(36)
            };
            try {
              const channel = new BroadcastChannel('com.antigravity.dnd-sheet/local-bridge');
              channel.postMessage(notifPayload);
              channel.close();
            } catch (e) {}

            if (typeof window !== 'undefined') {
              const opened = (window as any).__dndOpenedWindows || [];
              opened.forEach((win: any) => {
                if (win && !win.closed) {
                  win.postMessage(notifPayload, '*');
                }
              });
            }
          }
        });
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
  }, [addNotification]);

  // Listen to local bridge events for standalone/iframe communication
  useEffect(() => {
    const unsubscribe = localBridge.subscribe((event) => {
      const payload = event.data;
      if (!payload) return;

      const msgId = payload.msgId || `${payload.type}-${JSON.stringify(payload.result || payload.message)}`;
      if (localBridge.isDuplicateMessage(msgId, 500)) {
        return;
      }

      if (payload.type === 'ROLL_DICE' && isOwlbear()) {
        console.log('[DND Sheet] Bridge Sync: Proxying roll from standalone tab to OBR:', payload);
        broadcastRoll(payload.characterName, payload.result);
      } else if (payload.type === 'SHOW_NOTIFICATION') {
        console.log('[DND Sheet] Bridge Sync: Showing notification toast:', payload.message);
        addNotification(payload.message, payload.notificationType);
      }
    });

    return unsubscribe;
  }, [broadcastRoll, addNotification]);

  const contextValue = useMemo(() => ({ addNotification, broadcastRoll }), [addNotification, broadcastRoll]);

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col items-end space-y-2 text-left">
        {notifications.map(notification => (
          <NotificationToast
            key={notification.id}
            message={notification.message}
            type={notification.type}
            onClose={() => removeNotification(notification.id)}
          />
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

export const useNotifier = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifier must be used within a NotificationProvider');
  }
  return context;
};
