import React, { useRef, useCallback, useMemo } from 'react';
import { useNotifier } from '../context/NotificationContext';
import { useCharacter } from '../context/CharacterContext';
import { isOwlbear } from '../utils/storage';
import OBR from '@owlbear-rodeo/sdk';

interface CharacterHeaderProps {
  onLevelChange: (newLevel: number) => void;
  onOpenCharacterManager: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenHistoryLog: () => void;
}

const EditableField: React.FC<{ value: string; onChange: (newValue: string) => void; label: string; placeholder: string; isReadOnly?: boolean }> = ({ value, onChange, label, placeholder, isReadOnly = false }) => (
  <div className="flex-1">
    <label className="block text-xs text-[var(--color-text-muted)] tracking-wider uppercase mb-1">{label}</label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      readOnly={isReadOnly}
      className={`w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 text-lg text-[var(--color-text-base)] focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] focus:border-[var(--color-focus-ring)] transition-colors h-[50px] ${isReadOnly ? 'opacity-80' : ''}`}
    />
  </div>
);

const PortraitUploader: React.FC = React.memo(() => {
    const { character, dispatch } = useCharacter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { addNotification } = useNotifier();

    const onPortraitUpload = useCallback((url: string) => {
        dispatch({ type: 'SET_FIELD', payload: { field: 'portraitUrl', value: url } });
    }, [dispatch]);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const resetInput = () => { if (fileInputRef.current) fileInputRef.current.value = ""; };

        const MAX_SIZE_MB = 5;
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
            addNotification(`Файл слишком большой. Максимальный размер: ${MAX_SIZE_MB}МБ.`, 'error');
            resetInput();
            return;
        }
        if (!file.type.startsWith('image/')) {
            addNotification('Неподдерживаемый тип файла. Пожалуйста, выберите изображение.', 'error');
            resetInput();
            return;
        }

        try {
            const reader = new FileReader();
            reader.onload = (e) => {
                const result = e.target?.result;
                if (typeof result === 'string') {
                    onPortraitUpload(result);
                }
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error("Ошибка при обработке портрета:", error);
            addNotification("Не удалось обработать изображение. Файл может быть поврежден.", 'error');
        } finally {
            resetInput();
        }
    };

    const triggerFileUpload = () => {
        fileInputRef.current?.click();
    };
    
    const handleRemovePortrait = (e: React.MouseEvent) => {
        e.stopPropagation();
        onPortraitUpload('');
    }

    return (
        <div className="flex-shrink-0 relative group">
            <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                ref={fileInputRef}
                onChange={handleImageUpload}
                className="hidden"
                aria-hidden="true"
             />
             <button
                type="button"
                onClick={triggerFileUpload}
                className="w-28 h-28 rounded-xl bg-[var(--color-surface-inset)] border-2 border-dashed border-[var(--color-border)] hover:border-[var(--color-accent-primary-hover)] flex items-center justify-center transition-colors overflow-hidden shadow-inner"
                aria-label="Загрузить портрет персонажа"
                data-tooltip="Загрузить портрет персонажа"
            >
                {character.portraitUrl ? (
                    <img src={character.portraitUrl} alt="Портрет персонажа" className="w-full h-full object-cover"/>
                ) : (
                    <svg className="w-12 h-12 text-[var(--color-text-subtle)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                )}
             </button>
            {character.portraitUrl && (
                <button
                    type="button"
                    onClick={handleRemovePortrait}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full h-6 w-6 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[var(--color-health)] transition-all"
                    aria-label="Удалить портрет"
                    data-tooltip="Удалить портрет"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            )}
        </div>
    );
});


export const CharacterHeader: React.FC<CharacterHeaderProps> = React.memo(({
  onLevelChange,
  onOpenCharacterManager,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenHistoryLog,
}) => {
  const { character, dispatch } = useCharacter();

  const myPlayerId = isOwlbear() ? OBR.player.id : null;
  const isReadOnly = useMemo(() => {
    return !!(character.ownerId && myPlayerId && character.ownerId !== myPlayerId);
  }, [character.ownerId, myPlayerId]);

  return (
    <div className="bg-[var(--color-surface-opaque)] p-4 rounded-xl shadow-lg border border-[var(--color-border)] flex flex-col md:flex-row items-start gap-4 relative">
      <PortraitUploader />
      <div className="space-y-4 flex-grow w-full">
        <div className="flex gap-4 items-end">
            <div className="flex-grow relative">
                <EditableField value={character.name} onChange={(val) => dispatch({type: 'SET_FIELD', payload: {field: 'name', value: val}})} label="Имя персонажа" placeholder="Например, Эльдра" isReadOnly={isReadOnly} />
                {(character.ownerName || isReadOnly) && (
                  <div className="absolute top-0 right-0 transform -translate-y-6 flex items-center gap-1.5 bg-slate-800/85 border border-slate-700/50 text-[11px] text-white/90 px-2 py-0.5 rounded-md font-medium backdrop-blur-sm shadow-sm select-none">
                    {character.ownerName && <span>👤 Владелец: {character.ownerName}</span>}
                    {isReadOnly && <span className="text-amber-400 font-bold bg-amber-400/10 px-1 rounded text-[10px]">Только чтение</span>}
                  </div>
                )}
            </div>
            <div className="flex-shrink-0 flex items-center gap-2">
                 {!isReadOnly && (
                   <div className="flex items-center gap-1 bg-[var(--color-surface-raised)] p-1 rounded-lg">
                      <button onClick={onUndo} disabled={!canUndo} className="h-[42px] w-10 flex items-center justify-center text-[var(--color-text-medium)] rounded-md hover:bg-[var(--color-surface-raised-hover)] hover:text-[var(--color-text-base)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[var(--color-surface-raised)] transition-colors" data-tooltip="Отменить (Ctrl+Z)" aria-label="Отменить последнее действие">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 9 9 0 01-18 0z" /></svg>
                      </button>
                       <button onClick={onRedo} disabled={!canRedo} className="h-[42px] w-10 flex items-center justify-center text-[var(--color-text-medium)] rounded-md hover:bg-[var(--color-surface-raised-hover)] hover:text-[var(--color-text-base)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[var(--color-surface-raised)] transition-colors" data-tooltip="Вернуть (Ctrl+Y)" aria-label="Вернуть отменённое действие">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 15l3-3m0 0l-3-3m3 3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </button>
                   </div>
                 )}
                 {!isReadOnly && (
                   <button onClick={onOpenHistoryLog} className="h-[50px] w-14 flex items-center justify-center bg-[var(--color-surface-raised)] text-[var(--color-text-medium)] rounded-lg hover:bg-[var(--color-surface-raised-hover)] hover:text-[var(--color-text-base)] transition-colors active:scale-95" data-tooltip="История изменений" aria-label="Открыть историю изменений">
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                   </button>
                 )}
                 <button
                    onClick={onOpenCharacterManager}
                    className="h-[50px] w-14 flex items-center justify-center bg-[var(--color-surface-raised)] text-[var(--color-text-medium)] rounded-lg hover:bg-[var(--color-surface-raised-hover)] hover:text-[var(--color-text-base)] transition-colors active:scale-95"
                    data-tooltip="Управление персонажами"
                    aria-label="Управление персонажами"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                </button>
            </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
            <EditableField value={character.characterClass} onChange={(val) => dispatch({type: 'SET_FIELD', payload: {field: 'characterClass', value: val}})} label="Класс" placeholder="Воин" isReadOnly={isReadOnly} />
            <EditableField value={character.race} onChange={(val) => dispatch({type: 'SET_FIELD', payload: {field: 'race', value: val}})} label="Раса" placeholder="Эльф" isReadOnly={isReadOnly} />
            <div className="flex-1 sm:max-w-[120px]">
            <label className="block text-xs text-[var(--color-text-muted)] tracking-wider uppercase mb-1">Уровень</label>
            <div className="flex items-center space-x-2 h-[50px]">
                <button 
                onClick={() => onLevelChange(character.level - 1)}
                className="bg-[var(--color-surface-raised)] w-8 h-8 rounded-full text-lg flex items-center justify-center hover:bg-[var(--color-surface-raised-hover)] transition-all duration-150 active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Уменьшить уровень"
                disabled={isReadOnly || character.level <= 1}
                data-tooltip="Понизить уровень"
                >
                -
                </button>
                <span className="text-2xl w-8 text-center font-bold">{character.level}</span>
                <button 
                onClick={() => onLevelChange(character.level + 1)}
                className="bg-[var(--color-surface-raised)] w-8 h-8 rounded-full text-lg flex items-center justify-center hover:bg-[var(--color-surface-raised-hover)] transition-all duration-150 active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Увеличить уровень"
                disabled={isReadOnly || character.level >= 20}
                data-tooltip="Повысить уровень"
                >
                +
                </button>
            </div>
            </div>
        </div>
      </div>
    </div>
  );
});
