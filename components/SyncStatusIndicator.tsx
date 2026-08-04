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

  const copyToClipboard = async (text: string, btnElement: HTMLButtonElement, successText: string, originalText: string) => {
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch (e) {}

    if (!copied) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        copied = document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch (err) {}
    }

    if (copied) {
      btnElement.innerText = successText;
      setTimeout(() => { btnElement.innerText = originalText; }, 2000);
    } else {
      prompt('Скопируйте ID комнаты вручную:', text);
    }
  };

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
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Текущий статус сети:</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${badgeColor}`}>
                  {icon} {label}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="text-slate-400">Комната VTT:</span>
                <span className="font-mono text-amber-300 font-bold">{currentRoomName}</span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                <div className="text-[11px] text-slate-400 font-mono truncate max-w-[220px]" title={currentRoomId}>
                  ID: {currentRoomId}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (currentRoomId) {
                        copyToClipboard(currentRoomId, e.currentTarget, '✓ Скопировано', '📋 Скопировать ID');
                      }
                    }}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-[10px] font-semibold rounded-lg transition-all"
                  >
                    📋 Скопировать ID
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (currentRoomId) {
                        const joinUrl = `${window.location.origin}${window.location.pathname}?roomId=${currentRoomId}`;
                        copyToClipboard(joinUrl, e.currentTarget, '✓ Ссылка скопирована', '🔗 Скопировать ссылку');
                      }
                    }}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold rounded-lg transition-all"
                  >
                    🔗 Скопировать ссылку
                  </button>
                </div>
              </div>
            </div>

            {/* Character Broadcast to GM in this Room */}
            {characters.length > 0 && onSelectActiveBoardCharacter && (
              <div className="flex flex-col gap-2 bg-slate-950/60 p-3.5 border border-slate-800 rounded-xl">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                    <span>📡</span> Персонаж, транслируемый ГМу в этой комнате:
                  </label>
                </div>
                <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
                  {characters.map((char) => {
                    const isBroadcasting = char.id === activeCharacterId;
                    return (
                      <button
                        key={char.id}
                        type="button"
                        onClick={() => onSelectActiveBoardCharacter(char.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                          isBroadcasting
                            ? 'bg-amber-500/15 border-amber-500/60 text-amber-200 shadow-md'
                            : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="text-base">{isBroadcasting ? '📡' : '👤'}</span>
                          <span className="font-semibold text-xs truncate">{char.name}</span>
                          <span className="text-[10px] text-slate-400">({char.characterClass || 'Персонаж'})</span>
                        </div>
                        {isBroadcasting ? (
                          <span className="px-2 py-0.5 bg-amber-500 text-slate-950 font-bold text-[10px] rounded-md shadow">
                            🟢 ТРАНСЛИРУЕТСЯ ГМУ
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 hover:text-amber-300">
                            Транслировать ГМу ➔
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
              {inOwlbear ? (
                <button
                  type="button"
                  onClick={() => {
                    if (onReconnect) onReconnect();
                    setShowModal(false);
                  }}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <span>🚀</span> Открыть / Переподключить внешнее окно листа
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleManualReconnect}
                  className="flex-1 py-2 px-4 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <span>🔄</span> Переподключить мост
                </button>
              )}
              <button
                type="button"
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
