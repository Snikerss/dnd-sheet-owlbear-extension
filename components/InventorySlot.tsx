import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { InventoryItem, Rarity, ItemBonuses } from '../types';
import { RARITY_COLORS, RARITY_NAMES, RECOVERY_TYPE_NAMES } from '../constants';
import { calculateItemWeight } from '../utils/inventory';

interface InventorySlotProps {
  item: InventoryItem | null;
  isDragOver: boolean;
  isBeingDragged: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void;
  index?: number;
}

const RARITY_TEXT_COLORS: Record<Rarity, string> = {
  [Rarity.Common]: 'text-slate-400',
  [Rarity.Uncommon]: 'text-[#61fa79]',
  [Rarity.Rare]: 'text-[#0095ff]',
  [Rarity.VeryRare]: 'text-[#a335ee]',
  [Rarity.Legendary]: 'text-[#ff8000]',
  [Rarity.Artifact]: 'text-[#e5cc80]',
};

const formatAbilityName = (ability: string): string => {
  const names: Record<string, string> = {
    STR: 'Сила',
    DEX: 'Ловкость',
    CON: 'Телосложение',
    INT: 'Интеллект',
    WIS: 'Мудрость',
    CHA: 'Харизма'
  };
  return names[ability] || ability;
};

const getBonusStrings = (bonuses?: ItemBonuses): string[] => {
  if (!bonuses) return [];
  const parts: string[] = [];

  if (bonuses.ac) parts.push(`+${bonuses.ac} к Классу Доспеха (КД)`);
  if (bonuses.initiative) parts.push(`+${bonuses.initiative} к Инициативе`);
  if (bonuses.maxHp) parts.push(`+${bonuses.maxHp} к Макс. ОЗ (HP)`);
  if (bonuses.speed) parts.push(`+${bonuses.speed} фт. к Скорости`);
  if (bonuses.attackHit) parts.push(`+${bonuses.attackHit} к броскам атаки`);
  if (bonuses.spellSaveDC) parts.push(`+${bonuses.spellSaveDC} к СЛ спасброска заклинаний`);
  if (bonuses.proficiencyBonus) parts.push(`+${bonuses.proficiencyBonus} к Бонусу Мастерства`);
  if (bonuses.carryCapacity) parts.push(`+${bonuses.carryCapacity} фнт. к Грузоподъемности`);
  if (bonuses.attunementMax) parts.push(`+${bonuses.attunementMax} к макс. числу настроек`);

  if (bonuses.abilityScores) {
    for (const [ability, val] of Object.entries(bonuses.abilityScores)) {
      if (val) {
        parts.push(`${val > 0 ? '+' : ''}${val} к характеристике: ${formatAbilityName(ability)}`);
      }
    }
  }

  if (bonuses.savingThrows) {
    for (const [ability, val] of Object.entries(bonuses.savingThrows)) {
      if (val) {
        parts.push(`${val > 0 ? '+' : ''}${val} к спасброскам: ${formatAbilityName(ability)}`);
      }
    }
  }

  if (bonuses.skills) {
    for (const [skill, val] of Object.entries(bonuses.skills)) {
      if (val) {
        parts.push(`${val > 0 ? '+' : ''}${val} к навыку: ${skill}`);
      }
    }
  }

  if (bonuses.passivePerception) parts.push(`+${bonuses.passivePerception} к Пассивной Внимательности`);
  if (bonuses.passiveInvestigation) parts.push(`+${bonuses.passiveInvestigation} к Пассивному Анализу`);
  if (bonuses.passiveInsight) parts.push(`+${bonuses.passiveInsight} к Пассивной Проницательности`);
  if (bonuses.longJump) parts.push(`+${bonuses.longJump} фт. к прыжкам в длину`);
  if (bonuses.highJump) parts.push(`+${bonuses.highJump} фт. к прыжкам в высоту`);

  return parts;
};

