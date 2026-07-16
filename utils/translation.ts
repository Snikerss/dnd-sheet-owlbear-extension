import { MagicSchool, Rarity, Currency } from '../types';
import { generateWithGemini, getGeminiApiKey } from './gemini';

// Magic School mapping
const MAGIC_SCHOOL_MAP: Record<string, MagicSchool> = {
    'abjuration': MagicSchool.Abjuration,
    'conjuration': MagicSchool.Conjuration,
    'divination': MagicSchool.Divination,
    'enchantment': MagicSchool.Enchantment,
    'evocation': MagicSchool.Evocation,
    'illusion': MagicSchool.Illusion,
    'necromancy': MagicSchool.Necromancy,
    'transmutation': MagicSchool.Transmutation,
};

// Rarity mapping
const RARITY_MAP: Record<string, Rarity> = {
    'common': Rarity.Common,
    'uncommon': Rarity.Uncommon,
    'rare': Rarity.Rare,
    'very rare': Rarity.VeryRare,
    'legendary': Rarity.Legendary,
    'artifact': Rarity.Artifact,
};

// Currency mapping
const CURRENCY_MAP: Record<string, Currency> = {
    'cp': Currency.CP,
    'sp': Currency.SP,
    'ep': Currency.EP,
    'gp': Currency.GP,
    'pp': Currency.PP,
};

// Local dictionary for casting time
export const translateCastingTime = (time: string): string => {
    if (!time) return '';
    const clean = time.toLowerCase().trim();
    if (clean.includes('1 action')) return '1 действие';
    if (clean.includes('1 bonus action')) return '1 бонусное действие';
    if (clean.includes('1 reaction')) return '1 реакция';
    if (clean.includes('1 minute')) return '1 минута';
    if (clean.includes('10 minutes')) return '10 минут';
    if (clean.includes('1 hour')) return '1 час';
    if (clean.includes('8 hours')) return '8 часов';
    if (clean.includes('24 hours')) return '24 часа';
    
    // Fallback dictionary replacement
    return time
        .replace(/action/gi, 'действие')
        .replace(/bonus action/gi, 'бонусное действие')
        .replace(/reaction/gi, 'реакция')
        .replace(/minute/gi, 'минута')
        .replace(/minutes/gi, 'минут')
        .replace(/hour/gi, 'час')
        .replace(/hours/gi, 'часов')
        .replace(/day/gi, 'день')
        .replace(/days/gi, 'дней');
};

// Local dictionary for range
export const translateRange = (range: string): string => {
    if (!range) return '';
    const clean = range.toLowerCase().trim();
    if (clean === 'self') return 'на себя';
    if (clean === 'touch') return 'касание';
    if (clean === 'sight') return 'в пределах видимости';
    if (clean === 'unlimited') return 'без ограничений';
    
    return range
        .replace(/feet/gi, 'футов')
        .replace(/foot/gi, 'фут')
        .replace(/miles/gi, 'миль')
        .replace(/mile/gi, 'миля')
        .replace(/self/gi, 'на себя')
        .replace(/touch/gi, 'касание');
};

// Local dictionary for duration
export const translateDuration = (duration: string): string => {
    if (!duration) return '';
    const clean = duration.toLowerCase().trim();
    if (clean === 'instantaneous') return 'мгновенная';
    if (clean.includes('concentration')) {
        const suffix = duration.replace(/concentration/gi, '').replace(/,/gi, '').trim();
        if (suffix) {
            return `концентрация, ${translateDuration(suffix).toLowerCase()}`;
        }
        return 'концентрация';
    }
    if (clean === 'until dispelled') return 'пока не рассеется';
    if (clean === 'special') return 'особая';
    
    return duration
        .replace(/instantaneous/gi, 'мгновенная')
        .replace(/until dispelled/gi, 'пока не рассеется')
        .replace(/concentration/gi, 'концентрация')
        .replace(/up to/gi, 'до')
        .replace(/round/gi, 'раунд')
        .replace(/rounds/gi, 'раундов')
        .replace(/minute/gi, 'минута')
        .replace(/minutes/gi, 'минут')
        .replace(/hour/gi, 'час')
        .replace(/hours/gi, 'часов')
        .replace(/day/gi, 'день')
        .replace(/days/gi, 'дней');
};

// Map magic school from API string
export const mapMagicSchool = (schoolName: string): MagicSchool => {
    const clean = schoolName.toLowerCase().trim();
    return MAGIC_SCHOOL_MAP[clean] ?? MagicSchool.Evocation;
};

// Map rarity from API string
export const mapRarity = (rarityName: string): Rarity => {
    const clean = rarityName.toLowerCase().trim();
    return RARITY_MAP[clean] ?? Rarity.Common;
};

// Map currency from API string
export const mapCurrency = (currencyCode: string): Currency => {
    const clean = currencyCode.toLowerCase().trim();
    return CURRENCY_MAP[clean] ?? Currency.GP;
};

