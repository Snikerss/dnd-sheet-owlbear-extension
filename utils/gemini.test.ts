// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    generateWithGemini,
    getGeminiApiKey,
    setGeminiApiKey,
    hasGeminiApiKey,
    GeminiAuthError,
    GeminiRateLimitError,
    GeminiError,
} from './gemini';

describe('gemini — управление ключом', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('setGeminiApiKey сохраняет ключ в localStorage', () => {
        setGeminiApiKey('test-key-123');
        expect(localStorage.getItem('dnd_gemini_api_key')).toBe('test-key-123');
    });

    it('getGeminiApiKey возвращает сохранённый ключ', () => {
        localStorage.setItem('dnd_gemini_api_key', 'my-key');
        expect(getGeminiApiKey()).toBe('my-key');
    });

    it('getGeminiApiKey возвращает пустую строку, если ключа нет', () => {
        expect(getGeminiApiKey()).toBe('');
    });

    it('hasGeminiApiKey возвращает false без ключа, true с ключом', () => {
        expect(hasGeminiApiKey()).toBe(false);
        setGeminiApiKey('key');
        expect(hasGeminiApiKey()).toBe(true);
    });

    it('hasGeminiApiKey игнорирует пробелы', () => {
        setGeminiApiKey('   ');
        expect(hasGeminiApiKey()).toBe(false);
    });
});

describe('gemini — безопасность ключа (баги #5, #6)', () => {
    beforeEach(() => {
        localStorage.clear();
        setGeminiApiKey('SECRET-KEY-DO-NOT-LEAK');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('КРИТИЧЕСКОЕ: ключ НЕ попадает в URL (только в заголовок)', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({
                candidates: [{ content: { parts: [{ text: 'ответ' }] } }],
            }), { status: 200 }),
        );

        await generateWithGemini('gemini-2.0-flash', 'тестовый промпт');

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0]!;

        // ГЛАВНОЕ: в URL нет ключа
        expect(String(url)).not.toContain('SECRET-KEY-DO-NOT-LEAK');
        expect(String(url)).not.toContain('key=');

        // Ключ передаётся через заголовок
        const headers = new Headers((init as RequestInit).headers);
        expect(headers.get('x-goog-api-key')).toBe('SECRET-KEY-DO-NOT-LEAK');
    });

    it('бросает GeminiAuthError, если ключ не задан', async () => {
        localStorage.clear();
        await expect(generateWithGemini('gemini-2.0-flash', 'промпт')).rejects.toThrow(GeminiAuthError);
    });

    it('бросает GeminiAuthError при 401', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('Unauthorized', { status: 401 }),
        );
        await expect(generateWithGemini('gemini-2.0-flash', 'промпт')).rejects.toThrow(GeminiAuthError);
    });

    it('бросает GeminiRateLimitError при 429', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('Too Many Requests', { status: 429 }),
        );
        await expect(generateWithGemini('gemini-2.0-flash', 'промпт')).rejects.toThrow(GeminiRateLimitError);
    });

    it('бросает GeminiError при прочих статусах', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('Internal Server Error', { status: 500 }),
        );
        await expect(generateWithGemini('gemini-2.0-flash', 'промпт')).rejects.toThrow(GeminiError);
    });

    it('возвращает текст ответа при успехе', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({
                candidates: [{ content: { parts: [{ text: 'Сгенерированный текст' }] } }],
            }), { status: 200 }),
        );
        const result = await generateWithGemini('gemini-2.0-flash', 'промпт');
        expect(result).toBe('Сгенерированный текст');
    });

    it('передаёт responseMimeType в generationConfig', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({
                candidates: [{ content: { parts: [{ text: '{}' }] } }],
            }), { status: 200 }),
        );
        await generateWithGemini('gemini-2.0-flash', 'промпт', { responseMimeType: 'application/json' });
        const init = fetchSpy.mock.calls[0]![1] as RequestInit;
        const body = JSON.parse(init.body as string);
        expect(body.generationConfig.responseMimeType).toBe('application/json');
    });

    it('передаёт tools в тело запроса', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({
                candidates: [{ content: { parts: [{ text: 'ответ' }] } }],
            }), { status: 200 }),
        );
        await generateWithGemini('gemini-2.0-flash', 'промпт', { tools: [{ googleSearch: {} }] });
        const init = fetchSpy.mock.calls[0]![1] as RequestInit;
        const body = JSON.parse(init.body as string);
        expect(body.tools).toEqual([{ googleSearch: {} }]);
    });
});
