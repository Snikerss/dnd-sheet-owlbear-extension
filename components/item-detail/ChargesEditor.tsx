import { RecoveryType } from '../../types';
import { RECOVERY_TYPE_NAMES } from '../../constants';
import {
  type FormDataUpdater,
  type ItemInputChangeEvent
} from './itemDetailShared';

interface ChargesEditorProps {
  hasCharges?: boolean;
  totalCharges?: number;
  currentCharges?: number;
  chargeRecovery?: RecoveryType;
  onInputChange: (e: ItemInputChangeEvent) => void;
  onChange: FormDataUpdater;
}

export const ChargesEditor: React.FC<ChargesEditorProps> = ({
  hasCharges,
  totalCharges,
  currentCharges,
  chargeRecovery,
  onInputChange,
  onChange
}) => {
  return (
    <>
      <div className="border-t border-[var(--color-border-subtle)] pt-4">
            <label className="flex items-center space-x-3 cursor-pointer">
                <input
                    type="checkbox"
                    name="hasCharges"
                    checked={!!hasCharges}
                    onChange={onInputChange}
                    className="h-5 w-5 rounded border-[var(--color-border)] text-[var(--color-accent-primary)] focus:ring-[var(--color-accent-primary-hover)] bg-[var(--color-background)]"
                />
                <span className="text-sm font-medium text-[var(--color-text-medium)]">Имеет заряды</span>
            </label>
       </div>
       {hasCharges && (
        <div className="p-3 bg-[var(--color-surface-well)] rounded-lg space-y-3 border border-[var(--color-border)]">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="currentCharges" className="block text-xs font-medium text-[var(--color-text-medium)]">Текущие заряды</label>
                    <input type="number" name="currentCharges" id="currentCharges" value={currentCharges} onChange={onInputChange} min="0" max={totalCharges} className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]" />
                </div>
                 <div>
                    <label htmlFor="totalCharges" className="block text-xs font-medium text-[var(--color-text-medium)]">Максимум зарядов</label>
                    <input type="number" name="totalCharges" id="totalCharges" value={totalCharges} onChange={onInputChange} min="0" className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]" />
                </div>
            </div>
             <div>
                <label htmlFor="chargeRecovery" className="block text-sm font-medium text-[var(--color-text-medium)]">Восстановление зарядов</label>
                <select name="chargeRecovery" id="chargeRecovery" value={chargeRecovery} onChange={(e) => onChange(prev => ({...prev, chargeRecovery: parseInt(e.target.value) as RecoveryType}))} className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]">
                    {Object.entries(RECOVERY_TYPE_NAMES).map(([key, recoveryName]) => (
                        <option key={key} value={key}>{recoveryName}</option>
                    ))}
                </select>
            </div>
        </div>
       )}
    </>
  );
};
