import {
  type ItemInputChangeEvent
} from './itemDetailShared';

interface ChestEditorProps {
  isChest?: boolean;
  isConsumable?: boolean;
  onInputChange: (e: ItemInputChangeEvent) => void;
}

export const ChestEditor: React.FC<ChestEditorProps> = ({
  isChest,
  isConsumable,
  onInputChange
}) => {
  return (
    <>
      <div className="border-t border-[var(--color-border-subtle)] pt-4">
            <label className="flex items-center space-x-3 cursor-pointer">
                <input
                    type="checkbox"
                    name="isChest"
                    checked={!!isChest}
                    onChange={onInputChange}
                    className="h-5 w-5 rounded border-[var(--color-border)] text-[var(--color-accent-primary)] focus:ring-[var(--color-accent-primary-hover)] bg-[var(--color-background)]"
                />
                <span className="text-sm font-medium text-[var(--color-text-medium)]">Сделать сундуком</span>
            </label>
            <p className="text-xs text-[var(--color-text-muted)] mt-1 pl-8">
                Предмет станет контейнером на 50 ячеек. Количество будет установлено на 1.
            </p>
        </div>
        <div className="border-t border-[var(--color-border-subtle)] pt-4">
            <label className="flex items-center space-x-3 cursor-pointer">
                <input
                    type="checkbox"
                    name="isConsumable"
                    checked={!!isConsumable}
                    onChange={onInputChange}
                    className="h-5 w-5 rounded border-[var(--color-border)] text-[var(--color-accent-primary)] focus:ring-[var(--color-accent-primary-hover)] bg-[var(--color-background)]"
                />
                <span className="text-sm font-medium text-[var(--color-text-medium)]">Сделать расходником</span>
            </label>
            <p className="text-xs text-[var(--color-text-muted)] mt-1 pl-8">
                Предмет будет отображаться в списке быстрого доступа для быстрого использования и отслеживания.
            </p>
        </div>
    </>
  );
};
