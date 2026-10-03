import { useState } from 'react';
import { Currency, Rarity } from '../../types';
import { logger } from '../../utils/logger';
import {
  translateText,
  mapRarity,
  mapCurrency,
  translateQueryToEnglish,
  expandSearchTerms
} from '../../utils/translation';
import { useNotifier } from '../../context/NotificationContext';
import { type FormDataUpdater } from './itemDetailShared';

interface ApiSearchPanelProps {
  updateFormData: FormDataUpdater;
  onRequestClosePanel: () => void;
}

type SearchResult = { index: string; name: string; url: string; type: 'equipment' | 'magic-item' };

export const ApiSearchPanel: React.FC<ApiSearchPanelProps> = ({ updateFormData, onRequestClosePanel }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [ruleset, setRuleset] = useState<'2014' | '2024'>('2014');
  const [translateEnabled, setTranslateEnabled] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const { addNotification } = useNotifier();

  const handleSearch = async (overrideRuleset?: '2014' | '2024') => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);

    const activeRuleset = overrideRuleset || ruleset;
    try {
        // Translate search query to English if it is in Russian
        const englishQuery = await translateQueryToEnglish(searchQuery);
        const baseEndpoint = activeRuleset === '2024' ? 'https://www.dnd5eapi.co/api/2024' : 'https://www.dnd5eapi.co/api';

        // Expand query terms for synonym fuzzy matching
        const terms = expandSearchTerms(englishQuery).slice(0, 5);

        const eqPromises = terms.map(async (term) => {
            const url = `${baseEndpoint}/equipment?name=${encodeURIComponent(term)}`;
            const res = await fetch(url);
            if (!res.ok) return [];
            const data = await res.json();
            return (data.results || []).map((r: any) => ({ ...r, type: 'equipment' }));
        });

        const miPromises = terms.map(async (term) => {
            const url = `${baseEndpoint}/magic-items?name=${encodeURIComponent(term)}`;
            const res = await fetch(url);
            if (!res.ok) return [];
            const data = await res.json();
            return (data.results || []).map((r: any) => ({ ...r, type: 'magic-item' }));
        });

        const allResults = await Promise.all([...eqPromises, ...miPromises]);
        const seen = new Set<string>();
        const mergedResults: any[] = [];
        for (const list of allResults) {
            for (const item of list) {
                const uniqueKey = `${item.type}-${item.index}`;
                if (!seen.has(uniqueKey)) {
                    seen.add(uniqueKey);
                    mergedResults.push(item);
                }
            }
        }

        if (mergedResults.length > 0) {
            setSearchResults(mergedResults);
        } else {
            setSearchError(activeRuleset === '2024'
                ? `Предметы не найдены для "${searchQuery}" (поиск: "${englishQuery}"). Попробуйте переключить редакцию на 2014.`
                : `Предметы не найдены для "${searchQuery}" (поиск: "${englishQuery}").`
            );
        }
    } catch (err) {
        logger.error(err);
        setSearchError(activeRuleset === '2024'
            ? 'Ошибка поиска. Возможно, редакция 2024 еще не поддерживает данный поиск. Попробуйте переключить на 2014.'
            : 'Не удалось выполнить поиск. Проверьте соединение.'
        );
    } finally {
        setIsSearching(false);
    }
  };

  const handleSelectItem = async (itemUrl: string, type: 'equipment' | 'magic-item') => {
    setIsSearching(true);
    setSearchError(null);
    try {
        const response = await fetch(`https://www.dnd5eapi.co${itemUrl}`);
        if (!response.ok) {
            throw new Error(`Item detail API error: ${response.status}`);
        }
        const apiItem = await response.json();

        const packWeights: Record<string, number> = {
            'explorers-pack': 59,
            'burglars-pack': 47.5,
            'diplomats-pack': 36,
            'dungeoneers-pack': 61.5,
            'entertainers-pack': 38,
            'priests-pack': 19,
            'scholars-pack': 10
        };
        let mappedWeight = apiItem.weight || 0;
        if (mappedWeight === 0 && packWeights[apiItem.index]) {
            mappedWeight = packWeights[apiItem.index];
        }

        let mappedCostAmount = 0;
        let mappedCurrency = Currency.GP;

        if (apiItem.cost) {
            mappedCostAmount = apiItem.cost.quantity || 0;
            mappedCurrency = mapCurrency(apiItem.cost.unit || 'gp');
        }

        let mappedRarity = Rarity.Common;
        if (apiItem.rarity) {
            const rarityStr = typeof apiItem.rarity === 'object' ? apiItem.rarity.name : apiItem.rarity;
            mappedRarity = mapRarity(rarityStr || '');
        } else if (type === 'magic-item') {
            mappedRarity = Rarity.Rare;
        }

        let descText = '';
        if (apiItem.desc) {
            descText = Array.isArray(apiItem.desc) ? apiItem.desc.filter((d: any) => d).join('\n\n') : apiItem.desc;
        }

        if (apiItem.special && apiItem.special.length > 0) {
            const specialText = Array.isArray(apiItem.special) ? apiItem.special.filter((s: any) => s).join('\n\n') : apiItem.special;
            if (specialText) {
                descText = descText ? `${descText}\n\n**Особое:**\n${specialText}` : `**Особое:**\n${specialText}`;
            }
        }

        if (apiItem.contents && apiItem.contents.length > 0) {
            const contentsList = apiItem.contents.map((c: any) => {
                const itemName = c.item?.name || '';
                const quantity = c.quantity || 1;
                return `- ${itemName} x${quantity}`;
            }).join('\n');

            descText = descText ? `${descText}\n\n**Содержимое:**\n${contentsList}` : `**Содержимое:**\n${contentsList}`;
        }

        if (apiItem.properties && apiItem.properties.length > 0) {
            const props = apiItem.properties.map((p: any) => p.name).join(', ');
            descText += `\n\n**Свойства:** ${props}`;
        }
        if (apiItem.weapon_range) {
            descText += `\n**Дистанция:** ${apiItem.weapon_range}`;
        }
        if (apiItem.damage) {
            descText += `\n**Урон:** ${apiItem.damage.damage_dice} (${apiItem.damage.damage_type?.name})`;
        }
        if (apiItem.armor_class) {
            descText += `\n**Класс доспеха (Базовый):** ${apiItem.armor_class.base}`;
            if (apiItem.armor_class.dex_bonus) {
                descText += ` (+Ловкость, макс. ${apiItem.armor_class.max_bonus || 'без огр.'})`;
            }
        }

        let translatedName = apiItem.name;
        let translatedDesc = descText;

        if (translateEnabled) {
            try {
                const namePromise = translateText(apiItem.name);
                const descPromise = translateText(descText);
                const [tName, tDesc] = await Promise.all([namePromise, descPromise]);
                translatedName = tName;
                translatedDesc = tDesc;
            } catch (transErr) {
                logger.error("Translation failed, keeping original English name/description.", transErr);
            }
        }

        updateFormData(prev => ({
            ...prev,
            name: translatedName,
            description: translatedDesc,
            weight: mappedWeight,
            cost: { amount: mappedCostAmount, currency: mappedCurrency },
            rarity: mappedRarity,
            isChest: prev.isChest,
            chestInventory: prev.chestInventory,
            hasCharges: prev.hasCharges,
            totalCharges: prev.totalCharges,
            currentCharges: prev.currentCharges,
            chargeRecovery: prev.chargeRecovery,
            isEquipped: prev.isEquipped,
            bonuses: prev.bonuses
        }));

        onRequestClosePanel();
        addNotification(`Предмет "${translatedName}" успешно импортирован!`, 'info');
    } catch (err) {
        logger.error(err);
        setSearchError('Не удалось загрузить детальную информацию о предмете.');
    } finally {
        setIsSearching(false);
    }
  };

  return (
      <div className="space-y-3">
          <div className="text-[10px] text-[var(--color-text-subtle)] leading-relaxed">
              Поиск работает по названию предмета (например, <span className="text-[var(--color-accent-primary)] font-semibold cursor-pointer" onClick={() => setSearchQuery('Longsword')}>Longsword</span>, <span className="text-[var(--color-accent-primary)] font-semibold cursor-pointer" onClick={() => setSearchQuery('Shield')}>Shield</span>, <span className="text-[var(--color-accent-primary)] font-semibold cursor-pointer" onClick={() => setSearchQuery('Amulet of Health')}>Amulet of Health</span>).
          </div>

          {/* Ruleset & Translation Switches */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                  <span className="text-[var(--color-text-muted)] font-medium">Редакция:</span>
                  <label className="inline-flex items-center cursor-pointer select-none">
                      <input
                          type="radio"
                          name="item-ruleset"
                          value="2014"
                          checked={ruleset === '2014'}
                          onChange={() => {
                              setRuleset('2014');
                              if (searchQuery.trim()) handleSearch('2014');
                          }}
                          className="sr-only peer"
                      />
                      <span className="px-2 py-0.5 rounded-l-md border border-[var(--color-border)] bg-[var(--color-background)] text-[10px] font-bold text-[var(--color-text-muted)] peer-checked:bg-[var(--color-accent-primary)]/20 peer-checked:border-[var(--color-accent-primary-hover)] peer-checked:text-[var(--color-accent-primary-light)] transition-colors">2014 (Стабильная)</span>
                  </label>
                  <label className="inline-flex items-center cursor-pointer select-none -ml-px">
                      <input
                          type="radio"
                          name="item-ruleset"
                          value="2024"
                          checked={ruleset === '2024'}
                          onChange={() => {
                              setRuleset('2024');
                              if (searchQuery.trim()) handleSearch('2024');
                          }}
                          className="sr-only peer"
                      />
                      <span className="px-2 py-0.5 rounded-r-md border border-[var(--color-border)] bg-[var(--color-background)] text-[10px] font-bold text-[var(--color-text-muted)] peer-checked:bg-[var(--color-accent-primary)]/20 peer-checked:border-[var(--color-accent-primary-hover)] peer-checked:text-[var(--color-accent-primary-light)] transition-colors">2024 (Эксперим.)</span>
                  </label>
              </div>

              <label className="flex items-center space-x-1.5 cursor-pointer">
                  <input
                      type="checkbox"
                      checked={translateEnabled}
                      onChange={(e) => setTranslateEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-[var(--color-border)] text-teal-500 focus:ring-teal-400 bg-[var(--color-background)]"
                  />
                  <span className="text-[10px] font-bold text-[var(--color-text-muted)]">Перевод на русский</span>
              </label>
          </div>

          {/* Search Bar */}
          <div className="flex gap-2">
              <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Название предмета на русском или английском..."
                  className="flex-grow bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
              />
              <button
                  type="button"
                  onClick={() => handleSearch()}
                  disabled={isSearching}
                  className="px-3 py-1 bg-[var(--color-accent-primary-active)] hover:bg-[var(--color-accent-primary-dark)] text-white text-xs font-bold rounded-lg transition-all disabled:opacity-50 flex items-center gap-1 shadow"
              >
                  {isSearching ? 'Поиск...' : 'Найти'}
              </button>
          </div>

          {/* Error State */}
          {searchError && (
              <div className="text-xs text-red-400 bg-red-950/20 border border-red-900/30 p-2 rounded-lg leading-relaxed flex flex-col gap-1.5">
                  <span>{searchError}</span>
                  {ruleset === '2024' && (
                      <button
                          type="button"
                          onClick={() => {
                              setRuleset('2014');
                              handleSearch('2014');
                          }}
                          className="text-left text-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary-hover)] font-bold underline cursor-pointer"
                      >
                          Искать в правилах 2014 г.
                      </button>
                  )}
              </div>
          )}

          {/* Search Results */}
          {searchResults.length > 0 && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  <div className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">Результаты поиска ({searchResults.length}):</div>
                  <div className="grid grid-cols-2 gap-2">
                      {searchResults.map((result) => (
                          <button
                              key={`${result.type}-${result.index}`}
                              type="button"
                              onClick={() => handleSelectItem(result.url, result.type)}
                              className="text-left bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] hover:border-teal-500/50 hover:bg-[var(--color-surface-raised-hover)] px-2 py-1.5 rounded-lg text-xs font-medium text-[var(--color-text-medium)] hover:text-[var(--color-text-base)] transition-all truncate flex items-center justify-between"
                              data-tooltip={result.name}
                          >
                              <span className="truncate">✨ {result.name}</span>
                              <span className="text-[8px] opacity-60 uppercase bg-black/20 px-1 rounded flex-shrink-0 ml-1">{result.type === 'equipment' ? 'Снар' : 'Маг'}</span>
                          </button>
                      ))}
                  </div>
              </div>
          )}
      </div>
  );
};
