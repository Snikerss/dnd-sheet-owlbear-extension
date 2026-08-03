import React, { useState, useEffect } from 'react';
import { localBridge } from '../utils/bridgeService';

interface EmbeddedOwlbearModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialUrl?: string;
  onUrlChange?: (url: string) => void;
  layoutMode: 'split' | 'overlay';
  onToggleLayoutMode: () => void;
}

const ROOM_HISTORY_KEY = 'dnd-sheet/embedded-owlbear-history';

export const EmbeddedOwlbearModal: React.FC<EmbeddedOwlbearModalProps> = ({
  isOpen,
  onClose,
  initialUrl = '',
  onUrlChange,
  layoutMode,
  onToggleLayoutMode,
}) => {
  const [roomUrl, setRoomUrl] = useState<string>(initialUrl || 'https://www.owlbear.rodeo/');
  const [roomHistory, setRoomHistory] = useState<string[]>([]);
  const [isEditingUrl, setIsEditingUrl] = useState<boolean>(!initialUrl);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ROOM_HISTORY_KEY);
      if (saved) {
        setRoomHistory(JSON.parse(saved));
      }
    } catch (e) {}
  }, []);

  const handleSaveAndConnect = (urlToLoad: string) => {
    let cleanUrl = urlToLoad.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }
    setRoomUrl(cleanUrl);
    setIsEditingUrl(false);

    if (onUrlChange) {
      onUrlChange(cleanUrl);
    }

    try {
      const updated = Array.from(new Set([cleanUrl, ...roomHistory])).slice(0, 5);
      setRoomHistory(updated);
      localStorage.getItem(ROOM_HISTORY_KEY);
      localStorage.setItem(ROOM_HISTORY_KEY, JSON.stringify(updated));
    } catch (e) {}
  };

  const handleOpenCompanionWindow = (urlToLoad: string) => {
    let cleanUrl = urlToLoad.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }
    const win = window.open(cleanUrl, 'owlbear_vtt_room');
    if (win) {
      try {
        localBridge.registerChildWindow(win);
      } catch (e) {}
    }
    handleSaveAndConnect(cleanUrl);
  };

  if (!isOpen) return null;

  if (layoutMode === 'split') {
    return (
      <div className="w-full h-full flex flex-col bg-slate-900 border-l border-slate-700/60 shadow-2xl relative z-40 overflow-hidden">
        {/* Split Screen Control Bar */}
        <div className="h-10 bg-slate-950/80 border-b border-slate-800 px-3 flex items-center justify-between text-xs text-slate-300 select-none">
          <div className="flex items-center gap-2 overflow-hidden mr-2">
            <span className="font-semibold text-amber-400 flex items-center gap-1">
              <span>🌐</span> Owlbear VTT
            </span>
            <span className="text-slate-600">|</span>
            <span className="truncate max-w-[200px] text-slate-400 font-mono" title={roomUrl}>
              {roomUrl}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => handleOpenCompanionWindow(roomUrl)}
              className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded transition-colors"
              title="Открыть комнату в отдельном окне-спутнике с прямым подключением"
            >
              🚀 Окно-спутник
            </button>
            <button
              onClick={() => setIsEditingUrl(!isEditingUrl)}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors"
              title="Сменить URL комнаты"
            >
              ✏️ Ссылка
            </button>
            <button
              onClick={onToggleLayoutMode}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors"
              title="Переключить в всплывающее окно"
            >
              🔲 Оверлей
            </button>
            <button
              onClick={onClose}
              className="px-2 py-1 bg-rose-900/60 hover:bg-rose-800 text-rose-200 rounded transition-colors"
              title="Закрыть встроенный Owlbear"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Edit URL Bar (if active) */}
        {isEditingUrl && (
          <div className="p-2.5 bg-slate-900 border-b border-slate-800 flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={roomUrl}
                onChange={(e) => setRoomUrl(e.target.value)}
                placeholder="https://www.owlbear.rodeo/room/your-room-id"
                className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={() => handleSaveAndConnect(roomUrl)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs rounded transition-colors"
              >
                Загрузить в кадр
              </button>
              <button
                onClick={() => handleOpenCompanionWindow(roomUrl)}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded transition-colors"
              >
                🚀 Окно-спутник
              </button>
            </div>
            {roomHistory.length > 0 && (
              <div className="flex items-center gap-1 overflow-x-auto text-[10px] text-slate-400">
                <span className="shrink-0 text-slate-500">Недавние:</span>
                {roomHistory.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => handleSaveAndConnect(h)}
                    className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded truncate max-w-[150px]"
                  >
                    {h.replace('https://www.owlbear.rodeo/room/', '')}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Notice & Embedded Owlbear Rodeo Iframe */}
        <div className="flex-1 w-full h-full bg-slate-950 flex flex-col relative">
          <div className="bg-amber-950/40 border-b border-amber-800/40 px-3 py-1.5 text-[11px] text-amber-200/90 flex items-center justify-between">
            <span>💡 Сервер Owlbear может блокировать встраивание главной страницы в кадры браузера. Если кадр пуст — нажмите <strong>«🚀 Окно-спутник»</strong>.</span>
            <button
              onClick={() => handleOpenCompanionWindow(roomUrl)}
              className="ml-2 px-2 py-0.5 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold rounded"
            >
              🚀 Открыть окно
            </button>
          </div>
          <iframe
            src={roomUrl}
            title="Owlbear Rodeo VTT"
            className="w-full h-full border-0 flex-1"
            allow="microphone; camera; display-capture; autoplay; clipboard-write; clipboard-read"
          />
        </div>
      </div>
    );
  }

  // Modal Overlay Mode
  return (
    <div className="fixed inset-0 z-[9990] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-[95vw] h-[92vh] max-w-[1600px] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="h-12 bg-slate-950 border-b border-slate-800 px-4 flex items-center justify-between text-sm text-slate-200">
          <div className="flex items-center gap-2">
            <span className="text-lg">🌐</span>
            <span className="font-bold text-amber-400">Встроенная доска Owlbear Rodeo VTT</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOpenCompanionWindow(roomUrl)}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded transition-colors"
            >
              🚀 Открыть окно-спутник
            </button>
            <button
              onClick={onToggleLayoutMode}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded transition-colors"
            >
              ↔️ Режим «Разделенный экран»
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1 bg-rose-900/80 hover:bg-rose-800 text-rose-100 text-xs rounded font-bold transition-colors"
            >
              ✕ Закрыть
            </button>
          </div>
        </div>

        {/* Edit URL Bar */}
        <div className="p-3 bg-slate-950/90 border-b border-slate-800 flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={roomUrl}
              onChange={(e) => setRoomUrl(e.target.value)}
              placeholder="https://www.owlbear.rodeo/room/..."
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 font-mono focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={() => handleSaveAndConnect(roomUrl)}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-lg transition-colors"
            >
              Загрузить в кадр
            </button>
            <button
              onClick={() => handleOpenCompanionWindow(roomUrl)}
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-lg transition-colors"
            >
              🚀 Открыть окно-спутник
            </button>
          </div>
        </div>

        {/* Embedded Iframe */}
        <div className="flex-1 w-full h-full bg-black flex flex-col relative">
          <div className="bg-amber-950/40 border-b border-amber-800/40 px-4 py-1.5 text-xs text-amber-200 flex items-center justify-between">
            <span>💡 Если Owlbear блокирует встраивание в кадр — нажмите <strong>«🚀 Открыть окно-спутник»</strong>.</span>
            <button
              onClick={() => handleOpenCompanionWindow(roomUrl)}
              className="px-3 py-0.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded"
            >
              🚀 Открыть окно-спутник
            </button>
          </div>
          <iframe
            src={roomUrl}
            title="Owlbear Rodeo VTT Overlay"
            className="w-full h-full border-0 flex-1"
            allow="microphone; camera; display-capture; autoplay; clipboard-write; clipboard-read"
          />
        </div>
      </div>
    </div>
  );
};
