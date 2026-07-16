import React, { useState, useEffect, useMemo } from 'react';
import { calculateModifier } from '../utils/characterCalculations';
import { Ability } from '../types';

const JumpStat: React.FC<{ 
    baseValue: number;
    bonus: number;
    itemBonus?: number;
    onBonusChange: (newBonus: number) => void;
    label: string; 
}> = ({ baseValue, bonus, itemBonus = 0, onBonusChange, label }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedBonus, setEditedBonus] = useState(bonus);
    const totalValue = baseValue + bonus + itemBonus;

    useEffect(() => {
        if (!isEditing) setEditedBonus(bonus);
    }, [bonus, isEditing]);

    const handleSubmit = () => {
        const newBonus = isNaN(editedBonus) ? 0 : editedBonus;
        if (newBonus !== bonus) onBonusChange(newBonus);
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleSubmit();
        if (e.key === 'Escape') {
            setEditedBonus(bonus);
            setIsEditing(false);
            (e.target as HTMLInputElement).blur();
        }
    };

    return (
        <div className="bg-[var(--color-surface-inset)] p-2 rounded-lg flex flex-col items-center justify-center text-center min-h-[85px] border border-transparent hover:border-teal-500/50 transition-all duration-200">
            <div className="flex flex-col items-center w-full">
                <span className="text-[11px] text-[var(--color-text-medium)] tracking-wider uppercase font-bold mt-1">Прыжок {label}</span>
                <div 
                    className="text-2xl font-extrabold text-[var(--color-text-base)] mt-0.5 cursor-pointer hover:text-[var(--color-accent-primary)] transition-colors"
                    onClick={() => !isEditing && setIsEditing(true)}
                    data-tooltip="Изменить бонус"
                >
                    {totalValue} <span className="text-xs font-normal text-[var(--color-text-muted)]">фт.</span>
                </div>
                
                <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5 flex items-center justify-center min-h-[14px] font-medium">
                    {isEditing ? (
                        <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                            <span>{baseValue}+</span>
                            <input
                                type="number"
                                value={editedBonus}
                                onChange={(e) => setEditedBonus(parseInt(e.target.value, 10))}
                                onBlur={handleSubmit}
                                onKeyDown={handleKeyDown}
                                className="w-16 h-8 bg-[var(--color-background)] border border-slate-700/50 hover:border-teal-500/30 focus:border-[var(--color-accent-primary-hover)] rounded-xl text-center text-xs font-extrabold focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-primary-hover)] text-[var(--color-text-base)] shadow-inner transition-all duration-150"
                                autoFocus
                                onFocus={(e) => e.target.select()}
                            />
                            {itemBonus !== 0 && <span className="text-teal-400 font-semibold">+{itemBonus}</span>}
                        </div>
                    ) : (
                        <span
                            data-tooltip={
                                label === "в длину" 
                                    ? "Дистанция длинного прыжка с разбега равна значению Силы. С места — вдвое меньше." 
                                    : "Высота высокого прыжка с разбега равна 3 + модификатор Силы. С места — вдвое меньше."
                            }
                        >
                            ({baseValue}
                            {bonus !== 0 && `${bonus > 0 ? '+' : ''}${bonus}`}
                            {itemBonus !== 0 && <span className="text-teal-400 font-semibold">+{itemBonus}</span>}
                            ) • {Math.floor(totalValue / 2)} фт. <span className="text-[9px] text-[var(--color-text-muted)] font-normal">с места</span>
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export const Speed: React.FC<{
    speed: number;
    speedBonus: number;
    itemSpeedBonus?: number;
    longJumpBonus: number;
    itemLongJumpBonus?: number;
    highJumpBonus: number;
    itemHighJumpBonus?: number;
    scores: Record<Ability, number>;
    onSpeedChange: (newSpeed: number) => void;
    onSpeedBonusChange: (newBonus: number) => void;
    onLongJumpBonusChange: (newBonus: number) => void;
    onHighJumpBonusChange: (newBonus: number) => void;
    minimal?: boolean;
    flat?: boolean;
}> = React.memo(({
    speed,
    speedBonus,
    itemSpeedBonus = 0,
    longJumpBonus,
    itemLongJumpBonus = 0,
    highJumpBonus,
    itemHighJumpBonus = 0,
    scores,
    onSpeedChange,
    onSpeedBonusChange,
    onLongJumpBonusChange,
    onHighJumpBonusChange,
    minimal = false,
    flat = false
}) => { 
    const strModifier = useMemo(() => calculateModifier(scores.STR), [scores.STR]);
    const longJumpBase = useMemo(() => scores.STR, [scores.STR]);
    const highJumpBase = useMemo(() => Math.max(0, 3 + strModifier), [strModifier]);
    
    const [isEditingBase, setIsEditingBase] = useState(false);
    const [isEditingBonus, setIsEditingBonus] = useState(false);
    const [editedBaseSpeed, setEditedBaseSpeed] = useState(speed);
    const [editedBonusSpeed, setEditedBonusSpeed] = useState(speedBonus);
    const totalSpeed = speed + speedBonus + itemSpeedBonus;

    useEffect(() => {
        if (!isEditingBase) setEditedBaseSpeed(speed);
    }, [speed, isEditingBase]);

    useEffect(() => {
        if (!isEditingBonus) setEditedBonusSpeed(speedBonus);
    }, [speedBonus, isEditingBonus]);

    const handleBaseSpeedSubmit = () => {
        const val = isNaN(editedBaseSpeed) ? 0 : Math.max(0, editedBaseSpeed);
        if (val !== speed) onSpeedChange(val);
        setIsEditingBase(false);
    };

    const handleBonusSpeedSubmit = () => {
        const val = isNaN(editedBonusSpeed) ? 0 : editedBonusSpeed;
        if (val !== speedBonus) onSpeedBonusChange(val);
        setIsEditingBonus(false);
    };

    const handleBaseSpeedKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleBaseSpeedSubmit();
        if (e.key === 'Escape') {
            setEditedBaseSpeed(speed);
            setIsEditingBase(false);
        }
    };

    const handleBonusSpeedKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleBonusSpeedSubmit();
        if (e.key === 'Escape') {
            setEditedBonusSpeed(speedBonus);
            setIsEditingBonus(false);
        }
    };

    const content = (
        <div className="w-full">
            <h3 className="text-xs font-bold tracking-wide text-[var(--color-text-medium)] uppercase mb-2">Передвижение</h3>
            <div className="grid grid-cols-3 gap-2.5">
                {/* Speed Card */}
                <div className="bg-[var(--color-surface-inset)] p-2 rounded-lg flex flex-col items-center justify-center text-center min-h-[85px] border border-transparent hover:border-teal-500/50 transition-all duration-200">
                    <div className="flex flex-col items-center w-full">
                        <span className="text-[11px] text-[var(--color-text-medium)] tracking-wider uppercase font-bold mt-1">Скорость</span>
                        
                        {isEditingBase ? (
                            <div className="mt-0.5 flex items-center justify-center gap-1">
                                <input
                                    type="number"
                                    value={editedBaseSpeed}
                                    onChange={(e) => setEditedBaseSpeed(parseInt(e.target.value, 10))}
                                    onBlur={handleBaseSpeedSubmit}
                                    onKeyDown={handleBaseSpeedKeyDown}
                                    className="w-16 h-8 bg-[var(--color-background)] border border-slate-700/50 hover:border-teal-500/30 focus:border-[var(--color-accent-primary-hover)] rounded-xl text-center text-xs font-extrabold focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-primary-hover)] text-[var(--color-text-base)] shadow-inner transition-all duration-150"
                                    autoFocus
                                    onFocus={(e) => e.target.select()}
                                />
                                <span className="text-xs text-[var(--color-text-muted)]">фт.</span>
                            </div>
                        ) : (
                            <div 
                                className="text-2xl font-extrabold text-[var(--color-text-base)] mt-0.5 cursor-pointer hover:text-[var(--color-accent-primary)] transition-colors group flex items-center justify-center gap-0.5"
                                onClick={() => setIsEditingBase(true)}
                                data-tooltip="Изменить базовую скорость"
                            >
                                <span>{totalSpeed}</span>
                                <span className="text-xs font-normal text-[var(--color-text-muted)]">фт.</span>
                            </div>
                        )}
                        
                        <div 
                            className="text-[11px] text-[var(--color-text-muted)] mt-0.5 flex items-center justify-center min-h-[14px] group cursor-pointer font-medium"
                            onClick={() => !isEditingBonus && setIsEditingBonus(true)}
                            data-tooltip="Изменить бонус к скорости"
                        >
                            {isEditingBonus ? (
                                <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                                    <span>{speed}+</span>
                                    <input
                                        type="number"
                                        value={editedBonusSpeed}
                                        onChange={(e) => setEditedBonusSpeed(parseInt(e.target.value, 10))}
                                        onBlur={handleBonusSpeedSubmit}
                                        onKeyDown={handleBonusSpeedKeyDown}
                                        className="w-16 h-8 bg-[var(--color-background)] border border-slate-700/50 hover:border-teal-500/30 focus:border-[var(--color-accent-primary-hover)] rounded-xl text-center text-xs font-extrabold focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-primary-hover)] text-[var(--color-text-base)] shadow-inner transition-all duration-150"
                                        autoFocus
                                        onFocus={(e) => e.target.select()}
                                    />
                                    {itemSpeedBonus !== 0 && <span className="text-[9px] text-teal-400">+{itemSpeedBonus}</span>}
                                </div>
                            ) : (
                                <>
                                    <span>({speed}
                                        {speedBonus !== 0 && `${speedBonus > 0 ? '+' : ''}${speedBonus}`}
                                        {itemSpeedBonus !== 0 && <span className="text-teal-400 font-semibold">+{itemSpeedBonus}</span>}
                                    )</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-2 w-2 ml-0.5 text-[var(--color-text-subtle)] group-hover:text-[var(--color-accent-primary)] transition-colors opacity-0 group-hover:opacity-100" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                                        <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
                                    </svg>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Jump Stats Cards */}
                <JumpStat baseValue={longJumpBase} bonus={longJumpBonus} itemBonus={itemLongJumpBonus} onBonusChange={onLongJumpBonusChange} label="в длину" />
                <JumpStat baseValue={highJumpBase} bonus={highJumpBonus} itemBonus={itemHighJumpBonus} onBonusChange={onHighJumpBonusChange} label="в высоту" />
            </div>
        </div>
    );

    if (flat) {
        return (
            <>
                {/* Speed Card */}
                <div className="bg-[var(--color-surface-inset)] p-2 rounded-lg flex flex-col items-center justify-center text-center min-h-[85px] border border-transparent hover:border-teal-500/50 transition-all duration-200">
                    <div className="flex flex-col items-center w-full">
                        <span className="text-[11px] text-[var(--color-text-medium)] tracking-wider uppercase font-bold mt-1">Скорость</span>
                        
                        {isEditingBase ? (
                            <div className="mt-0.5 flex items-center justify-center gap-1">
                                <input
                                    type="number"
                                    value={editedBaseSpeed}
                                    onChange={(e) => setEditedBaseSpeed(parseInt(e.target.value, 10))}
                                    onBlur={handleBaseSpeedSubmit}
                                    onKeyDown={handleBaseSpeedKeyDown}
                                    className="w-16 h-8 bg-[var(--color-background)] border border-slate-700/50 hover:border-teal-500/30 focus:border-[var(--color-accent-primary-hover)] rounded-xl text-center text-xs font-extrabold focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-primary-hover)] text-[var(--color-text-base)] shadow-inner transition-all duration-150"
                                    autoFocus
                                    onFocus={(e) => e.target.select()}
                                />
                                <span className="text-xs text-[var(--color-text-muted)]">фт.</span>
                            </div>
                        ) : (
                            <div 
                                className="text-2xl font-extrabold text-[var(--color-text-base)] mt-0.5 cursor-pointer hover:text-[var(--color-accent-primary)] transition-colors group flex items-center justify-center gap-0.5"
                                onClick={() => setIsEditingBase(true)}
                                data-tooltip="Изменить базовую скорость"
                            >
                                <span>{totalSpeed}</span>
                                <span className="text-xs font-normal text-[var(--color-text-muted)]">фт.</span>
                            </div>
                        )}
                        
                        <div 
                            className="text-[11px] text-[var(--color-text-muted)] mt-0.5 flex items-center justify-center min-h-[14px] group cursor-pointer font-medium"
                            onClick={() => !isEditingBonus && setIsEditingBonus(true)}
                            data-tooltip="Изменить бонус к скорости"
                        >
                            {isEditingBonus ? (
                                <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                                    <span>{speed}+</span>
                                    <input
                                        type="number"
                                        value={editedBonusSpeed}
                                        onChange={(e) => setEditedBonusSpeed(parseInt(e.target.value, 10))}
                                        onBlur={handleBonusSpeedSubmit}
                                        onKeyDown={handleBonusSpeedKeyDown}
                                        className="w-16 h-8 bg-[var(--color-background)] border border-slate-700/50 hover:border-teal-500/30 focus:border-[var(--color-accent-primary-hover)] rounded-xl text-center text-xs font-extrabold focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-primary-hover)] text-[var(--color-text-base)] shadow-inner transition-all duration-150"
                                        autoFocus
                                        onFocus={(e) => e.target.select()}
                                    />
                                    {itemSpeedBonus !== 0 && <span className="text-[9px] text-teal-400">+{itemSpeedBonus}</span>}
                                </div>
                            ) : (
                                <>
                                    <span>({speed}
                                        {speedBonus !== 0 && `${speedBonus > 0 ? '+' : ''}${speedBonus}`}
                                        {itemSpeedBonus !== 0 && <span className="text-teal-400 font-semibold">+{itemSpeedBonus}</span>}
                                    )</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-2 w-2 ml-0.5 text-[var(--color-text-subtle)] group-hover:text-[var(--color-accent-primary)] transition-colors opacity-0 group-hover:opacity-100" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                                        <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
                                    </svg>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Jump Stats Cards */}
                <JumpStat baseValue={longJumpBase} bonus={longJumpBonus} itemBonus={itemLongJumpBonus} onBonusChange={onLongJumpBonusChange} label="в длину" />
                <JumpStat baseValue={highJumpBase} bonus={highJumpBonus} itemBonus={itemHighJumpBonus} onBonusChange={onHighJumpBonusChange} label="в высоту" />
            </>
        );
    }

    if (minimal) {
        return content;
    }

    return (
        <div className="bg-[var(--color-surface-opaque)] p-4 rounded-xl shadow-lg border border-[var(--color-border)]">
            {content}
        </div>
    );
});