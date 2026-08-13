import React from 'react';
import { Copy, Trash2, Settings } from 'lucide-react';
import { useTranslation } from '../../../contexts/I18nContext';
import { globalLabelManager } from '../../../labels/LabelMarkerManager';
import { TemplatePreview } from '../TemplatePreview';
import type { AppSettings } from '../../../types';

// The Theme type if needed locally, or we can use any
interface Theme {
  primaryBackplateFill?: string;
  primaryTextColor?: string;
  secondaryBackplateFill?: string;
  secondaryTextColor?: string;
  pointerFill?: string;
  [key: string]: any;
}

interface LabelTemplateListProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  activeLabelTab: 'regular' | 'highlight' | 'headline';
  expandedLabelSettings: Record<string, boolean>;
  setExpandedLabelSettings: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

export const LabelTemplateList: React.FC<LabelTemplateListProps> = ({
  settings,
  setSettings,
  activeLabelTab,
  expandedLabelSettings,
  setExpandedLabelSettings
}) => {
  const { t } = useTranslation();

  const currentTemplate =
    activeLabelTab === 'regular'
      ? settings.labelTemplates?.regularLabelTemplate
      : activeLabelTab === 'highlight'
      ? settings.labelTemplates?.highlightLabelTemplate
      : settings.labelTemplates?.headlineTemplate;

  const availableRaw = Array.isArray(settings.labelTemplates?.availableTemplates)
    ? settings.labelTemplates.availableTemplates
    : [];
  
  const variations = settings.labelTemplates?.variations || [];
  const hidden = settings.labelTemplates?.hiddenTemplates || [];

  const available = availableRaw
    .map((t: any) => (typeof t === 'string' ? { id: t, kind: 'regular' } : t))
    .filter((t: any) => {
      const kinds = Array.isArray(t.kind) ? t.kind : [t.kind];
      return (
        (activeLabelTab === 'headline'
          ? kinds.includes('headline')
          : kinds.includes(activeLabelTab) || kinds.includes('both')) &&
        !hidden.includes(t.id)
      );
    });

  const allItems = [
    {
      id: '',
      baseTemplate: '',
      name: 'Default (HTML)',
      isVariation: false,
    },
    ...available.map((t: any) => ({
      id: t.id,
      baseTemplate: t.id,
      name: t.id,
      isVariation: false,
    })),
    ...variations
      .filter((v: any) => available.some((a: any) => a.id === v.baseTemplate))
      .map((v: any) => ({ ...v, isVariation: true })),
  ];

  const sorted = allItems.sort((a, b) => {
    const isACurrent = a.id === currentTemplate || (!a.id && !currentTemplate);
    const isBCurrent = b.id === currentTemplate || (!b.id && !currentTemplate);
    if (isACurrent && !isBCurrent) return -1;
    if (!isACurrent && isBCurrent) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      {sorted.map((item) => {
        const tName = item.baseTemplate;
        const isSelected = item.id === currentTemplate || (!item.id && !currentTemplate);
        const isExpanded = expandedLabelSettings[item.id || 'default'];
        const tplDefForTheme = settings.labelTemplates?.availableTemplates?.find(
          (t: any) => t.id === item.baseTemplate
        );
        const manForTheme =
          (tplDefForTheme as any)?.manifest ||
          globalLabelManager.templates.get(item.baseTemplate)?.manifest;

        const currentTheme = {
          ...(settings.labelTemplates?.theme || {}),
          ...(manForTheme?.primary?.color ? { primaryBackplateFill: manForTheme.primary.color } : {}),
          ...(manForTheme?.primary?.pointer?.color ? { pointerFill: manForTheme.primary.pointer.color } : {}),
          ...(manForTheme?.primary?.typography?.color ? { primaryTextColor: manForTheme.primary.typography.color } : {}),
          ...(manForTheme?.secondary?.color ? { secondaryBackplateFill: manForTheme.secondary.color } : {}),
          ...(manForTheme?.secondary?.typography?.color ? { secondaryTextColor: manForTheme.secondary.typography.color } : {}),
          ...(settings.labelTemplates?.savedThemes?.[item.id] || {}),
        };

        return (
          <div
            key={item.id || 'default'}
            className={`flex flex-col bg-zinc-900 border min-h-[64px] rounded-3xl overflow-hidden transition-colors ${
              isSelected ? 'border-white' : 'border-white/10 hover:border-white/30'
            }`}
          >
            <div
              className="relative p-2 flex justify-center items-center cursor-pointer w-full"
              onClick={() => {
                const val = item.id === '' ? undefined : item.id;
                const updateField =
                  activeLabelTab === 'regular'
                    ? 'regularLabelTemplate'
                    : activeLabelTab === 'highlight'
                    ? 'highlightLabelTemplate'
                    : 'headlineTemplate';
                setSettings((prev: any) => ({
                  ...prev,
                  labelTemplates: {
                    ...prev.labelTemplates,
                    availableTemplates: prev.labelTemplates?.availableTemplates || [],
                    [updateField]: val,
                  },
                }));
                window.dispatchEvent(
                  new CustomEvent('updateSelectedLabelTemplate', {
                    detail: { type: activeLabelTab, template: val },
                  })
                );
              }}
            >
              <TemplatePreview
                templateName={item.baseTemplate}
                hasSecondary={activeLabelTab === 'regular' || activeLabelTab === 'headline'}
                theme={currentTheme}
              />
              <div className="absolute top-2 right-2 flex gap-1">
                {item.id !== '' && (
                  <button
                    className="p-1 rounded text-white/40 hover:text-white/80 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      const newId = `var-${Date.now()}`;
                      setSettings((prev: any) => ({
                        ...prev,
                        labelTemplates: {
                          ...prev.labelTemplates,
                          availableTemplates: prev.labelTemplates?.availableTemplates || [],
                          variations: [
                            ...(prev.labelTemplates?.variations || []),
                            {
                              id: newId,
                              baseTemplate: item.baseTemplate,
                              name: `${item.name} (Copy)`,
                            },
                          ],
                          savedThemes: {
                            ...(prev.labelTemplates?.savedThemes || {}),
                            [newId]: { ...currentTheme },
                          },
                        },
                      }));
                    }}
                    title={t('Duplicate')}
                  >
                    <Copy size={14} />
                  </button>
                )}
                {item.isVariation && (
                  <button
                    className="p-1 rounded text-white/40 hover:text-white/80 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSettings((prev: any) => {
                        const newVars = (prev.labelTemplates?.variations || []).filter(
                          (v: any) => v.id !== item.id
                        );
                        const newThemes = {
                          ...(prev.labelTemplates?.savedThemes || {}),
                        };
                        delete newThemes[item.id];
                        return {
                          ...prev,
                          labelTemplates: {
                            ...prev.labelTemplates,
                            availableTemplates: prev.labelTemplates?.availableTemplates || [],
                            variations: newVars,
                            savedThemes: newThemes,
                          },
                        };
                      });
                    }}
                    title={t('Delete Variation')}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                {!item.isVariation && item.id !== '' && (
                  <button
                    className="p-1 rounded text-white/40 hover:text-white/80 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSettings((prev: any) => ({
                        ...prev,
                        labelTemplates: {
                          ...prev.labelTemplates,
                          availableTemplates: prev.labelTemplates?.availableTemplates || [],
                          hiddenTemplates: [
                            ...(prev.labelTemplates?.hiddenTemplates || []),
                            item.id,
                          ],
                        },
                      }));
                    }}
                    title={t('Hide from Show')}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                <button
                  className={`p-1 rounded transition-colors ${
                    isExpanded ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white/80'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedLabelSettings((prev: any) => ({
                      ...prev,
                      [item.id || 'default']: !prev[item.id || 'default'],
                    }));
                  }}
                  title={t('Settings')}
                >
                  <Settings size={14} />
                </button>
              </div>
            </div>
            {isExpanded && (
              <div className="p-3 pt-0 mt-2 border-t border-white/10 flex flex-wrap gap-2 items-start justify-center bg-black/20">
                {tName === '' ? (
                  <input
                    type="color"
                    value={currentTheme.primaryBackplateFill || '#ffffff'}
                    onChange={(e) => {
                      const newColor = e.target.value;
                      setSettings((prev: any) => ({
                        ...prev,
                        labelTemplates: {
                          ...prev.labelTemplates,
                          availableTemplates: prev.labelTemplates?.availableTemplates || [],
                          savedThemes: {
                            ...(prev.labelTemplates?.savedThemes || {}),
                            [item.id]: {
                              ...currentTheme,
                              primaryBackplateFill: newColor,
                            },
                          },
                        },
                      }));
                      if (isSelected) {
                        window.dispatchEvent(
                          new CustomEvent('updateSelectedLabelTheme', {
                            detail: {
                              key: 'primaryBackplateFill',
                              value: newColor,
                            },
                          })
                        );
                      }
                    }}
                    className="w-6 h-6 mt-3 p-0 border-0 bg-transparent cursor-pointer rounded-full overflow-hidden [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-full"
                    title={t('Primary Fill')}
                  />
                ) : (
                  (() => {
                    const updateColor = (key: keyof Theme, val: string) => {
                      setSettings((prev: any) => ({
                        ...prev,
                        labelTemplates: {
                          ...prev.labelTemplates,
                          availableTemplates: prev.labelTemplates?.availableTemplates || [],
                          savedThemes: {
                            ...(prev.labelTemplates?.savedThemes || {}),
                            [item.id]: {
                              ...currentTheme,
                              [key]: val,
                            },
                          },
                        },
                      }));
                      if (isSelected) {
                        window.dispatchEvent(
                          new CustomEvent('updateSelectedLabelTheme', {
                            detail: { key, value: val },
                          })
                        );
                      }
                    };


                    const tplDef = settings.labelTemplates?.availableTemplates?.find(
                      (t: any) => t.id === item.baseTemplate
                    );
                    const man =
                      (tplDef as any)?.manifest ||
                      globalLabelManager.templates.get(item.baseTemplate)?.manifest;

                    const primaryFill =
                      currentTheme.primaryBackplateFill || man?.primary?.color || '#ffffff';
                    const primaryText =
                      currentTheme.primaryTextColor ||
                      man?.primary?.typography?.color ||
                      '#000000';
                    const secFill =
                      currentTheme.secondaryBackplateFill || man?.secondary?.color || '#ffffff';
                    const secText =
                      currentTheme.secondaryTextColor ||
                      man?.secondary?.typography?.color ||
                      '#ffffff';
                    const pointerFill =
                      currentTheme.pointerFill || man?.primary?.pointer?.color || '#ffffff';

                    return (
                      <>
                        <div className="flex flex-col items-center gap-1 mt-3">
                          <div className="flex w-12 h-6 rounded-full overflow-hidden border border-white/20">
                            <input
                              type="color"
                              value={primaryText}
                              onChange={(e) => updateColor('primaryTextColor', e.target.value)}
                              className="w-1/2 h-full p-0 border-0 bg-transparent cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-none"
                              title={t('Primary Text')}
                            />
                            {man?.primary?.overrideColor ? (
                              <input
                                type="color"
                                value={primaryFill}
                                onChange={(e) =>
                                  updateColor('primaryBackplateFill', e.target.value)
                                }
                                className="w-1/2 h-full p-0 border-0 bg-transparent cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-none"
                                title={t('Primary Fill')}
                              />
                            ) : (
                              <div
                                className="w-1/2 h-full bg-white/10"
                                title={t('Original primary fill locked')}
                              />
                            )}
                          </div>
                          <span className="text-[9px] text-white/50 text-center leading-tight">
                            {t('Primary')}
                          </span>
                        </div>

                        {(activeLabelTab === 'regular' || activeLabelTab === 'headline') &&
                          man?.secondary && (
                            <div className="flex flex-col items-center gap-1 mt-3">
                              <div className="flex w-12 h-6 rounded-full overflow-hidden border border-white/20">
                                <input
                                  type="color"
                                  value={secText}
                                  onChange={(e) =>
                                    updateColor('secondaryTextColor', e.target.value)
                                  }
                                  className="w-1/2 h-full p-0 border-0 bg-transparent cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-none"
                                  title={t('Secondary Text')}
                                />
                                {man.secondary.overrideColor ? (
                                  <input
                                    type="color"
                                    value={secFill}
                                    onChange={(e) =>
                                      updateColor('secondaryBackplateFill', e.target.value)
                                    }
                                    className="w-1/2 h-full p-0 border-0 bg-transparent cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-none"
                                    title={t('Secondary Fill')}
                                  />
                                ) : (
                                  <div
                                    className="w-1/2 h-full bg-white/10"
                                    title={t('Original secondary fill locked')}
                                  />
                                )}
                              </div>
                              <span className="text-[9px] text-white/50 text-center leading-tight">
                                {t('Secondary')}
                              </span>
                            </div>
                          )}

                        {man?.primary?.pointer?.overrideColor && (
                          <div className="flex flex-col items-center gap-1 mt-3">
                            <input
                              type="color"
                              value={pointerFill}
                              onChange={(e) => updateColor('pointerFill', e.target.value)}
                              className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer rounded-full overflow-hidden [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-full"
                              title={t('Pointer Fill')}
                            />
                            <span className="text-[9px] text-white/50 text-center leading-tight max-w-[40px]">
                              {t('Pointer')}
                            </span>
                          </div>
                        )}


                      </>
                    );
                  })()
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
};
