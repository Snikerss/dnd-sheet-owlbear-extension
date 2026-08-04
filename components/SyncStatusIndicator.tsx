import React, { useState } from 'react';
import { isOwlbear, getKnownRooms } from '../utils/storage';
import { p2pRoomBridge } from '../utils/p2pBridge';
import { Character } from '../types';

export type SyncStatusType = 'synced' | 'syncing' | 'connected_tab' | 'disconnected' | 'error';

export interface SyncStatusIndicatorProps {
  status: SyncStatusType;
  onReconnect?: () => void;
  characters?: Array<{ id: string; name: string; characterClass?: string }>;
  activeCharacterId?: string | null;
  onSelectActiveBoardCharacter?: (charId: string) => void;
  className?: string;
}

export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({
  status,
  onReconnect,
  characters = [],
  activeCharacterId,
  onSelectActiveBoardCharacter,
  className = '',
}) => {
  const inOwlbear = isOwlbear();
  const [showModal, setShowModal] = useState(false);
  const knownRooms = getKnownRooms();
  const currentRoomId = p2pRoomBridge.getCurrentRoomId() || 'global_vault_bridge';
  const currentRoomName = p2pRoomBridge.getCurrentRoomName();

  let badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  let dotColor = 'bg-emerald-400';
  let icon = inOwlbear ? '🟢' : '🌐';
  let label = inOwlbear ? 'Owlbear VTT' : 'Автономно';
  let title = 'Нажмите для управления синхронизацией и выбора активного персонажа';

  switch (status) {
    case 'syncing':
      badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      dotColor = 'bg-amber-400 animate-ping';
      icon = '🟡';
      label = 'Сохранение...';
      break;
    case 'connected_tab':
      badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      dotColor = 'bg-emerald-400';
      icon = '🟢';
      label = inOwlbear ? 'Owlbear VTT' : 'Прямой P2P (WebRTC)';
      break;
    case 'disconnected':
      badgeColor = 'bg-rose-500/20 text-rose-300 border-rose-500/40 cursor-pointer hover:bg-rose-500/30 transition-colors';
      dotColor = 'bg-rose-500';
      icon = '🔴';
      label = 'Связь потеряна';
      break;
    case 'error':
      badgeColor = 'bg-red-600/30 text-red-300 border-red-500/50 cursor-pointer';
      dotColor = 'bg-red-500';
      icon = '⚠️';
      label = 'Ошибка синхр.';
      break;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowModal(true);
  };

  const handleManualReconnect = () => {
    if (onReconnect) {
      onReconnect();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title={title}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border backdrop-blur-sm shadow-sm transition-all duration-200 select-none hover:scale-105 ${badgeColor} ${className}`}
      >
        <span className="relative flex h-2 w-2">
          <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`} />
        </span>
        <span className="leading-none text-[11px] font-medium tracking-wide">
          {icon} {label}
        </span>
      </button>

      {/* Sync Control Hub Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 flex flex-col gap-5 text-slate-100 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚙️</span>
                <h3 className="text-base font-bold text-amber-400">Центр Управления Синхронизацией</h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Connection Status Overview */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Текущий статус сети:</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${badgeColor}`}>
                  {icon} {label}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="text-slate-400">Комната VTT:</span>
                <span className="font-mono text-amber-300">{currentRoomName}</span>
              </div>
              <div className="text-[11px] text-slate-500 font-mono truncate" title={currentRoomId}>
                ID: {currentRoomId}
              </div>
            </div>

            {/* Active Character Selector for VTT Board */}
            {characters.length > 0 && onSelectActiveBoardCharacter && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <span>🎯</span> Персонаж, синхронизируемый с доской:
                </label>
                <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
                  {characters.map((char) => {
                    const isSelected = char.id === activeCharacterId;
                    return (
                      <button
                        key={char.id}
                        onClick={() => onSelectActiveBoardCharacter(char.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-amber-500/15 border-amber-500/60 text-amber-200'
                            : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="text-base">{isSelected ? '🎯' : '👤'}</span>
                          <span className="font-semibold text-xs truncate">{char.name}</span>
                          <span className="text-[10px] text-slate-400">({char.characterClass || 'Персонаж'})</span>
                        </div>
                        {isSelected && (
                          <span className="px-2 py-0.5 bg-amber-500 text-slate-950 font-bold text-[10px] rounded-md">
                            АКТИВЕН
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Known Rooms History & Manual Join Input */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-slate-400">Присоединиться к комнате Owlbear:</span>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const targetRoomId = (e.currentTarget.elements.namedItem('customRoomId') as HTMLInputElement)?.value.trim();
                  if (targetRoomId) {
                    const cleanRoomId = targetRoomId.includes('roomId=')
                      ? new URL(targetRoomId).searchParams.get('roomId') || targetRoomId
                      : targetRoomId;

                    p2pRoomBridge.connect(cleanRoomId, 'Присоединенная комната');
                    if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
                      const currentUrl = new URL(window.location.href);
                      currentUrl.searchParams.set('roomId', cleanRoomId);
                      window.history.replaceState({}, '', currentUrl.toString());
                    }
                    if (onReconnect) onReconnect();
                  }
                }}
                className="flex items-center gap-2"
              >
                <input
                  name="customRoomId"
                  type="text"
                  placeholder="Вставьте ID комнаты или ссылку Owlbear..."
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl transition-all shadow"
                >
                  Войти
                </button>
              </form>

              {knownRooms.length > 0 && (
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
                  {knownRooms.map((r: any) => {
                    const rId = r.roomId || r.id;
                    const rName = r.roomName || r.name || 'Owlbear Room';
                    const isCurrent = rId === currentRoomId;
                    return (
                      <button
                        key={rId}
                        type="button"
                        onClick={() => {
                          p2pRoomBridge.connect(rId, rName);
                          if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
                            const currentUrl = new URL(window.location.href);
                            currentUrl.searchParams.set('roomId', rId);
                            window.history.replaceState({}, '', currentUrl.toString());
                          }
                          if (onReconnect) onReconnect();
                        }}
                        className={`px-2.5 py-1 text-[11px] rounded-lg border font-medium transition-all flex items-center gap-1.5 ${
                          isCurrent
                            ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-slate-500'
                        }`}
                      >
                        <span>🎲</span> {rName}
                        {isCurrent && <span className="text-[9px] bg-amber-500/40 px-1 rounded">АКТИВНА</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
              <button
                onClick={handleManualReconnect}
                className="flex-1 py-2 px-4 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <span>🔄</span> Переподключить мост
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition-colors"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
