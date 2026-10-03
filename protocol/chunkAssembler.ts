/**
 * Чистый сборщик чанков сетевых передач.
 *
 * Закрывает три бага аудита:
 *  - #3: буферы не имели updatedAt → GC незавершённых передач никогда не срабатывал,
 *        приёмник висел вечно, память утекала;
 *  - #10: повторная передача под тем же ключом смешивалась со старой (разные totalChunks
 *         / частичное перекрытие) → собирался JSON из двух версий листа;
 *  - отсутствие проверки границ chunkIndex (JS-массив молча растёт).
 *
 * Модуль полностью синхронный и чистый — покрывается юнит-тестами без React/OBR.
 */

export interface IncomingChunk {
  /** Уникальный идентификатор передачи (генерируется отправителем). */
  syncId?: string;
  chunkIndex: number;
  totalChunks: number;
  chunkData: string;
}

interface ChunkBuffer {
  chunks: string[];
  received: number;
  total: number;
  updatedAt: number;
}

export class ChunkAssembler {
  /** Разумный предел чанков одной передачи (1000 × 20KB = 20MB на лист). */
  private static readonly MAX_TOTAL_CHUNKS = 1000;

  private buffers = new Map<string, ChunkBuffer>();

  constructor(private readonly staleAfterMs = 30000) {}

  /**
   * Добавляет чанк передачи. Возвращает собранную строку, когда передача завершена
   * (буфер при этом удаляется), иначе null.
   *
   * @param key Логический ключ потока, например `char-sheet/{id}` или `char-img/{id}/{imgId}`.
   */
  public push(key: string, msg: IncomingChunk): string | null {
    const { syncId, chunkIndex, totalChunks, chunkData } = msg;

    if (!Number.isInteger(totalChunks) || totalChunks <= 0 || totalChunks > ChunkAssembler.MAX_TOTAL_CHUNKS) return null;
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= totalChunks) return null;
    if (typeof chunkData !== 'string') return null;

    // Новая передача (свой syncId) живёт в своём буфере — старые догнивают через GC.
    const bufferKey = syncId ? `${key}@${syncId}` : key;
    const now = Date.now();

    let buffer = this.buffers.get(bufferKey);
    if (!buffer) {
      buffer = { chunks: new Array<string>(totalChunks).fill(''), received: 0, total: totalChunks, updatedAt: now };
      this.buffers.set(bufferKey, buffer);
    } else if (buffer.total !== totalChunks) {
      // Легаси-отправитель без syncId: размер изменился — это новая передача, сбрасываем.
      buffer = { chunks: new Array<string>(totalChunks).fill(''), received: 0, total: totalChunks, updatedAt: now };
      this.buffers.set(bufferKey, buffer);
    }

    if (buffer.chunks[chunkIndex] === '') {
      buffer.received += 1;
    }
    buffer.chunks[chunkIndex] = chunkData;
    buffer.updatedAt = now;

    if (buffer.received === buffer.total) {
      this.buffers.delete(bufferKey);
      return buffer.chunks.join('');
    }
    return null;
  }

  /**
   * Удаляет зависшие незавершённые буферы. Вызывается периодически.
   * @returns Ключи удалённых буферов (для логирования/метрик).
   */
  public collectStale(now = Date.now()): string[] {
    const removed: string[] = [];
    for (const [key, buffer] of this.buffers.entries()) {
      if (now - buffer.updatedAt > this.staleAfterMs) {
        this.buffers.delete(key);
        removed.push(key);
      }
    }
    return removed;
  }

  /** Число активных незавершённых передач (для диагностики). */
  public get size(): number {
    return this.buffers.size;
  }

  public clear(): void {
    this.buffers.clear();
  }
}
