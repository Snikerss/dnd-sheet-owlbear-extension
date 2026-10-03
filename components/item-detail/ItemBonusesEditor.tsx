import { Ability, type Character, type ItemBonuses } from '../../types';
import { getEquippedItemBonuses } from '../../utils/inventory';
import { ABILITY_NAMES, SKILLS } from '../../constants';
import {
  type FormDataUpdater
} from './itemDetailShared';

const BONUS_INPUT_CLASS = "mt-1 block w-full bg-[var(--color-background)] border border-[var(--color-border-subtle)] rounded-lg py-1 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-focus-ring)] text-[var(--color-text-base)]";

interface BonusNumberFieldProps {
  id: string;
  label: string;
  value?: number;
  onValueChange: (val: number) => void;
}

const BonusNumberField: React.FC<BonusNumberFieldProps> = ({ id, label, value, onValueChange }) => (
  <div>
      <label htmlFor={id} className="block text-xs text-[var(--color-text-medium)]">{label}</label>
      <input
          type="number"
          id={id}
          value={value || 0}
          onChange={(e) => {
              const val = parseInt(e.target.value, 10) || 0;
              onValueChange(val);
          }}
          className={BONUS_INPUT_CLASS}
      />
  </div>
);

interface AbilityBonusGridProps {
  label: string;
  values: Partial<Record<Ability, number>> | undefined;
  onAbilityChange: (ability: Ability, val: number) => void;
}

const AbilityBonusGrid: React.FC<AbilityBonusGridProps> = ({ label, values, onAbilityChange }) => (
  <div className="space-y-1">
      <label className="block text-xs text-[var(--color-text-medium)]">{label}</label>
      <div className="grid grid-cols-3 gap-2">
          {(Object.keys(ABILITY_NAMES) as Ability[]).map(ability => (
              <div key={ability} className="flex items-center gap-1.5 bg-[var(--color-surface-inset)] px-2 py-1 rounded border border-[var(--color-border-subtle)]">
                  <span className="text-[10px] font-bold text-[var(--color-text-muted)] w-8 uppercase">{ability}</span>
                  <input
                      type="number"
                      value={values?.[ability] || 0}
                      onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 0;
                          onAbilityChange(ability, val);
                      }}
                      className="w-full text-right bg-transparent text-sm font-bold focus:outline-none p-0 border-none text-[var(--color-text-base)]"
                      placeholder="0"
                  />
              </div>
          ))}
      </div>
  </div>
);

interface ItemBonusesEditorProps {
  character: Character;
  itemId?: string;
  isEquipped?: boolean;
  requiresAttunement?: boolean;
  isAttuned?: boolean;
  bonuses?: ItemBonuses;
  onChange: FormDataUpdater;
  onCustomAlert: (message: string) => void;
}

