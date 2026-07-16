import { getEquippedItemBonuses } from '../utils/inventory';
import React, { useState, useEffect } from 'react';
import { Rarity, Currency, type InventoryItem, RecoveryType, Ability, EquipSlot } from '../types';
import { CustomIconPicker } from './CustomIconPicker';
import { RARITY_NAMES, CURRENCY_NAMES, RECOVERY_TYPE_NAMES, ABILITY_NAMES, SKILLS } from '../constants';
import { useNotifier } from '../context/NotificationContext';
import { useFocusTrap } from '../utils/useFocusTrap';
import {
  translateText,
  mapRarity,
  mapCurrency,
  translateQueryToEnglish,
  expandSearchTerms,
  parseRobustJSON
} from '../utils/translation';
import { generateWithGemini, getGeminiApiKey, setGeminiApiKey } from '../utils/gemini';

import { Character } from '../types';

interface ItemDetailModalProps {
  character: Character;
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: InventoryItem | null) => void;
  onDelete: () => void;
  item: InventoryItem | null;
  customIcons: string[];
  onAddCustomIcon: (iconDataUrl: string) => void;
  onDeleteCustomIcon: (iconDataUrl: string) => void;
}

const DEFAULT_ITEM: Omit<InventoryItem, 'id'> = {
  name: '',
  description: '',
  quantity: 1,
  imageUrl: '',
  weight: 0,
  cost: { amount: 0, currency: Currency.GP },
  rarity: Rarity.Common,
  isChest: false,
  chestInventory: [],
  isConsumable: false,
  hasCharges: false,
  totalCharges: 0,
  currentCharges: 0,
  chargeRecovery: RecoveryType.LongRest,
  isEquipped: false,
  requiresAttunement: false,
  isAttuned: false,
  bonuses: {
    ac: 0,
    initiative: 0,
    abilityScores: {},
    skills: {},
    attackHit: 0,
    speed: 0,
    longJump: 0,
    highJump: 0,
    passivePerception: 0,
    passiveInvestigation: 0,
    passiveInsight: 0,
    savingThrows: {},
    spellSaveDC: 0,
    carryCapacity: 0,
    maxHp: 0,
    proficiencyBonus: 0,
    attunementMax: 0,
  }
};

const normalizeSavingThrows = (savingThrows: any): Partial<Record<Ability, number>> => {
  if (!savingThrows) return {};
  const normalized: Partial<Record<Ability, number>> = {};
  Object.entries(savingThrows).forEach(([key, val]) => {
    const uppercaseKey = key.toUpperCase() as Ability;
    if (Object.values(Ability).includes(uppercaseKey)) {
      normalized[uppercaseKey] = parseInt(val as any, 10) || 0;
    }
  });
  return normalized;
};

const normalizeAbilityScores = (abilityScores: any): Partial<Record<Ability, number>> => {
  if (!abilityScores) return {};
  const normalized: Partial<Record<Ability, number>> = {};
  Object.entries(abilityScores).forEach(([key, val]) => {
    const uppercaseKey = key.toUpperCase() as Ability;
    if (Object.values(Ability).includes(uppercaseKey)) {
      normalized[uppercaseKey] = parseInt(val as any, 10) || 0;
    }
  });
  return normalized;
};

