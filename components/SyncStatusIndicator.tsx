import React from 'react';
import { isOwlbear } from '../utils/storage';

export type SyncStatusType = 'synced' | 'syncing' | 'connected_tab' | 'disconnected' | 'error';

export interface SyncStatusIndicatorProps {
  status: SyncStatusType;
  onReconnect?: () => void;
  onOpenEmbeddedOwlbear?: () => void;
  onConnectOwlbearWindow?: () => void;
  className?: string;
}

export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({
  status,
  onReconnect,
  onOpenEmbeddedOwlbear,
  onConnectOwlbearWindow,
  className = '',
}) => {
  const inOwlbear = isOwlbear();
  const [showOptionsModal, setShowOptionsModal] = React.useState(false);
  const urlHasCharId = typeof window !== 'undefined' && !!new URLSearchParams(window.location.search).get('charId');

  let badgeColor = inOwlbear
    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  let dotColor = inOwlbear ? 'bg-emerald-400' : 'bg-emerald-400';
  let icon = inOwlbear ? '🟢' : '🌐';
  let label = inOwlbear ? 'Owlbear VTT' : 'Автономно';
  let title = inOwlbear
    ? 'Работает внутри комнаты Owlbear Rodeo VTT. Все изменения синхронизированы.'
    : 'Нажмите для выбора режима подключения к Owlbear Rodeo VTT!';

  switch (status) {
    case 'syncing':
      badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      dotColor = 'bg-amber-400 animate-ping';
      icon = '🟡';
      label = 'Сохранение...';
      title = 'Идет передача сетевых пакетов и запись данных';
      break;
    case 'connected_tab':
      badgeColor = 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      dotColor = 'bg-blue-400';
      icon = '🔵';
      label = inOwlbear ? 'Вкладка подключена' : 'P2P Сеть Owlbear';
      title = inOwlbear
        ? 'Owlbear Rodeo VTT: Соседняя вкладка успешно подключена и синхронизируется в реальном времени'
        : 'Отдельная вкладка браузера: Подключена к комнате Owlbear Rodeo через P2P-сетевой мост';
      break;
    case 'disconnected':
      badgeColor = 'bg-rose-500/20 text-rose-300 border-rose-500/40 cursor-pointer hover:bg-rose-500/30 transition-colors';
      dotColor = 'bg-rose-500';
      icon = '🔴';
      label = 'Связь потеряна';
      title = 'Потеряна связь с главным окном Owlbear. Нажмите для переподключения!';
      break;
    case 'error':
      badgeColor = 'bg-red-600/30 text-red-300 border-red-500/50 cursor-pointer';
      dotColor = 'bg-red-500';
      icon = '⚠️';
      label = 'Ошибка синхр.';
      title = 'Ошибка при передаче данных. Нажмите, чтобы запросить повторную синхронизацию';
      break;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      console.log('--- DND SHEET DIAGNOSTIC REPORT ---');
      console.log('inOwlbear:', inOwlbear);
      console.log('status:', status);
      console.log('urlHasCharId:', urlHasCharId);
      console.log('-----------------------------------');
    } catch (err) {}

    if (!inOwlbear) {
      setShowOptionsModal(true);
    } else if (onReconnect) {
      onReconnect();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title={title}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border backdrop-blur-sm shadow-sm transition-all duration-200 select-none ${badgeColor} ${className}`}
      >
        <span className="relative flex h-2 w-2">
          <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`} />
        </span>
        <span className="leading-none text-[11px] font-medium tracking-wide">
          {icon} {label}
        </span>
      </button>

      {/* Interactive Integration Options Modal */}
      {showOptionsModal && (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-5 flex flex-col gap-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-amber-400 flex items-center gap-2">
                <span>🌐</span> Выберите режим подключения к Owlbear
              </h3>
              <button
                onClick={() => setShowOptionsModal(false)}
                className="text-slate-400 hover:text-slate-200 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {/* Option 1 */}
              <button
                onClick={() => {
                  setShowOptionsModal(false);
                  if (onOpenEmbeddedOwlbear) onOpenEmbeddedOwlbear();
                }}
                className="p-3 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-amber-500/50 rounded-lg text-left transition-all flex flex-col gap-1 group"
              >
                <div className="font-semibold text-sm text-amber-300 group-hover:text-amber-200 flex items-center gap-2">
                  <span>🖥️ Вариант 1: Встроить Owlbear Rodeo VTT (Разделенный экран)</span>
                </div>
                <div className="text-xs text-slate-400">
                  Запускает доску Owlbear прямо внутри этого приложения в режиме разделенного экрана. **100% неразрывная постоянная синхронизация!**
                </div>
              </button>

              {/* Option 2 */}
              <button
                onClick={() => {
                  setShowOptionsModal(false);
                  if (onConnectOwlbearWindow) onConnectOwlbearWindow();
                }}
                className="p-3 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-blue-500/50 rounded-lg text-left transition-all flex flex-col gap-1 group"
              >
                <div className="font-semibold text-sm text-blue-300 group-hover:text-blue-200 flex items-center gap-2">
                  <span>🔗 Вариант 2: Подключить открытое окно Owlbear (Прямой P2P мост)</span>
                </div>
                <div className="text-xs text-slate-400">
                  Устанавливает прямую парную привязку со случайным или ранее открытым окном Owlbear в соседней вкладке вашего браузера.
                </div>
              </button>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowOptionsModal(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors"
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