export const splitTextIntoChunks = (text: string, maxLength: number = 2000): string[] => {
    if (text.length <= maxLength) return [text];
    
    const chunks: string[] = [];
    const parts = text.split(/(?<=[.!?])\s+/);
    let currentChunk = '';
    
    for (const part of parts) {
        if (!part) continue;
        
        const proposedLength = currentChunk ? currentChunk.length + 1 + part.length : part.length;
        if (proposedLength > maxLength) {
            if (currentChunk.trim()) {
                chunks.push(currentChunk.trim());
                currentChunk = '';
            }
            
            if (part.length > maxLength) {
                const words = part.split(/\s+/);
                let wordChunk = '';
                for (const word of words) {
                    const proposedWordLength = wordChunk ? wordChunk.length + 1 + word.length : word.length;
                    if (proposedWordLength > maxLength) {
                        if (wordChunk.trim()) {
                            chunks.push(wordChunk.trim());
                        }
                        wordChunk = word;
                    } else {
                        wordChunk = wordChunk ? wordChunk + ' ' + word : word;
                    }
                }
                if (wordChunk.trim()) {
                    currentChunk = wordChunk;
                }
            } else {
                currentChunk = part;
            }
        } else {
            currentChunk = currentChunk ? currentChunk + ' ' + part : part;
        }
    }
    
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }
    
    return chunks;
};

// Helper to translate via Gemini if key is available.
// Использует единый сервис generateWithGemini — ключ в заголовке, не в URL (баг #5).
const translateWithGemini = async (text: string): Promise<string> => {
    const prompt = `Translate the following D&D 5e text to Russian. Preserve formatting, markdown, and all numbers/statistics exactly. Return ONLY the translated Russian text, with no extra commentary:\n\n${text}`;
    const result = await generateWithGemini('gemini-2.0-flash', prompt);
    return result.trim();
};

