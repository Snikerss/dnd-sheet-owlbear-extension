import React, { useState, useEffect } from 'react';
import { Spell, MagicSchool } from '../types';
import { CustomIconPicker } from './CustomIconPicker';
import { MAGIC_SCHOOL_NAMES } from '../constants';
import { useFocusTrap } from '../utils/useFocusTrap';
import { generateUUID } from '../utils/uuid';
import { useNotifier } from '../context/NotificationContext';
import { 
  translateText, 
  translateCastingTime, 
  translateRange, 
  translateDuration, 
  mapMagicSchool,
  translateQueryToEnglish,
  expandSearchTerms,
  parseRobustJSON
} from '../utils/translation';
import { generateWithGemini, getGeminiApiKey, setGeminiApiKey } from '../utils/gemini';

interface SpellDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (spell: Spell) => void;
  onDelete: (id: string) => void;
  spell: Spell | null;
  customIcons: string[];
  onAddCustomIcon: (iconDataUrl: string) => void;
  onDeleteCustomIcon: (iconDataUrl: string) => void;
}

const DEFAULT_SPELL: Omit<Spell, 'id'> = {
  name: 'Новое заклинание',
  description: '',
  level: 0,
  school: MagicSchool.Evocation,
  castingTime: '1 действие',
  range: '60 футов',
  duration: 'Мгновенная',
  isPrepared: false,
  imageUrl: '',
  isRitual: false,
  requiresConcentration: false,
  components: {
    verbal: false,
    somatic: false,
    material: false,
    materialDescription: '',
  },
};

