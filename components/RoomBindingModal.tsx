import React, { useState, useEffect } from 'react';
import type { Character } from '../types';
import { getKnownRooms, updateRoomAlias, OwlbearRoomBinding } from '../utils/roomRegistry';
import { isOwlbear } from '../utils/storage';
import OBR from '@owlbear-rodeo/sdk';

interface RoomBindingModalProps {
  isOpen: boolean;
  character: Character;
  onClose: () => void;
  onBindRoom: (roomId: string, roomName: string) => void;
  onUnbindRoom: (roomId: string) => void;
  onToggleGlobal: (isGlobal: boolean) => void;
}

export const RoomBindingModal: React.FC<RoomBindingModalProps> = ({
  isOpen,
  character,
  onClose,
  onBindRoom,
  onUnbindRoom,
  onToggleGlobal,
}) => {
  const [knownRooms, setKnownRooms] = useState<OwlbearRoomBinding[]>([]);
  const [customRoomId, setCustomRoomId] = useState('');
  const [customRoomName, setCustomRoomName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setKnownRooms(getKnownRooms());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentBoundIds = new Set((character.boundRooms || []).map(r => r.roomId));
  const currentRoomId = isOwlbear() && typeof OBR !== 'undefined' ? OBR.room?.id : '';

  const handleToggleRoom = (room: OwlbearRoomBinding) => {
    if (currentBoundIds.has(room.roomId)) {
      onUnbindRoom(room.roomId);
    } else {
      onBindRoom(room.roomId, room.roomName);
    }
  };

  const handleAddCustomRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customRoomId.trim()) return;
    onBindRoom(customRoomId.trim(), customRoomName.trim() || 'Пользовательская доска');
    setCustomRoomId('');
    setCustomRoomName('');
    setKnownRooms(getKnownRooms());
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-[var(--color-surface-opaque)] border border-[var(--color-border)] rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5">
        
        {/* Header */}
        <div className="flex justify-between items-center border-b border-[var(--color-border)] pb-3">
          <div>
            <h2 className="text-xl font-extrabold text-[var(--color-text-base)] flex items-center gap-2">
              <span>🎯</span> Привязка персонажа к доскам Owlbear
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Персонаж: <span className="text-teal-300 font-bold">{character.name}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-white transition-colors p-1"
          >
            ✕
          </button>
        </div>

        {/* Global Access Checkbox */}
        <div className="bg-[var(--color-surface-well)] p-4 rounded-xl border border-slate-700/50 flex items-center justify-between">
          <div>
            <span className="text-sm font-bold text-[var(--color-text-base)] block">Глобальный персонаж</span>
            <span className="text-xs text-[var(--color-text-muted)]">Доступен во всех комнатах без ограничений</span>
          </div>
          <input
            type="checkbox"
            checked={!!character.isGlobal}
            onChange={(e) => onToggleGlobal(e.target.checked)}
            className="w-5 h-5 accent-teal-500 rounded cursor-pointer"
          />
        </div>

        {/* List of Known Rooms */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
            Известные комнаты / кампании Owlbear
          </h3>

          {knownRooms.length === 0 ? (
            <div className="text-center py-6 text-xs text-[var(--color-text-muted)] bg-[var(--color-surface-well)] rounded-xl border border-dashed border-slate-700/50">
              Вы еще не заходили на доски Owlbear с этого устройства.
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
              {knownRooms.map(room => {
                const isBound = currentBoundIds.has(room.roomId);
                const isCurrent = room.roomId === currentRoomId;

                return (
                  <div
                    key={room.roomId}
                    onClick={() => handleToggleRoom(room)}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none ${
                      isBound
                        ? 'bg-teal-500/10 border-teal-500/40 text-teal-200'
                        : 'bg-[var(--color-surface-well)] border-slate-700/40 text-[var(--color-text-base)] hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isBound}
                        onChange={() => {}} // handled by parent div onClick
                        className="w-4 h-4 accent-teal-500 rounded"
                      />
                      <div>
                        <div className="text-sm font-bold flex items-center gap-2">
                          {room.roomName}
                          {isCurrent && (
                            <span className="text-[10px] bg-teal-500/20 text-teal-300 px-1.5 py-0.5 rounded border border-teal-500/40">
                              Текущая
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
                          ID: {room.roomId}
                        </div>
                      </div>
                    </div>
                    {isBound && <span className="text-xs font-bold text-teal-400">Привязан</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Manual Add Custom Room */}
        <form onSubmit={handleAddCustomRoom} className="space-y-2 pt-2 border-t border-[var(--color-border)]">
          <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
            Добавить ID доски вручную
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="ID комнаты (roomId)"
              value={customRoomId}
              onChange={(e) => setCustomRoomId(e.target.value)}
              className="bg-[var(--color-surface-inset)] border border-[var(--color-border-subtle)] rounded-lg px-3 py-1.5 text-xs text-[var(--color-text-base)]"
            />
            <input
              type="text"
              placeholder="Название кампании"
              value={customRoomName}
              onChange={(e) => setCustomRoomName(e.target.value)}
              className="bg-[var(--color-surface-inset)] border border-[var(--color-border-subtle)] rounded-lg px-3 py-1.5 text-xs text-[var(--color-text-base)]"
            />
          </div>
          <button
            type="submit"
            disabled={!customRoomId.trim()}
            className="w-full bg-[var(--color-surface-raised)] hover:bg-[var(--color-accent-primary)] hover:text-white text-xs font-bold py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            + Привязать доску
          </button>
        </form>

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-bold py-2 px-5 rounded-xl text-xs transition-all shadow"
          >
            Готово
          </button>
        </div>

      </div>
    </div>
  );
};
