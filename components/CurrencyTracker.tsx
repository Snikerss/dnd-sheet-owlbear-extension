import React, { useState } from 'react';
import { Currency } from '../types';
import { CURRENCY_NAMES, CURRENCY_ABBREVIATIONS_RU } from '../constants';
import { useNotifier } from '../context/NotificationContext';

interface CurrencyTrackerProps {
  currency: Record<Currency, number>;
  onCurrencyChange: (currency: Currency, amount: number) => void;
}

// Conversion rates to the smallest unit (copper)
const CONVERSION_RATES: Record<Currency, number> = {
  [Currency.CP]: 1,
  [Currency.SP]: 10,
  [Currency.EP]: 50,
  [Currency.GP]: 100,
  [Currency.PP]: 1000,
};

const CURRENCY_COLORS: Record<Currency, { text: string; border: string }> = {
  [Currency.CP]: { text: 'text-amber-500', border: 'border-amber-600/35 hover:border-amber-500/60 focus:border-amber-500' },
  [Currency.SP]: { text: 'text-slate-300', border: 'border-slate-500/35 hover:border-slate-400/60 focus:border-slate-300' },
  [Currency.EP]: { text: 'text-emerald-400', border: 'border-emerald-500/35 hover:border-emerald-400/60 focus:border-emerald-400' },
  [Currency.GP]: { text: 'text-yellow-500', border: 'border-yellow-500/35 hover:border-yellow-400/60 focus:border-yellow-500' },
  [Currency.PP]: { text: 'text-purple-400', border: 'border-purple-400/25 focus:border-purple-400/50 hover:border-purple-400/60' },
};