export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({ 
    character,
    isOpen, 
    onClose, 
    onSave, 
    onDelete, 
    item,
    customIcons,
    onAddCustomIcon,
    onDeleteCustomIcon
}) => {
  const [formData, setFormData] = useState<Omit<InventoryItem, 'id'>>(() => {
    const base = item || DEFAULT_ITEM;
    return {
      ...DEFAULT_ITEM,
      ...base,
      bonuses: {
        ac: base.bonuses?.ac || 0,
        initiative: base.bonuses?.initiative || 0,
        abilityScores: normalizeAbilityScores(base.bonuses?.abilityScores),
        skills: base.bonuses?.skills || {},
        attackHit: base.bonuses?.attackHit || 0,
        speed: base.bonuses?.speed || 0,
        longJump: base.bonuses?.longJump || 0,
        highJump: base.bonuses?.highJump || 0,
        passivePerception: base.bonuses?.passivePerception || 0,
        passiveInvestigation: base.bonuses?.passiveInvestigation || 0,
        passiveInsight: base.bonuses?.passiveInsight || 0,
        spellSaveDC: base.bonuses?.spellSaveDC || 0,
        savingThrows: normalizeSavingThrows(base.bonuses?.savingThrows),
        carryCapacity: base.bonuses?.carryCapacity || 0,
        maxHp: base.bonuses?.maxHp || 0,
        proficiencyBonus: base.bonuses?.proficiencyBonus || 0,
        attunementMax: base.bonuses?.attunementMax || 0,
      }
    };
  });
  const [showPicker, setShowPicker] = useState(false);
  const { addNotification } = useNotifier();
  const modalRef = useFocusTrap<HTMLDivElement>(isOpen, onClose);

  // API Search States
  const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [ruleset, setRuleset] = useState<'2014' | '2024'>('2014');
  const [translateEnabled, setTranslateEnabled] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [customAlertMessage, setCustomAlertMessage] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<{ index: string; name: string; url: string; type: 'equipment' | 'magic-item' }[]>([]);
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
      const base = item || DEFAULT_ITEM;
      setFormData({
        ...DEFAULT_ITEM,
        ...base,
        bonuses: {
          ac: base.bonuses?.ac || 0,
          initiative: base.bonuses?.initiative || 0,
          abilityScores: normalizeAbilityScores(base.bonuses?.abilityScores),
        skills: base.bonuses?.skills || {},
        attackHit: base.bonuses?.attackHit || 0,
        speed: base.bonuses?.speed || 0,
        longJump: base.bonuses?.longJump || 0,
        highJump: base.bonuses?.highJump || 0,
        passivePerception: base.bonuses?.passivePerception || 0,
        passiveInvestigation: base.bonuses?.passiveInvestigation || 0,
        passiveInsight: base.bonuses?.passiveInsight || 0,
        spellSaveDC: base.bonuses?.spellSaveDC || 0,
        savingThrows: normalizeSavingThrows(base.bonuses?.savingThrows),
          carryCapacity: base.bonuses?.carryCapacity || 0,
        maxHp: base.bonuses?.maxHp || 0,
        proficiencyBonus: base.bonuses?.proficiencyBonus || 0,
        attunementMax: base.bonuses?.attunementMax || 0,
        }
      });
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
  }, [item, isOpen]);

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
You are a D&D 5e assistant. Based on the mode "${isOfficial ? 'official' : 'homebrew'}", generate details for an inventory item and return a JSON object conforming strictly to the following JSON schema:
{
  "type": "object",
  "properties": {
    "error": { "type": "string", "description": "Fill this ONLY in 'official' mode if you cannot find any official D&D 5e SRD / Player's Handbook item matching the query name/description." },
    "name": { "type": "string" },
    "quantity": { "type": "integer", "minimum": 1 },
    "weight": { "type": "number" },
    "cost": {
      "type": "object",
      "properties": {
        "amount": { "type": "integer" },
        "currency": { "type": "string", "enum": ["CP", "SP", "EP", "GP", "PP"] }
      },
      "required": ["amount", "currency"]
    },
    "rarity": { "type": "integer", "minimum": 0, "maximum": 5 },
    "description": { "type": "string" },
    "isEquipped": { "type": "boolean" },
    "hasCharges": { "type": "boolean" },
    "totalCharges": { "type": "integer" },
    "currentCharges": { "type": "integer" },
    "chargeRecovery": { "type": "string" },
    "bonuses": {
      "type": "object",
      "properties": {
        "ac": { "type": "integer" },
        "initiative": { "type": "integer" },
        "speed": { "type": "integer" },
        "longJump": { "type": "integer" },
        "highJump": { "type": "integer" },
        "passivePerception": { "type": "integer" },
        "passiveInvestigation": { "type": "integer" },
        "passiveInsight": { "type": "integer" },
        "spellSaveDC": { "type": "integer" },
        "carryCapacity": { "type": "integer" },
        "maxHp": { "type": "integer" },
        "proficiencyBonus": { "type": "integer" },
        "savingThrows": {
          "type": "object",
          "properties": {
            "STR": { "type": "integer" },
            "DEX": { "type": "integer" },
            "CON": { "type": "integer" },
            "INT": { "type": "integer" },
            "WIS": { "type": "integer" },
            "CHA": { "type": "integer" }
          }
        }
      },
      "required": ["ac", "initiative", "speed", "longJump", "highJump", "passivePerception", "passiveInvestigation", "passiveInsight"]
    }
  },
  "required": ["name", "quantity", "weight", "cost", "rarity", "description", "isEquipped", "hasCharges", "totalCharges", "currentCharges", "chargeRecovery", "bonuses"]
}

