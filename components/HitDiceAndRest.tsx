import React, { useState, useEffect } from 'react';
import { useCharacterDispatch } from '../context/CharacterContext';
import { HitDie } from '../types';

interface HitDiceAndRestProps {
    onShortRestClick: () => void;
    currentHitDice: number;
    totalHitDice: number;
    hitDieValue: HitDie;
    minimal?: boolean;
}

export const HitDiceAndRest: React.FC<HitDiceAndRestProps> = React.memo(({ onShortRestClick, currentHitDice, totalHitDice, hitDieValue, minimal = false }) => {
    const dispatch = useCharacterDispatch();

    const [isEditing, setIsEditing] = useState(false);
    const [editedValue, setEditedValue] = useState(currentHitDice);

    useEffect(() => {
        if (!isEditing) {
            setEditedValue(currentHitDice);
        }
    }, [currentHitDice, isEditing]);

    const handleSubmit = () => {
        const newValue = Number.isNaN(editedValue) ? 0 : editedValue;
        if (newValue !== currentHitDice) {
            dispatch({ type: 'SET_CURRENT_HIT_DICE', payload: newValue });
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSubmit();
        } else if (e.key === 'Escape') {
            setEditedValue(currentHitDice);
            setIsEditing(false);
        }
    };

    const handleLongRest = () => {
        dispatch({ type: 'LONG_REST' });
    }

    const content = (
        <div className="flex flex-col gap-2 w-full">
            <div className="flex items-center justify-between">
                <span className={`${minimal ? 'text-xs font-bold text-[var(--color-text-medium)] uppercase' : 'text-sm font-semibold text-[var(--color-text-base)]'}`}>
                    {minimal ? `Кости (d${hitDieValue})` : `Кости здоровья (d${hitDieValue}):`}
                </span>
                <div 
                    className="text-base font-bold flex items-center gap-1 cursor-pointer group"
                    onClick={() => setIsEditing(true)}
                    data-tooltip="Изменить текущее количество костей здоровья"
                >
                    {isEditing ? (
                        <input
                            type="number"
                            value={editedValue}
                            onChange={(e) => setEditedValue(parseInt(e.target.value, 10))}
                            onBlur={handleSubmit}
                            onKeyDown={handleKeyDown}
                            className="w-10 bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded py-0 px-1 text-center text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
                            autoFocus
                            onFocus={(e) => e.target.select()}
                            min="0"
                            max={totalHitDice}
                        />
                    ) : (
                        <span className="group-hover:text-[var(--color-accent-primary)] transition-colors font-extrabold">{currentHitDice}</span>
                    )}
                    <span className="text-[var(--color-text-subtle)] font-normal text-xs">/</span>
                    <span className="font-extrabold text-sm">{totalHitDice}</span>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 w-full mt-0.5">
                <button
                    onClick={onShortRestClick}
                    disabled={currentHitDice === 0}
                    className="bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary-hover)] text-white font-bold py-1.5 px-1 rounded-lg transition-all duration-150 text-[10px] shadow active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap text-center"
                >
                    {minimal ? 'Короткий' : 'Короткий отдых'}
                </button>
                <button
                    onClick={handleLongRest}
                    className="bg-[var(--color-accent-primary-dark)] hover:bg-[var(--color-accent-primary-darker)] text-white font-bold py-1.5 px-1 rounded-lg transition-all duration-150 text-[10px] shadow active:scale-95 whitespace-nowrap text-center"
                >
                    {minimal ? 'Длинный' : 'Длинный отдых'}
                </button>
            </div>
        </div>
    );

    if (minimal) {
        return content;
    }

    return (
        <div className="bg-[var(--color-surface-opaque)] p-4 rounded-xl shadow-lg border border-[var(--color-border)] flex flex-col gap-3">
            {content}
        </div>
    );
});