export const ItemBonusesEditor: React.FC<ItemBonusesEditorProps> = ({
  character,
  itemId,
  isEquipped,
  requiresAttunement,
  isAttuned,
  bonuses,
  onChange,
  onCustomAlert
}) => {
  const updateBonuses = (patch: Partial<ItemBonuses>) =>
    onChange(prev => ({
        ...prev,
        bonuses: { ...prev.bonuses, ...patch }
    }));

  return (
      <>
        {/* Equipped and active bonuses section */}
        <div className="border-t border-[var(--color-border-subtle)] pt-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-6 gap-3">
                <label className="flex items-center space-x-3 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        name="isEquipped"
                        checked={!!isEquipped}
                        onChange={(e) => {
                            const willEquip = e.target.checked;
                            if (willEquip && requiresAttunement && !isAttuned) {
                                onCustomAlert('Нельзя экипировать этот предмет, пока вы не настроитесь на него!');
                                return;
                            }
                            onChange(prev => ({
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
                        checked={!!requiresAttunement}
                        onChange={(e) => {
                            const req = e.target.checked;
                            onChange(prev => {
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
                {requiresAttunement && (
                    <label className="flex items-center space-x-3 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            name="isAttuned"
                            checked={!!isAttuned}
                            onChange={(e) => {
                                const willAttune = e.target.checked;
                                if (willAttune) {
                                    const currentAttunedCount = (character.inventory || []).filter(i => i && i.isAttuned && i.id !== itemId).length;
                                    const activeItemBonuses = getEquippedItemBonuses(character);
                                    const maxAttuned = 3 + (character.attunementMaxBonus || 0) + (activeItemBonuses.attunementMax || 0);
                                    if (currentAttunedCount >= maxAttuned) {
                                        onCustomAlert(`Нельзя настроиться на этот предмет: достигнут лимит в ${maxAttuned} предметов!`);
                                        return;
                                    }
                                }
                                onChange(prev => ({
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
                    <BonusNumberField id="bonus-ac" label="Бонус к КД" value={bonuses?.ac} onValueChange={(val) => updateBonuses({ ac: val })} />
                    <BonusNumberField id="bonus-initiative" label="Инициатива" value={bonuses?.initiative} onValueChange={(val) => updateBonuses({ initiative: val })} />
                    <BonusNumberField id="bonus-attackHit" label="Попадание" value={bonuses?.attackHit} onValueChange={(val) => updateBonuses({ attackHit: val })} />
                </div>

                 <div className="grid grid-cols-3 gap-3">
                     <BonusNumberField id="bonus-spellSaveDC" label="Сл. спас. закл." value={bonuses?.spellSaveDC} onValueChange={(val) => updateBonuses({ spellSaveDC: val })} />
                     <BonusNumberField id="bonus-carryCapacity" label="Грузоподъемность (фнт.)" value={bonuses?.carryCapacity} onValueChange={(val) => updateBonuses({ carryCapacity: val })} />
                     <BonusNumberField id="bonus-maxHp" label="Бонус к макс. ОЗ" value={bonuses?.maxHp} onValueChange={(val) => updateBonuses({ maxHp: val })} />
                 </div>

                 <div className="grid grid-cols-3 gap-3">
                     <BonusNumberField id="bonus-proficiencyBonus" label="Бонус мастерства" value={bonuses?.proficiencyBonus} onValueChange={(val) => updateBonuses({ proficiencyBonus: val })} />
                     <BonusNumberField id="bonus-attunementMax" label="Макс. настроек" value={bonuses?.attunementMax} onValueChange={(val) => updateBonuses({ attunementMax: val })} />
                 </div>

                <div className="grid grid-cols-3 gap-3">
                    <BonusNumberField id="bonus-speed" label="Скорость" value={bonuses?.speed} onValueChange={(val) => updateBonuses({ speed: val })} />
                    <BonusNumberField id="bonus-longJump" label="Прыжок (длина)" value={bonuses?.longJump} onValueChange={(val) => updateBonuses({ longJump: val })} />
                    <BonusNumberField id="bonus-highJump" label="Прыжок (высота)" value={bonuses?.highJump} onValueChange={(val) => updateBonuses({ highJump: val })} />
                </div>

                <div className="grid grid-cols-3 gap-3">
                    <BonusNumberField id="bonus-passivePerception" label="Пасс. Восприятие" value={bonuses?.passivePerception} onValueChange={(val) => updateBonuses({ passivePerception: val })} />
                    <BonusNumberField id="bonus-passiveInvestigation" label="Пасс. Анализ" value={bonuses?.passiveInvestigation} onValueChange={(val) => updateBonuses({ passiveInvestigation: val })} />
                    <BonusNumberField id="bonus-passiveInsight" label="Пасс. Проницательность" value={bonuses?.passiveInsight} onValueChange={(val) => updateBonuses({ passiveInsight: val })} />
                </div>

                <AbilityBonusGrid
                  label="Бонусы характеристик"
                  values={bonuses?.abilityScores}
                  onAbilityChange={(ability, val) => updateBonuses({
                      abilityScores: {
                          ...bonuses?.abilityScores,
                          [ability]: val
                      }
                  })}
                />

                 <AbilityBonusGrid
                   label="Бонусы спасбросков"
                   values={bonuses?.savingThrows}
                   onAbilityChange={(ability, val) => updateBonuses({
                       savingThrows: {
                           ...bonuses?.savingThrows,
                           [ability]: val
                       }
                   })}
                 />

                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <label className="block text-xs text-[var(--color-text-medium)]">Бонусы навыков</label>
                        <select
                            onChange={(e) => {
                                const skillName = e.target.value;
                                if (!skillName) return;
                                onChange(prev => {
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
                                .filter(s => !bonuses?.skills?.[s])
                                .map(skillName => (
                                    <option key={skillName} value={skillName}>{skillName}</option>
                                ))
                            }
                        </select>
                    </div>

                    {Object.keys(bonuses?.skills || {}).length === 0 ? (
                        <div className="text-[10px] text-[var(--color-text-muted)] italic text-center py-1">Нет добавленных бонусов к навыкам</div>
                    ) : (
                        <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
                            {Object.entries(bonuses?.skills || {}).map(([skillName, bonusVal]) => (
                                <div key={skillName} className="flex items-center justify-between bg-[var(--color-surface-inset)] px-2.5 py-1 rounded border border-[var(--color-border-subtle)] text-xs">
                                    <span className="font-medium text-[var(--color-text-base)]">{skillName}</span>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            value={bonusVal}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value, 10) || 0;
                                                onChange(prev => ({
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
                                                onChange(prev => {
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
      </>
  );
};
