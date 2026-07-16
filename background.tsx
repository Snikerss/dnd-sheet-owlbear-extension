import OBR from '@owlbear-rodeo/sdk';
import { RollResult, RollType } from './types';

const ROLL_CHANNEL = 'com.antigravity.dnd-sheet/rolls';

OBR.onReady(() => {
  OBR.broadcast.onMessage(ROLL_CHANNEL, (event) => {
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

      const messageText = `${playerName} (${characterName}) бросил ${result.name}: 🎲 ${result.total} (${rollDetails} ${modSign})`;
      
      OBR.notification.show(messageText);
    }
  });
});
