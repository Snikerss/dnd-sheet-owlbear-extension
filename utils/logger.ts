/**
 * Тонкий логгер приложения.
 *
 * - Единый префикс "[DND Sheet]" для всех сообщений;
 * - `logger.debug` скрывается в production-сборке (import.meta.env.PROD),
 *   остальные уровни пишутся всегда;
 * - Пишет напрямую в тот же `console`, поэтому существующие тесты,
 *   мокающие console.warn/console.error, продолжают перехватывать вывод.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const PREFIX = '[DND Sheet]';

interface ViteEnv {
  PROD?: boolean;
}

const isProd = (): boolean => {
  try {
    const meta = import.meta as unknown as { env?: ViteEnv };
    return meta.env?.PROD === true;
  } catch {
    return false;
  }
};

const enabled = (lvl: Level): boolean => lvl !== 'debug' || !isProd();

const write = (lvl: Level, args: unknown[]): void => {
  if (!enabled(lvl)) return;
  if (lvl === 'debug') console.log(PREFIX, ...args);
  else if (lvl === 'info') console.info(PREFIX, ...args);
  else if (lvl === 'warn') console.warn(PREFIX, ...args);
  else console.error(PREFIX, ...args);
};

export const logger = {
  debug: (...a: unknown[]) => write('debug', a),
  info: (...a: unknown[]) => write('info', a),
  warn: (...a: unknown[]) => write('warn', a),
  error: (...a: unknown[]) => write('error', a),
};
