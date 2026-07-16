/**
 * Единый сервис для работы с Gemini API.
 *
 * КРИТИЧЕСКОЕ ИЗМЕНЕНИЕ БЕЗОПАСНОСТИ (баг #5, #6):
 * Раньше API-ключ передавался в URL query-параметре (?key=...), что приводило к утечке
 * в логи провайдера, историю браузера и Referer-заголовки. Теперь ключ ВСЕГДА
 * передаётся через HTTP-заголовок `x-goog-api-key` и НИКОГДА не попадает в URL.
 *
 * Дополнительно: ключ больше не вшивается в клиентский бандл через vite `define`
 * (это было видно всем пользователям в DevTools). Теперь ключ берётся из localStorage,
 * куда его вводит пользователь через UI настроек.
 */

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const STORAGE_KEY = 'dnd_gemini_api_key';

/**
 * Типизированные ошибки для единообразной обработки в UI.
 */
export class GeminiError extends Error {
    constructor(
        message: string,
        public readonly statusCode?: number,
        public readonly cause?: unknown,
    ) {
        super(message);
        this.name = 'GeminiError';
    }
}

export class GeminiAuthError extends GeminiError {
    constructor(message = 'Неверный или отсутствующий API-ключ Gemini') {
        super(message, 401);
        this.name = 'GeminiAuthError';
    }
}

export class GeminiRateLimitError extends GeminiError {
    constructor(message = 'Превышен лимит запросов к Gemini') {
        super(message, 429);
        this.name = 'GeminiRateLimitError';
    }
}

export interface GeminiGenerateOptions {
    /** MIME-тип ответа; по умолчанию text/plain. Для JSON: 'application/json'. */
    responseMimeType?: string;
    /** Инструменты (например, googleSearch для grounding). */
    tools?: unknown[];
    /** Температура генерации. */
    temperature?: number;
}

/**
 * Читает API-ключ Gemini из localStorage.
 * @returns Ключ или пустая строка, если не задан.
 */
export const getGeminiApiKey = (): string => {
    try {
        return localStorage.getItem(STORAGE_KEY) || '';
    } catch {
        return '';
    }
};

/**
 * Сохраняет API-ключ Gemini в localStorage.
 */
export const setGeminiApiKey = (key: string): void => {
    try {
        localStorage.setItem(STORAGE_KEY, key);
    } catch (e) {
        console.error('Не удалось сохранить API-ключ Gemini:', e);
    }
};

/**
 * Проверяет, задан ли API-ключ.
 */
export const hasGeminiApiKey = (): boolean => getGeminiApiKey().trim() !== '';

/**
 * Единственная точка работы с Gemini API.
 *
 * ВСЕГДА передаёт ключ через заголовок `x-goog-api-key` (никогда через URL query).
 *
 * @param model Имя модели, например 'gemini-2.0-flash'.
 * @param prompt Текстовый промпт.
 * @param options Опции генерации.
 * @returns Текстовый ответ модели.
 * @throws {GeminiAuthError} если ключ не задан или невалиден (401/403).
 * @throws {GeminiRateLimitError} при превышении лимита (429).
 * @throws {GeminiError} при прочих ошибках API.
 */
export const generateWithGemini = async (
    model: string,
    prompt: string,
    options: GeminiGenerateOptions = {},
): Promise<string> => {
    const apiKey = getGeminiApiKey();
    if (!apiKey.trim()) {
        throw new GeminiAuthError();
    }

    // Ключ в заголовке, НЕ в URL — это главное исправление безопасности.
    const url = `${GEMINI_BASE_URL}/${model}:generateContent`;

    const body = {
        contents: [{ parts: [{ text: prompt }] }],
        ...(options.tools ? { tools: options.tools } : {}),
        generationConfig: {
            ...(options.responseMimeType ? { responseMimeType: options.responseMimeType } : {}),
            ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        },
    };

    let response: Response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            },
            body: JSON.stringify(body),
        });
    } catch (e) {
        throw new GeminiError('Сетевая ошибка при обращении к Gemini', undefined, e);
    }

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        if (response.status === 401 || response.status === 403) {
            throw new GeminiAuthError(`Ошибка авторизации Gemini (${response.status}): ${errorText}`);
        }
        if (response.status === 429) {
            throw new GeminiRateLimitError();
        }
        throw new GeminiError(
            `Gemini API вернул ошибку ${response.status}: ${errorText}`,
            response.status,
        );
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') {
        throw new GeminiError('Пустой или некорректный ответ Gemini');
    }
    return text;
};