export const SpellDetailModal: React.FC<SpellDetailModalProps> = ({ isOpen, onClose, onSave, onDelete, spell, customIcons, onAddCustomIcon, onDeleteCustomIcon }) => {
  const [formData, setFormData] = useState<Omit<Spell, 'id'>>(() => spell || DEFAULT_SPELL);
  const [showPicker, setShowPicker] = useState(false);
  const { addNotification } = useNotifier();
  const modalRef = useFocusTrap<HTMLDivElement>(isOpen, onClose);

  // API Search States
  const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [ruleset, setRuleset] = useState<'2014' | '2024'>('2014');
  const [translateEnabled, setTranslateEnabled] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{ index: string; name: string; url: string }[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // AI Import States
  const [importSource, setImportSource] = useState<'api' | 'ai'>('api');
  const [aiMode, setAiMode] = useState<'official' | 'homebrew'>('official');
  const [geminiKey, setGeminiKey] = useState(() => getGeminiApiKey());
  const [aiDescription, setAiDescription] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // AI Image Generator States
  const [showAiImagePrompt, setShowAiImagePrompt] = useState(false);
  const [aiImagePrompt, setAiImagePrompt] = useState('');
  const [isAiGeneratingImage, setIsAiGeneratingImage] = useState(false);
  const [aiImageError, setAiImageError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFormData(spell || DEFAULT_SPELL);
      setShowPicker(false);
      setIsSearchPanelOpen(false);
      setSearchQuery('');
      setSearchResults([]);
      setSearchError(null);
      setImportSource('api');
      setAiMode('official');
      setAiDescription('');
      setAiError(null);
      setIsAiGenerating(false);
      setGeminiKey(getGeminiApiKey());
      setShowAiImagePrompt(false);
      setAiImagePrompt('');
      setIsAiGeneratingImage(false);
      setAiImageError(null);
    }
  }, [spell, isOpen]);

  const handleGeminiKeyChange = (key: string) => {
      setGeminiKey(key);
      setGeminiApiKey(key);
  };

  const handleAIImport = async () => {
    if (!aiDescription.trim()) return;
    if (!geminiKey.trim()) {
        setAiError('Введите ваш API Ключ Gemini для работы ИИ-генератора.');
        return;
    }
    
    setIsAiGenerating(true);
    setAiError(null);
    
    try {
        const isOfficial = aiMode === 'official';
        const prompt = `
You are a D&D 5e assistant. Based on the mode "${isOfficial ? 'official' : 'homebrew'}", generate details for a spell and return a JSON object conforming strictly to the following JSON schema:
{
  "type": "object",
  "properties": {
    "error": { "type": "string", "description": "Fill this ONLY in 'official' mode if you cannot find any official D&D 5e SRD / Player's Handbook spell matching the query name/description." },
    "name": { "type": "string" },
    "level": { "type": "integer", "minimum": 0, "maximum": 9 },
    "school": { "type": "string", "enum": ["abjuration", "conjuration", "divination", "enchantment", "evocation", "illusion", "necromancy", "transmutation"] },
    "castingTime": { "type": "string" },
    "range": { "type": "string" },
    "duration": { "type": "string" },
    "requiresConcentration": { "type": "boolean" },
    "isRitual": { "type": "boolean" },
    "components": {
      "type": "object",
      "properties": {
        "verbal": { "type": "boolean" },
        "somatic": { "type": "boolean" },
        "material": { "type": "boolean" },
        "materialDescription": { "type": "string" }
      },
      "required": ["verbal", "somatic", "material", "materialDescription"]
    },
    "description": { "type": "string" }
  },
  "required": ["name", "level", "school", "castingTime", "range", "duration", "requiresConcentration", "isRitual", "components", "description"]
}

Important Instructions:
${isOfficial ? `
- You must act as a strict D&D 5e rules encyclopedia.
- Find the official D&D 5e SRD / ruleset spell matching: "${aiDescription}".
- Do NOT invent or make up characteristics. Fill in the exact official statistics.
- If no official spell exists under this name or similar, fill the "error" field with a helpful message in Russian explaining that the spell is not part of the official rules, and leave other fields empty or dummy.
` : `
- You must act as a creative D&D 5e homebrew generator.
- Create a new custom homebrew spell based on the user's ideas: "${aiDescription}".
- Do NOT output any "error". Invent balanced and thematic statistics.
`}
- Translate the output name, description, castingTime, range, duration, and materialDescription to Russian.
- Ensure the spell school is one of the enum values in lowercase.
- Do NOT use double quotes (") inside JSON string values. If you need quotation marks in description or name, use single quotes (') or Russian angle quotes (« »).
- Do NOT write raw line breaks in JSON strings; use escaped \\n instead.
- Clean up HTML tags and format description nicely.
`;

        // Используем единый сервис: ключ всегда в заголовке, не в URL (баг #5).
        let jsonText: string;
        try {
            jsonText = await generateWithGemini('gemini-2.0-flash', prompt, {
                responseMimeType: 'application/json',
                tools: [{ googleSearch: {} }],
            });
        } catch (groundingErr) {
            console.warn(`Gemini API call with Google Search failed (${(groundingErr as Error).message}). Retrying without search grounding...`);
            jsonText = await generateWithGemini('gemini-2.0-flash', prompt, {
                responseMimeType: 'application/json',
            });
        }

        const parsedSpell = parseRobustJSON(jsonText);
        
        if (parsedSpell.error) {
            setAiError(parsedSpell.error);
            return;
        }
        
        setFormData({
            name: parsedSpell.name || 'Новое заклинание',
            level: parsedSpell.level || 0,
            school: mapMagicSchool(parsedSpell.school || 'evocation'),
            requiresConcentration: !!parsedSpell.requiresConcentration,
            isRitual: !!parsedSpell.isRitual,
            castingTime: parsedSpell.castingTime || '1 действие',
            range: parsedSpell.range || 'На себя',
            duration: parsedSpell.duration || 'Мгновенно',
            components: {
                verbal: !!parsedSpell.components?.verbal,
                somatic: !!parsedSpell.components?.somatic,
                material: !!parsedSpell.components?.material,
                materialDescription: parsedSpell.components?.materialDescription || ''
            },
            description: parsedSpell.description || '',
            isPrepared: false,
            imageUrl: ''
        });
        
        setIsSearchPanelOpen(false);
        addNotification(isOfficial ? `Заклинание "${parsedSpell.name}" успешно импортировано!` : `Заклинание "${parsedSpell.name}" успешно сгенерировано ИИ!`, 'info');
    } catch (err: any) {
        console.error(err);
        setAiError(`Не удалось сгенерировать заклинание: ${err.message || 'ошибка сети или неверный API-ключ'}`);
    } finally {
        setIsAiGenerating(false);
    }
  };

  const handleGenerateAIImage = async () => {
    const promptToUse = aiImagePrompt.trim() || formData.name;
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
            console.warn("Could not translate image prompt: ", transErr);
        }

        const finalPrompt = `D&D high fantasy game icon style, detailed spell illustration, ${englishPrompt}, digital art, highly detailed, clean background, magical lighting`;
        const seed = Math.floor(Math.random() * 1000000);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=512&height=512&nologo=true&seed=${seed}&model=flux&enhance=true`;

        // Preload image
        await new Promise((resolve, reject) => {
            const img = new Image();
            img.src = imageUrl;
            img.onload = resolve;
            img.onerror = () => reject(new Error('Не удалось сгенерировать изображение. Попробуйте еще раз.'));
        });

        setFormData(prev => ({ ...prev, imageUrl }));
        setShowAiImagePrompt(false);
        addNotification('Изображение успешно сгенерировано ИИ!', 'success');
    } catch (err: any) {
        console.error(err);
        setAiImageError(err.message || 'Ошибка генерации изображения');
    } finally {
        setIsAiGeneratingImage(false);
    }
  };

  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;

    if (name.startsWith('component-')) {
        const componentName = name.split('-')[1];
        if (!componentName) return;
        const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
        setFormData(prev => ({
            ...prev,
            components: { ...prev.components, [componentName]: val }
        }));
    } else if (type === 'checkbox') {
        const { checked } = e.target as HTMLInputElement;
        setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
        const parsedValue = (name === 'level' || name === 'school') ? parseInt(value, 10) : value;
        setFormData(prev => ({ ...prev, [name]: parsedValue }));
    }
  };

  const handleSave = () => {
    if (!formData.name) return;
    const finalSpell: Spell = {
      id: spell?.id || generateUUID(),
      ...formData,
    };
    onSave(finalSpell);
  };

  const handleDelete = () => {
    if (spell) onDelete(spell.id);
  };

  const handleSelectIcon = (iconUrl: string) => {
    setFormData(prev => ({ ...prev, imageUrl: iconUrl }));
    setShowPicker(false);
  };

  const handleUploadIcon = (iconUrl: string) => {
    onAddCustomIcon(iconUrl);
    setFormData(prev => ({ ...prev, imageUrl: iconUrl }));
  };
  
  const handleRemoveImage = () => {
      setFormData(prev => ({...prev, imageUrl: ''}));
  }

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
        const fetchPromises = terms.map(async (term) => {
            const url = `${baseEndpoint}/spells?name=${encodeURIComponent(term)}`;
            const res = await fetch(url);
            if (!res.ok) return [];
            const data = await res.json();
            return data.results || [];
        });
        
        const allResults = await Promise.all(fetchPromises);
        const seen = new Set<string>();
        const mergedResults: any[] = [];
        for (const list of allResults) {
            for (const item of list) {
                if (!seen.has(item.index)) {
                    seen.add(item.index);
                    mergedResults.push(item);
                }
            }
        }
        
        if (mergedResults.length > 0) {
            setSearchResults(mergedResults);
        } else {
            setSearchError(activeRuleset === '2024' 
                ? `Заклинания не найдены для "${searchQuery}" (поиск: "${englishQuery}"). Попробуйте переключить редакцию на 2014.` 
                : `Заклинания не найдены для "${searchQuery}" (поиск: "${englishQuery}").`
            );
        }
    } catch (err) {
        console.error(err);
        setSearchError(activeRuleset === '2024'
            ? 'Ошибка поиска. Возможно, редакция 2024 еще не поддерживает данный поиск. Попробуйте переключить на 2014.'
            : 'Не удалось выполнить поиск. Проверьте соединение.'
        );
    } finally {
        setIsSearching(false);
    }
  };

  const handleSelectSpell = async (spellUrl: string) => {
    setIsSearching(true);
    setSearchError(null);
    try {
        const response = await fetch(`https://www.dnd5eapi.co${spellUrl}`);
        if (!response.ok) {
            throw new Error(`Spell detail API error: ${response.status}`);
        }
        const apiSpell = await response.json();
        
        // Translate structured fields
        let translatedName = apiSpell.name;
        const translatedCastingTime = translateCastingTime(apiSpell.casting_time);
        const translatedRange = translateRange(apiSpell.range);
        const translatedDuration = translateDuration(apiSpell.duration);
        
        let descText = apiSpell.desc ? apiSpell.desc.join('\n\n') : '';
        if (apiSpell.higher_level && apiSpell.higher_level.length > 0) {
            descText += '\n\n**На больших уровнях:**\n' + apiSpell.higher_level.join('\n');
        }
        let translatedDesc = descText;
        
        const materialDesc = apiSpell.material || '';
        let translatedMaterialDesc = materialDesc;

        // Perform translation via API if requested
        if (translateEnabled) {
            try {
                const namePromise = translateText(apiSpell.name);
                const descPromise = translateText(descText);
                const matPromise = materialDesc ? translateText(materialDesc) : Promise.resolve('');
                
                const [tName, tDesc, tMat] = await Promise.all([namePromise, descPromise, matPromise]);
                translatedName = tName;
                translatedDesc = tDesc;
                translatedMaterialDesc = tMat;
            } catch (transErr) {
                console.error("Async translation failed, falling back to English desc.", transErr);
            }
        }
        
        setFormData({
            name: translatedName,
            description: translatedDesc,
            level: apiSpell.level || 0,
            school: mapMagicSchool(apiSpell.school?.index || apiSpell.school?.name || ''),
            castingTime: translatedCastingTime,
            range: translatedRange,
            duration: translatedDuration,
            isPrepared: false,
            imageUrl: '',
            isRitual: !!apiSpell.ritual,
            requiresConcentration: !!apiSpell.concentration,
            components: {
                verbal: apiSpell.components?.includes('V') || false,
                somatic: apiSpell.components?.includes('S') || false,
                material: apiSpell.components?.includes('M') || false,
                materialDescription: translatedMaterialDesc
            }
        });
        
        // Close search panel after selection
        setIsSearchPanelOpen(false);
    } catch (err) {
        console.error(err);
        setSearchError('Не удалось загрузить детальную информацию о заклинании.');
    } finally {
        setIsSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[var(--color-surface-translucent)] backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="spell-modal-title">
      <div ref={modalRef} className="bg-[var(--color-surface-opaque)] rounded-xl shadow-2xl p-6 m-4 w-full max-w-4xl border border-[var(--color-border)] animate-fade-in" onClick={e => e.stopPropagation()}>
        <h2 id="spell-modal-title" className="text-2xl font-bold text-[var(--color-accent-primary)] mb-4">{spell ? 'Редактировать' : 'Новое'} заклинание</h2>
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-3">
          {/* D&D 5e API & AI Search Section */}
          <div className="bg-[var(--color-surface-well)] p-3 rounded-lg border border-[var(--color-border)] mb-4 animate-fade-in">
              <button
                  type="button"
                  onClick={() => setIsSearchPanelOpen(!isSearchPanelOpen)}
                  className="flex items-center justify-between w-full text-xs font-bold text-[var(--color-text-medium)] uppercase tracking-wider focus:outline-none"
              >
                  <span>🔮 Импорт из API / Google AI (Gemini)</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transform transition-transform duration-200 ${isSearchPanelOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
              </button>
              
              {isSearchPanelOpen && (
                  <div className="mt-3 space-y-3 border-t border-[var(--color-border-subtle)] pt-3 animate-fade-in">
                      {/* Tabs */}
                      <div className="flex border-b border-[var(--color-border-subtle)] pb-2 mb-2">
                          <button
                              type="button"
                              onClick={() => setImportSource('api')}
                              className={`px-3 py-1 text-xs font-bold rounded-t-lg transition-colors border-b-2 mr-2 ${importSource === 'api' ? 'border-[var(--color-accent-primary)] text-[var(--color-accent-primary-light)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-medium)]'}`}
                          >
                              🔍 Поиск по базе (API)
                          </button>
                          <button
                              type="button"
                              onClick={() => setImportSource('ai')}
                              className={`px-3 py-1 text-xs font-bold rounded-t-lg transition-colors border-b-2 ${importSource === 'ai' ? 'border-[var(--color-accent-primary)] text-[var(--color-accent-primary-light)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-medium)]'}`}
                          >
                              ✨ Генератор ИИ (Gemini)
                          </button>
                      </div>

                      {importSource === 'api' ? (
                          <div className="space-y-3">
                              <div className="text-[10px] text-[var(--color-text-subtle)] leading-relaxed">
                                  Поиск работает по названию заклинания (например, <span className="text-[var(--color-accent-primary)] font-semibold cursor-pointer" onClick={() => setSearchQuery('Fireball')}>Fireball</span>, <span className="text-[var(--color-accent-primary)] font-semibold cursor-pointer" onClick={() => setSearchQuery('Shield')}>Shield</span>, <span className="text-[var(--color-accent-primary)] font-semibold cursor-pointer" onClick={() => setSearchQuery('Cure Wounds')}>Cure Wounds</span>).
                              </div>
                              
                              {/* Ruleset & Translation Switches */}
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <div className="flex items-center gap-2">
                                      <span className="text-[var(--color-text-muted)] font-medium">Редакция:</span>
                                      <label className="inline-flex items-center cursor-pointer select-none">
                                          <input 
                                              type="radio" 
                                              name="ruleset" 
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
                                              name="ruleset" 
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
                                      placeholder="Название заклинания на русском или английском..." 
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
                                                  key={result.index}
                                                  type="button"
                                                  onClick={() => handleSelectSpell(result.url)}
                                                  className="text-left bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] hover:border-teal-500/50 hover:bg-[var(--color-surface-raised-hover)] px-2 py-1.5 rounded-lg text-xs font-medium text-[var(--color-text-medium)] hover:text-[var(--color-text-base)] transition-all truncate"
                                                  data-tooltip={result.name}
                                              >
                                                  ✨ {result.name}
                                              </button>
                                          ))}
                                      </div>
                                  </div>
                              )}
                          </div>
                      ) : (
                          <div className="space-y-3">
                               <div className="text-[10px] text-[var(--color-text-subtle)] leading-relaxed">
                                  Опишите заклинание (или скопируйте его текст из Книги игрока) своими словами на любом языке.
                              </div>
                              
                              {/* AI Mode Selector */}
                              <div className="flex items-center gap-2 text-xs">
                                  <span className="text-[var(--color-text-muted)] font-medium">Режим работы:</span>
                                  <label className="inline-flex items-center cursor-pointer select-none">
                                      <input 
                                          type="radio" 
                                          name="spell-ai-mode" 
                                          value="official" 
                                          checked={aiMode === 'official'} 
                                          onChange={() => setAiMode('official')} 
                                          className="sr-only peer"
                                      />
                                      <span className="px-2.5 py-1 rounded-l-md border border-[var(--color-border)] bg-[var(--color-background)] text-[10px] font-bold text-[var(--color-text-muted)] peer-checked:bg-[var(--color-accent-primary)]/20 peer-checked:border-[var(--color-accent-primary-hover)] peer-checked:text-[var(--color-accent-primary-light)] transition-colors">🔍 Энциклопедия SRD</span>
                                  </label>
                                  <label className="inline-flex items-center cursor-pointer select-none -ml-px">
                                      <input 
                                          type="radio" 
                                          name="spell-ai-mode" 
                                          value="homebrew" 
                                          checked={aiMode === 'homebrew'} 
                                          onChange={() => setAiMode('homebrew')} 
                                          className="sr-only peer"
                                      />
                                      <span className="px-2.5 py-1 rounded-r-md border border-[var(--color-border)] bg-[var(--color-background)] text-[10px] font-bold text-[var(--color-text-muted)] peer-checked:bg-[var(--color-accent-primary)]/20 peer-checked:border-[var(--color-accent-primary-hover)] peer-checked:text-[var(--color-accent-primary-light)] transition-colors">✨ Создание Хоумбрю</span>
                                  </label>
                              </div>
                              
                              {/* Gemini API Key input */}
                              <div className="grid grid-cols-1 gap-1.5">
                                  <label htmlFor="gemini-key" className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider text-left">Gemini API Ключ (сохраняется локально):</label>
                                  <input 
                                      type="password" 
                                      id="gemini-key"
                                      value={geminiKey}
                                      onChange={(e) => handleGeminiKeyChange(e.target.value)}
                                      placeholder="AIzaSy..." 
                                      className="w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
                                  />
                              </div>

                              {/* AI Description text area */}
                              <div className="grid grid-cols-1 gap-1.5">
                                  <label htmlFor="ai-desc" className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider text-left">
                                      {aiMode === 'official' ? 'Название или описание официального заклинания:' : 'Описание хоумбрю заклинания для генерации:'}
                                  </label>
                                  <textarea 
                                      id="ai-desc"
                                      rows={4}
                                      value={aiDescription}
                                      onChange={(e) => setAiDescription(e.target.value)}
                                      placeholder={aiMode === 'official' 
                                          ? "Введите точное русское или английское название (например: Огненный шар / Fireball)..." 
                                          : "Опишите ваше хоумбрю заклинание (например: Ледяное дыхание дракона, стреляет конусом холода, наносит 3d6 урона, замедляет)..."
                                      }
                                      className="w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1.5 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)] resize-none"
                                  />
                              </div>

                              <button
                                  type="button"
                                  onClick={handleAIImport}
                                  disabled={isAiGenerating || !aiDescription.trim()}
                                  className="w-full py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:from-purple-900 disabled:to-indigo-900 text-white text-xs font-bold rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-1 shadow-md active:scale-[0.98]"
                              >
                                  {isAiGenerating ? (
                                      <>
                                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                          </svg>
                                          {aiMode === 'official' ? 'Импорт из SRD...' : 'Генерация хоумбрю...'}
                                      </>
                                  ) : (aiMode === 'official' ? '🔍 Найти и импортировать из SRD' : '✨ Сгенерировать хоумбрю')}
                              </button>

                              {aiError && (
                                  <div className="text-xs text-red-400 bg-red-950/20 border border-red-900/30 p-2 rounded-lg leading-relaxed">
                                      {aiError}
                                  </div>
                              )}
                          </div>
                      )}
                  </div>
              )}
          </div>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-[var(--color-text-medium)]">Название</label>
            <input type="text" name="name" id="name" value={formData.name} onChange={handleInputChange} className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]" required />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="level" className="block text-sm font-medium text-[var(--color-text-medium)]">Уровень</label>
              <select name="level" id="level" value={formData.level} onChange={handleInputChange} className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]">
                <option value="0">Заговор</option>
                {[...Array(9)].map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label htmlFor="school" className="block text-sm font-medium text-[var(--color-text-medium)]">Школа магии</label>
              <select name="school" id="school" value={formData.school} onChange={handleInputChange} className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]">
                {Object.entries(MAGIC_SCHOOL_NAMES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center space-x-6 pt-2">
            <label className="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" name="requiresConcentration" checked={formData.requiresConcentration} onChange={handleInputChange} className="h-5 w-5 rounded border-[var(--color-border)] text-[var(--color-accent-primary)] focus:ring-[var(--color-accent-primary-hover)] bg-[var(--color-background)]" />
                <span className="text-sm font-medium text-[var(--color-text-medium)]">Концентрация</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" name="isRitual" checked={formData.isRitual} onChange={handleInputChange} className="h-5 w-5 rounded border-[var(--color-border)] text-[var(--color-accent-primary)] focus:ring-[var(--color-accent-primary-hover)] bg-[var(--color-background)]" />
                <span className="text-sm font-medium text-[var(--color-text-medium)]">Ритуал</span>
            </label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
                <label htmlFor="castingTime" className="block text-sm font-medium text-[var(--color-text-medium)]">Время накладывания</label>
                <input type="text" name="castingTime" id="castingTime" value={formData.castingTime} onChange={handleInputChange} className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]" />
            </div>
            <div>
                <label htmlFor="range" className="block text-sm font-medium text-[var(--color-text-medium)]">Дистанция</label>
                <input type="text" name="range" id="range" value={formData.range} onChange={handleInputChange} className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]" />
            </div>
            <div>
                <label htmlFor="duration" className="block text-sm font-medium text-[var(--color-text-medium)]">Длительность</label>
                <input type="text" name="duration" id="duration" value={formData.duration} onChange={handleInputChange} className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]" />
            </div>
          </div>
           <div>
              <label className="block text-sm font-medium text-[var(--color-text-medium)]">Компоненты</label>
              <div className="mt-2 flex flex-col sm:flex-row gap-4">
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" name="component-verbal" checked={formData.components.verbal} onChange={handleInputChange} className="h-5 w-5 rounded border-[var(--color-border)] text-[var(--color-accent-primary)] focus:ring-[var(--color-accent-primary-hover)] bg-[var(--color-background)]" />
                    <span>V</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" name="component-somatic" checked={formData.components.somatic} onChange={handleInputChange} className="h-5 w-5 rounded border-[var(--color-border)] text-[var(--color-accent-primary)] focus:ring-[var(--color-accent-primary-hover)] bg-[var(--color-background)]" />
                    <span>S</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" name="component-material" checked={formData.components.material} onChange={handleInputChange} className="h-5 w-5 rounded border-[var(--color-border)] text-[var(--color-accent-primary)] focus:ring-[var(--color-accent-primary-hover)] bg-[var(--color-background)]" />
                    <span>M</span>
                  </label>
                </div>
                {formData.components.material && (
                  <div className="flex-grow">
                    <input type="text" name="component-materialDescription" value={formData.components.materialDescription} onChange={handleInputChange} placeholder="Опишите материальные компоненты..." className="block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]" />
                  </div>
                )}
              </div>
            </div>
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-[var(--color-text-medium)]">Описание</label>
            <textarea name="description" id="description" value={formData.description} onChange={handleInputChange} rows={10} className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] resize-none" />
          </div>
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
                {formData.imageUrl ? <img src={formData.imageUrl} alt="Заклинание" className="w-full h-full object-cover" /> : 
                <svg className="w-12 h-12 text-[var(--color-text-subtle)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
              </div>
              <div className="flex flex-col gap-2">
                 <div className="flex flex-wrap gap-2">
                     <button type="button" onClick={() => setShowPicker(!showPicker)} className="rounded-lg border border-[var(--color-border-subtle)] shadow-sm px-3 py-2 bg-[var(--color-surface-raised)] text-sm font-medium text-[var(--color-text-medium)] hover:bg-[var(--color-surface-raised-hover)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-[var(--color-surface-opaque)] transition-all">
                        {showPicker ? 'Скрыть библиотеку' : 'Выбрать иконку...'}
                     </button>
                     <button 
                        type="button" 
                        onClick={() => {
                            setShowAiImagePrompt(!showAiImagePrompt);
                            if (!aiImagePrompt && formData.name) {
                                setAiImagePrompt(formData.name);
                            }
                        }} 
                        className="rounded-lg border border-[var(--color-border-subtle)] shadow-sm px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] transition-all flex items-center gap-1 active:scale-95"
                     >
                        🎨 Сгенерировать ИИ
                     </button>
                 </div>
                 {formData.imageUrl && <button type="button" onClick={handleRemoveImage} className="rounded-lg border border-transparent px-3 py-1 bg-transparent text-sm font-medium text-[var(--color-text-muted)] hover:text-red-400 focus:outline-none text-left w-fit">Убрать картинку</button>}
              </div>
            </div>
             {showAiImagePrompt && (
                 <div className="mt-3 p-3 bg-[var(--color-surface-well)] rounded-lg border border-[var(--color-border-subtle)] space-y-2">
                     <label htmlFor="ai-image-prompt-input" className="block text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Описание для генератора картинок (ИИ):</label>
                     <div className="flex gap-2">
                         <input 
                             type="text" 
                             id="ai-image-prompt-input"
                             value={aiImagePrompt}
                             onChange={(e) => setAiImagePrompt(e.target.value)}
                             placeholder="Например: Ледяная стрела, светящаяся синей энергией..." 
                             className="flex-grow bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1.5 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
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
                <div className="mt-4"><CustomIconPicker icons={customIcons} onSelect={handleSelectIcon} onUpload={handleUploadIcon} onDelete={onDeleteCustomIcon} /></div>
            )}
          </div>
        </div>
        <div className="mt-6 flex flex-col sm:flex-row-reverse gap-3">
          <button onClick={handleSave} className="w-full sm:w-auto justify-center rounded-lg border border-transparent shadow-md px-4 py-2 bg-[var(--color-accent-primary-active)] text-base font-medium text-white hover:bg-[var(--color-accent-primary-dark)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-[var(--color-surface-opaque)] transition-all">Сохранить</button>
          {spell && <button onClick={handleDelete} className="w-full sm:w-auto justify-center rounded-lg border border-[var(--color-border-subtle)] shadow-sm px-4 py-2 bg-[var(--color-surface-raised)] text-base font-medium text-[var(--color-text-medium)] hover:bg-[var(--color-surface-raised-hover)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-[var(--color-surface-opaque)] transition-all">Удалить</button>}
          <button onClick={onClose} className="w-full sm:w-auto justify-center rounded-lg border border-[var(--color-border-subtle)] shadow-sm px-4 py-2 bg-transparent text-base font-medium text-[var(--color-text-medium)] hover:bg-[var(--color-surface-raised)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] sm:mt-0 sm:mr-auto transition-all">Отмена</button>
        </div>
      </div>
    </div>
  );
};