Important Instructions:
${isOfficial ? `
- You must act as a strict D&D 5e rules encyclopedia.
- Find the official D&D 5e SRD / ruleset item matching: "${aiDescription}".
- Do NOT invent or make up characteristics. Fill in the exact official statistics (weight, cost, rarity, description, properties, etc.).
- If no official item exists under this name or similar, fill the "error" field with a helpful message in Russian explaining that the item is not part of the official rules, and leave other fields empty or dummy.
` : `
- You must act as a creative D&D 5e homebrew generator.
- Create a new custom homebrew item based on the user's ideas: "${aiDescription}".
- Do NOT output any "error". Invent balanced, fun, and thematic statistics.
`}
- Translate the output name, description, and chargeRecovery to Russian.
- Map D&D rarity to an integer: 0 = Common (Обычный), 1 = Uncommon (Необычный), 2 = Rare (Редкий), 3 = Very Rare (Очень редкий), 4 = Legendary (Легендарный), 5 = Artifact (Артефакт).
- Extract any armor class (AC), initiative, speed, jump, passive senses, spell save DC, carrying capacity, max health (maxHp), proficiency bonus (proficiencyBonus), or saving throw bonuses (for STR, DEX, CON, INT, WIS, CHA) to the bonuses object. If none are specified, set them to 0.
- Do NOT use double quotes (") inside JSON string values. If you need quotation marks in description or name, use single quotes (') or Russian angle quotes (« »).
- Do NOT write raw line breaks in JSON strings; use escaped \\n instead.
- Clean up formatting.
`;

        // Используем единый сервис: ключ всегда в заголовке, не в URL (баг #5).
        let jsonText: string;
        try {
            // Сначала пробуем с grounding (Google Search)
            jsonText = await generateWithGemini('gemini-2.0-flash', prompt, {
                responseMimeType: 'application/json',
                tools: [{ googleSearch: {} }],
            });
        } catch (groundingErr) {
            // Если grounding не удался (429, 400 и т.д.) — fallback без него
            console.warn(`Gemini API call with Google Search failed (${(groundingErr as Error).message}). Retrying without search grounding...`);
            jsonText = await generateWithGemini('gemini-2.0-flash', prompt, {
                responseMimeType: 'application/json',
            });
        }

        const parsedItem = parseRobustJSON(jsonText);
        
        if (parsedItem.error) {
            setAiError(parsedItem.error);
            return;
        }
        
        const base = item || DEFAULT_ITEM;
        setFormData({
            ...DEFAULT_ITEM,
            name: parsedItem.name || 'Новый предмет',
            quantity: parsedItem.quantity || 1,
            weight: parsedItem.weight || 0,
            cost: {
                amount: parsedItem.cost?.amount || 0,
                currency: parsedItem.cost?.currency || 'GP'
            },
            rarity: parsedItem.rarity !== undefined ? parsedItem.rarity : 0,
            description: parsedItem.description || '',
            isEquipped: !!parsedItem.isEquipped,
            hasCharges: !!parsedItem.hasCharges,
            totalCharges: parsedItem.totalCharges || 0,
            currentCharges: parsedItem.currentCharges || 0,
            chargeRecovery: parsedItem.chargeRecovery || '',
            imageUrl: base.imageUrl || '',
            bonuses: {
                ac: parsedItem.bonuses?.ac || 0,
                initiative: parsedItem.bonuses?.initiative || 0,
                speed: parsedItem.bonuses?.speed || 0,
                longJump: parsedItem.bonuses?.longJump || 0,
                highJump: parsedItem.bonuses?.highJump || 0,
                passivePerception: parsedItem.bonuses?.passivePerception || 0,
                passiveInvestigation: parsedItem.bonuses?.passiveInvestigation || 0,
                passiveInsight: parsedItem.bonuses?.passiveInsight || 0,
                spellSaveDC: parsedItem.bonuses?.spellSaveDC || 0,
                savingThrows: normalizeSavingThrows(parsedItem.bonuses?.savingThrows),
                carryCapacity: parsedItem.bonuses?.carryCapacity || 0,
                maxHp: parsedItem.bonuses?.maxHp || 0,
                proficiencyBonus: parsedItem.bonuses?.proficiencyBonus || 0,
                attunementMax: parsedItem.bonuses?.attunementMax || 0,
                abilityScores: base.bonuses?.abilityScores || {},
                skills: base.bonuses?.skills || {},
                attackHit: base.bonuses?.attackHit || 0
            }
        });
        
        setIsSearchPanelOpen(false);
        addNotification(isOfficial ? `Предмет "${parsedItem.name}" успешно импортирован!` : `Предмет "${parsedItem.name}" успешно сгенерирован ИИ!`, 'info');
    } catch (err: any) {
        console.error(err);
        setAiError(`Не удалось сгенерировать предмет: ${err.message || 'ошибка сети или неверный API-ключ'}`);
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

        const finalPrompt = `D&D high fantasy game icon style, detailed item illustration, ${englishPrompt}, digital art, highly detailed, clean background, studio lighting, realistic reflections, natural textures`;
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
        console.error(err);
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
                console.error("Translation failed, keeping original English name/description.", transErr);
            }
        }
        
        setFormData(prev => ({
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
        
        setIsSearchPanelOpen(false);
        addNotification(`Предмет "${translatedName}" успешно импортирован!`, 'info');
    } catch (err) {
        console.error(err);
        setSearchError('Не удалось загрузить детальную информацию о предмете.');
    } finally {
        setIsSearching(false);
    }
  };

  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
        const { checked } = e.target as HTMLInputElement;
        if (name === 'isChest' && !checked && item?.isChest && item.chestInventory?.some(i => i !== null)) {
            addNotification("Сначала опустошите сундук, чтобы превратить его в обычный предмет.", 'error');
            return;
        }
        if (name === 'hasCharges') {
            setFormData(prev => ({
                ...prev,
                hasCharges: checked,
                totalCharges: checked ? (prev.totalCharges || 1) : 0,
                currentCharges: checked ? (prev.totalCharges || 1) : 0,
            }));
        } else {
            setFormData(prev => ({ ...prev, [name]: checked }));
        }
    } else {
        const parsedValue = ['quantity', 'weight', 'totalCharges', 'currentCharges'].includes(name) ? parseInt(value, 10) || 0 : value;
        
        if (name === 'totalCharges') {
             setFormData(prev => ({ 
                ...prev, 
                totalCharges: parsedValue as number,
                currentCharges: Math.min(parsedValue as number, prev.currentCharges || 0)
            }));
        } else {
            setFormData(prev => ({ ...prev, [name]: parsedValue }));
        }
    }
  };

  const handleCostChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
        ...prev,
        cost: {
            ...prev.cost,
            [name]: name === 'amount' ? parseFloat(value) || 0 : value,
        }
    }));
  };

  const handleRemoveImage = () => {
    setFormData(prev => ({ ...prev, imageUrl: '' }));
  };


  const handleSave = () => {
    if (!formData.name) {
        addNotification("Название предмета не может быть пустым.", 'error');
        return;
    }
    const finalItem: InventoryItem = {
        id: item?.id || '',
        ...formData
    };

    if (finalItem.isChest && (!finalItem.chestInventory || finalItem.chestInventory.length === 0)) {
        finalItem.chestInventory = Array(50).fill(null);
    } else if (!finalItem.isChest) {
        delete finalItem.chestInventory;
    }

    if (!finalItem.hasCharges) {
        delete finalItem.totalCharges;
        delete finalItem.currentCharges;
        delete finalItem.chargeRecovery;
    }


    onSave(finalItem);
  };
  
  const handleDeleteItem = () => {
      if (item?.isChest && item.chestInventory?.some(i => i !== null)) {
        addNotification("Нельзя удалить сундук, в котором есть предметы.", 'error');
        return;
      }
      onDelete();
  };
  
  const handleSelectIcon = (iconUrl: string) => {
    setFormData(prev => ({ ...prev, imageUrl: iconUrl }));
    setShowPicker(false);
  };

  const handleUploadIcon = (iconUrl: string) => {
    onAddCustomIcon(iconUrl);
    setFormData(prev => ({ ...prev, imageUrl: iconUrl }));
    setShowPicker(false);
  };

  const handleDeleteIconFromLibrary = (iconUrl: string) => {
    onDeleteCustomIcon(iconUrl);
    if (formData.imageUrl === iconUrl) {
      setFormData(prev => ({ ...prev, imageUrl: '' }));
    }
  };


  return (
    <div 
      className="fixed inset-0 bg-[var(--color-surface-translucent)] backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-modal-title"
    >
      <div 
        ref={modalRef}
        className="bg-[var(--color-surface-opaque)] rounded-xl shadow-2xl p-6 m-4 w-full max-w-4xl border border-[var(--color-border)] animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="item-modal-title" className="text-2xl font-bold text-[var(--color-accent-primary)] mb-4">{item ? 'Редактировать предмет' : 'Новый предмет'}</h2>
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-2">
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
                      ) : (
                          <div className="space-y-3">
                              <div className="text-[10px] text-[var(--color-text-subtle)] leading-relaxed">
                                  Опишите предмет своими словами на любом языке.
                              </div>
                              
                              {/* AI Mode Selector */}
                              <div className="flex items-center gap-2 text-xs">
                                  <span className="text-[var(--color-text-muted)] font-medium">Режим работы:</span>
                                  <label className="inline-flex items-center cursor-pointer select-none">
                                      <input 
                                          type="radio" 
                                          name="item-ai-mode" 
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
                                          name="item-ai-mode" 
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
                                  <label htmlFor="item-gemini-key" className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider text-left">Gemini API Ключ (сохраняется локально):</label>
                                  <input 
                                      type="password" 
                                      id="item-gemini-key"
                                      value={geminiKey}
                                      onChange={(e) => handleGeminiKeyChange(e.target.value)}
                                      placeholder="AIzaSy..." 
                                      className="w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
                                  />
                              </div>

                              {/* AI Description text area */}
                              <div className="grid grid-cols-1 gap-1.5">
                                  <label htmlFor="item-ai-desc" className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider text-left">
                                      {aiMode === 'official' ? 'Название или описание официального предмета:' : 'Описание хоумбрю предмета для генерации:'}
                                  </label>
                                  <textarea 
                                      id="item-ai-desc"
                                      rows={4}
                                      value={aiDescription}
                                      onChange={(e) => setAiDescription(e.target.value)}
                                      placeholder={aiMode === 'official' 
                                          ? "Введите точное русское или английское название (например: Меч ран / Sword of Wounding)..." 
                                          : "Опишите ваше хоумбрю снаряжение (например: Сапоги скорости, весят 1 фунт, дают +2 к инициативе, удваивают скорость)..."
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
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
                <label htmlFor="name" className="block text-sm font-medium text-[var(--color-text-medium)]">Название</label>
                <input
                    type="text"
                    name="name"
                    id="name"
                    value={formData.name}
                    onChange={handleInputChange}
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
                    value={formData.quantity}
                    onChange={handleInputChange}
                    className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]"
                    min="1"
                    disabled={formData.isChest}
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
                    value={formData.weight}
                    onChange={handleInputChange}
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
                        value={formData.cost.amount}
                        onChange={handleCostChange}
                        className="block w-full flex-1 rounded-none rounded-l-lg bg-[var(--color-background)] border border-[var(--color-border-subtle)] py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] z-10"
                        min="0"
                    />
                    <select
                        name="currency"
                        value={formData.cost.currency}
                        onChange={handleCostChange}
                        className="block w-auto rounded-none rounded-r-lg bg-[var(--color-background)] border border-l-0 border-[var(--color-border-subtle)] py-2 pl-3 pr-8 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]"
                    >
                        {Object.entries(CURRENCY_NAMES).map(([key, name]) => (
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
                value={formData.rarity}
                onChange={(e) => setFormData(prev => ({...prev, rarity: parseInt(e.target.value) as Rarity}))}
                className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]"
            >
                {Object.entries(RARITY_NAMES).map(([key, name]) => (
                    <option key={key} value={key}>{name}</option>
                ))}
            </select>
          </div>
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-[var(--color-text-medium)]">Описание</label>
            <textarea
              name="description"
              id="description"
              value={formData.description}
              onChange={handleInputChange}
              rows={10}
              className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] resize-none"
            />
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
                {formData.imageUrl ? (
                  <img src={formData.imageUrl} alt="Предмет" className="w-full h-full object-cover" />
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
                        className="rounded-lg border border-[var(--color-border-subtle)] shadow-sm px-3 py-2 bg-[var(--color-surface-raised)] text-sm font-medium text-[var(--color-text-medium)] hover:bg-[var(--color-surface-raised-hover)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-[var(--color-surface-opaque)] transition-all duration-150 active:scale-95"
                     >
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
                 {formData.imageUrl && (
                    <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="rounded-lg border border-transparent px-3 py-2 bg-transparent text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-health)] focus:outline-none"
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

             {/* Equipped and active bonuses section */}
             <div className="border-t border-[var(--color-border-subtle)] pt-4 space-y-3">
                 <div className="flex flex-col sm:flex-row sm:items-center sm:gap-6 gap-3">
                     <label className="flex items-center space-x-3 cursor-pointer select-none">
                         <input
                             type="checkbox"
                             name="isEquipped"
                             checked={!!formData.isEquipped}
                             onChange={(e) => {
                                 const willEquip = e.target.checked;
                                 if (willEquip && formData.requiresAttunement && !formData.isAttuned) {
                                     setCustomAlertMessage('Нельзя экипировать этот предмет, пока вы не настроитесь на него!');
                                     return;
                                 }
                                 setFormData(prev => ({ 
                                     ...prev, 
                                     isEquipped: willEquip
                                 }));
                             }}
                             className="h-5 w-5 rounded border-[var(--color-border)] text-teal-500 focus:ring-teal-400 bg-[var(--color-background)]"
                         />
                         <span className="text-sm font-semibold text-[var(--color-text-medium)]">Экипирован</span>
                     </label>

                     <label className="flex items-center space-x-3 cursor-pointer select-none">
                         <input
                             type="checkbox"
                             name="requiresAttunement"
                             checked={!!formData.requiresAttunement}
                             onChange={(e) => {
                                 const req = e.target.checked;
                                 setFormData(prev => {
                                     const nextAttuned = req ? prev.isAttuned : false;
                                     const nextEquipped = (req && !nextAttuned) ? false : prev.isEquipped;
                                     return {
                                         ...prev,
                                         requiresAttunement: req,
                                         isAttuned: nextAttuned,
                                         isEquipped: nextEquipped
                                     };
                                 });
                             }}
                             className="h-5 w-5 rounded border-[var(--color-border)] text-teal-500 focus:ring-teal-400 bg-[var(--color-background)]"
                         />
                         <span className="text-sm font-semibold text-[var(--color-text-medium)]">Требует настройки</span>
                     </label>
                     {formData.requiresAttunement && (
                         <label className="flex items-center space-x-3 cursor-pointer select-none">
                             <input
                                 type="checkbox"
                                 name="isAttuned"
                                 checked={!!formData.isAttuned}
                                 onChange={(e) => {
                                     const willAttune = e.target.checked;
                                     if (willAttune) {
                                         const currentAttunedCount = (character.inventory || []).filter(i => i && i.isAttuned && i.id !== item?.id).length;
                                         const activeItemBonuses = getEquippedItemBonuses(character);
                                         const maxAttuned = 3 + (character.attunementMaxBonus || 0) + (activeItemBonuses.attunementMax || 0);
                                         if (currentAttunedCount >= maxAttuned) {
                                             setCustomAlertMessage(`Нельзя настроиться на этот предмет: достигнут лимит в ${maxAttuned} предметов!`);
                                             return;
                                         }
                                     }
                                     setFormData(prev => ({ 
                                         ...prev, 
                                         isAttuned: willAttune, 
                                         attunementTimestamp: willAttune ? Date.now() : undefined,
                                         isEquipped: willAttune ? prev.isEquipped : false
                                     }));
                                 }}
                                 className="h-5 w-5 rounded border-[var(--color-border)] text-teal-500 focus:ring-teal-400 bg-[var(--color-background)]"
                             />
                             <span className="text-sm font-semibold text-[var(--color-text-medium)]">Настроен</span>
                         </label>
                     )}
                 </div>
                 
                 <div className="bg-[var(--color-surface-well)] p-3 rounded-lg border border-[var(--color-border)] space-y-3">
                     <div className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Характеристики экипировки</div>
                     
                     <div className="grid grid-cols-3 gap-3">
                         <div>
                             <label htmlFor="bonus-ac" className="block text-xs text-[var(--color-text-medium)]">Бонус к КД</label>
                             <input 
                                 type="number" 
                                 id="bonus-ac"
                                 value={formData.bonuses?.ac || 0}
                                 onChange={(e) => {
                                     const val = parseInt(e.target.value, 10) || 0;
                                     setFormData(prev => ({
                                         ...prev,
                                         bonuses: { ...prev.bonuses, ac: val }
                                     }));
                                 }}
                                 className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
                             />
                         </div>
                         <div>
                             <label htmlFor="bonus-initiative" className="block text-xs text-[var(--color-text-medium)]">Инициатива</label>
                             <input 
                                 type="number" 
                                 id="bonus-initiative"
                                 value={formData.bonuses?.initiative || 0}
                                 onChange={(e) => {
                                     const val = parseInt(e.target.value, 10) || 0;
                                     setFormData(prev => ({
                                         ...prev,
                                         bonuses: { ...prev.bonuses, initiative: val }
                                     }));
                                 }}
                                 className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
                             />
                         </div>
                         <div>
                             <label htmlFor="bonus-attackHit" className="block text-xs text-[var(--color-text-medium)]">Попадание</label>
                             <input 
                                 type="number" 
                                 id="bonus-attackHit"
                                 value={formData.bonuses?.attackHit || 0}
                                 onChange={(e) => {
                                     const val = parseInt(e.target.value, 10) || 0;
                                     setFormData(prev => ({
                                         ...prev,
                                         bonuses: { ...prev.bonuses, attackHit: val }
                                     }));
                                 }}
                                 className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
                             />
                         </div>
                     </div>

                      <div className="grid grid-cols-3 gap-3">
                          <div>
                              <label htmlFor="bonus-spellSaveDC" className="block text-xs text-[var(--color-text-medium)]">Сл. спас. закл.</label>
                              <input 
                                  type="number" 
                                  id="bonus-spellSaveDC"
                                  value={formData.bonuses?.spellSaveDC || 0}
                                  onChange={(e) => {
                                      const val = parseInt(e.target.value, 10) || 0;
                                      setFormData(prev => ({
                                          ...prev,
                                          bonuses: { ...prev.bonuses, spellSaveDC: val }
                                      }));
                                  }}
                                  className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
                              />
                          </div>
                          <div>
                              <label htmlFor="bonus-carryCapacity" className="block text-xs text-[var(--color-text-medium)]">Грузоподъемность (фнт.)</label>
                              <input 
                                  type="number" 
                                  id="bonus-carryCapacity"
                                  value={formData.bonuses?.carryCapacity || 0}
                                  onChange={(e) => {
                                      const val = parseInt(e.target.value, 10) || 0;
                                      setFormData(prev => ({
                                          ...prev,
                                          bonuses: { ...prev.bonuses, carryCapacity: val }
                                      }));
                                  }}
                                  className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
                              />
                          </div>
                          <div>
                              <label htmlFor="bonus-maxHp" className="block text-xs text-[var(--color-text-medium)]">Бонус к макс. ОЗ</label>
                              <input 
                                  type="number" 
                                  id="bonus-maxHp"
                                  value={formData.bonuses?.maxHp || 0}
                                  onChange={(e) => {
                                      const val = parseInt(e.target.value, 10) || 0;
                                      setFormData(prev => ({
                                          ...prev,
                                          bonuses: { ...prev.bonuses, maxHp: val }
                                      }));
                                  }}
                                  className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
                              />
                          </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                          <div>
                              <label htmlFor="bonus-proficiencyBonus" className="block text-xs text-[var(--color-text-medium)]">Бонус мастерства</label>
                              <input 
                                  type="number" 
                                  id="bonus-proficiencyBonus"
                                  value={formData.bonuses?.proficiencyBonus || 0}
                                  onChange={(e) => {
                                      const val = parseInt(e.target.value, 10) || 0;
                                      setFormData(prev => ({
                                          ...prev,
                                          bonuses: { ...prev.bonuses, proficiencyBonus: val }
                                      }));
                                  }}
                                  className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
                              />
                          </div>
                          <div>
                              <label htmlFor="bonus-attunementMax" className="block text-xs text-[var(--color-text-medium)]">Макс. настроек</label>
                              <input 
                                  type="number" 
                                  id="bonus-attunementMax"
                                  value={formData.bonuses?.attunementMax || 0}
                                  onChange={(e) => {
                                      const val = parseInt(e.target.value, 10) || 0;
                                      setFormData(prev => ({
                                          ...prev,
                                          bonuses: { ...prev.bonuses, attunementMax: val }
                                      }));
                                  }}
                                  className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
                              />
                          </div>
                      </div>

                     <div className="grid grid-cols-3 gap-3">
                         <div>
                             <label htmlFor="bonus-speed" className="block text-xs text-[var(--color-text-medium)]">Скорость</label>
                             <input 
                                 type="number" 
                                 id="bonus-speed"
                                 value={formData.bonuses?.speed || 0}
                                 onChange={(e) => {
                                     const val = parseInt(e.target.value, 10) || 0;
                                     setFormData(prev => ({
                                         ...prev,
                                         bonuses: { ...prev.bonuses, speed: val }
                                     }));
                                 }}
                                 className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
                             />
                         </div>
                         <div>
                             <label htmlFor="bonus-longJump" className="block text-xs text-[var(--color-text-medium)]">Прыжок (длина)</label>
                             <input 
                                 type="number" 
                                 id="bonus-longJump"
                                 value={formData.bonuses?.longJump || 0}
                                 onChange={(e) => {
                                     const val = parseInt(e.target.value, 10) || 0;
                                     setFormData(prev => ({
                                         ...prev,
                                         bonuses: { ...prev.bonuses, longJump: val }
                                     }));
                                 }}
                                 className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
                             />
                         </div>
                         <div>
                             <label htmlFor="bonus-highJump" className="block text-xs text-[var(--color-text-medium)]">Прыжок (высота)</label>
                             <input 
                                 type="number" 
                                 id="bonus-highJump"
                                 value={formData.bonuses?.highJump || 0}
                                 onChange={(e) => {
                                     const val = parseInt(e.target.value, 10) || 0;
                                     setFormData(prev => ({
                                         ...prev,
                                         bonuses: { ...prev.bonuses, highJump: val }
                                     }));
                                 }}
                                 className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
                             />
                         </div>
                     </div>

                     <div className="grid grid-cols-3 gap-3">
                         <div>
                             <label htmlFor="bonus-passivePerception" className="block text-xs text-[var(--color-text-medium)]">Пасс. Восприятие</label>
                             <input 
                                 type="number" 
                                 id="bonus-passivePerception"
                                 value={formData.bonuses?.passivePerception || 0}
                                 onChange={(e) => {
                                     const val = parseInt(e.target.value, 10) || 0;
                                     setFormData(prev => ({
                                         ...prev,
                                         bonuses: { ...prev.bonuses, passivePerception: val }
                                     }));
                                 }}
                                 className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
                             />
                         </div>
                         <div>
                             <label htmlFor="bonus-passiveInvestigation" className="block text-xs text-[var(--color-text-medium)]">Пасс. Анализ</label>
                             <input 
                                 type="number" 
                                 id="bonus-passiveInvestigation"
                                 value={formData.bonuses?.passiveInvestigation || 0}
                                 onChange={(e) => {
                                     const val = parseInt(e.target.value, 10) || 0;
                                     setFormData(prev => ({
                                         ...prev,
                                         bonuses: { ...prev.bonuses, passiveInvestigation: val }
                                     }));
                                 }}
                                 className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
                             />
                         </div>
                         <div>
                             <label htmlFor="bonus-passiveInsight" className="block text-xs text-[var(--color-text-medium)]">Пасс. Проницательность</label>
                             <input 
                                 type="number" 
                                 id="bonus-passiveInsight"
                                 value={formData.bonuses?.passiveInsight || 0}
                                 onChange={(e) => {
                                     const val = parseInt(e.target.value, 10) || 0;
                                     setFormData(prev => ({
                                         ...prev,
                                         bonuses: { ...prev.bonuses, passiveInsight: val }
                                     }));
                                 }}
                                 className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]"
                             />
                         </div>
                     </div>

                     <div className="space-y-1">
                         <label className="block text-xs text-[var(--color-text-medium)]">Бонусы характеристик</label>
                         <div className="grid grid-cols-3 gap-2">
                             {(Object.keys(ABILITY_NAMES) as Ability[]).map(ability => (
                                 <div key={ability} className="flex items-center gap-1.5 bg-[var(--color-surface-inset)] px-2 py-1 rounded border border-[var(--color-border-subtle)]">
                                     <span className="text-[10px] font-bold text-[var(--color-text-muted)] w-8 uppercase">{ability}</span>
                                     <input 
                                         type="number"
                                         value={formData.bonuses?.abilityScores?.[ability] || 0}
                                         onChange={(e) => {
                                             const val = parseInt(e.target.value, 10) || 0;
                                             setFormData(prev => ({
                                                 ...prev,
                                                 bonuses: {
                                                     ...prev.bonuses,
                                                     abilityScores: {
                                                         ...prev.bonuses?.abilityScores,
                                                         [ability]: val
                                                     }
                                                 }
                                             }));
                                         }}
                                         className="w-full text-right bg-transparent text-sm font-bold focus:outline-none p-0 border-none text-[var(--color-text-base)]"
                                         placeholder="0"
                                     />
                                 </div>
                             ))}
                         </div>
                     </div>

                      <div className="space-y-1">
                          <label className="block text-xs text-[var(--color-text-medium)]">Бонусы спасбросков</label>
                          <div className="grid grid-cols-3 gap-2">
                              {(Object.keys(ABILITY_NAMES) as Ability[]).map(ability => (
                                  <div key={ability} className="flex items-center gap-1.5 bg-[var(--color-surface-inset)] px-2 py-1 rounded border border-[var(--color-border-subtle)]">
                                      <span className="text-[10px] font-bold text-[var(--color-text-muted)] w-8 uppercase">{ability}</span>
                                      <input 
                                          type="number"
                                          value={formData.bonuses?.savingThrows?.[ability] || 0}
                                          onChange={(e) => {
                                              const val = parseInt(e.target.value, 10) || 0;
                                              setFormData(prev => ({
                                                  ...prev,
                                                  bonuses: {
                                                      ...prev.bonuses,
                                                      savingThrows: {
                                                          ...prev.bonuses?.savingThrows,
                                                          [ability]: val
                                                      }
                                                  }
                                              }));
                                          }}
                                          className="w-full text-right bg-transparent text-sm font-bold focus:outline-none p-0 border-none text-[var(--color-text-base)]"
                                          placeholder="0"
                                      />
                                  </div>
                              ))}
                          </div>
                      </div>

                     <div className="space-y-2">
                         <div className="flex items-center justify-between gap-2">
                             <label className="block text-xs text-[var(--color-text-medium)]">Бонусы навыков</label>
                             <select
                                 onChange={(e) => {
                                     const skillName = e.target.value;
                                     if (!skillName) return;
                                     setFormData(prev => {
                                         const currentSkills = { ...prev.bonuses?.skills };
                                         if (!(skillName in currentSkills)) {
                                             currentSkills[skillName] = 1;
                                         }
                                         return {
                                             ...prev,
                                             bonuses: {
                                                 ...prev.bonuses,
                                                 skills: currentSkills
                                             }
                                         };
                                     });
                                     e.target.value = "";
                                 }}
                                 className="text-xs bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded py-0.5 px-2 focus:outline-none text-[var(--color-text-base)]"
                             >
                                 <option value="">+ Добавить навык...</option>
                                 {Object.keys(SKILLS)
                                     .filter(s => !formData.bonuses?.skills?.[s])
                                     .map(skillName => (
                                         <option key={skillName} value={skillName}>{skillName}</option>
                                     ))
                                 }
                             </select>
                         </div>

                         {Object.keys(formData.bonuses?.skills || {}).length === 0 ? (
                             <div className="text-[10px] text-[var(--color-text-muted)] italic text-center py-1">Нет добавленных бонусов к навыкам</div>
                         ) : (
                             <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
                                 {Object.entries(formData.bonuses?.skills || {}).map(([skillName, bonusVal]) => (
                                     <div key={skillName} className="flex items-center justify-between bg-[var(--color-surface-inset)] px-2.5 py-1 rounded border border-[var(--color-border-subtle)] text-xs">
                                         <span className="font-medium text-[var(--color-text-base)]">{skillName}</span>
                                         <div className="flex items-center gap-2">
                                             <input 
                                                 type="number"
                                                 value={bonusVal}
                                                 onChange={(e) => {
                                                     const val = parseInt(e.target.value, 10) || 0;
                                                     setFormData(prev => ({
                                                         ...prev,
                                                         bonuses: {
                                                             ...prev.bonuses,
                                                             skills: {
                                                                 ...prev.bonuses?.skills,
                                                                 [skillName]: val
                                                             }
                                                         }
                                                     }));
                                                 }}
                                                 className="w-12 text-center bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded py-0.5 px-1 font-bold text-xs text-[var(--color-text-base)]"
                                             />
                                             <button
                                                 type="button"
                                                 onClick={() => {
                                                     setFormData(prev => {
                                                         const copy = { ...prev.bonuses?.skills };
                                                         delete copy[skillName];
                                                         return {
                                                             ...prev,
                                                             bonuses: {
                                                                 ...prev.bonuses,
                                                                 skills: copy
                                                             }
                                                         };
                                                     });
                                                 }}
                                                 className="text-[var(--color-text-muted)] hover:text-red-400 font-bold text-sm px-1"
                                                 data-tooltip="Удалить"
                                             >
                                                 &times;
                                             </button>
                                         </div>
                                     </div>
                                 ))}
                             </div>
                         )}
                      </div>
                  </div>
              </div>
            <div className="border-t border-[var(--color-border-subtle)] pt-4">
                <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                        type="checkbox"
                        name="hasCharges"
                        checked={!!formData.hasCharges}
                        onChange={handleInputChange}
                        className="h-5 w-5 rounded border-[var(--color-border)] text-[var(--color-accent-primary)] focus:ring-[var(--color-accent-primary-hover)] bg-[var(--color-background)]"
                    />
                    <span className="text-sm font-medium text-[var(--color-text-medium)]">Имеет заряды</span>
                </label>
           </div>
           {formData.hasCharges && (
            <div className="p-3 bg-[var(--color-surface-well)] rounded-lg space-y-3 border border-[var(--color-border)]">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="currentCharges" className="block text-xs font-medium text-[var(--color-text-medium)]">Текущие заряды</label>
                        <input type="number" name="currentCharges" id="currentCharges" value={formData.currentCharges} onChange={handleInputChange} min="0" max={formData.totalCharges} className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]" />
                    </div>
                     <div>
                        <label htmlFor="totalCharges" className="block text-xs font-medium text-[var(--color-text-medium)]">Максимум зарядов</label>
                        <input type="number" name="totalCharges" id="totalCharges" value={formData.totalCharges} onChange={handleInputChange} min="0" className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]" />
                    </div>
                </div>
                 <div>
                    <label htmlFor="chargeRecovery" className="block text-sm font-medium text-[var(--color-text-medium)]">Восстановление зарядов</label>
                    <select name="chargeRecovery" id="chargeRecovery" value={formData.chargeRecovery} onChange={(e) => setFormData(prev => ({...prev, chargeRecovery: parseInt(e.target.value) as RecoveryType}))} className="mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)]">
                        {Object.entries(RECOVERY_TYPE_NAMES).map(([key, name]) => (
                            <option key={key} value={key}>{name}</option>
                        ))}
                    </select>
                </div>
            </div>
           )}
           <div className="border-t border-[var(--color-border-subtle)] pt-4">
                <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                        type="checkbox"
                        name="isChest"
                        checked={!!formData.isChest}
                        onChange={handleInputChange}
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
                        checked={!!formData.isConsumable}
                        onChange={handleInputChange}
                        className="h-5 w-5 rounded border-[var(--color-border)] text-[var(--color-accent-primary)] focus:ring-[var(--color-accent-primary-hover)] bg-[var(--color-background)]"
                    />
                    <span className="text-sm font-medium text-[var(--color-text-medium)]">Сделать расходником</span>
                </label>
                <p className="text-xs text-[var(--color-text-muted)] mt-1 pl-8">
                    Предмет будет отображаться в списке быстрого доступа для быстрого использования и отслеживания.
                </p>
            </div>
        </div>
        <div className="mt-6 flex flex-col sm:flex-row-reverse gap-3">
          <button
            onClick={handleSave}
            className="w-full sm:w-auto justify-center rounded-lg border border-transparent shadow-md px-4 py-2 bg-[var(--color-accent-primary-active)] text-base font-medium text-white hover:bg-[var(--color-accent-primary-dark)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-[var(--color-surface-opaque)] transition-all duration-150 active:scale-95"
          >
            Сохранить
          </button>
          {item && (
            <button
                onClick={handleDeleteItem}
                className="w-full sm:w-auto justify-center rounded-lg border border-[var(--color-border-subtle)] shadow-sm px-4 py-2 bg-[var(--color-surface-raised)] text-base font-medium text-[var(--color-text-medium)] hover:bg-[var(--color-surface-raised-hover)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] focus:ring-offset-[var(--color-surface-opaque)] transition-all duration-150 active:scale-95"
            >
                Удалить предмет
            </button>
          )}
          <button
            onClick={onClose}
            className="close-button w-full sm:w-auto justify-center rounded-lg border border-[var(--color-border-subtle)] shadow-sm px-4 py-2 bg-transparent text-base font-medium text-[var(--color-text-medium)] hover:bg-[var(--color-surface-raised)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-focus-ring)] sm:mt-0 sm:mr-auto transition-all duration-150 active:scale-95"
          >
            Отмена
          </button>
        </div>
      </div>
      {customAlertMessage && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] animate-fade-in">
              <div className="bg-[var(--color-surface-opaque)] rounded-xl shadow-2xl p-6 m-4 w-full max-w-sm border border-[var(--color-border)] text-center">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                  </div>
                  <h3 className="text-lg font-bold text-[var(--color-text-base)] mb-2">Внимание</h3>
                  <p className="text-sm text-[var(--color-text-medium)] mb-5">
                      {customAlertMessage}
                  </p>
                  <button
                      onClick={() => setCustomAlertMessage(null)}
                      className="w-full justify-center rounded-lg border border-transparent shadow-md px-4 py-2 bg-[var(--color-accent-primary)] text-base font-semibold text-white hover:bg-[var(--color-accent-primary-hover)] focus:outline-none transition-all duration-150 active:scale-95"
                  >
                      Понятно
                  </button>
              </div>
          </div>
      )}
    </div>
  );
};