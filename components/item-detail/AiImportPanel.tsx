import { useState } from 'react';
import { type InventoryItem } from '../../types';
import { logger } from '../../utils/logger';
import { parseRobustJSON } from '../../utils/translation';
import { generateWithGemini, getGeminiApiKey, setGeminiApiKey } from '../../utils/gemini';
import { useNotifier } from '../../context/NotificationContext';
import {
  DEFAULT_ITEM,
  normalizeSavingThrows,
  type FormDataUpdater
} from './itemDetailShared';

interface AiImportPanelProps {
  baseItem: InventoryItem | null;
  updateFormData: FormDataUpdater;
  onRequestClosePanel: () => void;
}

export const AiImportPanel: React.FC<AiImportPanelProps> = ({ baseItem, updateFormData, onRequestClosePanel }) => {
  const [aiMode, setAiMode] = useState<'official' | 'homebrew'>('official');
  const [geminiKey, setGeminiKey] = useState(() => getGeminiApiKey());
  const [aiDescription, setAiDescription] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const { addNotification } = useNotifier();

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
            logger.warn(`Gemini API call with Google Search failed (${(groundingErr as Error).message}). Retrying without search grounding...`);
            jsonText = await generateWithGemini('gemini-2.0-flash', prompt, {
                responseMimeType: 'application/json',
            });
        }

        const parsedItem = parseRobustJSON(jsonText);

        if (parsedItem.error) {
            setAiError(parsedItem.error);
            return;
        }

        const base = baseItem || DEFAULT_ITEM;
        updateFormData({
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

        onRequestClosePanel();
        addNotification(isOfficial ? `Предмет "${parsedItem.name}" успешно импортирован!` : `Предмет "${parsedItem.name}" успешно сгенерирован ИИ!`, 'info');
    } catch (err: any) {
        logger.error(err);
        setAiError(`Не удалось сгенерировать предмет: ${err.message || 'ошибка сети или неверный API-ключ'}`);
    } finally {
        setIsAiGenerating(false);
    }
  };

  return (
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
  );
};
