import React, { createContext, useState, useCallback, useContext, useMemo, useEffect } from 'react';
import OBR from '@owlbear-rodeo/sdk';
import { NotificationToast, NotificationType } from '../components/NotificationToast';
import { generateUUID } from '../utils/uuid';
import { isOwlbear, SESSION_CLIENT_ID } from '../utils/storage';
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
        let playerName = 'Игрок';
        try {
          playerName = await OBR.player.getName() || 'Игрок';
        } catch (e) {
          console.warn('Failed to retrieve player name from OBR:', e);
        }
        
        // Send to ALL clients in the room (both local and remote)
        console.log('[DND Sheet] Broadcasting roll data to ALL destination:', { playerName, characterName, result });
        await OBR.broadcast.sendMessage(ROLL_CHANNEL, {
          playerName,
          characterName,
          result
        }, { destination: 'ALL' });
      } catch (err) {
        console.error('[DND Sheet] Failed to send roll broadcast:', err);
      }
    } else {
      // Standalone mode: send via local bridge BroadcastChannel and window.opener
      const payload = {
        type: 'ROLL_DICE',
        characterName,
        result,
        senderId: SESSION_CLIENT_ID
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
      console.log('[DND Sheet] Subscribing to broadcast channel:', ROLL_CHANNEL);
      const unsubscribe = OBR.broadcast.onMessage(ROLL_CHANNEL, (event) => {
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

          // Open a beautiful custom roll popup window in the bottom-right corner of the VTT
          // Get the base path dynamically from the current window location to support subdirectory hosting
          const pathName = window.location.pathname;
          const basePath = pathName.substring(0, pathName.lastIndexOf('/'));
          const popoverUrl = window.location.origin + basePath + 
            `/index.html?mode=roll-popup` +
            `&playerName=${encodeURIComponent(playerName)}` +
            `&characterName=${encodeURIComponent(characterName)}` +
            `&rollName=${encodeURIComponent(result.name)}` +
            `&total=${result.total}` +
            `&rollDetails=${encodeURIComponent(`${rollDetails} ${modSign}`)}`;

          const popupWidth = 240;
          const popupHeight = 280;
          
          // Calculate bottom-right positioning dynamically based on current viewport
          const leftPos = Math.max(10, window.innerWidth - popupWidth - 30);
          const topPos = Math.max(10, window.innerHeight - popupHeight - 30);

          console.log('[DND Sheet] Launching custom roll popup at:', { leftPos, topPos });
          
          OBR.popover.open({
            id: 'com.antigravity.dnd-sheet/roll-popup',
            url: popoverUrl,
            width: popupWidth,
            height: popupHeight,
            anchorPosition: { left: leftPos, top: topPos },
            disableClickAway: true,
          }).catch((err) => {
            console.error('[DND Sheet] Failed to open custom roll popup:', err);
          });

          // Also show React toast within the character sheet as a backup
          const toastMessageText = `${playerName} (${characterName}) совершил бросок:\n**${result.name}**\n🎲 **${result.total}** (${rollDetails} ${modSign})`;
          addNotification(toastMessageText, 'info');

          // Broadcast notification to standalone tab
          const notifPayload = {
            type: 'SHOW_NOTIFICATION',
            message: toastMessageText,
            notificationType: 'info',
            senderId: SESSION_CLIENT_ID
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

      return unsubscribe;
    }
  }, [addNotification]);

  // Listen to BroadcastChannel and window messages for standalone/iframe communication
  useEffect(() => {
    const channel = new BroadcastChannel('com.antigravity.dnd-sheet/local-bridge');
    
    const handleSyncMessage = (payload: any) => {
      if (!payload || payload.senderId === SESSION_CLIENT_ID) return;

      if (payload.type === 'ROLL_DICE' && isOwlbear()) {
        console.log('[DND Sheet] Bridge Sync: Proxying roll from standalone tab to OBR:', payload);
        broadcastRoll(payload.characterName, payload.result);
      } else if (payload.type === 'SHOW_NOTIFICATION') {
        console.log('[DND Sheet] Bridge Sync: Showing notification toast:', payload.message);
        addNotification(payload.message, payload.notificationType);
      }
    };

    const handleLocalBridgeMessage = (event: MessageEvent) => {
      handleSyncMessage(event.data);
    };

    const handleWindowMessage = (event: MessageEvent) => {
      handleSyncMessage(event.data);
    };

    channel.addEventListener('message', handleLocalBridgeMessage);
    window.addEventListener('message', handleWindowMessage);

    return () => {
      channel.removeEventListener('message', handleLocalBridgeMessage);
      window.removeEventListener('message', handleWindowMessage);
      channel.close();
    };
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
