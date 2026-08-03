import React from 'react';

export type SyncStatusType = 'synced' | 'syncing' | 'connected_tab' | 'disconnected' | 'error';

export interface SyncStatusIndicatorProps {
  status: SyncStatusType;
  onReconnect?: () => void;
  className?: string;
}

export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({
  status,
  onReconnect,
  className = '',
}) => {
  let badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  let dotColor = 'bg-emerald-400';
  let icon = '🟢';
  let label = 'Синхронизировано';
  let title = 'Все изменения локально сохранены и переданы в комнату VTT';

  switch (status) {
    case 'syncing':
      badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      dotColor = 'bg-amber-400 animate-ping';
      icon = '🟡';
      label = 'Сохранение...';
      title = 'Идет передача сетевых чанков и запись в хранилище';
      break;
    case 'connected_tab':
      badgeColor = 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      dotColor = 'bg-blue-400';
      icon = '🔵';
      label = 'Вкладка подключена';
      title = 'Соседняя вкладка синхронизирована с главным окном Owlbear VTT';
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

  return (
    <button
      type="button"
      onClick={onReconnect}
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
  );
};
