import { useState, useEffect, useRef, useCallback } from 'react';
import { RollResult, RollType } from '../../types';
import { parseAndRoll } from '../../utils/dice';
import { generateUUID } from '../../utils/uuid';
import { useNotifier } from '../../context/NotificationContext';

interface UseRollToastOptions {
    characterName: string;
    onRollStart?: () => void;
}

export const useRollToast = ({ characterName, onRollStart }: UseRollToastOptions) => {
    const { broadcastRoll } = useNotifier();

    const [rollToastData, setRollToastData] = useState<RollResult | null>(null);
    const [isRollingDice, setIsRollingDice] = useState(false);

    const rollToastTimerRef = useRef<number | null>(null);
    const rollDelayTimerRef = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (rollToastTimerRef.current) clearTimeout(rollToastTimerRef.current);
            if (rollDelayTimerRef.current) clearTimeout(rollDelayTimerRef.current);
        };
    }, []);

    const handleRoll = useCallback((name: string, modifier: number, rollType: RollType, bonusDiceFormula?: string) => {
        if (rollToastTimerRef.current) clearTimeout(rollToastTimerRef.current);
        setRollToastData(null);
        setIsRollingDice(true);
        if (onRollStart) onRollStart(); // Close context menu immediately

        if (rollDelayTimerRef.current) clearTimeout(rollDelayTimerRef.current);
        rollDelayTimerRef.current = window.setTimeout(() => {
            rollDelayTimerRef.current = null;
            const roll1 = Math.floor(Math.random() * 20) + 1;
            let roll2: number | undefined = undefined;
            let chosenRoll: number;

            if (rollType === RollType.Normal) {
                chosenRoll = roll1;
            } else {
                roll2 = Math.floor(Math.random() * 20) + 1;
                chosenRoll = rollType === RollType.Advantage
                    ? Math.max(roll1, roll2)
                    : Math.min(roll1, roll2);
            }

            let bonusDiceResult = { total: 0 };
            if (bonusDiceFormula) {
                bonusDiceResult = parseAndRoll(bonusDiceFormula);
            }

            const rollResult = {
                id: generateUUID(),
                name,
                roll1,
                roll2,
                chosenRoll,
                modifier,
                total: chosenRoll + modifier + bonusDiceResult.total,
                rollType,
                diceType: 'd20',
                bonusDiceRoll: bonusDiceFormula ? bonusDiceResult.total : undefined,
                bonusDiceFormula: bonusDiceFormula || undefined,
            };
            setRollToastData(rollResult);
            broadcastRoll(characterName, rollResult);
            setIsRollingDice(false);
            rollToastTimerRef.current = window.setTimeout(() => setRollToastData(null), 3400);
        }, 800);
    }, [broadcastRoll, characterName, onRollStart]);

    const handleDamageRoll = useCallback((name: string, damageFormula: string) => {
        if (rollToastTimerRef.current) clearTimeout(rollToastTimerRef.current);
        setRollToastData(null);
        setIsRollingDice(true);

        if (rollDelayTimerRef.current) clearTimeout(rollDelayTimerRef.current);
        rollDelayTimerRef.current = window.setTimeout(() => {
            rollDelayTimerRef.current = null;
            const { total, diceResult, modifier } = parseAndRoll(damageFormula);

            const rollResult = {
                id: generateUUID(),
                name: `Урон: ${name}`,
                roll1: diceResult,
                chosenRoll: diceResult,
                modifier: modifier,
                total: total,
                rollType: RollType.Normal,
                diceType: damageFormula,
            };
            setRollToastData(rollResult);
            broadcastRoll(characterName, rollResult);
            setIsRollingDice(false);
            rollToastTimerRef.current = window.setTimeout(() => setRollToastData(null), 3400);
        }, 800);
    }, [broadcastRoll, characterName]);

    const showRollResult = useCallback((result: RollResult) => {
        if (rollToastTimerRef.current) clearTimeout(rollToastTimerRef.current);
        setRollToastData(result);
        broadcastRoll(characterName, result);
        rollToastTimerRef.current = window.setTimeout(() => setRollToastData(null), 3400);
    }, [broadcastRoll, characterName]);

    return { rollToastData, isRollingDice, setIsRollingDice, handleRoll, handleDamageRoll, showRollResult };
};
