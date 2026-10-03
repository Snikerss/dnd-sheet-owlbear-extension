import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from './logger';

describe('utils/logger', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('предоставляет уровни debug/info/warn/error как функции', async () => {
    const { logger } = await import('./logger');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('warn прокидывает вызов в console.warn с префиксом "[DND Sheet]"', async () => {
    const { logger } = await import('./logger');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logger.warn('hello', 42);

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith('[DND Sheet]', 'hello', 42);
  });

  it('error прокидывает вызов в console.error с префиксом "[DND Sheet]"', async () => {
    const { logger } = await import('./logger');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.error({ code: 1 });

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith('[DND Sheet]', { code: 1 });
  });

  it('debug пишется в console.log вне production', async () => {
    const { logger } = await import('./logger');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.debug('visible');

    expect(logSpy).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledWith('[DND Sheet]', 'visible');
  });

  it('debug скрыт, когда import.meta.env.PROD = true', () => {
    vi.stubEnv('PROD', true);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.debug('hidden-in-prod');

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('warn остаётся видимым в production', () => {
    vi.stubEnv('PROD', true);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logger.warn('still-visible');

    expect(warnSpy).toHaveBeenCalledOnce();
  });
});
