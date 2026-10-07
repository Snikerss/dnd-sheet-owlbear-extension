import { describe, it, expect } from 'vitest';
import { ChunkAssembler } from './chunkAssembler';

const makeMsg = (overrides: Partial<{ syncId: string; chunkIndex: number; totalChunks: number; chunkData: string }> = {}) => ({
  syncId: 'sync-1',
  chunkIndex: 0,
  totalChunks: 3,
  chunkData: 'chunk',
  ...overrides,
});

describe('ChunkAssembler', () => {
  it('собирает передачу из чанков, пришедших по порядку', () => {
    const asm = new ChunkAssembler();
    expect(asm.push('k', makeMsg({ chunkIndex: 0, chunkData: 'a' }))).toBeNull();
    expect(asm.push('k', makeMsg({ chunkIndex: 1, chunkData: 'b' }))).toBeNull();
    const result = asm.push('k', makeMsg({ chunkIndex: 2, chunkData: 'c' }));
    expect(result).toBe('abc');
    expect(asm.size).toBe(0);
  });

  it('собирает чанки независимо от порядка прибытия', () => {
    const asm = new ChunkAssembler();
    expect(asm.push('k', makeMsg({ chunkIndex: 2, chunkData: '!' }))).toBeNull();
    expect(asm.push('k', makeMsg({ chunkIndex: 0, chunkData: 'x' }))).toBeNull();
    const result = asm.push('k', makeMsg({ chunkIndex: 1, chunkData: 'y' }));
    expect(result).toBe('xy!');
  });

  it('дубликат чанка не ломает полноту и не портит данные', () => {
    const asm = new ChunkAssembler();
    expect(asm.push('k', makeMsg({ chunkIndex: 0, totalChunks: 2, chunkData: 'a' }))).toBeNull();
    expect(asm.push('k', makeMsg({ chunkIndex: 0, totalChunks: 2, chunkData: 'a' }))).toBeNull(); // дубликат
    const result = asm.push('k', makeMsg({ chunkIndex: 1, totalChunks: 2, chunkData: 'b' }));
    expect(result).toBe('ab');
    expect(asm.size).toBe(0);
  });

  it('полная сборка при повторной доставке последнего чанка отдаёт строку один раз', () => {
    const asm = new ChunkAssembler();
    void asm.push('k', makeMsg({ chunkIndex: 0, totalChunks: 2, chunkData: 'a' }));
    expect(asm.push('k', makeMsg({ chunkIndex: 1, totalChunks: 2, chunkData: 'b' }))).toBe('ab');
    // Повтор последнего чанка начинает НОВУЮ передачу (буфер уже удалён)
    expect(asm.push('k', makeMsg({ chunkIndex: 1, totalChunks: 2, chunkData: 'b' }))).toBeNull();
    expect(asm.size).toBe(1);
  });

  it('отклоняет некорректные индексы и размеры', () => {
    const asm = new ChunkAssembler();
    expect(asm.push('k', makeMsg({ chunkIndex: -1 }))).toBeNull();
    expect(asm.push('k', makeMsg({ chunkIndex: 5, totalChunks: 3 }))).toBeNull();
    expect(asm.push('k', makeMsg({ totalChunks: 0 }))).toBeNull();
    expect(asm.push('k', makeMsg({ totalChunks: -3 }))).toBeNull();
    expect(asm.push('k', makeMsg({ totalChunks: 1e9 }))).toBeNull(); // защита от гигантского массива
    expect(asm.push('k', { syncId: 's', chunkIndex: 0, totalChunks: 1, chunkData: undefined as unknown as string })).toBeNull();
    expect(asm.size).toBe(0);
  });

  it('различает передачи по syncId и не смешивает их', () => {
    const asm = new ChunkAssembler();
    expect(asm.push('k', makeMsg({ syncId: 'A', chunkIndex: 0, totalChunks: 2, chunkData: 'A0' }))).toBeNull();
    expect(asm.push('k', makeMsg({ syncId: 'B', chunkIndex: 0, totalChunks: 2, chunkData: 'B0' }))).toBeNull();
    expect(asm.push('k', makeMsg({ syncId: 'B', chunkIndex: 1, totalChunks: 2, chunkData: 'B1' }))).toBe('B0B1');
    expect(asm.size).toBe(1); // осталась недоконченная передача A
    expect(asm.push('k', makeMsg({ syncId: 'A', chunkIndex: 1, totalChunks: 2, chunkData: 'A1' }))).toBe('A0A1');
  });

  it('легаси-передача без syncId сбрасывается при изменении totalChunks (баг #10)', () => {
    const asm = new ChunkAssembler();
    expect(asm.push('k', makeMsg({ syncId: '', chunkIndex: 2, totalChunks: 5, chunkData: 'OLD-tail' }))).toBeNull();
    // Новая передача того же ключа с другим размером — старый хвост не должен дать «ложную полноту»
    expect(asm.push('k', makeMsg({ syncId: '', chunkIndex: 0, totalChunks: 3, chunkData: 'n' }))).toBeNull();
    expect(asm.push('k', makeMsg({ syncId: '', chunkIndex: 1, totalChunks: 3, chunkData: 'e' }))).toBeNull();
    expect(asm.push('k', makeMsg({ syncId: '', chunkIndex: 2, totalChunks: 3, chunkData: 'w' }))).toBe('new');
  });

  it('collectStale удаляет только зависшие буферы', () => {
    vi.useFakeTimers();
    try {
      const start = Date.now();
      vi.setSystemTime(start);
      const asm = new ChunkAssembler(30000);
      asm.push('fresh', makeMsg({ chunkIndex: 0, totalChunks: 2 }));
      vi.setSystemTime(start + 31000);
      asm.push('old', makeMsg({ chunkIndex: 0, totalChunks: 2 }));
      // «old» только что обновился (updatedAt = start+31000), а «fresh» протух
      const removed = asm.collectStale(start + 31000);
      expect(removed).toEqual(['fresh@sync-1']);
      expect(asm.size).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('push обновляет updatedAt — активная передача не подлежит GC', () => {
    vi.useFakeTimers();
    try {
      const start = Date.now();
      vi.setSystemTime(start);
      const asm = new ChunkAssembler(30000);
      asm.push('k', makeMsg({ chunkIndex: 0, totalChunks: 3 }));
      vi.setSystemTime(start + 20000);
      asm.push('k', makeMsg({ chunkIndex: 1, totalChunks: 3 }));
      vi.setSystemTime(start + 45000); // 25s после последнего пуша — живой
      const removed = asm.collectStale(start + 45000);
      expect(removed).toEqual([]);
      vi.setSystemTime(start + 51000); // 31s после последнего пуша — протух
      expect(asm.collectStale(start + 51000)).toEqual(['k@sync-1']);
    } finally {
      vi.useRealTimers();
    }
  });
});