export const CurrencyTracker: React.FC<CurrencyTrackerProps> = ({ currency, onCurrencyChange }) => {
  const [calcAmount, setCalcAmount] = useState(0);
  const [calcCurrency, setCalcCurrency] = useState<Currency>(Currency.GP);
  
  const [convertAmount, setConvertAmount] = useState(0);
  const [convertFrom, setConvertFrom] = useState<Currency>(Currency.GP);
  const [convertTo, setConvertTo] = useState<Currency>(Currency.SP);
  const { addNotification } = useNotifier();

  const handleCalculate = (operation: 'add' | 'subtract') => {
    if (!calcAmount || calcAmount <= 0) return;

    const currentVal = currency[calcCurrency] || 0;
    let newVal: number;

    if (operation === 'add') {
      newVal = currentVal + calcAmount;
    } else {
      if (currentVal < calcAmount) {
        addNotification('Недостаточно средств для вычитания.', 'error');
        return;
      }
      newVal = currentVal - calcAmount;
    }
    
    onCurrencyChange(calcCurrency, newVal);
    setCalcAmount(0);
  };
  
  const handleConvert = () => {
    if (!convertAmount || convertAmount <= 0) return;
    if (convertFrom === convertTo) return;

    const currentFromVal = currency[convertFrom] || 0;
    if (currentFromVal < convertAmount) {
      addNotification(`Недостаточно ${CURRENCY_NAMES[convertFrom]} для конвертации.`, 'error');
      return;
    }

    const valueInCopper = convertAmount * CONVERSION_RATES[convertFrom];
    if (valueInCopper % CONVERSION_RATES[convertTo] !== 0) {
      addNotification('Невозможно произвести чистый обмен. Попробуйте конвертировать в более мелкие единицы.', 'warning');
      return;
    }
    
    const resultAmount = valueInCopper / CONVERSION_RATES[convertTo];
    const currentToVal = currency[convertTo] || 0;

    onCurrencyChange(convertFrom, currentFromVal - convertAmount);
    onCurrencyChange(convertTo, currentToVal + resultAmount);

    setConvertAmount(0);
  };


  return (
    <div className="bg-[var(--color-surface-inset)] p-3 rounded-xl border border-[var(--color-border-subtle)] space-y-3 w-full">
      <div className="grid grid-cols-5 gap-x-2">
        {Object.entries(CURRENCY_ABBREVIATIONS_RU).map(([c, name]) => {
          const curr = c as Currency;
          const colors = CURRENCY_COLORS[curr];
          return (
            <div key={c} className="flex flex-col items-center flex-1 min-w-0">
              <label 
                htmlFor={`currency-${c}`} 
                className={`text-[10px] font-extrabold tracking-wider uppercase mb-1.5 ${colors.text} drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]`}
                data-tooltip={CURRENCY_NAMES[curr]}
              >
                {name}
              </label>
              <input
                type="number"
                id={`currency-${c}`}
                value={currency[curr]}
                onChange={(e) => onCurrencyChange(curr, parseInt(e.target.value, 10))}
                className={`w-full bg-[var(--color-background)] border ${colors.border} rounded-lg py-1.5 px-1.5 text-center font-extrabold focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] transition-all text-sm appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                min="0"
                placeholder="0"
                data-tooltip={`Количество монет: ${CURRENCY_NAMES[curr]}`}
              />
            </div>
          );
        })}
      </div>

      <div className="border-t border-slate-700/40 pt-2.5 flex items-center gap-1.5">
        <input
            type="number"
            value={calcAmount || ''}
            onChange={(e) => setCalcAmount(Math.max(0, parseInt(e.target.value, 10)))}
            className="w-20 bg-[var(--color-background)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)] focus:border-[var(--color-focus-ring)] rounded-lg py-1.5 px-2 text-xs text-center focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] font-semibold text-[var(--color-text-base)] transition-all shadow-inner"
            placeholder="Сумма"
            min="0"
            data-tooltip="Сумма монет для прибавления или вычитания"
        />
        <div className="relative flex-shrink-0">
          <select
              value={calcCurrency}
              onChange={(e) => setCalcCurrency(e.target.value as Currency)}
              className="bg-[var(--color-background)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)] focus:border-[var(--color-focus-ring)] rounded-lg py-1.5 pl-2.5 pr-6 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] transition-all cursor-pointer text-[var(--color-text-base)] appearance-none shadow-sm"
              style={{
                backgroundImage: 'var(--select-arrow-url)',
                backgroundPosition: 'right 0.35rem center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '1.25em 1.25em',
              }}
              data-tooltip="Выберите монету для расчёта"
          >
            {Object.entries(CURRENCY_ABBREVIATIONS_RU).map(([key, name]) => (
              <option key={key} value={key}>{name}</option>
            ))}
          </select>
        </div>
        <button onClick={() => handleCalculate('add')} className="flex-1 bg-teal-950/40 text-teal-300 border border-teal-500/20 hover:bg-teal-900/50 text-[11px] font-extrabold py-1.5 px-2 rounded-lg transition-all duration-150 active:scale-95 shadow-sm" data-tooltip="Добавить указанную сумму монет">Прибавить</button>
        <button onClick={() => handleCalculate('subtract')} className="flex-1 bg-rose-950/40 text-rose-300 border border-rose-500/20 hover:bg-rose-900/50 text-[11px] font-extrabold py-1.5 px-2 rounded-lg transition-all duration-150 active:scale-95 shadow-sm" data-tooltip="Вычесть указанную сумму монет">Вычесть</button>
      </div>
      
      <div className="border-t border-slate-700/40 pt-2.5 flex items-center gap-1.5">
        <input
            type="number"
            value={convertAmount || ''}
            onChange={(e) => setConvertAmount(Math.max(0, parseInt(e.target.value, 10)))}
            className="w-20 bg-[var(--color-background)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)] focus:border-[var(--color-focus-ring)] rounded-lg py-1.5 px-2 text-xs text-center focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] font-semibold text-[var(--color-text-base)] transition-all shadow-inner"
            placeholder="Сумма"
            min="0"
            data-tooltip="Сумма для обмена"
        />
        <div className="relative flex-1 min-w-[50px]">
          <select
              value={convertFrom}
              onChange={(e) => setConvertFrom(e.target.value as Currency)}
              className="w-full bg-[var(--color-background)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)] focus:border-[var(--color-focus-ring)] rounded-lg py-1.5 pl-2.5 pr-6 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] transition-all cursor-pointer text-[var(--color-text-base)] appearance-none shadow-sm"
              style={{
                backgroundImage: 'var(--select-arrow-url)',
                backgroundPosition: 'right 0.35rem center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '1.25em 1.25em',
              }}
              data-tooltip="Какую валюту отдаёте"
          >
            {Object.entries(CURRENCY_ABBREVIATIONS_RU).map(([key, name]) => (
              <option key={key} value={key}>{name}</option>
            ))}
          </select>
        </div>
        <span className="text-[11px] text-[var(--color-text-muted)] font-extrabold flex-shrink-0">в</span>
        <div className="relative flex-1 min-w-[50px]">
          <select
              value={convertTo}
              onChange={(e) => setConvertTo(e.target.value as Currency)}
              className="w-full bg-[var(--color-background)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)] focus:border-[var(--color-focus-ring)] rounded-lg py-1.5 pl-2.5 pr-6 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] transition-all cursor-pointer text-[var(--color-text-base)] appearance-none shadow-sm"
              style={{
                backgroundImage: 'var(--select-arrow-url)',
                backgroundPosition: 'right 0.35rem center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '1.25em 1.25em',
              }}
              data-tooltip="Какую валюту получаете"
          >
            {Object.entries(CURRENCY_ABBREVIATIONS_RU).map(([key, name]) => (
              <option key={key} value={key}>{name}</option>
            ))}
          </select>
        </div>
        <button onClick={handleConvert} className="flex-1 bg-amber-950/40 text-amber-300 border border-amber-500/20 hover:bg-amber-900/50 text-[11px] font-extrabold py-1.5 px-2 rounded-lg transition-all duration-150 active:scale-95 shadow-sm flex-shrink-0" data-tooltip="Произвести обмен монет по стандартному курсу">Обменять</button>
      </div>

    </div>
  );
};