// Public Google Translate free API helper for large texts (with Gemini and MyMemory fallbacks)
export const translateText = async (text: string): Promise<string> => {
    if (!text || text.trim() === '') return '';
    try {
        const geminiKey = getGeminiApiKey();
        // Split by double newline to preserve paragraph structure
        const paragraphs = text.split('\n\n');
        const translatedParagraphs = await Promise.all(
            paragraphs.map(async (paragraph) => {
                const trimmed = paragraph.trim();
                if (!trimmed) return '';

                // Try Google Translate first
                try {
                    const chunks = splitTextIntoChunks(trimmed, 2000);
                    const translatedChunks = await Promise.all(
                        chunks.map(async (chunk) => {
                            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t&q=${encodeURIComponent(chunk)}`;
                            const response = await fetch(url);
                            if (!response.ok) throw new Error(`GT status ${response.status}`);
                            const data = await response.json();
                            if (data && data[0]) {
                                return data[0].map((x: any) => x[0] || '').join('');
                            }
                            throw new Error("Invalid GT response format");
                        })
                    );
                    return translatedChunks.join(' ');
                } catch (gtErr) {
                    console.warn("Google Translate paragraph translation failed, trying Gemini or MyMemory:", gtErr);

                    // Try Gemini next if key is available (через единый сервис — ключ в заголовке)
                    if (geminiKey) {
                        try {
                            return await translateWithGemini(trimmed);
                        } catch (geminiErr) {
                            console.warn("Gemini fallback translation failed, falling back to MyMemory:", geminiErr);
                        }
                    }

                    // MyMemory fallback (chunks of 450 to satisfy MyMemory 500-char limit)
                    const chunks = splitTextIntoChunks(trimmed, 450);
                    const translatedChunks = await Promise.all(
                        chunks.map(async (chunk) => {
                            const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=en|ru`;
                            const response = await fetch(url);
                            if (!response.ok) return chunk;
                            const data = await response.json();
                            const translated = data.responseData?.translatedText || chunk;
                            if (typeof translated === 'string' && translated.includes("QUERY LENGTH LIMIT EXCEEDED")) {
                                return chunk; // Do not output the limit error to user
                            }
                            return translated
                                .replace(/\uFFFD/g, '') // Strip broken unicode replacement characters
                                .replace(/&quot;/g, '"')
                                .replace(/&#39;/g, "'")
                                .replace(/&amp;/g, '&')
                                .replace(/&lt;/g, '<')
                                .replace(/&gt;/g, '>');
                        })
                    );
                    return translatedChunks.join(' ');
                }
            })
        );
        return translatedParagraphs.join('\n\n');
    } catch (error) {
        console.error("Translation helper completely failed:", error);
        return text;
    }
};

const RUSSIAN_DND_GLOSSARY: Record<string, string> = {
    // Equipment Packs
    'набор путешественника': "explorer's pack",
    'набор дипломата': "diplomat's pack",
    'набор взломщика': "burglar's pack",
    'набор исследователя подземелий': "dungeoneer's pack",
    'набор артиста': "entertainer's pack",
    'набор священника': "priest's pack",
    'набор ученого': "scholar's pack",
    
    // Core equipment items
    'длинный меч': 'longsword',
    'короткий меч': 'shortsword',
    'двуручный меч': 'greatsword',
    'кинжал': 'dagger',
    'щит': 'shield',
    'кольчуга': 'chain mail',
    'кожаный доспех': 'leather armor',
    'латный доспех': 'plate armor',
    'латы': 'plate armor',
    'арбалет': 'crossbow',
    'лук': 'bow',
    'короткий лук': 'shortbow',
    'длинный лук': 'longbow',
    'булава': 'mace',
    'копье': 'spear',
    'посох': 'staff',
    'амулет здоровья': 'amulet of health',
    'плащ защиты': 'cloak of protection',
    'кольцо защиты': 'ring of protection',
    
    // Spells (Common ones)
    'огненный шар': 'fireball',
    'волшебная стрела': 'magic missile',
    'мистический заряд': 'eldritch blast',
    'исцеление ран': 'cure wounds',
    'лечение ран': 'cure wounds',
    'щит веры': 'shield of faith',
    'обнаружение магии': 'detect magic',
    'туманный шаг': 'misty step',
    'усыпление': 'sleep',
    'паутина': 'web',
    'полет': 'fly',
    'молния': 'lightning bolt'
};

// Helper to translate user search query to English if it contains Russian characters
export const translateQueryToEnglish = async (query: string): Promise<string> => {
    const clean = query.trim();
    if (!clean) return '';
    
    const key = clean.toLowerCase();
    if (RUSSIAN_DND_GLOSSARY[key]) {
        return RUSSIAN_DND_GLOSSARY[key];
    }
    
    // Check if query contains Cyrillic characters
    const hasCyrillic = /[\u0400-\u04FF]/.test(clean);
    if (!hasCyrillic) return clean;
    
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ru&tl=en&dt=t&q=${encodeURIComponent(clean)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`GT status ${response.status}`);
        const data = await response.json();
        if (data && data[0]) {
            const translated = data[0].map((x: any) => x[0] || '').join('').trim();
            // Clean up leading/trailing spaces or quotes that the translator might wrap
            return translated.replace(/^["']|["']$/g, '').trim();
        }
        throw new Error("Invalid GT response");
    } catch (err) {
        console.warn("Google Translate query translation failed, trying MyMemory fallback:", err);
        try {
            const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=ru|en`;
            const response = await fetch(url);
            if (!response.ok) return clean;
            const data = await response.json();
            const translated = data.responseData?.translatedText || clean;
            if (typeof translated === 'string' && translated.includes("QUERY LENGTH LIMIT EXCEEDED")) {
                return clean;
            }
            return translated.replace(/^["']|["']$/g, '').trim();
        } catch (mymemoryErr) {
            console.error("MyMemory fallback also failed:", mymemoryErr);
            return clean;
        }
    }
};

export const expandSearchTerms = (query: string): string[] => {
    const clean = query.toLowerCase().trim();
    if (!clean) return [];
    
    const terms = new Set<string>([clean]);
    const replacements: Record<string, string[]> = {
        'traveler': ['explorer'],
        'explorer': ['traveler'],
        'set': ['pack', 'kit', 'gear'],
        'pack': ['set', 'kit'],
        'kit': ['pack', 'set'],
        'healing': ['cure', 'heal'],
        'cure': ['healing', 'heal'],
        'blade': ['sword'],
        'sword': ['blade'],
        'armor': ['mail', 'suit']
    };
    
    const words = clean.split(/\s+/);
    
    for (let i = 0; i < words.length; i++) {
        const rawWord = words[i];
        if (!rawWord) continue;
        const cleanWord = rawWord.replace(/['"s]/g, '');
        for (const [key, syns] of Object.entries(replacements)) {
            if (cleanWord === key || cleanWord.includes(key) || key.includes(cleanWord)) {
                for (const syn of syns) {
                    const newWords = [...words];
                    newWords[i] = syn;
                    terms.add(newWords.join(' '));

                    // Also try combining replacements if there are other words
                    for (let j = 0; j < words.length; j++) {
                        if (j === i) continue;
                        const otherRaw = words[j];
                        if (!otherRaw) continue;
                        const otherWord = otherRaw.replace(/['"s]/g, '');
                        for (const [otherKey, otherSyns] of Object.entries(replacements)) {
                            if (otherWord === otherKey || otherWord.includes(otherKey) || otherKey.includes(otherWord)) {
                                for (const otherSyn of otherSyns) {
                                    const combinedWords = [...newWords];
                                    combinedWords[j] = otherSyn;
                                    terms.add(combinedWords.join(' '));
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    return Array.from(terms);
};

export const parseRobustJSON = (text: string): any => {
    let cleanText = text.trim();
    
    // Find the first '{' and last '}'
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    }
    
    try {
        return JSON.parse(cleanText);
    } catch (e: any) {
        throw new Error(`Invalid JSON format: ${e.message}. Raw text: ${text.substring(0, 150)}...`);
    }
};
