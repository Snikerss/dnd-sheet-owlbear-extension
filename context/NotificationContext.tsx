import React, { createContext, useState, useCallback, useContext, useMemo, useEffect } from 'react';
import OBR from '@owlbear-rodeo/sdk';
import { NotificationToast, NotificationType } from '../components/NotificationToast';
import { generateUUID } from '../utils/uuid';
import { isOwlbear } from '../utils/storage';
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
        const playerName = await OBR.player.getName();
        
        // Formulate roll details text
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

        // Show local notification at the top of the map
        const localMessageText = `Вы (${characterName}) бросили ${result.name}: 🎲 ${result.total} (${rollDetails} ${modSign})`;
        OBR.notification.show(localMessageText);

        // Send to others in the room
        OBR.broadcast.sendMessage(ROLL_CHANNEL, {
          playerName,
          characterName,
          result
        });
      } catch (err) {
        console.error('Failed to send roll broadcast:', err);
      }
    }
  }, []);

  // Listen for rolls from other players
  useEffect(() => {
    if (isOwlbear()) {
      const unsubscribe = OBR.broadcast.onMessage(ROLL_CHANNEL, (event) => {
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
            rollDetails = `кубики: ${result.chosenRoll}`;
          }

          if (result.bonusDiceRoll) {
            rollDetails += ` + бонус: ${result.bonusDiceRoll}`;
          }

          const messageText = `${playerName} (${characterName}) совершил бросок:\n**${result.name}**\n🎲 **${result.total}** (${rollDetails} ${modSign})`;
          
          addNotification(messageText, 'info');
        }
      });

      return unsubscribe;
    }
  }, [addNotification]);

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
