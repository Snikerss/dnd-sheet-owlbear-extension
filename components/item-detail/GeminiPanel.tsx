import { useState } from 'react';
import { type InventoryItem } from '../../types';
import { type FormDataUpdater } from './itemDetailShared';
import { ApiSearchPanel } from './ApiSearchPanel';
import { AiImportPanel } from './AiImportPanel';

interface GeminiPanelProps {
  baseItem: InventoryItem | null;
  updateFormData: FormDataUpdater;
}

export const GeminiPanel: React.FC<GeminiPanelProps> = ({ baseItem, updateFormData }) => {
  const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false);
  const [importSource, setImportSource] = useState<'api' | 'ai'>('api');

  return (
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
                          <ApiSearchPanel
                              updateFormData={updateFormData}
                              onRequestClosePanel={() => setIsSearchPanelOpen(false)}
                          />
                      ) : (
                          <AiImportPanel
                              baseItem={baseItem}
                              updateFormData={updateFormData}
                              onRequestClosePanel={() => setIsSearchPanelOpen(false)}
                          />
                      )}
                  </div>
              )}
          </div>
  );
};
