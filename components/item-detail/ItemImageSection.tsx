import { useState } from 'react';
import { logger } from '../../utils/logger';
import { translateQueryToEnglish } from '../../utils/translation';
import { useNotifier } from '../../context/NotificationContext';
import { CustomIconPicker } from '../CustomIconPicker';
import { type FormDataUpdater } from './itemDetailShared';

interface ItemImageSectionProps {
  imageUrl: string;
  itemName: string;
  customIcons: string[];
  onAddCustomIcon: (iconDataUrl: string) => void;
  onDeleteCustomIcon: (iconUrl: string) => void;
  onChange: FormDataUpdater;
}

export const ItemImageSection: React.FC<ItemImageSectionProps> = ({
  imageUrl,
  itemName,
  customIcons,
  onAddCustomIcon,
  onDeleteCustomIcon,
  onChange
}) => {
  const [showPicker, setShowPicker] = useState(false);

  // AI Image Generator States
  const [showAiImagePrompt, setShowAiImagePrompt] = useState(false);
  const [aiImagePrompt, setAiImagePrompt] = useState('');
  const [isAiGeneratingImage, setIsAiGeneratingImage] = useState(false);
  const [aiImageError, setAiImageError] = useState<string | null>(null);
  const { addNotification } = useNotifier();

  const handleGenerateAIImage = async () => {
    const promptToUse = aiImagePrompt.trim() || itemName;
    if (!promptToUse) {
        setAiImageError('Введите описание или название для генерации.');
        return;
    }

    setIsAiGeneratingImage(true);
    setAiImageError(null);

    try {
        let englishPrompt = promptToUse;
        try {
            englishPrompt = await translateQueryToEnglish(promptToUse);
        } catch (transErr) {
            logger.warn("Could not translate image prompt: ", transErr);
        }

        const finalPrompt = `D&D high fantasy game icon style, detailed item illustration, ${englishPrompt}, digital art, highly detailed, clean background, studio lighting, realistic reflections, natural textures`;
        const seed = Math.floor(Math.random() * 1000000);
        const generatedImageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=512&height=512&nologo=true&seed=${seed}&model=flux&enhance=true`;

        // Preload image
        await new Promise((resolve, reject) => {
            const img = new Image();
            img.src = generatedImageUrl;
            img.onload = resolve;
            img.onerror = () => reject(new Error('Не удалось сгенерировать изображение. Попробуйте еще раз.'));
        });

        onChange(prev => ({ ...prev, imageUrl: generatedImageUrl }));
        setShowAiImagePrompt(false);
        addNotification('Изображение успешно сгенерировано ИИ!', 'success');
    } catch (err: unknown) {
        logger.error(err);
        setAiImageError(err instanceof Error ? err.message : 'Ошибка генерации изображения');
    } finally {
        setIsAiGeneratingImage(false);
    }
  };

  const handleRemoveImage = () => {
    onChange(prev => ({ ...prev, imageUrl: '' }));
  };

  const handleSelectIcon = (iconUrl: string) => {
    onChange(prev => ({ ...prev, imageUrl: iconUrl }));
    setShowPicker(false);
  };

  const handleUploadIcon = (iconUrl: string) => {
    onAddCustomIcon(iconUrl);
    onChange(prev => ({ ...prev, imageUrl: iconUrl }));
    setShowPicker(false);
  };

  const handleDeleteIconFromLibrary = (iconUrl: string) => {
    onDeleteCustomIcon(iconUrl);
    if (imageUrl === iconUrl) {
      onChange(prev => ({ ...prev, imageUrl: '' }));
    }
  };

  return (
      <div>
        <label className="block text-sm font-medium text-[var(--color-text-medium)] mb-2">Изображение</label>
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 bg-[var(--color-surface-well)] rounded-lg flex items-center justify-center border border-[var(--color-border-subtle)] overflow-hidden flex-shrink-0 shadow-inner relative">
            {isAiGeneratingImage && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-20">
                <svg className="animate-spin h-6 w-6 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-[8px] text-white font-bold mt-1.5 uppercase tracking-wide">Генерация...</span>
              </div>
            )}
            {imageUrl ? (
              <img src={imageUrl} alt="Предмет" className="w-full h-full object-cover" />
            ) : (
              <svg className="w-12 h-12 text-[var(--color-text-subtle)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            )}
          </div>
          <div className="flex flex-col gap-2">
             <div className="flex flex-wrap gap-2">
                 <button
                    type="button"
                    onClick={() => setShowPicker(!showPicker)}
                    className="rounded-lg border border-[var(--color-border-subtle)] shadow-xs px-3 py-2 bg-[var(--color-surface-raised)] text-sm font-medium text-[var(--color-text-medium)] hover:bg-[var(--color-surface-raised-hover)] focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-[var(--color-surface-opaque)] transition-all duration-150 active:scale-95"
                 >
                    {showPicker ? 'Скрыть библиотеку' : 'Выбрать иконку...'}
                 </button>
                 <button
                    type="button"
                    onClick={() => {
                        setShowAiImagePrompt(!showAiImagePrompt);
                        if (!aiImagePrompt && itemName) {
                            setAiImagePrompt(itemName);
                        }
                    }}
                    className="rounded-lg border border-[var(--color-border-subtle)] shadow-xs px-3 py-2 bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] transition-all flex items-center gap-1 active:scale-95"
                 >
                    🎨 Сгенерировать ИИ
                 </button>
             </div>
             {imageUrl && (
                <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="rounded-lg border border-transparent px-3 py-2 bg-transparent text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-health)] focus:outline-hidden"
                >
                    Убрать
                </button>
             )}
          </div>
        </div>
         {showAiImagePrompt && (
             <div className="mt-3 p-3 bg-[var(--color-surface-well)] rounded-lg border border-[var(--color-border-subtle)] space-y-2">
                 <label htmlFor="item-ai-image-prompt-input" className="block text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Описание для генератора картинок (ИИ):</label>
                 <div className="flex gap-2">
                     <input
                         type="text"
                         id="item-ai-image-prompt-input"
                         value={aiImagePrompt}
                         onChange={(e) => setAiImagePrompt(e.target.value)}
                         placeholder="Например: Огненный меч, объятый пламенем..."
                         className="flex-grow bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1.5 px-3 text-xs focus:outline-hidden focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
                     />
                     <button
                         type="button"
                         onClick={handleGenerateAIImage}
                         disabled={isAiGeneratingImage}
                         className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg disabled:opacity-50 transition-all flex items-center justify-center gap-1 shrink-0"
                     >
                         {isAiGeneratingImage ? 'Создание...' : 'Сгенерировать'}
                     </button>
                 </div>
                 {aiImageError && (
                     <div className="text-[10px] text-red-400 bg-red-950/20 border border-red-900/30 p-1.5 rounded">
                         {aiImageError}
                     </div>
                 )}
             </div>
         )}
         {showPicker && (
            <div className="mt-4">
                <CustomIconPicker
                    icons={customIcons}
                    onSelect={handleSelectIcon}
                    onUpload={handleUploadIcon}
                    onDelete={handleDeleteIconFromLibrary}
                />
            </div>
        )}
      </div>
  );
};