export const InventorySlot: React.FC<InventorySlotProps> = ({
  item,
  isDragOver,
  isBeingDragged,
  onClick,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  index
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const hoverTimeoutRef = useRef<number | null>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; placeBelow: boolean } | null>(null);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setShowTooltip(true);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = window.setTimeout(() => {
      setShowTooltip(false);
    }, 100) as unknown as number;
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const updateCoords = () => {
    if (slotRef.current) {
      const rect = slotRef.current.getBoundingClientRect();
      const placeBelow = index !== undefined && index < 20;
      const top = placeBelow 
        ? rect.bottom + window.scrollY + 8 
        : rect.top + window.scrollY - 8;
      const left = rect.left + window.scrollX + rect.width / 2;
      setCoords({ top, left, placeBelow });
    }
  };

  useEffect(() => {
    if (!showTooltip) {
      setCoords(null);
      return;
    }
    updateCoords();

    const handleScrollOrResize = () => {
      updateCoords();
    };

    window.addEventListener('scroll', handleScrollOrResize, { capture: true, passive: true });
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, { capture: true });
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [showTooltip]);

  const rarityBorderClass = item ? RARITY_COLORS[item.rarity] : 'border-transparent';
  const baseClasses = `aspect-square w-full rounded-lg flex items-center justify-center cursor-pointer transition-all duration-150 relative shadow-inner border-2`;
  
  let stateClasses = `bg-[var(--color-surface-inset)] hover:bg-[var(--color-surface-raised)]/70 ${rarityBorderClass}`;

  if (isDragOver) {
    stateClasses = "bg-[var(--color-accent-primary)]/30 border-dashed border-[var(--color-accent-primary)] scale-105";
  } else if (isBeingDragged) {
    stateClasses = "opacity-40 border-dashed border-[var(--color-border-subtle)] bg-transparent scale-95";
  }
  
  const totalWeight = calculateItemWeight(item);
  const bonusStrings = item ? getBonusStrings(item.bonuses) : [];
  const insideItems = item && item.isChest && item.chestInventory
    ? (item.chestInventory.filter((i): i is InventoryItem => i !== null))
    : [];

  return (
    <div
      ref={slotRef}
      className={`${baseClasses} ${stateClasses} ${item ? '' : 'drag-none'}`}
      draggable={!!item}
      onClick={onClick}
      onMouseDown={() => setShowTooltip(false)}
      onDragStart={(e) => {
        e.currentTarget.classList.add('dragging');
        // Force synchronous layout reflow to apply the CSS changes immediately before drag image capture
        const _reflow = e.currentTarget.offsetHeight;
        setShowTooltip(false);
        if (item) onDragStart(e);
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={(e) => {
        e.currentTarget.classList.remove('dragging');
        setShowTooltip(false);
        onDragEnd(e);
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {item && !isBeingDragged ? (
        <>
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover pointer-events-none rounded-[6px]" />
          ) : (
            <span className="text-xs text-center text-[var(--color-text-medium)] p-1 break-words leading-tight pointer-events-none">
              {item.name}
            </span>
          )}
         
          {item.quantity > 1 && !item.isChest && (
            <div 
              className="absolute bottom-1 right-1 bg-[var(--color-surface-well)] text-[var(--color-text-base)] text-xs font-bold px-1.5 py-0.5 rounded-full border border-[var(--color-border-subtle)] shadow-md cursor-help"
              data-tooltip={`Количество: ${item.quantity} шт.`}
            >
              {item.quantity}
            </div>
          )}

          {item.hasCharges && (
            <div className="absolute bottom-1 left-1 bg-[var(--color-surface-well)] text-[var(--color-accent-secondary)] text-xs font-bold px-1.5 py-0.5 rounded-full border border-[var(--color-border-subtle)] shadow-md flex items-center gap-0.5" data-tooltip="Заряды">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg>
              <span>{item.currentCharges}</span>
            </div>
          )}

          {item.isChest && (
            <div 
              className="absolute bottom-1 left-1 bg-amber-700/90 text-amber-100 p-0.5 rounded border border-amber-500/50 shadow-md flex items-center justify-center z-30"
              data-tooltip="Это сундук. Кликните, чтобы открыть."
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v1H5V4zM5 7h10v9a2 2 0 01-2 2H7a2 2 0 01-2 2V7z" />
                </svg>
            </div>
          )}

          {item.requiresAttunement && (
            <div 
              className={`absolute top-1 left-1 p-0.5 rounded-full border shadow-md flex items-center justify-center transition-all duration-150 ${
                item.isAttuned 
                  ? 'bg-blue-500/80 text-white border-blue-300' 
                  : 'bg-slate-700/60 text-slate-400 border-slate-500/40'
              }`}
              data-tooltip={item.isAttuned ? "Настроено" : "Требует настройки (не настроено)"}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                </svg>
            </div>
          )}

          {item.isEquipped && (
            <div 
              className="absolute top-1 right-1 bg-teal-500/80 text-white p-0.5 rounded-full border border-teal-300 shadow-md flex items-center justify-center"
              data-tooltip="Экипирован"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 2a1 1 0 011 1v1.323l3.945-1.183a1 1 0 011.238 1.238L15 8.323V14a2 2 0 01-2 2h-1v1a1 1 0 11-2 0v-1H9a2 2 0 01-2-2V8.323L3.817 7.378a1 1 0 011.238-1.238L9 7.323V3a1 1 0 011-1z" />
                </svg>
            </div>
          )}

          {showTooltip && coords && createPortal(
            <div 
              className="item-tooltip absolute z-[9999] pointer-events-auto"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              style={{
                top: `${coords.top}px`,
                left: `${coords.left}px`,
                transform: coords.placeBelow ? 'translateX(-50%)' : 'translate(-50%, -100%)',
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#0b0f19]/98 backdrop-blur-xl backdrop-brightness-50 border border-slate-700/50 rounded-xl p-3.5 shadow-[0_10px_30px_rgba(0,0,0,0.8)] w-72 text-left animate-fade-in pointer-events-auto">
                <div className="font-bold text-sm mb-1 text-[var(--color-text-base)] flex items-center justify-between gap-2">
                  <span className={RARITY_TEXT_COLORS[item.rarity] || 'text-slate-400'}>{item.name}</span>
                  {item.isChest && <span className="text-[10px] bg-amber-600/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-semibold uppercase">Сундук</span>}
                </div>

                <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-[10px] text-[var(--color-text-muted)] font-semibold uppercase tracking-wider mb-2">
                  <span className={RARITY_TEXT_COLORS[item.rarity] || 'text-slate-400'}>{RARITY_NAMES[item.rarity]}</span>
                  <span className="text-slate-600">•</span>
                  <span>{totalWeight.toFixed(2)} фнт.</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-amber-400">{item.cost.amount} {item.cost.currency}</span>
                </div>

                <div className="border-t border-slate-700/40 my-2" />

                {item.description ? (
                  <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto pr-1">
                    {item.description}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic">Нет описания</div>
                )}

                {bonusStrings.length > 0 && (
                  <>
                    <div className="border-t border-slate-700/40 my-2" />
                    <div className="text-[10px] text-amber-400 font-extrabold uppercase tracking-wider mb-1.5">Свойства и бонусы:</div>
                    <ul className="text-xs text-slate-300 space-y-1 pl-1">
                      {bonusStrings.map((b, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-amber-500 mt-0.5">✦</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {(item.hasCharges || item.requiresAttunement) && (
                  <>
                    <div className="border-t border-slate-700/40 my-2" />
                    <div className="flex flex-wrap gap-1.5">
                      {item.hasCharges && (
                        <div className="text-[9px] bg-purple-500/10 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-0.5">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                          </svg>
                          <span>Заряды: {item.currentCharges}/{item.totalCharges}</span>
                        </div>
                      )}
                      {item.requiresAttunement && (
                        <div className={`text-[9px] border px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-0.5 ${
                          item.isAttuned 
                            ? 'bg-blue-500/10 text-blue-300 border-blue-500/30' 
                            : 'bg-slate-700/20 text-slate-400 border-slate-700/30'
                        }`}>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                          </svg>
                          <span>{item.isAttuned ? 'Настроено' : 'Настройка'}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
                
                {item.isChest && (
                  <div className="mt-3 pt-3 border-t border-slate-700/50">
                    <div className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span>Содержимое</span>
                      {insideItems.length > 0 && (
                        <span className="text-slate-500 font-normal normal-case">
                          {insideItems.reduce((acc, curr) => acc + curr.weight * curr.quantity, 0).toFixed(1)} фнт.
                        </span>
                      )}
                    </div>
                    {insideItems.length > 0 ? (
                      <div className="max-h-28 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                        {insideItems.map((innerItem) => (
                          <div key={innerItem.id} className="flex justify-between items-center text-xs text-[var(--color-text-medium)] bg-[#111622]/40 px-2 py-1 rounded border border-slate-700/20">
                            <div className="flex items-center gap-1.5 truncate">
                              {innerItem.imageUrl ? (
                                <img src={innerItem.imageUrl} className="w-4 h-4 rounded object-cover" alt="" />
                              ) : (
                                <div className="w-4 h-4 rounded bg-slate-700 flex items-center justify-center text-[9px] text-slate-400 font-bold">I</div>
                              )}
                              <span className="truncate">{innerItem.name}</span>
                            </div>
                            <span className="text-[10px] font-semibold text-slate-400 ml-2 whitespace-nowrap">x{innerItem.quantity}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 italic">Контейнер пуст</div>
                    )}
                  </div>
                )}
              </div>
            </div>,
            document.body
          )}
        </>
      ) : null}
    </div>
  );
};