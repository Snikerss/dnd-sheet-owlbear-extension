import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Character, InventoryItem, Rarity, ItemBonuses } from '../types';
import { RARITY_COLORS, RARITY_NAMES } from '../constants';
import { useCharacter } from '../context/CharacterContext';
import { useNotifier } from '../context/NotificationContext';
import { calculateItemWeight } from '../utils/inventory';

interface CharacterDollProps {
  onSlotClick: (index: number, e: React.MouseEvent, fromDoll?: boolean) => void;
  onItemDragStart: (index: number) => void;
  onItemDrop: (x: number, y: number) => void;
  onItemMove: (itemIndex: number, x: number, y: number) => void;
  onItemDragEnd: () => void;
  onItemUnequip: (itemIndex: number) => void;
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

export const CharacterDoll: React.FC<CharacterDollProps> = ({
  onSlotClick,
  onItemDragStart,
  onItemDrop,
  onItemMove,
  onItemDragEnd,
  onItemUnequip
}) => {
  const { character } = useCharacter();
  const { addNotification } = useNotifier();
  const [isDragOver, setIsDragOver] = useState(false);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; placeBelow: boolean } | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);

  const handleMouseEnter = (itemId: string, element: HTMLElement) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredItemId(itemId);
    setHoveredElement(element);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = window.setTimeout(() => {
      setHoveredItemId(null);
      setHoveredElement(null);
    }, 100) as unknown as number;
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const updateCoords = (element: HTMLElement, itemY: number) => {
    const rect = element.getBoundingClientRect();
    const placeBelow = itemY !== undefined && itemY < 30;
    const top = placeBelow 
      ? rect.bottom + window.scrollY + 8 
      : rect.top + window.scrollY - 8;
    const left = rect.left + window.scrollX + rect.width / 2;
    setCoords({ top, left, placeBelow });
  };

  useEffect(() => {
    if (!hoveredElement || !hoveredItemId) {
      setCoords(null);
      return;
    }
    const item = (character.equippedItems || []).find(i => i && i.id === hoveredItemId);
    const itemY = item?.equippedY ?? 0;
    updateCoords(hoveredElement, itemY);

    const handleScrollOrResize = () => {
      updateCoords(hoveredElement, itemY);
    };

    window.addEventListener('scroll', handleScrollOrResize, { capture: true, passive: true });
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, { capture: true });
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [hoveredElement, hoveredItemId, character.equippedItems]);

  const containerRef = useRef<HTMLDivElement>(null);

  // Get all items that are placed on the character doll
  const placedItems = (character.equippedItems || [])
    .map((item, index) => ({ item, index }))
    .filter(
      (entry): entry is { item: InventoryItem; index: number } =>
        !!entry.item
    );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDragOver) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (!containerRef.current) return;

    // Calculate relative drop coordinates (0-100%)
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    // Retrieve drag-and-drop transfer data
    const dragDataStr = e.dataTransfer.getData('text/plain');
    
    // Check if dragging an item already placed on the doll (internal movement)
    if (dragDataStr.startsWith('doll-item:')) {
      const itemIndex = parseInt(dragDataStr.replace('doll-item:', ''), 10);
      if (!isNaN(itemIndex)) {
        onItemMove(itemIndex, x, y);
        return;
      }
    }

    // Otherwise, it's a new item dropped from the bag
    onItemDrop(x, y);
  };

  return (
    <div className="bg-[var(--color-surface-opaque)] p-4 rounded-xl shadow-lg border border-[var(--color-border)] flex flex-col w-full select-none h-full min-h-[720px]">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-bold tracking-wider text-[var(--color-text-base)]">
          Иллюстрация персонажа
        </h3>
        <span className="text-[10px] text-[var(--color-text-muted)] font-semibold uppercase tracking-wider">
          Размещено: {placedItems.length}
        </span>
      </div>

      {/* Main Illustration Area */}
      <div
        ref={containerRef}
        className={`relative grow rounded-lg overflow-hidden border-2 transition-all duration-200 flex items-center justify-center min-h-[620px] shadow-inner ${
          isDragOver
            ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10 scale-[1.01]'
            : 'border-[var(--color-border-subtle)] bg-[var(--color-surface-well)]'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {character.portraitUrl ? (
          <img
            src={character.portraitUrl}
            alt="Character Illustration"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
        ) : (
          <div className="flex flex-col items-center gap-4 p-6 text-center z-10 pointer-events-none">
            <svg viewBox="0 0 100 200" className="w-24 h-48 opacity-10 text-[var(--color-text-base)]">
              <defs>
                <linearGradient id="bodyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="var(--color-accent-primary)" />
                  <stop offset="100%" stopColor="transparent" />
                </linearGradient>
              </defs>
              <circle cx="50" cy="30" r="16" fill="url(#bodyGradient)" />
              <path d="M50 48c-12 0-22 6-22 18v34h10v80h24v-80h10V66c0-12-10-18-22-18z" fill="url(#bodyGradient)" />
            </svg>
            <p className="text-xs text-[var(--color-text-muted)] max-w-[200px] leading-relaxed">
              Загрузите портрет в шапке или перетащите предметы прямо сюда, чтобы разместить их на персонаже
            </p>
          </div>
        )}

        {/* Overlay placed items */}
        {placedItems.map(({ item, index }) => {
          const totalWeight = calculateItemWeight(item);
          const bonusStrings = getBonusStrings(item.bonuses);
          const insideItems = item.isChest && item.chestInventory
            ? (item.chestInventory.filter((i): i is InventoryItem => i !== null))
            : [];

          return (
            <div
              key={item.id}
              className={`absolute w-16 h-16 rounded-lg flex items-center justify-center cursor-move transition-all duration-150 hover:scale-110 active:scale-95 opacity-80 hover:opacity-100 border-2 border-opacity-80 hover:border-opacity-100 shadow-lg bg-[var(--color-surface-well)]/90 backdrop-blur-xs ${
                RARITY_COLORS[item.rarity]
              }`}
              style={{
                left: `${item.equippedX}%`,
                top: `${item.equippedY}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: hoveredItemId === item.id ? 40 : 20
              }}
              draggable
              onMouseDown={() => setHoveredItemId(null)}
              onDragStart={(e) => {
                e.currentTarget.classList.add('dragging');
                // Force synchronous layout reflow to apply the CSS changes immediately before drag image capture
                const _reflow = e.currentTarget.offsetHeight;
                setHoveredItemId(null);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', `doll-item:${index}`);
                onItemDragStart(index);
              }}
              onDragEnd={(e) => {
                e.currentTarget.classList.remove('dragging');
                setHoveredItemId(null);
                onItemDragEnd();
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSlotClick(index, e, true);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setHoveredItemId(null);
                onItemUnequip(index);
              }}
              onMouseEnter={(e) => {
                handleMouseEnter(item.id, e.currentTarget);
              }}
              onMouseLeave={() => {
                handleMouseLeave();
              }}
            >
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-full h-full object-cover rounded-md pointer-events-none"
                />
              ) : (
                <span className="text-[10px] text-center text-[var(--color-text-medium)] p-1 break-all leading-tight font-bold">
                  {item.name.substring(0, 12)}
                </span>
              )}

              {item.quantity > 1 && (
                <div className="absolute -bottom-1.5 -right-1.5 bg-[var(--color-surface-well)] text-[var(--color-text-base)] text-[9px] font-bold px-1 rounded border border-[var(--color-border-subtle)] shadow z-30">
                  {item.quantity}
                </div>
              )}

              {item.hasCharges && (
                <div 
                  className="absolute -bottom-1.5 -left-1.5 bg-[var(--color-surface-well)] text-[var(--color-accent-secondary)] text-[9px] font-bold px-1 py-0.5 rounded-full border border-[var(--color-border-subtle)] shadow-md flex items-center gap-0.5 z-30" 
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                  </svg>
                  <span>{item.currentCharges}</span>
                </div>
              )}

              {item.isChest && (
                <div 
                  className="absolute -bottom-1.5 -left-1.5 bg-amber-700/90 text-amber-100 p-0.5 rounded border border-amber-500/50 shadow-md flex items-center justify-center z-30"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v1H5V4zM5 7h10v9a2 2 0 01-2 2H7a2 2 0 01-2 2V7z" />
                  </svg>
                </div>
              )}

              {item.requiresAttunement && (
                <div 
                  className={`absolute -top-1.5 -left-1.5 p-0.5 rounded-full border shadow-md flex items-center justify-center transition-all duration-150 z-30 ${
                    item.isAttuned 
                      ? 'bg-blue-500/90 text-white border-blue-300' 
                      : 'bg-slate-700/80 text-slate-400 border-slate-500/40'
                  }`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                    </svg>
                </div>
              )}

              {item.isEquipped && (
                <div 
                  className="absolute -top-1.5 -right-1.5 bg-teal-500/90 text-white p-0.5 rounded-full border border-teal-300 shadow-md flex items-center justify-center z-30"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 2a1 1 0 011 1v1.323l3.945-1.183a1 1 0 011.238 1.238L15 8.323V14a2 2 0 01-2 2h-1v1a1 1 0 11-2 0v-1H9a2 2 0 01-2-2V8.323L3.817 7.378a1 1 0 011.238-1.238L9 7.323V3a1 1 0 011-1z" />
                    </svg>
                </div>
              )}

              {hoveredItemId === item.id && coords && createPortal(
                <div 
                  className="item-tooltip absolute z-[9999] pointer-events-auto"
                  onMouseEnter={(e) => {
                    handleMouseEnter(item.id, hoveredElement || e.currentTarget);
                  }}
                  onMouseLeave={() => {
                    handleMouseLeave();
                  }}
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

                    <div className="text-[9px] text-slate-500 italic mt-2 text-center border-t border-slate-700/20 pt-1">
                      Двойной клик, чтобы снять
                    </div>
                  </div>
                </div>,
                document.body
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
