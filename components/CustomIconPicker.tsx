import React, { useRef } from 'react';
import { useNotifier } from '../context/NotificationContext';

interface CustomIconPickerProps {
    icons: string[];
    onSelect: (iconUrl: string) => void;
    onUpload: (iconUrl: string) => void;
    onDelete: (iconUrl: string) => void;
}

export const CustomIconPicker: React.FC<CustomIconPickerProps> = ({ icons, onSelect, onUpload, onDelete }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { addNotification } = useNotifier();

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            return;
        }

        // --- VALIDATION ---
        const MAX_SIZE_MB = 2; // Icons should be smaller
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
            addNotification(`Файл иконки слишком большой. Максимальный размер: ${MAX_SIZE_MB}МБ.`, 'error');
            if(fileInputRef.current) { fileInputRef.current.value = ""; }
            return;
        }
        if (!file.type.startsWith('image/')) {
            addNotification('Неподдерживаемый тип файла. Пожалуйста, выберите изображение.', 'error');
            if(fileInputRef.current) { fileInputRef.current.value = ""; }
            return;
        }

        // Reset file input early to allow re-uploading the same file
        const resetInput = () => {
            if(fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        };

        try {
            // 1. Use createImageBitmap for faster, more memory-efficient decoding
            const imageBitmap = await createImageBitmap(file);

            const canvas = document.createElement('canvas');
            const MAX_DIMENSION = 256;
            let { width, height } = imageBitmap;

            // 2. Calculate new dimensions, preserving aspect ratio
            if (width > height) {
                if (width > MAX_DIMENSION) {
                    height = Math.round(height * (MAX_DIMENSION / width));
                    width = MAX_DIMENSION;
                }
            } else {
                if (height > MAX_DIMENSION) {
                    width = Math.round(width * (MAX_DIMENSION / height));
                    height = MAX_DIMENSION;
                }
            }

            canvas.width = width;
            canvas.height = height;

            // 3. Get context and draw the image
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                throw new Error("Не удалось получить 2D контекст canvas.");
            }
            ctx.drawImage(imageBitmap, 0, 0, width, height);
            
            // Close the ImageBitmap to free up memory
            imageBitmap.close();

            // 4. Convert to WebP for better compression and transparency support
            // The quality of 0.8 for WebP often provides a great balance of size and quality.
            const compressedDataUrl = canvas.toDataURL('image/webp', 0.8);
            
            onUpload(compressedDataUrl);

        } catch (error) {
            console.error("Произошла ошибка при обработке изображения:", error);
            addNotification("Не удалось обработать изображение. Файл может быть поврежден.", 'error');
        } finally {
            resetInput();
        }
    };

    const triggerFileUpload = () => {
        fileInputRef.current?.click();
    };

    return (
        <div className="p-3 bg-[var(--color-surface-well)] border border-[var(--color-border-subtle)] rounded-lg">
             <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                ref={fileInputRef}
                onChange={handleImageUpload}
                className="hidden"
                aria-hidden="true"
             />
            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2 max-h-48 overflow-y-auto pr-2">
                <button
                    type="button"
                    onClick={triggerFileUpload}
                    className="aspect-square w-full rounded-lg flex items-center justify-center cursor-pointer transition-all duration-150 bg-[var(--color-surface-opaque)] border-2 border-dashed border-[var(--color-border-subtle)] hover:border-[var(--color-accent-primary-hover)] hover:bg-[var(--color-surface-raised)] active:scale-95"
                    data-tooltip="Загрузить новую иконку"
                    aria-label="Загрузить новую иконку"
                >
                    <svg className="w-8 h-8 text-[var(--color-text-subtle)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                    </svg>
                </button>
                {icons.map((iconUrl, index) => (
                    <div key={index} className="relative group">
                        <button
                            type="button"
                            onClick={() => onSelect(iconUrl)}
                            className="aspect-square w-full rounded-lg bg-[var(--color-surface-opaque)] overflow-hidden border-2 border-transparent hover:border-[var(--color-accent-primary-hover)] focus:outline-none focus:border-[var(--color-accent-primary-hover)] transition-all duration-150"
                            aria-label={`Выбрать иконку ${index + 1}`}
                        >
                           <img src={iconUrl} alt={`Иконка ${index + 1}`} className="w-full h-full object-cover"/>
                        </button>
                        <button
                            type="button"
                            onClick={() => onDelete(iconUrl)}
                            className="absolute -top-1 -right-1 bg-[var(--color-health)] text-white rounded-full h-5 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[var(--color-health)]/80 transition-opacity active:scale-90"
                            aria-label="Удалить иконку из библиотеки"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                ))}
            </div>
             {icons.length === 0 && (
                <p className="text-center text-sm text-[var(--color-text-subtle)] mt-2">Ваша библиотека иконок пуста. Нажмите "+", чтобы добавить первую.</p>
            )}
        </div>
    );
};
