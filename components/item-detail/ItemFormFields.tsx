import { Currency, Rarity } from '../../types';
import { CURRENCY_NAMES, RARITY_NAMES } from '../../constants';
import { RichTextDescriptionEditor } from '../RichTextFormatting';
import {
  type FormDataUpdater,
  type ItemInputChangeEvent
} from './itemDetailShared';

interface ItemFormFieldsProps {
  name: string;
  quantity: number;
  weight: number;
  cost: { amount: number; currency: Currency };
  rarity: Rarity;
  description: string;
  isChest?: boolean;
  onInputChange: (e: ItemInputChangeEvent) => void;
  onChange: FormDataUpdater;
}

export const ItemFormFields: React.FC<ItemFormFieldsProps> = ({
  name,
  quantity,
  weight,
  cost,
  rarity,
  description,
  isChest,
  onInputChange,
  onChange
}) => {
  const handleCostChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name: fieldName, value } = e.target;
    onChange(prev => ({
        ...prev,
        cost: {
            ...prev.cost,
            [fieldName]: fieldName === 'amount' ? parseFloat(value) || 0 : value,
        }
    }));
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
            <label htmlFor="name" className="block text-sm font-medium text-[var(--color-text-medium)]">Название</label>
            <input
                type="text"
                name="name"
                id="name"
                value={name}
                onChange={onInputChange}
                className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]"
                required
            />
        </div>
         <div>
            <label htmlFor="quantity" className="block text-sm font-medium text-[var(--color-text-medium)]">Количество</label>
            <input
                type="number"
                name="quantity"
                id="quantity"
                value={quantity}
                onChange={onInputChange}
                className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]"
                min="1"
                disabled={isChest}
            />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
            <label htmlFor="weight" className="block text-sm font-medium text-[var(--color-text-medium)]">Вес (фунты)</label>
            <input
                type="number"
                name="weight"
                id="weight"
                value={weight}
                onChange={onInputChange}
                className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]"
                min="0"
                step="0.1"
            />
        </div>
        <div>
            <label className="block text-sm font-medium text-[var(--color-text-medium)]">Стоимость</label>
            <div className="mt-1 flex rounded-lg shadow-sm">
                <input
                    type="number"
                    name="amount"
                    value={cost.amount}
                    onChange={handleCostChange}
                    className="block w-full flex-1 rounded-none rounded-l-lg bg-[var(--color-background)] border border-[var(--color-border-subtle)] py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] z-10"
                    min="0"
                />
                <select
                    name="currency"
                    value={cost.currency}
                    onChange={handleCostChange}
                    className="block w-auto rounded-none rounded-r-lg bg-[var(--color-background)] border border-l-0 border-[var(--color-border-subtle)] py-2 pl-3 pr-8 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]"
                >
                    {Object.entries(CURRENCY_NAMES).map(([key, _currencyName]) => (
                        <option key={key} value={key}>{key}</option>
                    ))}
                </select>
            </div>
        </div>
      </div>
      <div>
        <label htmlFor="rarity" className="block text-sm font-medium text-[var(--color-text-medium)]">Редкость</label>
        <select
            name="rarity"
            id="rarity"
            value={rarity}
            onChange={(e) => onChange(prev => ({...prev, rarity: parseInt(e.target.value) as Rarity}))}
            className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]"
        >
            {Object.entries(RARITY_NAMES).map(([key, rarityName]) => (
                <option key={key} value={key}>{rarityName}</option>
            ))}
        </select>
      </div>
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-[var(--color-text-medium)] mb-1">Описание</label>
        <RichTextDescriptionEditor
          value={description}
          onChange={(newVal) => onChange(prev => ({ ...prev, description: newVal }))}
          placeholder="Введите описание предмета... (Выделите текст и нажмите ПКМ для форматирования)"
          minHeight="160px"
        />
      </div>
    </>
  );
};
