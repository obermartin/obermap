import React, { useRef, useState, useEffect } from "react";
import maplibregl from "maplibre-gl";
import type { AppSettings, MapLayer, BaseMapStyle } from "../types";
import {
  Reorder,
  useDragControls,
  motion,
  AnimatePresence,
} from "framer-motion";
import {
  GripVertical,
  Eye,
  EyeOff,
  Upload,
  Link,
  X,
  Layers,
  Trash2,
  Edit2,
  Square,
  RefreshCcw,
  RotateCcw,
  Copy,
  Radio,
  Settings,
  Save,
  Loader2,
  Image as ImageIcon,
  ChevronDown,
  ChevronRight,
  Video,
  BookmarkPlus,
  Home,
  Tag,
  Download
} from "lucide-react";
import { parseMapFileWithIds } from "../utils/fileUtils";
import {
  customAlert,
  customConfirm,
  customPrompt,
} from "../utils/dialogService";
import { useTranslation } from "../contexts/I18nContext";
import { LabelMarkerManager, globalLabelManager, type Theme } from "../labels/LabelMarkerManager";

const TemplatePreview: React.FC<{
  templateName?: string;
  isRegular: boolean;
  theme?: Theme;
}> = ({ templateName, isRegular, theme }) => {
  const [html, setHtml] = useState<string | null>(null);
  const [manifest, setManifest] = useState<any>(null);

  useEffect(() => {
    if (!templateName) {
      const getContrastYIQ = (hexcolor: string) => {
        if (!hexcolor) return "#ffffff";
        let hex = hexcolor;
        if (hex.startsWith("#")) hex = hex.slice(1);
        if (hex.length === 3)
          hex = hex
            .split("")
            .map((c) => c + c)
            .join("");
        const r = parseInt(hex.substr(0, 2), 16) || 0;
        const g = parseInt(hex.substr(2, 2), 16) || 0;
        const b = parseInt(hex.substr(4, 2), 16) || 0;
        const yiq = (r * 299 + g * 587 + b * 114) / 1000;
        return yiq >= 128 ? "#000000" : "#ffffff";
      };

      const primaryColor = theme?.primaryBackplateFill || "#ffffff";
      const contrastColor = getContrastYIQ(primaryColor);

      let defaultHtml = "";
      if (isRegular) {
        defaultHtml = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div class="custom-marker" style="pointer-events: none;">
              <div class="custom-marker-plate" style="background-color: ${primaryColor}; border-color: ${primaryColor === "#000000" || primaryColor === "#000" ? "rgba(255,255,255,0.1)" : primaryColor}">
                <div class="custom-marker-text" style="color: ${contrastColor}; display: flex; flex-direction: column; align-items: flex-start;">
                  <span style="font-size: 1.6em; line-height: 1;">Preview</span>
                  <span style="font-size: 1em; line-height: 1; margin-top: 2px;">Label</span>
                </div>
              </div>
              <div class="custom-marker-pointer" style="border-top-color: ${primaryColor}"></div>
            </div>
          </div>
        `;
      } else {
        defaultHtml = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div style="position: relative; display: flex; align-items: center; width: 100px; height: 32px; pointer-events: none; margin-left: -20px;">
              <div class="custom-highlight-marker" style="background-color: ${primaryColor};">
                <div class="custom-highlight-plate" style="background-color: ${primaryColor};">
                  <div class="custom-highlight-text" style="color: ${contrastColor}">
                    Preview
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      }
      setHtml(defaultHtml);
      return;
    }

    const manager = new LabelMarkerManager(null);
    const tryLoad = async (retries = 2) => {
      try {
        await manager.loadTemplates([templateName]);
        const p = manager.getPreviewHtml(
          templateName,
          isRegular ? { primary: "Preview", secondary: "Label" } : "Preview",
        );
        if (!p) throw new Error("Preview html is null");
        const tpl = manager.templates.get(templateName);
        if (tpl && tpl.manifest) setManifest(tpl.manifest);
        setHtml(p);
      } catch (e) {
        if (retries > 0) {
          setTimeout(() => tryLoad(retries - 1), 500);
        } else {
          console.error(e);
          setHtml(`<div style="color:red; font-size:10px;">Error</div>`);
        }
      }
    };
    tryLoad();
  }, [templateName, isRegular, theme]);

  if (!html)
    return (
      <div className="text-[10px] text-white/50">
        <Loader2 size={14} className="animate-spin" />
      </div>
    );

  const style: any = {};
  if (theme && manifest) {
    if (manifest.primary?.overrideColor)
      style["--primary-backplate-fill"] =
        theme.primaryBackplateFill || manifest.primary.color;
    if (manifest.secondary?.overrideColor)
      style["--secondary-backplate-fill"] =
        theme.secondaryBackplateFill || manifest.secondary.color;
    if (manifest.primary?.pointer?.overrideColor)
      style["--pointer-fill"] =
        theme.pointerFill || manifest.primary.pointer.color;
    style["--primary-text-color"] =
      theme.primaryTextColor || manifest.primary?.typography?.color;
    style["--secondary-text-color"] =
      theme.secondaryTextColor || manifest.secondary?.typography?.color;
    if (theme.accentFill) style["--accent-fill"] = theme.accentFill;
  }

  return (
    <div
      dangerouslySetInnerHTML={{ __html: html }}
      className="scale-75 origin-center pointer-events-none"
      style={style}
    />
  );
};

const DEFAULT_LAYERS: MapLayer[] = [
  {
    id: "split-container",
    name: "Split View Container",
    type: "split",
    visible: false,
    splitPosition: 0.5,
    splitDirection: "vertical",
    splitLayers: [],
  },
  {
    id: "deepstate",
    name: "Ukraine",
    type: "deepstate",
    visible: false,
    isLive: true,
  },
  { id: "flights", name: "Air Traffic", type: "flights", visible: false, showCallsigns: true },
  { id: "vessels", name: "Maritime Traffic", type: "vessels", visible: false },
  {
    id: "nighttime",
    name: "Nighttime Overlay",
    type: "nighttime",
    visible: false,
    opacity: 0.5,
  },
  {
    id: "satellite",
    name: "Satellite View (Bing)",
    type: "satellite",
    visible: false,
  },
  {
    id: "population_density",
    name: "Population Density",
    type: "raster",
    visible: false,
    url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GPW_Population_Density_2020/default/default/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png",
  },
  {
    id: "weather_forecast",
    name: "Weather",
    type: "weather_forecast",
    visible: false,
    showTemperature: true,
    showPrecipitation: false,
    windOpacity: 1,
    windParticleSize: 1.5,
    windParticleTrail: 94,
    showWindParticles: true,
    showWindLegend: true,
    windParticleSizeBySpeed: true,
    windParticleSpeedBySpeed: true,
    windParticleTrailBySpeed: false,
    windParticleColorBySpeed: false,
    showCityTemperatures: true,
    showCityWeatherIcons: true,
  },
  {
    id: "gdacs_cyclones",
    name: "Tropical Cyclones",
    type: "gdacs_cyclones",
    visible: false,
  },
  {
    id: "wildfires",
    name: "Wildfires",
    type: "wildfires",
    visible: false,
    wildfireMode: "effis",
    url: "https://maps.effis.emergency.copernicus.eu/gwis?service=WMS&request=GetMap&layers=nrt.ba&version=1.1.1&format=image/png&transparent=true&srs=EPSG:3857&width=256&height=256&styles=&bbox={bbox-epsg-3857}&time={date-start}/{date-end}",
  },
  {
    id: "floods",
    name: "Floods",
    type: "raster",
    visible: false,
    url: "https://geoserver.gfm.eodc.eu/geoserver/gfm/wms?service=WMS&request=GetMap&layers=observed_flood_extent&version=1.1.1&format=image/png&transparent=true&srs=EPSG:3857&width=256&height=256&styles=&bbox={bbox-epsg-3857}&time={date-start}T00:00:00.000Z/{date-end}T23:59:59.000Z",
  },
  {
    id: "gdacs_earthquakes",
    name: "Earthquakes",
    type: "gdacs_earthquakes",
    visible: false,
  },
  {
    id: "gdacs_volcanoes",
    name: "Volcanoes",
    type: "gdacs_volcanoes",
    visible: false,
  },
];

const CategoryItem = ({
  category,
  catIndex,
  expandedCategories,
  setExpandedCategories,
  setSettings,
}: any) => {
  const { t } = useTranslation();
  const controls = useDragControls();
  const isExpanded = expandedCategories[category.id] ?? false;

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(category.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDoubleClick = () => {
    setIsEditing(true);
    setEditName(category.name);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleRenameSubmit = () => {
    setIsEditing(false);
    if (editName.trim() && editName !== category.name) {
      setSettings((prev: any) => {
        const newIcons = [...(prev.icons || [])];
        newIcons[catIndex] = { ...category, name: editName.trim() };
        return { ...prev, icons: newIcons };
      });
    } else {
      setEditName(category.name);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleRenameSubmit();
    if (e.key === "Escape") {
      setIsEditing(false);
      setEditName(category.name);
    }
  };


  return (
    <Reorder.Item
      key={category.id}
      value={category}
      dragListener={false}
      dragControls={controls}
      className="flex flex-col gap-[2px] w-full"
    >
      <div className="relative p-3 flex items-center justify-between gap-3 bg-black">
        <div className="flex items-center gap-2 flex-1">
          <div
            onPointerDown={(e) => controls.start(e)}
            className="cursor-grab active:cursor-grabbing shrink-0 flex items-center p-1"
          >
            <GripVertical size={14} className="text-white/30" />
          </div>
          <button
            onClick={() =>
              setExpandedCategories((prev: any) => ({
                ...prev,
                [category.id]: !isExpanded,
              }))
            }
            className="p-1 transition-colors text-white/50 hover:text-white shrink-0"
          >
            {isExpanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
          </button>
          <div className="flex-1 min-w-0" onDoubleClick={handleDoubleClick}>
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={handleKeyDown}
                className="w-full bg-black border border-white/20 text-sm font-semibold tracking-wide px-1 outline-none text-white focus:border-white/50"
              />
            ) : (
              <div
                className="text-sm font-semibold tracking-wide text-white truncate cursor-text"
                title={category.name}
              >
                {category.name}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={async () => {
            const confirmed = await customConfirm(
              t('Delete category "{{name}}" and all its icons?', {
                name: category.name,
              }),
            );
            if (confirmed) {
              setSettings((prev: any) => {
                const newIcons = [...(prev.icons || [])];
                newIcons.splice(catIndex, 1);
                return { ...prev, icons: newIcons };
              });
            }
          }}
          className="text-white/30 hover:text-white transition-colors p-1 shrink-0"
          title={t("Delete Category")}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {isExpanded && (
        <div
          className="flex flex-wrap gap-2 items-center p-3 bg-black"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex flex-wrap gap-2 items-center">
            {category.icons?.map((iconObj: any, index: number) => (
              <div
                key={iconObj.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", index.toString());
                  e.currentTarget.style.opacity = "0.5";
                }}
                onDragEnd={(e) => {
                  e.currentTarget.style.opacity = "1";
                }}
                onDragOver={(e) => {
                  e.preventDefault(); // Necessary to allow dropping
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const fromIndex = parseInt(
                    e.dataTransfer.getData("text/plain"),
                    10,
                  );
                  const toIndex = index;
                  if (fromIndex === toIndex || isNaN(fromIndex)) return;

                  setSettings((prev: any) => {
                    const newCategories = [...(prev.icons || [])];
                    const newIcons = [...(category.icons || [])];
                    const [movedItem] = newIcons.splice(fromIndex, 1);
                    newIcons.splice(toIndex, 0, movedItem);
                    newCategories[catIndex] = { ...category, icons: newIcons };
                    return { ...prev, icons: newCategories };
                  });
                }}
                className="w-10 h-10 relative group cursor-grab active:cursor-grabbing flex items-center justify-center bg-black text-white shrink-0"
              >
                <div
                  className="w-full h-full p-2 icon-svg-wrapper pointer-events-none"
                  dangerouslySetInnerHTML={{ __html: iconObj.svg }}
                />
                <button
                  onClick={() => {
                    setSettings((prev: any) => {
                      const newCategories = [...(prev.icons || [])];
                      newCategories[catIndex] = {
                        ...category,
                        icons: category.icons.filter(
                          (i: any) => i.id !== iconObj.id,
                        ),
                      };
                      return { ...prev, icons: newCategories };
                    });
                  }}
                  className="absolute inset-0 bg-white text-black hidden group-hover:flex items-center justify-center text-xs font-bold transition-opacity"
                  title={t("Remove icon")}
                >
                  ×
                </button>
              </div>
            ))}

            <label
              className="w-10 h-10 border border-white flex items-center justify-center bg-black text-white hover:bg-white hover:text-black transition-colors shrink-0 cursor-pointer"
              title={t("Upload SVG Icon to this Category")}
            >
              +
              <input
                type="file"
                accept=".svg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    const text = event.target?.result as string;
                    if (text.includes("<svg")) {
                      const newIcon = { id: `icon-${Date.now()}`, svg: text };
                      setSettings((prev: any) => {
                        const newCategories = [...(prev.icons || [])];
                        newCategories[catIndex] = {
                          ...category,
                          icons: [...(category.icons || []), newIcon],
                        };
                        return { ...prev, icons: newCategories };
                      });
                    }
                  };
                  reader.readAsText(file);
                }}
              />
            </label>
          </div>
        </div>
      )}
    </Reorder.Item>
  );
};

interface LayerSidebarProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  annotations?: any[];
  currentShow?: string | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  activeGeojsonLayerId: string | null;
  setActiveGeojsonLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedGeojsonFeatureId: string | number | null;
  onSave?: () => void;
  onSaveAndExit?: () => void;
  onExport?: () => void;
  isSaving?: boolean;
}

export function LayerSidebar({
  settings,
  setSettings,
  annotations,
  currentShow,
  isOpen,
  setIsOpen,
  activeGeojsonLayerId,
  setActiveGeojsonLayerId,
  selectedGeojsonFeatureId,
  onSave,
  onSaveAndExit,
  onExport,
  isSaving,
}: LayerSidebarProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "layers" | "icons" | "labels" | "basemap" | "video"
  >("layers");
  const [activeLabelTab, setActiveLabelTab] = useState<"regular" | "highlight">(
    "regular",
  );
  const [isDraggingLayer, setIsDraggingLayer] = useState(false);
  const [showPresetLayers, setShowPresetLayers] = useState(false);
  const [selectedAircraftId, setSelectedAircraftId] = useState<string | null>(
    null,
  );
  const [selectedVesselMmsi, setSelectedVesselMmsi] = useState<string | null>(
    null,
  );
  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({});
  const [expandedLabelSettings, setExpandedLabelSettings] = useState<
    Record<string, boolean>
  >({});

  const [basemaps, setBasemaps] = useState<BaseMapStyle[]>([]);
  const basemapFileInputRef = useRef<HTMLInputElement>(null);
  const [isGeneratingScreenshotId, setIsGeneratingScreenshotId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api.php?action=list_basemaps')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setBasemaps(data);
      })
      .catch(console.error);
  }, []);

  // Video Export State
  const [videoFormat, setVideoFormat] = useState<"16x9" | "9x16" | "both">(
    "16x9",
  );
  const [videoFileType, setVideoFileType] = useState<"mp4" | "jsx" | "both">(
    "mp4",
  );
  const [videoDuration, setVideoDuration] = useState<number>(3);

  const [videoBitrate, setVideoBitrate] = useState<number>(15);

  useEffect(() => {
    const handler = (e: CustomEvent<string | null>) =>
      setSelectedAircraftId(e.detail);
    window.addEventListener("aircraftSelected", handler as EventListener);

    const vesselHandler = (e: CustomEvent<string | null>) =>
      setSelectedVesselMmsi(e.detail);
    window.addEventListener("vesselSelected", vesselHandler as EventListener);

    return () => {
      window.removeEventListener("aircraftSelected", handler as EventListener);
      window.removeEventListener(
        "vesselSelected",
        vesselHandler as EventListener,
      );
    };
  }, []);


  // Fetch available templates
  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((list) => {
        if (!Array.isArray(list)) list = [];
        setSettings((prev) => ({
          ...prev,
          labelTemplates: {
            ...prev.labelTemplates,
            availableTemplates: list,
          },
        }));
      })
      .catch((e) => console.error("Error fetching templates", e));
  }, [setSettings]);

  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload-template", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        customAlert(t("Template uploaded successfully"));
        fetch("/api/templates")
          .then((r) => r.json())
          .then((list) => {
            setSettings((prev) => ({
              ...prev,
              labelTemplates: {
                ...prev.labelTemplates,
                availableTemplates: list,
                hiddenTemplates: (
                  prev.labelTemplates?.hiddenTemplates || []
                ).filter((id) => id !== data.name),
              },
            }));
          });
      } else {
        customAlert(t("Upload failed") + ": " + data.error);
      }
    } catch (err) {
      console.error(err);
      customAlert(t("Error uploading template"));
    }
  };

  const saveAsPreset = (layerToSave: MapLayer) => {
    const newPreset: MapLayer = {
      ...layerToSave,
      id: `${layerToSave.id}_preset_${Date.now()}`,
      visible: false,
      _isDirty: undefined,
    };
    setSettings((prev) => ({
      ...prev,
      presetLayers: [...(prev.presetLayers || []), newPreset],
    }));
    customAlert(t("Layer saved as preset successfully!"));
  };

  const toggleDefaultLayer = (defaultLayer: MapLayer) => {
    const exists = settings.layers.some((l) => l.id === defaultLayer.id);
    if (exists) {
      setSettings((prev) => ({
        ...prev,
        layers: prev.layers.filter((l) => l.id !== defaultLayer.id),
        _isDirty: true,
      }));
    } else {
      setSettings((prev) => ({
        ...prev,
        layers: [...prev.layers, { ...defaultLayer, visible: true }],
        _isDirty: true,
      }));
    }
  };

  const [addingColor, setAddingColor] = useState(false);
  const [newColorHex, setNewColorHex] = useState("#000000");

  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragItem.current = index;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
  };

  const handleColorDragEnd = () => {
    const fromIndex = dragItem.current;
    const toIndex = dragOverItem.current;

    if (fromIndex !== null && toIndex !== null && fromIndex !== toIndex) {
      setSettings((prev) => {
        const newColors = [...prev.colorPalette];
        const draggedColor = newColors[fromIndex];
        newColors.splice(fromIndex, 1);
        newColors.splice(toIndex, 0, draggedColor);
        return { ...prev, colorPalette: newColors };
      });
    }
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const confirmAddColor = async () => {
    if (/^#[0-9A-F]{6}$/i.test(newColorHex)) {
      setSettings((prev) => ({
        ...prev,
        colorPalette: [...prev.colorPalette, newColorHex.toUpperCase()],
      }));
      setAddingColor(false);
    } else {
      await customAlert(t("Invalid hex color format. Use #RRGGBB"));
    }
  };

  const removeColor = (color: string) => {
    setSettings((prev) => ({
      ...prev,
      colorPalette: prev.colorPalette.filter((c) => c !== color),
    }));
  };

  const refreshBasemaps = async () => {
    try {
      const res = await fetch('/api.php?action=list_basemaps');
      const data = await res.json();
      if (Array.isArray(data)) setBasemaps(data);
    } catch (e) { console.error(e); }
  };

  const handleAddBasemapUrl = async () => {
    const url = await customPrompt(t("Enter Map Style URL:"));
    if (!url) return;
    const name = await customPrompt(t("Enter a name for this style:")) || "Custom Style";
    const id = `basemap_${Date.now()}`;
    await fetch('/api.php?action=save_basemap', {
      method: 'POST',
      body: JSON.stringify({ id, name, url })
    });
    refreshBasemaps();
  };

  const handleUploadBasemapJson = () => {
    if (basemapFileInputRef.current) {
      basemapFileInputRef.current.accept = ".json";
      basemapFileInputRef.current.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        let text = await file.text();
        try {
          if (text.includes("get_your_own_OpIi9ZULNHzrESv6T2vL")) {
            const apiKey = await customPrompt(t("This map style requires a MapTiler API key. Please enter your API key:"));
            if (apiKey) {
              text = text.replace(/get_your_own_OpIi9ZULNHzrESv6T2vL/g, apiKey);
            } else {
              customAlert(t("Without a valid API key, this map style will not load correctly."));
            }
          }

          JSON.parse(text);
          const name = await customPrompt(t("Enter a name for this style:")) || file.name;
          const id = `basemap_${Date.now()}`;
          const url = `/api.php?action=basemap_style&id=${id}`;
          await fetch('/api.php?action=save_basemap', {
            method: 'POST',
            body: JSON.stringify({ id, name, url, styleData: text })
          });
          refreshBasemaps();
        } catch (err) {
          customAlert(t("Invalid JSON file"));
        }
        e.target.value = '';
      };
      basemapFileInputRef.current.click();
    }
  };

  const handleUploadBasemapPreview = (id: string) => {
    if (basemapFileInputRef.current) {
      basemapFileInputRef.current.accept = "image/png, image/jpeg";
      basemapFileInputRef.current.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          const previewData = reader.result as string;
          const bm = basemaps.find(b => b.id === id);
          if (bm) {
            await fetch('/api.php?action=save_basemap', {
              method: 'POST',
              body: JSON.stringify({ ...bm, previewData })
            });
            refreshBasemaps();
          }
        };
        reader.readAsDataURL(file);
        e.target.value = '';
      };
      basemapFileInputRef.current.click();
    }
  };

  const handleDeleteBasemap = async (id: string) => {
    if (await customConfirm(t("Are you sure you want to delete this custom base map?"))) {
      await fetch(`/api.php?action=delete_basemap&id=${id}`, { method: 'POST' });
      refreshBasemaps();
    }
  };

  const handleGenerateBasemapPreview = (bm: BaseMapStyle) => {
    setIsGeneratingScreenshotId(bm.id);
  };

  const updateLayerRecursively = (
    layers: MapLayer[],
    targetId: string,
    updater: (l: MapLayer) => MapLayer,
  ): MapLayer[] => {
    return layers.map((layer) => {
      if (layer.id === targetId) return updater(layer);
      if (layer.type === "split" && layer.splitLayers) {
        return {
          ...layer,
          splitLayers: updateLayerRecursively(
            layer.splitLayers,
            targetId,
            updater,
          ),
        };
      }
      return layer;
    });
  };

  const toggleLayerVisibility = (id: string) => {
    setSettings((prev) => {
      let newVisibility = false;
      const checkLayer = (layers: MapLayer[]) => {
        for (const l of layers) {
          if (l.id === id) {
            newVisibility = !l.visible;
          }
          if (l.splitLayers) checkLayer(l.splitLayers);
        }
      };
      checkLayer(prev.layers);

      return {
        ...prev,
        layers: updateLayerRecursively(prev.layers, id, (l) => {
          if (l.type === "split" && l.splitLayers) {
            return {
              ...l,
              visible: newVisibility,
              splitLayers: l.splitLayers.map((sl) => ({
                ...sl,
                visible: newVisibility,
              })),
            };
          }
          return { ...l, visible: newVisibility };
        }),
      };
    });
  };

  const removeLayer = (id: string) => {
    setSettings((prev) => ({
      ...prev,
      layers: prev.layers.filter((l) => l.id !== id),
    }));
  };

  const renameLayer = (id: string, newName: string) => {
    setSettings((prev) => ({
      ...prev,
      layers: updateLayerRecursively(prev.layers, id, (l) => ({
        ...l,
        name: newName,
      })),
    }));
  };

  const duplicateLayer = (id: string) => {
    setSettings((prev) => {
      let layerToDuplicate: MapLayer | undefined;
      let parentSplitId: string | undefined;

      const findLayer = (layers: MapLayer[], parentId?: string) => {
        for (const l of layers) {
          if (l.id === id) {
            layerToDuplicate = l;
            parentSplitId = parentId;
          } else if (l.type === "split" && l.splitLayers) {
            findLayer(l.splitLayers, l.id);
          }
        }
      };
      findLayer(prev.layers);

      if (!layerToDuplicate) return prev;

      const newLayer: MapLayer = {
        ...layerToDuplicate,
        id: `${layerToDuplicate.type}-${Date.now()}`,
        name: `${layerToDuplicate.name} (Copy)`,
        _isDirty: true,
        customLayer: layerToDuplicate.customLayer || layerToDuplicate.id.startsWith("upload-") || layerToDuplicate.id.startsWith("url-") || undefined,
      };

      if (parentSplitId) {
        const splitContainer = prev.layers.find((l) => l.id === parentSplitId);
        if (
          splitContainer &&
          splitContainer.splitLayers &&
          splitContainer.splitLayers.length < 2
        ) {
          return {
            ...prev,
            layers: prev.layers.map((l) => {
              if (l.id === parentSplitId) {
                return {
                  ...l,
                  splitLayers: [...(l.splitLayers || []), newLayer],
                };
              }
              return l;
            }),
          };
        }
      }

      // Add to top of stack
      return { ...prev, layers: [newLayer, ...prev.layers] };
    });
  };

  const flatLayers = React.useMemo(() => {
    return settings.layers;
  }, [settings.layers]);

  const handleReorder = (newLayers: MapLayer[]) => {
    setSettings((prev) => ({ ...prev, layers: newLayers }));
  };

  const handleDragEnd = (
    e: MouseEvent | TouchEvent | PointerEvent,
    layerId: string,
  ) => {
    let clientX = 0;
    let clientY = 0;
    if ("touches" in e) {
      clientX = (e as TouchEvent).changedTouches[0].clientX;
      clientY = (e as TouchEvent).changedTouches[0].clientY;
    } else {
      clientX = (e as MouseEvent).clientX;
      clientY = (e as MouseEvent).clientY;
    }

    const elements = document.elementsFromPoint(clientX, clientY);
    const dropZone = elements.find(
      (el) =>
        el.hasAttribute("data-drop-zone") &&
        el.getAttribute("data-layer-id") !== layerId,
    );

    if (dropZone) {
      const zoneId = dropZone.getAttribute("data-drop-zone");
      setSettings((prev) => {
        let isCurrentlyNested = false;
        let layerToMove: MapLayer | null = null;

        for (const l of prev.layers) {
          if (l.id === layerId) layerToMove = l;
          if (l.type === "split" && l.splitLayers) {
            for (const sl of l.splitLayers) {
              if (sl.id === layerId) {
                layerToMove = sl;
                isCurrentlyNested = true;
              }
            }
          }
        }

        if (!layerToMove || layerToMove.type === "split") return prev;

        if (zoneId === "split-container" && !isCurrentlyNested) {
          const splitContainer = prev.layers.find((l) => l.type === "split");
          if (
            splitContainer &&
            (!splitContainer.splitLayers ||
              splitContainer.splitLayers.length < 2)
          ) {
            const currentSplitLayers = splitContainer.splitLayers || [];
            const newLayers = prev.layers.filter((l) => l.id !== layerId);
            const newSplit = {
              ...splitContainer,
              splitLayers: [...currentSplitLayers, layerToMove],
            };
            return {
              ...prev,
              layers: newLayers.map((l) =>
                l.id === splitContainer.id ? newSplit : l,
              ),
            };
          }
        } else if (zoneId === "root" && isCurrentlyNested) {
          const splitContainer = prev.layers.find((l) => l.type === "split");
          if (splitContainer && splitContainer.splitLayers) {
            const newSplitLayers = splitContainer.splitLayers.filter(
              (sl) => sl.id !== layerId,
            );
            const newSplit = { ...splitContainer, splitLayers: newSplitLayers };

            const splitIndex = prev.layers.findIndex(
              (l) => l.id === splitContainer.id,
            );
            const newLayers = [...prev.layers];
            newLayers[splitIndex] = newSplit;
            newLayers.splice(splitIndex + 1, 0, layerToMove);

            return { ...prev, layers: newLayers };
          }
        }

        return prev;
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const geojson = await parseMapFileWithIds(file);
      const newLayer: MapLayer = {
        id: `upload-${Date.now()}`,
        name: file.name,
        type: "geojson",
        visible: true,
        data: geojson,
        _isDirty: true,
        customLayer: true,
      };
      setSettings((prev) => ({ ...prev, layers: [newLayer, ...prev.layers] }));
    } catch (err) {
      await customAlert(t("Error parsing file: ") + (err as Error).message);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAddUrl = () => {
    let inputUrl = urlInput.trim();
    if (!inputUrl) return;

    if (!inputUrl.startsWith("http")) {
      inputUrl = "https://" + inputUrl;
    }

    try {
      if (inputUrl.toLowerCase().includes("wms")) {
        const urlObj = new URL(inputUrl);
        urlObj.searchParams.set("bbox", "{bbox-epsg-3857}");
        if (!urlObj.searchParams.has("width"))
          urlObj.searchParams.set("width", "256");
        if (!urlObj.searchParams.has("height"))
          urlObj.searchParams.set("height", "256");
        if (
          !urlObj.searchParams.has("srs") &&
          !urlObj.searchParams.has("crs")
        ) {
          urlObj.searchParams.set("srs", "EPSG:3857");
          urlObj.searchParams.set("crs", "EPSG:3857");
        }
        if (!urlObj.searchParams.has("transparent"))
          urlObj.searchParams.set("transparent", "true");
        if (!urlObj.searchParams.has("format"))
          urlObj.searchParams.set("format", "image/png");
        if (!urlObj.searchParams.has("styles"))
          urlObj.searchParams.set("styles", "");

        // Ensure mandatory WMS parameters are present
        if (
          !urlObj.searchParams.has("version") &&
          !urlObj.searchParams.has("VERSION")
        ) {
          urlObj.searchParams.set("version", "1.1.1");
        }
        if (
          !urlObj.searchParams.has("request") &&
          !urlObj.searchParams.has("REQUEST")
        ) {
          urlObj.searchParams.set("request", "GetMap");
        }
        if (
          !urlObj.searchParams.has("service") &&
          !urlObj.searchParams.has("SERVICE")
        ) {
          urlObj.searchParams.set("service", "WMS");
        }

        if (inputUrl.toLowerCase().includes("copernicus.eu")) {
          urlObj.searchParams.set("time", "{date-start}/{date-end}");
        }

        inputUrl = urlObj.toString().replace(/%7B/g, "{").replace(/%7D/g, "}");
      }
    } catch (e) {
      // Ignore parsing errors and proceed
    }

    const newLayer: MapLayer = {
      id: `url-${Date.now()}`,
      name: inputUrl.toLowerCase().includes("wms")
        ? "Custom WMS"
        : "Custom WMTS/XYZ",
      type: "raster",
      visible: true,
      url: inputUrl,
      _isDirty: true,
      customLayer: true,
    };
    setSettings((prev) => ({ ...prev, layers: [newLayer, ...prev.layers] }));
    setUrlInput("");
    setShowUrlInput(false);
  };

  return (
    <div
      className={`absolute top-0 left-0 h-full w-80 bg-[#18181b] border-r border-white/10 flex flex-col shadow-2xl z-40 text-white transition-transform duration-300 ease-in-out ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
    >
      <div className="p-4 flex justify-start items-center bg-black/20">
        <button
          onClick={onSaveAndExit || (() => setIsOpen(false))}
          className="text-white/50 hover:text-white transition-colors"
          title={onSaveAndExit ? t("Save & Exit to Overview") : t("Close")}
        >
          <Home size={18} />
        </button>
      </div>

      <div className="p-3">
        <div className="flex border border-white/20 rounded-full p-1 relative bg-transparent text-xs font-semibold tracking-wider">
          <button
            onClick={() => setActiveTab("layers")}
            className={`flex-1 py-2 flex items-center justify-center relative z-10 transition-colors ${activeTab === "layers" ? "text-black" : "text-white/50 hover:text-white/80"}`}
            title={t("Layers")}
          >
            {activeTab === "layers" && (
              <motion.div
                layoutId="tab-active-bg"
                className="absolute inset-0 bg-white rounded-full -z-10"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <Layers size={18} />
          </button>
          <button
            onClick={() => setActiveTab("icons")}
            className={`flex-1 py-2 flex items-center justify-center relative z-10 transition-colors ${activeTab === "icons" ? "text-black" : "text-white/50 hover:text-white/80"}`}
            title={t("Icon Library")}
          >
            {activeTab === "icons" && (
              <motion.div
                layoutId="tab-active-bg"
                className="absolute inset-0 bg-white rounded-full -z-10"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <ImageIcon size={18} />
          </button>
          <button
            onClick={() => setActiveTab("labels")}
            className={`flex-1 py-2 flex items-center justify-center relative z-10 transition-colors ${activeTab === "labels" ? "text-black" : "text-white/50 hover:text-white/80"}`}
            title={t("Label Templates")}
          >
            {activeTab === "labels" && (
              <motion.div
                layoutId="tab-active-bg"
                className="absolute inset-0 bg-white rounded-full -z-10"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <Tag size={18} />
          </button>
          <button
            onClick={() => setActiveTab("basemap")}
            className={`flex-1 py-2 flex items-center justify-center relative z-10 transition-colors ${activeTab === "basemap" ? "text-black" : "text-white/50 hover:text-white/80"}`}
            title={t("Base Map & Settings")}
          >
            {activeTab === "basemap" && (
              <motion.div
                layoutId="tab-active-bg"
                className="absolute inset-0 bg-white rounded-full -z-10"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <Settings size={18} />
          </button>
          <button
            onClick={() => setActiveTab("video")}
            className={`flex-1 py-2 flex items-center justify-center relative z-10 transition-colors ${activeTab === "video" ? "text-black" : "text-white/50 hover:text-white/80"}`}
            title={t("Export Video")}
          >
            {activeTab === "video" && (
              <motion.div
                layoutId="tab-active-bg"
                className="absolute inset-0 bg-white rounded-full -z-10"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <Video size={18} />
          </button>
          {onSave && <div className="w-[1px] bg-white/20 mx-1 my-1" />}
          {onSave && (
            <button
              onClick={onSave}
              disabled={isSaving}
              className={`w-12 flex items-center justify-center transition-colors rounded-full shrink-0 ${isSaving ? "text-white cursor-wait bg-white/5" : "text-white/50 hover:bg-white/10 hover:text-white"}`}
              title={t("Save Map & Settings")}
            >
              {isSaving ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <Save size={18} />
              )}
            </button>
          )}
        </div>
      </div>

      {activeTab === "layers" ? (
        <>
          <div className="p-4 border-b border-white/10">
            <label className="text-xs text-white mb-2 block font-semibold tracking-wider">
              {t("LABEL DENSITY")} ({settings.labelDensity ?? 50}%)
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/50 w-8 text-right">0%</span>
              <div className="relative flex-1 flex flex-col justify-center h-8">
                <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex justify-between px-2 pointer-events-none">
                  {[...Array(11)].map((_, i) => (
                    <div key={i} className="w-[1px] h-2.5 bg-white/30" />
                  ))}
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.labelDensity ?? 50}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      labelDensity: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer relative z-10"
                />
              </div>
              <span className="text-xs text-white/50 w-8">100%</span>
            </div>
          </div>

          <div className="flex-1 overflow-hidden relative flex flex-col">
            <div
              data-drop-zone="root"
              className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-2"
            >
              <label className="text-xs text-white mb-1 block font-semibold tracking-wider">
                {t("LAYER STACK")}
              </label>
              <Reorder.Group
                axis="y"
                values={flatLayers}
                onReorder={handleReorder}
                className="flex flex-col gap-2"
              >
                {flatLayers.map((layer) => {
                  return (
                    <LayerItem
                      key={layer.id}
                      layer={layer}
                      isNestedChild={false}
                      isDraggingLayer={isDraggingLayer}
                      setIsDraggingLayer={setIsDraggingLayer}
                      handleDragEnd={handleDragEnd}
                      selectedAircraftId={selectedAircraftId}
                      selectedVesselMmsi={selectedVesselMmsi}
                      toggleVisibility={toggleLayerVisibility}
                      removeLayer={removeLayer}
                      renameLayer={renameLayer}
                      colorPalette={settings.colorPalette}
                      activeGeojsonLayerId={activeGeojsonLayerId}
                      setActiveGeojsonLayerId={setActiveGeojsonLayerId}
                      selectedFeatureId={selectedGeojsonFeatureId}
                      saveAsPreset={saveAsPreset}
                      updateLayerStyle={(layerId, featureId, styleChanges) => {
                        setSettings((prev) => ({
                          ...prev,
                          layers: updateLayerRecursively(
                            prev.layers,
                            layerId,
                            (l) => {
                              if (!l.data || !l.data.features) return l;
                              const newData = {
                                ...l.data,
                                features: l.data.features.map((f: any) => {
                                  if (
                                    featureId === null ||
                                    f.properties?.id === featureId
                                  ) {
                                    return {
                                      ...f,
                                      properties: {
                                        ...f.properties,
                                        ...styleChanges,
                                      },
                                    };
                                  }
                                  return f;
                                }),
                              };
                              return { ...l, data: newData, _isDirty: true };
                            },
                          ),
                        }));
                      }}
                      updateLayerProperty={(layerId, property, value) => {
                        setSettings((prev) => ({
                          ...prev,
                          layers: updateLayerRecursively(
                            prev.layers,
                            layerId,
                            (l) => ({
                              ...l,
                              [property]: value,
                              _isDirty: true,
                            }),
                          ),
                        }));
                      }}
                      updateLayerDates={(layerId, startDate, endDate) => {
                        setSettings((prev) => ({
                          ...prev,
                          layers: updateLayerRecursively(
                            prev.layers,
                            layerId,
                            (l) => {
                              const newName =
                                l.type === "deepstate" &&
                                (l.name === "DeepStateMap Overlay" ||
                                  l.name === "DeepStateMap" ||
                                  l.name.startsWith("DSM ") ||
                                  l.name.startsWith("UKRAINE "))
                                  ? `UKRAINE ${(startDate || new Date().toISOString().split("T")[0]).split("-").reverse().join(".")}`
                                  : l.name;
                              return {
                                ...l,
                                startDate,
                                endDate,
                                name: newName,
                                isLive: false,
                                _isDirty: true,
                              };
                            },
                          ),
                        }));
                      }}
                      toggleLive={(layerId) => {
                        setSettings((prev) => ({
                          ...prev,
                          layers: updateLayerRecursively(
                            prev.layers,
                            layerId,
                            (l) => {
                              if (l.type !== "deepstate") return l;
                              const isCurrentlyLive = !!l.isLive;
                              const newName = !isCurrentlyLive
                                ? "UKRAINE CURRENT"
                                : `UKRAINE ${(l.startDate || new Date().toISOString().split("T")[0]).split("-").reverse().join(".")}`;
                              return {
                                ...l,
                                isLive: !isCurrentlyLive,
                                name: newName,
                                _isDirty: true,
                              };
                            },
                          ),
                        }));
                      }}
                      duplicateLayer={duplicateLayer}
                    />
                  );
                })}
              </Reorder.Group>
            </div>

            <AnimatePresence>
              {showPresetLayers && (
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 25, stiffness: 200 }}
                  className="absolute inset-0 z-50 flex flex-col p-4 custom-scrollbar overflow-y-auto"
                  style={{ backgroundColor: "#18181b" }}
                >
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/10">
                    <label className="text-xs text-white font-semibold tracking-wider flex items-center gap-2">
                      <Layers size={14} /> {t("PRESET LAYERS")}
                    </label>
                    <button
                      onClick={() => setShowPresetLayers(false)}
                      className="text-white/50 hover:text-white transition-colors bg-white/5 hover:bg-white/10 rounded-full p-1.5"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {[...DEFAULT_LAYERS, ...(settings.presetLayers || [])].map(
                      (layer) => {
                        const isEnabled = settings.layers.some(
                          (l) => l.id === layer.id,
                        );
                        return (
                          <div
                            key={layer.id}
                            className="flex items-center justify-between px-2 py-2"
                          >
                            <span className="text-sm font-medium text-white">
                              {t(layer.name)}
                            </span>
                            <button
                              onClick={() => toggleDefaultLayer(layer)}
                              className={`w-9 h-5 rounded-full relative transition-colors ${isEnabled ? "bg-white" : "bg-white/20"}`}
                            >
                              <div
                                className={`w-3 h-3 rounded-full absolute top-1 transition-all ${isEnabled ? "left-5 bg-black" : "left-1 bg-white"}`}
                              />
                            </button>
                          </div>
                        );
                      },
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="p-4 border-t border-white/10 flex flex-col gap-3 relative z-30">
            <button
              onClick={() => setShowPresetLayers((prev) => !prev)}
              className="w-full py-2 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-sm transition-colors rounded-full"
            >
              <Layers size={16} /> {t("Preset layers")}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-sm transition-colors rounded-full"
            >
              <Upload size={16} /> {t("Upload GeoJSON/KML/KMZ")}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".json,.geojson,.kml,.kmz"
              className="hidden"
            />

            {showUrlInput ? (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder={t("WMTS/WMS URL...")}
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 px-3 py-2 text-sm outline-none focus:border-white/30"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddUrl}
                    className="flex-1 py-1 bg-white text-black text-sm font-semibold hover:bg-white/90 rounded-full"
                  >
                    {t("Add")}
                  </button>
                  <button
                    onClick={() => setShowUrlInput(false)}
                    className="px-3 py-1 bg-white/10 hover:bg-white/20 text-sm rounded-full"
                  >
                    {t("Cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowUrlInput(true)}
                className="w-full py-2 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-sm transition-colors rounded-full"
              >
                <Link size={16} /> {t("Add WMTS/WMS URL")}
              </button>
            )}
          </div>
        </>
      ) : activeTab === "icons" ? (
        <>
          <div className="p-4 pb-2 border-b border-white/20">
            <div className="text-xs font-semibold tracking-wider text-white">
              {t("ICON SETS")}
            </div>
          </div>

          <div className="p-4 flex flex-col flex-1 overflow-y-auto custom-scrollbar">
            <Reorder.Group
              axis="y"
              values={settings.icons || []}
              onReorder={(newCategories) =>
                setSettings((prev) => ({ ...prev, icons: newCategories }))
              }
              className="flex flex-col gap-4"
            >
              {settings.icons?.map((category, catIndex) => (
                <CategoryItem
                  key={category.id}
                  category={category}
                  catIndex={catIndex}
                  expandedCategories={expandedCategories}
                  setExpandedCategories={setExpandedCategories}
                  setSettings={setSettings}
                />
              ))}
            </Reorder.Group>
          </div>

          <div className="p-4 border-t border-white/10 flex flex-col gap-3">
            <button
              onClick={() => {
                setSettings((prev) => ({
                  ...prev,
                  icons: [
                    ...(prev.icons || []),
                    {
                      id: `cat-${Date.now()}`,
                      name: t("New Icon Set"),
                      icons: [],
                    },
                  ],
                }));
              }}
              className="w-full py-2 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-sm transition-colors rounded-full"
            >
              + {t("New Icon Set")}
            </button>

            <label className="w-full py-2 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-sm transition-colors cursor-pointer rounded-full">
              <Upload size={16} /> {t("Upload Icon Set")}
              <input
                type="file"
                accept=".svg"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = e.target.files;
                  if (!files || files.length === 0) return;

                  const catName = await customPrompt(
                    t(
                      `Enter a name for the new category containing {{count}} icons:`,
                      { count: files.length },
                    ),
                    t("New Category"),
                  );
                  if (!catName) {
                    e.target.value = "";
                    return;
                  }

                  const newIcons: { id: string; svg: string }[] = [];
                  for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const text = await new Promise<string>((resolve) => {
                      const reader = new FileReader();
                      reader.onload = (event) =>
                        resolve(event.target?.result as string);
                      reader.readAsText(file);
                    });
                    if (text.includes("<svg")) {
                      newIcons.push({
                        id: `icon-${Date.now()}-${i}`,
                        svg: text,
                      });
                    }
                  }

                  if (newIcons.length > 0) {
                    setSettings((prev) => ({
                      ...prev,
                      icons: [
                        ...(prev.icons || []),
                        {
                          id: `cat-${Date.now()}`,
                          name: catName,
                          icons: newIcons,
                        },
                      ],
                    }));
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </>
      ) : activeTab === "labels" ? (
        <>
          <div className="p-4 pb-2 border-b border-white/20">
            <div className="text-xs font-semibold tracking-wider text-white">
              {t("LABEL TEMPLATES")}
            </div>
          </div>

          <div className="p-4 flex flex-col gap-6 flex-1 overflow-y-auto custom-scrollbar">
            <div className="flex border border-white/20 rounded-full p-1 relative bg-transparent">
              <button
                onClick={() => setActiveLabelTab("regular")}
                className={`flex-1 px-4 py-2 text-sm relative z-10 transition-colors ${
                  activeLabelTab === "regular"
                    ? "text-black"
                    : "text-white/60 hover:text-white/80"
                }`}
              >
                {activeLabelTab === "regular" && (
                  <motion.div
                    layoutId="labeltab-active-bg"
                    className="absolute inset-0 bg-white rounded-full -z-10"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                {t("Label")}
              </button>
              <button
                onClick={() => setActiveLabelTab("highlight")}
                className={`flex-1 px-4 py-2 text-sm relative z-10 transition-colors ${
                  activeLabelTab === "highlight"
                    ? "text-black"
                    : "text-white/60 hover:text-white/80"
                }`}
              >
                {activeLabelTab === "highlight" && (
                  <motion.div
                    layoutId="labeltab-active-bg"
                    className="absolute inset-0 bg-white rounded-full -z-10"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                {t("Highlight")}
              </button>
            </div>

            <div>
              <label className="text-[10px] text-white mb-2 block font-semibold tracking-wider">
                {t("AVAILABLE TEMPLATES")}
              </label>
              <div className="flex flex-col gap-3">
                {(() => {
                  const currentTemplate =
                    activeLabelTab === "regular"
                      ? settings.labelTemplates?.regularLabelTemplate
                      : settings.labelTemplates?.highlightLabelTemplate;
                  const availableRaw = Array.isArray(
                    settings.labelTemplates?.availableTemplates,
                  )
                    ? settings.labelTemplates.availableTemplates
                    : [];
                  const variations = settings.labelTemplates?.variations || [];

                  // Normalize availableTemplates and filter by activeLabelTab and hiddenTemplates
                  const hidden = settings.labelTemplates?.hiddenTemplates || [];
                  const available = availableRaw
                    .map((t) =>
                      typeof t === "string" ? { id: t, kind: "regular" } : t,
                    )
                    .filter(
                      (t) =>
                        (t.kind === activeLabelTab || t.kind === "both") &&
                        !hidden.includes(t.id),
                    );

                  const allItems = [
                    {
                      id: "",
                      baseTemplate: "",
                      name: "Default (HTML)",
                      isVariation: false,
                    },
                    ...available.map((t) => ({
                      id: t.id,
                      baseTemplate: t.id,
                      name: t.id,
                      isVariation: false,
                    })),
                    ...variations
                      .filter((v) =>
                        available.some((a) => a.id === v.baseTemplate),
                      )
                      .map((v) => ({ ...v, isVariation: true })),
                  ];

                  const sorted = allItems.sort((a, b) => {
                    const isACurrent =
                      a.id === currentTemplate || (!a.id && !currentTemplate);
                    const isBCurrent =
                      b.id === currentTemplate || (!b.id && !currentTemplate);
                    if (isACurrent && !isBCurrent) return -1;
                    if (!isACurrent && isBCurrent) return 1;
                    return a.name.localeCompare(b.name);
                  });

                  return sorted.map((item) => {
                    const tName = item.baseTemplate;
                    const isSelected =
                      item.id === currentTemplate ||
                      (!item.id && !currentTemplate);
                    const isExpanded =
                      expandedLabelSettings[item.id || "default"];
                    const tplDefForTheme = settings.labelTemplates?.availableTemplates?.find((t: any) => t.id === item.baseTemplate);
                    const manForTheme = (tplDefForTheme as any)?.manifest || globalLabelManager.templates.get(item.baseTemplate)?.manifest;
                    const currentTheme = {
                      ...(settings.labelTemplates?.theme || {}),
                      ...(manForTheme?.primary?.color ? { primaryBackplateFill: manForTheme.primary.color } : {}),
                      ...(manForTheme?.primary?.pointer?.color ? { pointerFill: manForTheme.primary.pointer.color } : {}),
                      ...(manForTheme?.primary?.typography?.color ? { primaryTextColor: manForTheme.primary.typography.color } : {}),
                      ...(manForTheme?.secondary?.color ? { secondaryBackplateFill: manForTheme.secondary.color } : {}),
                      ...(manForTheme?.secondary?.typography?.color ? { secondaryTextColor: manForTheme.secondary.typography.color } : {}),
                      ...(settings.labelTemplates?.savedThemes?.[item.id] || {})
                    };

                    return (
                      <div
                        key={item.id || "default"}
                        className={`flex flex-col bg-zinc-900 border min-h-[64px] rounded overflow-hidden transition-colors ${
                          isSelected
                            ? "border-white"
                            : "border-white/10 hover:border-white/30"
                        }`}
                      >
                        <div
                          className="relative p-2 flex justify-center items-center cursor-pointer w-full"
                          onClick={() => {
                            const val = item.id === "" ? undefined : item.id;
                            const key =
                              activeLabelTab === "regular"
                                ? "regularLabelTemplate"
                                : "highlightLabelTemplate";
                            setSettings((prev) => ({
                              ...prev,
                              labelTemplates: {
                                ...prev.labelTemplates,
                                availableTemplates:
                                  prev.labelTemplates?.availableTemplates || [],
                                [key]: val,
                              },
                            }));
                            window.dispatchEvent(
                              new CustomEvent("updateSelectedLabelTemplate", {
                                detail: { type: activeLabelTab, template: val },
                              }),
                            );
                          }}
                        >
                          <TemplatePreview
                            templateName={item.baseTemplate}
                            isRegular={activeLabelTab === "regular"}
                            theme={currentTheme}
                          />
                          <div className="absolute top-2 right-2 flex gap-1">
                            {item.id !== "" && (
                              <button
                                className="p-1 rounded text-white/40 hover:text-white/80 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newId = `var-${Date.now()}`;
                                  setSettings((prev) => ({
                                    ...prev,
                                    labelTemplates: {
                                      ...prev.labelTemplates,
                                      availableTemplates:
                                        prev.labelTemplates
                                          ?.availableTemplates || [],
                                      variations: [
                                        ...(prev.labelTemplates?.variations ||
                                          []),
                                        {
                                          id: newId,
                                          baseTemplate: item.baseTemplate,
                                          name: `${item.name} (Copy)`,
                                        },
                                      ],
                                      savedThemes: {
                                        ...(prev.labelTemplates?.savedThemes ||
                                          {}),
                                        [newId]: { ...currentTheme },
                                      },
                                    },
                                  }));
                                }}
                                title={t("Duplicate")}
                              >
                                <Copy size={14} />
                              </button>
                            )}
                            {item.isVariation && (
                              <button
                                className="p-1 rounded text-white/40 hover:text-white/80 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSettings((prev) => {
                                    const newVars = (
                                      prev.labelTemplates?.variations || []
                                    ).filter((v) => v.id !== item.id);
                                    const newThemes = {
                                      ...(prev.labelTemplates?.savedThemes ||
                                        {}),
                                    };
                                    delete newThemes[item.id];
                                    return {
                                      ...prev,
                                      labelTemplates: {
                                        ...prev.labelTemplates,
                                        availableTemplates:
                                          prev.labelTemplates
                                            ?.availableTemplates || [],
                                        variations: newVars,
                                        savedThemes: newThemes,
                                      },
                                    };
                                  });
                                }}
                                title={t("Delete Variation")}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                            {!item.isVariation && item.id !== "" && (
                              <button
                                className="p-1 rounded text-white/40 hover:text-white/80 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSettings((prev) => ({
                                    ...prev,
                                    labelTemplates: {
                                      ...prev.labelTemplates,
                                      availableTemplates:
                                        prev.labelTemplates
                                          ?.availableTemplates || [],
                                      hiddenTemplates: [
                                        ...(prev.labelTemplates
                                          ?.hiddenTemplates || []),
                                        item.id,
                                      ],
                                    },
                                  }));
                                }}
                                title={t("Hide from Show")}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                            <button
                              className={`p-1 rounded transition-colors ${isExpanded ? "bg-white/20 text-white" : "text-white/40 hover:text-white/80"}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedLabelSettings((prev) => ({
                                  ...prev,
                                  [item.id || "default"]:
                                    !prev[item.id || "default"],
                                }));
                              }}
                              title={t("Settings")}
                            >
                              <Settings size={14} />
                            </button>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="p-3 pt-0 mt-2 border-t border-white/10 flex flex-wrap gap-2 items-start justify-center bg-black/20">
                            {tName === "" ? (
                              <input
                                type="color"
                                value={
                                  currentTheme.primaryBackplateFill || "#ffffff"
                                }
                                onChange={(e) => {
                                  const newColor = e.target.value;
                                  setSettings((prev) => ({
                                    ...prev,
                                    labelTemplates: {
                                      ...prev.labelTemplates,
                                      availableTemplates:
                                        prev.labelTemplates
                                          ?.availableTemplates || [],
                                      savedThemes: {
                                        ...(prev.labelTemplates?.savedThemes ||
                                          {}),
                                        [item.id]: {
                                          ...currentTheme,
                                          primaryBackplateFill: newColor,
                                        },
                                      },
                                    },
                                  }));
                                  if (isSelected)
                                    window.dispatchEvent(
                                      new CustomEvent(
                                        "updateSelectedLabelTheme",
                                        {
                                          detail: {
                                            key: "primaryBackplateFill",
                                            value: newColor,
                                          },
                                        },
                                      ),
                                    );
                                }}
                                className="w-6 h-6 mt-3 p-0 border-0 bg-transparent cursor-pointer rounded-full overflow-hidden [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-full"
                                title={t("Primary Fill")}
                              />
                            ) : (
                              (() => {
                                const updateColor = (
                                  key: keyof Theme,
                                  val: string,
                                ) => {
                                  setSettings((prev) => ({
                                    ...prev,
                                    labelTemplates: {
                                      ...prev.labelTemplates,
                                      availableTemplates:
                                        prev.labelTemplates
                                          ?.availableTemplates || [],
                                      savedThemes: {
                                        ...(prev.labelTemplates?.savedThemes ||
                                          {}),
                                        [item.id]: {
                                          ...currentTheme,
                                          [key]: val,
                                        },
                                      },
                                    },
                                  }));
                                  if (isSelected)
                                    window.dispatchEvent(
                                      new CustomEvent(
                                        "updateSelectedLabelTheme",
                                        { detail: { key, value: val } },
                                      ),
                                    );
                                };

                                // Look up the template manifest
                                const tplDef =
                                  settings.labelTemplates?.availableTemplates?.find(
                                    (t: any) => t.id === item.baseTemplate,
                                  );
                                const man = (tplDef as any)?.manifest || globalLabelManager.templates.get(item.baseTemplate)?.manifest;

                                // Determine current values or fallbacks from manifest
                                const primaryFill =
                                  currentTheme.primaryBackplateFill ||
                                  man?.primary?.color ||
                                  "#ffffff";
                                const primaryText =
                                  currentTheme.primaryTextColor ||
                                  man?.primary?.typography?.color ||
                                  "#000000";
                                const secFill =
                                  currentTheme.secondaryBackplateFill ||
                                  man?.secondary?.color ||
                                  "#ffffff";
                                const secText =
                                  currentTheme.secondaryTextColor ||
                                  man?.secondary?.typography?.color ||
                                  "#ffffff";
                                const pointerFill =
                                  currentTheme.pointerFill ||
                                  man?.primary?.pointer?.color ||
                                  "#ffffff";

                                return (
                                  <>
                                    <div className="flex flex-col items-center gap-1 mt-3">
                                      <div className="flex w-12 h-6 rounded-full overflow-hidden border border-white/20">
                                        <input
                                          type="color"
                                          value={primaryText}
                                          onChange={(e) =>
                                            updateColor(
                                              "primaryTextColor",
                                              e.target.value,
                                            )
                                          }
                                          className="w-1/2 h-full p-0 border-0 bg-transparent cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-none"
                                          title={t("Primary Text")}
                                        />
                                        {man?.primary?.overrideColor ? (
                                          <input
                                            type="color"
                                            value={primaryFill}
                                            onChange={(e) =>
                                              updateColor(
                                                "primaryBackplateFill",
                                                e.target.value,
                                              )
                                            }
                                            className="w-1/2 h-full p-0 border-0 bg-transparent cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-none"
                                            title={t("Primary Fill")}
                                          />
                                        ) : (
                                          <div
                                            className="w-1/2 h-full bg-white/10"
                                            title={t(
                                              "Original primary fill locked",
                                            )}
                                          />
                                        )}
                                      </div>
                                      <span className="text-[9px] text-white/50 text-center leading-tight">
                                        {t("Primary")}
                                      </span>
                                    </div>

                                    {activeLabelTab === "regular" &&
                                      man?.secondary && (
                                        <div className="flex flex-col items-center gap-1 mt-3">
                                          <div className="flex w-12 h-6 rounded-full overflow-hidden border border-white/20">
                                            <input
                                              type="color"
                                              value={secText}
                                              onChange={(e) =>
                                                updateColor(
                                                  "secondaryTextColor",
                                                  e.target.value,
                                                )
                                              }
                                              className="w-1/2 h-full p-0 border-0 bg-transparent cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-none"
                                              title={t("Secondary Text")}
                                            />
                                            {man.secondary.overrideColor ? (
                                              <input
                                                type="color"
                                                value={secFill}
                                                onChange={(e) =>
                                                  updateColor(
                                                    "secondaryBackplateFill",
                                                    e.target.value,
                                                  )
                                                }
                                                className="w-1/2 h-full p-0 border-0 bg-transparent cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-none"
                                                title={t("Secondary Fill")}
                                              />
                                            ) : (
                                              <div
                                                className="w-1/2 h-full bg-white/10"
                                                title={t(
                                                  "Original secondary fill locked",
                                                )}
                                              />
                                            )}
                                          </div>
                                          <span className="text-[9px] text-white/50 text-center leading-tight">
                                            {t("Secondary")}
                                          </span>
                                        </div>
                                      )}

                                    {man?.primary?.pointer?.overrideColor && (
                                      <div className="flex flex-col items-center gap-1 mt-3">
                                        <input
                                          type="color"
                                          value={pointerFill}
                                          onChange={(e) =>
                                            updateColor(
                                              "pointerFill",
                                              e.target.value,
                                            )
                                          }
                                          className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer rounded-full overflow-hidden [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-full"
                                          title={t("Pointer Fill")}
                                        />
                                        <span className="text-[9px] text-white/50 text-center leading-tight max-w-[40px]">
                                          {t("Pointer")}
                                        </span>
                                      </div>
                                    )}

                                    {/* Accent Color removed per user request */}
                                  </>
                                );
                              })()
                            )}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
          <div className="p-4 border-t border-white/10 flex flex-col gap-3 relative z-30">
            <label className="w-full py-2 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-sm transition-colors rounded-full cursor-pointer">
              <Upload size={16} /> {t("Upload .ZIP template")}
              <input
                type="file"
                accept=".zip"
                className="hidden"
                onChange={handleZipUpload}
              />
            </label>
          </div>
        </>
      ) : activeTab === "video" ? (
        <>
          <div className="p-4 pb-2 border-b border-white/20">
            <div className="text-xs font-semibold tracking-wider text-white">
              {t("VIDEO EXPORT")}
            </div>
          </div>

          <div className="p-4 flex flex-col flex-1 overflow-y-auto custom-scrollbar gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-xs text-white/60 mb-2 block font-semibold tracking-wider">
                  {t("FORMAT")}
                </label>
                <div className="flex border border-white/20 rounded-full p-1 relative bg-transparent">
                  {(["16x9", "9x16", "both"] as const).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => setVideoFormat(fmt)}
                      className={`flex-1 px-4 py-2 text-sm relative z-10 transition-colors ${
                        videoFormat === fmt
                          ? "text-black"
                          : "text-white/60 hover:text-white/80"
                      }`}
                    >
                      {videoFormat === fmt && (
                        <motion.div
                          layoutId="format-active-bg"
                          className="absolute inset-0 bg-white rounded-full -z-10"
                          transition={{
                            type: "spring",
                            stiffness: 400,
                            damping: 30,
                          }}
                        />
                      )}
                      {t(fmt.charAt(0).toUpperCase() + fmt.slice(1))}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-white/60 mb-2 block font-semibold tracking-wider">
                  {t("FILE TYPE")}
                </label>
                <div className="flex border border-white/20 rounded-full p-1 relative bg-transparent">
                  {(["mp4", "jsx", "both"] as const).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => setVideoFileType(fmt)}
                      className={`flex-1 px-4 py-2 text-sm relative z-10 transition-colors ${
                        videoFileType === fmt
                          ? "text-black"
                          : "text-white/60 hover:text-white/80"
                      }`}
                    >
                      {videoFileType === fmt && (
                        <motion.div
                          layoutId="filetype-active-bg"
                          className="absolute inset-0 bg-white rounded-full -z-10"
                          transition={{
                            type: "spring",
                            stiffness: 400,
                            damping: 30,
                          }}
                        />
                      )}
                      {fmt === "both" ? t("Both") : t(fmt.toUpperCase())}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-white/60 mb-2 flex justify-between font-semibold tracking-wider">
                  <span>{t("STEP DURATION")}</span>
                  <span>{videoDuration}s</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={videoDuration}
                  onChange={(e) => setVideoDuration(parseInt(e.target.value))}
                  className="w-full accent-white"
                />
              </div>

              <div>
                <label className="text-xs text-white/60 mb-2 flex justify-between font-semibold tracking-wider">
                  <span>{t("VIDEO BITRATE")}</span>
                  <span>{videoBitrate} Mbps</span>
                </label>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={videoBitrate}
                  onChange={(e) => setVideoBitrate(parseInt(e.target.value))}
                  className="w-full accent-white"
                />
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-white/10 flex flex-col gap-3">
            {!annotations?.some(
              (a) =>
                (a.type === "label" || a.type === "highlight") &&
                a.text &&
                a.view,
            ) && (
              <div className="text-xs text-red-400/80 text-center px-2 py-1 leading-relaxed bg-red-500/10 rounded">
                {t(
                  "Video export requires custom map views to be set. Please use the highlight or label tools or manually add map views with the camera button.",
                )}
              </div>
            )}
            <button
              disabled={
                !annotations?.some(
                  (a) =>
                    (a.type === "label" || a.type === "highlight") &&
                    a.text &&
                    a.view,
                )
              }
              onClick={() => {
                const event = new CustomEvent("startVideoExport", {
                  detail: {
                    format: videoFormat,
                    fileType: videoFileType,
                    duration: videoDuration,
                    dynamicLabels: true,
                    bitrate: videoBitrate,
                    showName: settings.title || currentShow,
                  },
                });
                window.dispatchEvent(event);
                setIsOpen(false);
              }}
              className={`w-full py-2 flex items-center justify-center gap-2 text-sm transition-colors ${
                annotations?.some(
                  (a) =>
                    (a.type === "label" || a.type === "highlight") &&
                    a.text &&
                    a.view,
                )
                  ? "bg-white/5 hover:bg-white/10"
                  : "bg-white/5 text-white/30 cursor-not-allowed"
              } rounded-full`}
            >
              <Video size={16} /> {t("Export Video")}
            </button>
            {annotations?.some(a => a.coordinates || a.polygonGeometry || a.routeGeometry) && (
              <button
                onClick={() => onExport?.()}
                className="w-full py-2 flex items-center justify-center gap-2 text-sm transition-colors bg-white/5 hover:bg-white/10 rounded-full"
              >
                <Download size={16} /> {t("Export Annotations")}
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="p-4 flex flex-col gap-6 flex-1 overflow-y-auto custom-scrollbar">
          {/* 1. COLOR PALETTE */}
          <div>
            <label className="text-xs text-white mb-2 block font-semibold tracking-wider">
              {t("COLOR PALETTE")}
            </label>
            <div className="flex flex-wrap gap-2 items-center">
              {settings.colorPalette.map((c, index) => (
                <div
                  key={c}
                  className="w-8 h-8 border border-white/20 relative group cursor-grab active:cursor-grabbing"
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragEnter={() => handleDragEnter(index)}
                  onDragEnd={handleColorDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <div
                    className="w-full h-full"
                    style={{ backgroundColor: c }}
                  />
                  <button
                    onClick={() => removeColor(c)}
                    className="absolute inset-0 bg-black/60 text-white hidden group-hover:flex items-center justify-center text-xs font-bold transition-opacity"
                    title={t("Remove color")}
                  >
                    ×
                  </button>
                </div>
              ))}
              {!addingColor ? (
                <button
                  onClick={() => setAddingColor(true)}
                  className="w-8 h-8 border border-white/20 flex items-center justify-center hover:bg-white hover:text-black transition-colors shrink-0"
                  title={t("Add color")}
                >
                  +
                </button>
              ) : (
                <div className="flex gap-1 items-center shrink-0 bg-white/5 border border-white/20 p-1">
                  <input
                    type="color"
                    className="w-8 h-8 p-0 border-0 cursor-pointer bg-transparent"
                    value={newColorHex}
                    onChange={(e) =>
                      setNewColorHex(e.target.value.toUpperCase())
                    }
                    title={t("Choose a color")}
                  />
                  <input
                    autoFocus
                    className="w-24 bg-transparent px-1 outline-none font-mono text-xs border border-transparent focus:border-white/50 transition-colors h-8 uppercase"
                    value={newColorHex}
                    onChange={(e) => setNewColorHex(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmAddColor();
                      if (e.key === "Escape") setAddingColor(false);
                    }}
                  />
                  <button
                    onClick={confirmAddColor}
                    className="text-white hover:bg-white hover:text-black px-3 font-semibold border border-white/20 text-xs h-8 rounded-full"
                  >
                    {t("OK")}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 5. BASE MAP */}
          <details className="group flex flex-col gap-[2px] w-full">
            <summary className="relative p-3 flex items-center gap-2 bg-black text-xs text-white font-semibold tracking-wider cursor-pointer list-none outline-none [&::-webkit-details-marker]:hidden">
              <ChevronRight
                size={14}
                className="text-white/50 group-hover:text-white transition-colors group-open:hidden shrink-0"
              />
              <ChevronDown
                size={14}
                className="text-white/50 group-hover:text-white transition-colors hidden group-open:block shrink-0"
              />
              <span>{t("BASE MAP")}</span>
            </summary>
            <div className="p-3 flex flex-col gap-4 bg-black mt-[2px]">
              <div className="grid grid-cols-3 gap-2">
                {/* Default Map: Liberty */}
                <div 
                  className={`relative aspect-square bg-white/10 rounded cursor-pointer overflow-hidden border-2 transition-all ${settings.mapStyle === 'https://tiles.openfreemap.org/styles/liberty' ? 'outline outline-2 outline-offset-2 outline-white border-transparent' : 'border-transparent hover:border-white/20'}`}
                  onClick={() => setSettings(p => ({ ...p, mapStyle: 'https://tiles.openfreemap.org/styles/liberty' }))}
                >
                  <img src="https://a.tile.openstreetmap.org/5/16/10.png" className="w-full h-full object-cover opacity-80 mix-blend-luminosity" />
                  <div className="absolute inset-0 flex items-center justify-center p-2 text-center text-[10px] font-bold text-white bg-black/40">{t("Default")}</div>
                </div>
                
                {/* Solid Color */}
                <div 
                  className={`relative aspect-square rounded cursor-pointer overflow-hidden border-2 transition-all ${settings.mapStyle?.startsWith('solid:') ? 'outline outline-2 outline-offset-2 outline-white border-white/10' : 'border-white/10 hover:border-white/20'}`}
                >
                  <input type="color" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" value={settings.mapStyle?.startsWith('solid:') ? settings.mapStyle.replace('solid:', '') : '#1A1A1A'} onChange={e => setSettings(p => ({ ...p, mapStyle: `solid:${e.target.value.toUpperCase()}` }))} />
                  <div className="absolute inset-0" style={{ backgroundColor: settings.mapStyle?.startsWith('solid:') ? settings.mapStyle.replace('solid:', '') : '#1A1A1A' }}></div>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-[10px] font-bold text-white bg-black/20 mix-blend-difference text-center leading-tight px-1">{t("Solid Color")}</div>
                </div>

                {/* Custom Base Maps */}
                {basemaps.map(bm => (
                  <div 
                    key={bm.id} 
                    className={`relative aspect-square bg-white/5 rounded cursor-pointer overflow-hidden border-2 group transition-all ${settings.mapStyle === bm.url ? 'outline outline-2 outline-offset-2 outline-white border-transparent' : 'border-transparent hover:border-white/20'}`}
                  >
                    <div className="absolute inset-0" onClick={() => setSettings(p => ({ ...p, mapStyle: bm.url }))}>
                      {bm.previewData ? (
                        <img src={bm.previewData} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/20 bg-black/40">
                          {isGeneratingScreenshotId === bm.id ? <Loader2 className="animate-spin" size={24} /> : <ImageIcon size={24} />}
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 p-1 bg-black/60 text-[8px] text-white truncate text-center">{bm.name}</div>
                    </div>
                    
                    {/* Hover Actions */}
                    <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1.5 bg-black/80 hover:bg-red-500 text-white rounded-full transition-colors" onClick={(e) => { e.stopPropagation(); handleDeleteBasemap(bm.id); }} title="Delete">
                        <Trash2 size={10} />
                      </button>
                      {!bm.previewData && isGeneratingScreenshotId !== bm.id && (
                        <>
                          <button className="p-1.5 bg-black/80 hover:bg-white hover:text-black text-white rounded-full transition-colors" onClick={(e) => { e.stopPropagation(); handleUploadBasemapPreview(bm.id); }} title="Upload PNG Preview">
                            <Upload size={10} />
                          </button>
                          <button className="p-1.5 bg-black/80 hover:bg-white hover:text-black text-white rounded-full transition-colors" onClick={(e) => { e.stopPropagation(); handleGenerateBasemapPreview(bm); }} title="Generate Preview from Map">
                            <RefreshCcw size={10} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="flex gap-2">
                <button onClick={handleAddBasemapUrl} className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white text-sm transition-colors rounded-full flex items-center justify-center gap-2">
                  <Link size={16} /> {t("Add URL")}
                </button>
                <button onClick={handleUploadBasemapJson} className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white text-sm transition-colors rounded-full flex items-center justify-center gap-2">
                  <Upload size={16} /> {t("Upload JSON")}
                </button>
                <input type="file" ref={basemapFileInputRef} className="hidden" />
              </div>

              <div className="flex items-center justify-between px-1 mt-2">
                <label className="text-[10px] text-white font-semibold tracking-wider">
                  {t("Force Gotham Font")}
                </label>
                <button
                  onClick={() =>
                    setSettings((prev) => ({
                      ...prev,
                      replaceGothamFont: prev.replaceGothamFont === false ? true : false,
                    }))
                  }
                  className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${settings.replaceGothamFont !== false ? "bg-white" : "bg-white/20"}`}
                >
                  <div
                    className={`w-3 h-3 rounded-full absolute top-1 transition-all ${settings.replaceGothamFont !== false ? "left-5 bg-black" : "left-1 bg-white"}`}
                  />
                </button>
              </div>


              {isGeneratingScreenshotId && basemaps.find(b => b.id === isGeneratingScreenshotId) && (
                <ScreenshotMap 
                  styleUrl={basemaps.find(b => b.id === isGeneratingScreenshotId)!.url}
                  onReady={async (data) => {
                    const bm = basemaps.find(b => b.id === isGeneratingScreenshotId);
                    if (bm) {
                      await fetch('/api.php?action=save_basemap', {
                        method: 'POST',
                        body: JSON.stringify({ ...bm, previewData: data })
                      });
                      refreshBasemaps();
                    }
                    setIsGeneratingScreenshotId(null);
                  }}
                />
              )}
            </div>
          </details>

          {/* 3D TERRAIN */}
          <details className="group flex flex-col gap-[2px] w-full mb-6">
            <summary className="relative p-3 flex items-center gap-2 bg-black text-xs text-white font-semibold tracking-wider cursor-pointer list-none outline-none [&::-webkit-details-marker]:hidden">
              <ChevronRight size={14} className="text-white/50 group-hover:text-white transition-colors group-open:hidden shrink-0" />
              <ChevronDown size={14} className="text-white/50 group-hover:text-white transition-colors hidden group-open:block shrink-0" />
              {t("3D TERRAIN")}
            </summary>
            
            <div className="p-3 flex flex-col gap-4 bg-black mt-[2px]">
              <div className="flex items-center justify-between px-1">
                <label className="text-[10px] text-white font-semibold tracking-wider">
                  {t("Enable 3D Terrain")}
                </label>
                <button
                  onClick={() => setSettings((prev) => ({ ...prev, enable3dTerrain: !prev.enable3dTerrain }))}
                  className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${settings.enable3dTerrain ? "bg-white" : "bg-white/20"}`}
                >
                  <div className={`w-3 h-3 rounded-full absolute top-1 transition-all ${settings.enable3dTerrain ? "left-5 bg-black" : "left-1 bg-white"}`} />
                </button>
              </div>

              {settings.enable3dTerrain && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2 px-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-white font-semibold tracking-wider">
                        {t("Exaggeration")}
                      </label>
                      <span className="text-[10px] text-white/50 font-mono">
                        {(settings.terrainExaggeration ?? 1.5).toFixed(1)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="3"
                      step="0.1"
                      value={settings.terrainExaggeration ?? 1.5}
                      onChange={(e) => setSettings((prev) => ({ ...prev, terrainExaggeration: parseFloat(e.target.value) }))}
                      className="w-full h-1 bg-white/20 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between px-1">
                      <label className="text-[10px] text-white font-semibold tracking-wider">
                        {t("Hillshade (Shadows)")}
                      </label>
                      <button
                        onClick={() => setSettings((prev) => ({ ...prev, enableHillshade: !prev.enableHillshade }))}
                        className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${settings.enableHillshade ? "bg-white" : "bg-white/20"}`}
                      >
                        <div className={`w-3 h-3 rounded-full absolute top-1 transition-all ${settings.enableHillshade ? "left-5 bg-black" : "left-1 bg-white"}`} />
                      </button>
                    </div>

                    {settings.enableHillshade && (
                      <div className="flex flex-col gap-3 pl-2 pr-1 mt-1 border-l-2 border-white/10">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[9px] text-white/70 font-semibold tracking-wider uppercase">
                              {t("Shadow Opacity")}
                            </label>
                            <span className="text-[9px] text-white/50 font-mono">
                              {Math.round((settings.hillshadeShadowOpacity ?? 0.5) * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={settings.hillshadeShadowOpacity ?? 0.5}
                            onChange={(e) => setSettings((prev) => ({ ...prev, hillshadeShadowOpacity: parseFloat(e.target.value) }))}
                            className="w-full h-1 bg-white/20 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[9px] text-white/70 font-semibold tracking-wider uppercase">
                              {t("Highlight Opacity")}
                            </label>
                            <span className="text-[9px] text-white/50 font-mono">
                              {Math.round((settings.hillshadeHighlightOpacity ?? 0.5) * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={settings.hillshadeHighlightOpacity ?? 0.5}
                            onChange={(e) => setSettings((prev) => ({ ...prev, hillshadeHighlightOpacity: parseFloat(e.target.value) }))}
                            className="w-full h-1 bg-white/20 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between px-1 mt-1">
                    <label className="text-[10px] text-white font-semibold tracking-wider">
                      {t("Sky")}
                    </label>
                    <button
                      onClick={() => setSettings((prev) => ({ ...prev, enableSky: !prev.enableSky }))}
                      className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${settings.enableSky ? "bg-white" : "bg-white/20"}`}
                    >
                      <div className={`w-3 h-3 rounded-full absolute top-1 transition-all ${settings.enableSky ? "left-5 bg-black" : "left-1 bg-white"}`} />
                    </button>
                  </div>

                  <div className="w-full h-px bg-white/10 my-1"></div>

                  <div className="flex flex-col gap-3 px-1">
                    <label className="text-[10px] text-white font-semibold tracking-wider uppercase">
                      {t("Water Masking / Styling")}
                    </label>
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] text-white/70 font-semibold tracking-wider uppercase">
                        {t("Water Color")}
                      </label>
                      <input
                        type="color"
                        value={settings.waterColor || "#9ebdc8"}
                        onChange={(e) => setSettings((prev) => ({ ...prev, waterColor: e.target.value }))}
                        className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[9px] text-white/70 font-semibold tracking-wider uppercase">
                          {t("Water Opacity")}
                        </label>
                        <span className="text-[9px] text-white/50 font-mono">
                          {Math.round((settings.waterOpacity ?? 1) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={settings.waterOpacity ?? 1}
                        onChange={(e) => setSettings((prev) => ({ ...prev, waterOpacity: parseFloat(e.target.value) }))}
                        className="w-full h-1 bg-white/20 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </details>

          {/* ANIMATIONS */}
          <details className="group flex flex-col gap-[2px] w-full mb-6">
            <summary className="relative p-3 flex items-center gap-2 bg-black text-xs text-white font-semibold tracking-wider cursor-pointer list-none outline-none [&::-webkit-details-marker]:hidden">
              <ChevronRight
                size={14}
                className="text-white/50 group-hover:text-white transition-colors group-open:hidden shrink-0"
              />
              <ChevronDown
                size={14}
                className="text-white/50 group-hover:text-white transition-colors hidden group-open:block shrink-0"
              />
              <span>{t("ANIMATIONS")}</span>
            </summary>
            <div className="p-3 flex flex-col gap-4 bg-black mt-[2px]">
              <div>
                <label className="text-[10px] text-white mb-2 block font-semibold tracking-wider">
                  {t("PATH & POLYGON REVEAL")} (
                  {(settings.animationDuration ?? 2000) / 1000}s)
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-white/50 w-6 text-right">
                    0s
                  </span>
                  <div className="relative flex-1 flex flex-col justify-center h-8">
                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex justify-between px-2 pointer-events-none">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="w-[1px] h-2.5 bg-white/30" />
                      ))}
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="5000"
                      step="500"
                      value={settings.animationDuration ?? 2000}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          animationDuration: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer relative z-10"
                    />
                  </div>
                  <span className="text-xs text-white/50 w-6">5s</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-white mb-2 block font-semibold tracking-wider">
                  {t("LABEL & ICON REVEAL")} (
                  {(settings.labelAnimationDuration ?? 1000) / 1000}s)
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-white/50 w-6 text-right">
                    0s
                  </span>
                  <div className="relative flex-1 flex flex-col justify-center h-8">
                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex justify-between px-2 pointer-events-none">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="w-[1px] h-2.5 bg-white/30" />
                      ))}
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="5000"
                      step="500"
                      value={settings.labelAnimationDuration ?? 1000}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          labelAnimationDuration: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer relative z-10"
                    />
                  </div>
                  <span className="text-xs text-white/50 w-6">5s</span>
                </div>
              </div>
            </div>
          </details>

          {/* 6. API SETTINGS */}
          <details className="group flex flex-col gap-[2px] w-full mb-6">
            <summary className="relative p-3 flex items-center gap-2 bg-black text-xs text-white font-semibold tracking-wider cursor-pointer list-none outline-none [&::-webkit-details-marker]:hidden">
              <ChevronRight
                size={14}
                className="text-white/50 group-hover:text-white transition-colors group-open:hidden shrink-0"
              />
              <ChevronDown
                size={14}
                className="text-white/50 group-hover:text-white transition-colors hidden group-open:block shrink-0"
              />
              <span>{t("API SETTINGS")}</span>
            </summary>
            <div className="p-3 flex flex-col gap-4 bg-black mt-[2px]">
              <div>
                <label className="text-[10px] text-white mb-1 block font-semibold tracking-wider">
                  {t("OPENSKY CREDENTIALS")}
                </label>
                <p className="text-[10px] text-white/40 mb-2 leading-tight">
                  {t(
                    "Optional. Leave blank for anonymous access (rate-limited).",
                  )}
                </p>
                <div className="flex gap-2">
                  <input
                    placeholder={t("Client ID")}
                    className="w-1/2 bg-black/60 px-3 py-2 outline-none font-mono text-xs border border-white/10 focus:border-white/50 transition-colors"
                    value={settings.openSkyCredentials?.clientId || ""}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        openSkyCredentials: {
                          ...prev.openSkyCredentials,
                          clientId: e.target.value,
                          clientSecret:
                            prev.openSkyCredentials?.clientSecret || "",
                        },
                      }))
                    }
                  />
                  <input
                    type="password"
                    placeholder={t("Client Secret")}
                    className="w-1/2 bg-black/60 px-3 py-2 outline-none font-mono text-xs border border-white/10 focus:border-white/50 transition-colors"
                    value={settings.openSkyCredentials?.clientSecret || ""}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        openSkyCredentials: {
                          ...prev.openSkyCredentials,
                          clientId: prev.openSkyCredentials?.clientId || "",
                          clientSecret: e.target.value,
                        },
                      }))
                    }
                  />
                </div>
              </div>
              <div className="mt-2">
                <label className="text-[10px] text-white mb-1 block font-semibold tracking-wider">
                  {t("AISSTREAM CREDENTIALS")}
                </label>
                <p className="text-[10px] text-white/40 mb-2 leading-tight">
                  {t(
                    "Required for Maritime Traffic. Get a free API key at aisstream.io",
                  )}
                </p>
                <input
                  type="password"
                  placeholder={t("API Key")}
                  className="w-full bg-black/60 px-3 py-2 outline-none font-mono text-xs border border-white/10 focus:border-white/50 transition-colors"
                  value={settings.aisstreamCredentials?.apiKey || ""}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      aisstreamCredentials: { apiKey: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="mt-2">
                <label className="text-[10px] text-white mb-1 block font-semibold tracking-wider">
                  {t("GOOGLE MAPS API KEY")}
                </label>
                <p className="text-[10px] text-white/40 mb-2 leading-tight">
                  {t(
                    "Optional. Enables train mode routing via Google Maps Directions API.",
                  )}
                </p>
                <input
                  type="password"
                  placeholder={t("API Key")}
                  className="w-full bg-black/60 px-3 py-2 outline-none font-mono text-xs border border-white/10 focus:border-white/50 transition-colors"
                  value={settings.googleMapsToken || ""}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      googleMapsToken: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function LayerItem(props: {
  layer: MapLayer;
  isNestedChild?: boolean;
  toggleVisibility: (id: string) => void;
  removeLayer: (id: string) => void;
  renameLayer: (id: string, newName: string) => void;
  colorPalette: string[];
  activeGeojsonLayerId: string | null;
  setActiveGeojsonLayerId: (id: string | null) => void;
  selectedFeatureId: string | number | null;
  updateLayerStyle: (
    layerId: string,
    featureId: string | number | null,
    styleChanges: any,
  ) => void;
  updateLayerProperty: (
    layerId: string,
    property: keyof MapLayer,
    value: any,
  ) => void;
  updateLayerDates?: (
    layerId: string,
    startDate?: string,
    endDate?: string,
  ) => void;
  duplicateLayer?: (id: string) => void;
  saveAsPreset?: (layer: MapLayer) => void;
  toggleLive?: (layerId: string) => void;
  handleDragEnd?: (
    e: MouseEvent | TouchEvent | PointerEvent,
    layerId: string,
  ) => void;
  isDraggingLayer?: boolean;
  setIsDraggingLayer?: (isDragging: boolean) => void;
  selectedAircraftId?: string | null;
  selectedVesselMmsi?: string | null;
}) {
  const { t } = useTranslation();
  const {
    layer,
    isNestedChild = false,
    toggleVisibility,
    removeLayer,
    renameLayer,
    colorPalette,
    activeGeojsonLayerId,
    setActiveGeojsonLayerId,
    selectedFeatureId,
    updateLayerStyle,
    updateLayerProperty,
    updateLayerDates,
    duplicateLayer,
    saveAsPreset,
    toggleLive,
    handleDragEnd,
    isDraggingLayer,
    setIsDraggingLayer,
    selectedAircraftId,
    selectedVesselMmsi,
  } = props;
  const isActiveEdit = activeGeojsonLayerId === layer.id;
  const setActiveEdit = () => {
    if (isActiveEdit) setActiveGeojsonLayerId(null);
    else setActiveGeojsonLayerId(layer.id);
  };
  const controls = useDragControls();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(layer.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const [aircraftSearchError, setAircraftSearchError] = useState<boolean>(false);

  useEffect(() => {
    const handleSearchAircraftResult = (e: Event) => {
      const customEvent = e as CustomEvent<{ found: boolean }>;
      setAircraftSearchError(!customEvent.detail.found);
    };
    window.addEventListener("searchAircraftResult", handleSearchAircraftResult);
    return () => window.removeEventListener("searchAircraftResult", handleSearchAircraftResult);
  }, []);

  let defaultStartDate = "";
  let defaultEndDate = "";
  if (layer.type === "wildfires") {
    const today = new Date();
    defaultEndDate = today.toISOString().split("T")[0];
    const past7d = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    defaultStartDate = past7d.toISOString().split("T")[0];
  }

  const [editTarget, setEditTarget] = useState<"fill" | "outline">("fill");

  const handleDoubleClick = () => {
    if (
      ["deepstate", "satellite", "wildfires"].includes(layer.type) ||
      ["deepstate", "satellite"].includes(layer.id)
    )
      return;
    setIsEditing(true);
    setEditName(layer.name);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleRenameSubmit = () => {
    setIsEditing(false);
    if (editName.trim() && editName !== layer.name) {
      renameLayer(layer.id, editName.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleRenameSubmit();
    if (e.key === "Escape") {
      setIsEditing(false);
      setEditName(layer.name);
    }
  };

  const handleColorClick = (color: string) => {
    if (editTarget === "fill") {
      updateLayerStyle(layer.id, selectedFeatureId, { fillColor: color });
    } else {
      updateLayerStyle(layer.id, selectedFeatureId, { outlineColor: color });
    }
  };

  const handleOpacityChange = (opacity: number) => {
    if (editTarget === "fill") {
      updateLayerStyle(layer.id, selectedFeatureId, { fillOpacity: opacity });
    } else {
      updateLayerStyle(layer.id, selectedFeatureId, {
        outlineOpacity: opacity,
      });
    }
  };

  const handleWidthChange = (width: number) => {
    updateLayerStyle(layer.id, selectedFeatureId, { outlineWidth: width });
  };

  const feature = layer.data?.features?.find((f: any) =>
    selectedFeatureId ? f.properties?.id === selectedFeatureId : true,
  );
  const currentFillColor = feature?.properties?.fillColor || "#00A79D";
  const currentFillOpacity = feature?.properties?.fillOpacity ?? 0.5;
  const currentOutlineColor =
    feature?.properties?.outlineColor || "transparent";
  const currentOutlineOpacity = feature?.properties?.outlineOpacity ?? 1.0;
  const currentOutlineWidth = feature?.properties?.outlineWidth ?? 0;

  const handleSwap = () => {
    updateLayerStyle(layer.id, selectedFeatureId, {
      fillColor: currentOutlineColor,
      fillOpacity: currentOutlineOpacity,
      outlineColor: currentFillColor,
      outlineOpacity: currentFillOpacity,
    });
  };

  const handleReset = () => {
    updateLayerStyle(layer.id, selectedFeatureId, {
      fillColor: "#00A79D",
      fillOpacity: 0.5,
      outlineColor: "transparent",
      outlineWidth: 0,
      outlineOpacity: 1.0,
    });
  };

  const renderColorSwatch = (color: string) => {
    if (color === "transparent") {
      return (
        <button
          key="transparent"
          onClick={() => handleColorClick("transparent")}
          className="w-6 h-6 relative overflow-hidden flex-shrink-0 transition-colors"
          title={t("Transparent")}
        >
          <div className="absolute inset-0 bg-white/10 flex items-center justify-center">
            <div className="w-full h-0 border-t border-red-500 transform rotate-45"></div>
          </div>
        </button>
      );
    }
    return (
      <button
        key={color}
        onClick={() => handleColorClick(color)}
        className="w-6 h-6 flex-shrink-0 transition-colors"
        style={{ backgroundColor: color }}
        title={color}
      />
    );
  };

  const Wrapper: any = isNestedChild ? motion.div : Reorder.Item;
  const wrapperProps: any = isNestedChild
    ? {
        drag: true,
        dragControls: controls,
        dragListener: false,
        dragSnapToOrigin: true,
        style: { zIndex: 50 },
        onDragStart: () => setIsDraggingLayer?.(true),
        onDragEnd: (e: any) => {
          setIsDraggingLayer?.(false);
          // Wait to allow drop zone detection
          setTimeout(() => {
            if (handleDragEnd) handleDragEnd(e, layer.id);
          }, 0);
        },
      }
    : {
        value: layer,
        dragListener: false,
        dragControls: controls,
        onDragStart: () => setIsDraggingLayer?.(true),
        onDragEnd: (e: any) => {
          setIsDraggingLayer?.(false);
          if (handleDragEnd) handleDragEnd(e, layer.id);
        },
      };

  const iconColor = layer.visible
    ? "text-white"
    : "text-white/50 hover:text-white";
  const iconColorFaded = layer.visible
    ? "text-white"
    : "text-white/30 hover:text-white/70";

  return (
    <div className={`flex flex-col ${isActiveEdit ? "gap-0" : "gap-[2px]"}`}>
      <Wrapper
        {...wrapperProps}
        data-drop-zone={
          layer.type === "split" || isNestedChild ? "split-container" : "root"
        }
        data-layer-id={layer.id}
        className="w-full relative"
      >
        <div
          className={`relative flex flex-col transition-all duration-300 w-full ${isDraggingLayer && layer.type === "split" ? "bg-white/5" : ""} rounded-full`}
        >
          <div
            className={`relative p-3 flex items-center gap-3 select-none group transition-opacity duration-200 ${isActiveEdit ? "bg-black z-10" : layer.visible ? "bg-black" : "bg-transparent"} ${!layer.visible ? "opacity-40" : "opacity-100"} ${isNestedChild ? "ml-6" : ""}`}
          >
            <div
              className={`cursor-grab active:cursor-grabbing ${iconColorFaded}`}
              onPointerDown={(e) => controls.start(e)}
              style={{ touchAction: "none" }}
            >
              <GripVertical size={16} />
            </div>
            <div
              data-layer-id={layer.id}
              className="absolute inset-0 pointer-events-none"
            />

            <button
              onClick={() => toggleVisibility(layer.id)}
              className={`transition-colors flex-shrink-0 ${iconColor}`}
            >
              {layer.visible ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>

            <div className="flex-1 min-w-0" onDoubleClick={handleDoubleClick}>
              {layer.type === "split" ? (
                <div className="flex flex-col gap-2 w-full">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold truncate text-white">
                        {t("Split View Container")}
                      </div>
                      <div className="text-[10px] text-white/40 uppercase tracking-wider">
                        {layer.splitLayers?.[0]?.name
                          ? t(layer.splitLayers[0].name)
                          : t("Empty")}{" "}
                        |{" "}
                        {layer.splitLayers?.[1]?.name
                          ? t(layer.splitLayers[1].name)
                          : t("Empty")}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {isEditing ? (
                    <input
                      ref={inputRef}
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={handleRenameSubmit}
                      onKeyDown={handleKeyDown}
                      className="w-full bg-black border border-white/20 text-sm font-medium px-1 outline-none text-white focus:border-white/50"
                    />
                  ) : (
                    <div
                      className="text-sm font-medium truncate cursor-text"
                      title={t(layer.name)}
                    >
                      {t(layer.name)}
                    </div>
                  )}
                  <div className="text-[10px] text-white/40 uppercase tracking-wider">
                    {layer.type}
                  </div>
                </>
              )}
            </div>

            {layer.type !== "split" &&
              (layer.type === "geojson" ||
                layer.type === "raster" ||
                layer.type === "satellite" ||
                layer.type === "deepstate" ||
                layer.type === "flights" ||
                layer.type === "vessels" ||
                layer.type === "weather_forecast" ||
                layer.type === "gdacs_earthquakes" ||
                layer.type === "gdacs_volcanoes" ||
                layer.type === "wildfires" ||
                layer.type === "gdacs_cyclones" ||
                layer.type === "nighttime") && (
                <button
                  onClick={() => {
                    if (!layer.visible) toggleVisibility(layer.id);
                    setActiveEdit();
                  }}
                  className={`transition-colors ${isActiveEdit ? "text-white" : iconColorFaded}`}
                  title={`Toggle ${layer.type === "geojson" ? "GeoJSON" : layer.type === "flights" ? "Air Traffic" : layer.type === "vessels" ? "Maritime Traffic" : layer.type === "weather_forecast" ? "Weather Forecast" : "Layer"} Edit Mode`}
                >
                  <Edit2 size={16} />
                </button>
              )}

            {!isNestedChild && (
                <button
                  onClick={() => removeLayer(layer.id)}
                  className={`transition-colors ml-1 ${iconColor} rounded-full`}
                >
                  <Trash2 size={16} />
                </button>
              )}
          </div>

          {isActiveEdit && (
            <div
              className={`bg-black p-3 pt-2 flex flex-col gap-4 text-sm animate-in slide-in-from-top-2 relative z-0 transition-opacity duration-200 ${!layer.visible ? "opacity-40" : "opacity-100"} ${isNestedChild ? "ml-6" : ""}`}
            >
              {layer.type === "raster" ||
              layer.type === "satellite" ||
              layer.type === "deepstate" ||
              layer.type === "gdacs_earthquakes" ||
              layer.type === "gdacs_volcanoes" ||
              layer.type === "wildfires" ||
              layer.type === "gdacs_cyclones" ||
              layer.type === "nighttime" ? (
                <div className="flex flex-col gap-3 pb-2">
                  <div className="flex items-center gap-3">
                    {(layer.type === "raster" ||
                      layer.type === "satellite" ||
                      layer.type === "gdacs_earthquakes" ||
                      layer.type === "gdacs_volcanoes" ||
                      layer.type === "wildfires" ||
                      layer.type === "gdacs_cyclones") && saveAsPreset && (
                      <button
                        onClick={() => saveAsPreset(layer)}
                        className="text-white/50 hover:text-white transition-colors flex items-center shrink-0"
                        title={t("Save as Preset")}
                      >
                        <BookmarkPlus size={16} />
                      </button>
                    )}
                    {(layer.type === "deepstate" ||
                      layer.type === "gdacs_earthquakes" ||
                      layer.type === "gdacs_volcanoes" ||
                      layer.type === "wildfires" ||
                      layer.id === "floods" ||
                      layer.id.startsWith("raster-")) &&
                      duplicateLayer && (
                        <button
                          onClick={() => duplicateLayer(layer.id)}
                          className="text-white/50 hover:text-white transition-colors flex items-center shrink-0"
                          title={t("Duplicate Layer")}
                        >
                          <Copy size={16} />
                        </button>
                      )}
                    {layer.type === "deepstate" && toggleLive && (
                      <button
                        onClick={() => toggleLive(layer.id)}
                        className={`transition-colors flex items-center shrink-0 ${layer.isLive ? "text-[#ff0000] drop-shadow-[0_0_5px_rgba(255,0,0,0.8)]" : "text-white/50 hover:text-white"}`}
                        title={
                          layer.isLive ? "LIVE Mode Active" : "Enable LIVE Mode"
                        }
                      >
                        <Radio size={16} />
                      </button>
                    )}
                    {(layer.type === "deepstate" ||
                      (layer.type === "wildfires" &&
                        layer.wildfireMode === "gdacs")) &&
                      updateLayerDates && (
                        <div className="flex-1 flex justify-end">
                          <input
                            type="date"
                            max={new Date().toISOString().split("T")[0]}
                            value={
                              layer.startDate ||
                              new Date().toISOString().split("T")[0]
                            }
                            onChange={(e) =>
                              updateLayerDates(layer.id, e.target.value)
                            }
                            className="bg-black border border-white/20 px-2 py-1 text-xs text-white outline-none focus:border-white/50 w-full max-w-[140px]"
                            style={{ colorScheme: "dark" }}
                          />
                        </div>
                      )}
                    {(layer.type === "gdacs_earthquakes" ||
                      layer.type === "gdacs_volcanoes" ||
                      layer.type === "gdacs_cyclones" ||
                      (layer.type === "wildfires" &&
                        layer.wildfireMode === "effis")) &&
                      updateLayerDates && (
                        <div className="flex-1 flex flex-col items-end gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-white/50 min-w-[70px] text-right uppercase">
                              {t("from")}
                            </span>
                            <input
                              type="date"
                              max={new Date().toISOString().split("T")[0]}
                              value={
                                layer.startDate ||
                                new Date().toISOString().split("T")[0]
                              }
                              onChange={(e) =>
                                updateLayerDates(
                                  layer.id,
                                  e.target.value,
                                  layer.endDate,
                                )
                              }
                              className="bg-black border border-white/20 px-2 py-1 text-xs text-white outline-none focus:border-white/50 w-full max-w-[110px]"
                              style={{ colorScheme: "dark" }}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-white/50 min-w-[70px] text-right uppercase">
                              {t("to")}
                            </span>
                            <input
                              type="date"
                              max={new Date().toISOString().split("T")[0]}
                              value={
                                layer.endDate ||
                                new Date().toISOString().split("T")[0]
                              }
                              onChange={(e) =>
                                updateLayerDates(
                                  layer.id,
                                  layer.startDate,
                                  e.target.value,
                                )
                              }
                              className="bg-black border border-white/20 px-2 py-1 text-xs text-white outline-none focus:border-white/50 w-full max-w-[110px]"
                              style={{ colorScheme: "dark" }}
                            />
                          </div>
                        </div>
                      )}
                  </div>
                  {layer.type === "wildfires" && updateLayerProperty && (
                    <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-white font-semibold tracking-wider">
                          {t("DATA SOURCE")}
                        </label>
                        <div className="flex bg-white/10 rounded-full p-0.5">
                          <button
                            onClick={() =>
                              updateLayerProperty(
                                layer.id,
                                "wildfireMode",
                                "effis",
                              )
                            }
                            className={`text-[10px] px-3 py-1 rounded-full transition-colors ${layer.wildfireMode !== "gdacs" ? "bg-white text-black font-medium" : "text-white/60 hover:text-white"}`}
                          >
                            {t("All")} (EFFIS)
                          </button>
                          <button
                            onClick={() =>
                              updateLayerProperty(
                                layer.id,
                                "wildfireMode",
                                "gdacs",
                              )
                            }
                            className={`text-[10px] px-3 py-1 rounded-full transition-colors ${layer.wildfireMode === "gdacs" ? "bg-white text-black font-medium" : "text-white/60 hover:text-white"}`}
                          >
                            {t("Catastrophic")} (GDACS)
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {layer.id === "floods" && updateLayerDates && (
                    <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-white font-semibold tracking-wider">
                          {t("START DATE")}
                        </label>
                        <input
                          type="date"
                          value={layer.startDate || defaultStartDate}
                          onChange={(e) =>
                            updateLayerDates(
                              layer.id,
                              e.target.value,
                              layer.endDate || defaultEndDate,
                            )
                          }
                          className="bg-black border border-white/20 px-2 py-1 text-xs text-white outline-none focus:border-white/50"
                          style={{ colorScheme: "dark" }}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-white font-semibold tracking-wider">
                          {t("END DATE")}
                        </label>
                        <input
                          type="date"
                          value={layer.endDate || defaultEndDate}
                          onChange={(e) =>
                            updateLayerDates(
                              layer.id,
                              layer.startDate || defaultStartDate,
                              e.target.value,
                            )
                          }
                          className="bg-black border border-white/20 px-2 py-1 text-xs text-white outline-none focus:border-white/50"
                          style={{ colorScheme: "dark" }}
                        />
                      </div>
                    </div>
                  )}

                  {layer.type === "nighttime" && (
                    <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-white font-semibold tracking-wider">
                          {t("DATE")}
                        </label>
                        <input
                          type="date"
                          value={
                            layer.nighttimeDate ||
                            new Date().toISOString().split("T")[0]
                          }
                          onChange={(e) =>
                            updateLayerProperty(
                              layer.id,
                              "nighttimeDate",
                              e.target.value,
                            )
                          }
                          className="bg-black border border-white/20 px-2 py-1 text-xs text-white outline-none focus:border-white/50 rounded"
                          style={{ colorScheme: "dark" }}
                        />
                      </div>
                    </div>
                  )}

                  {(layer.customLayer === true || layer.id.startsWith("upload-") || layer.id.startsWith("url-")) && (
                    <div className="flex flex-col gap-1 mt-1 pt-2 border-t border-white/10">
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-[10px] text-white font-semibold tracking-wider">
                          {t("DATA SOURCE")}
                        </label>
                      </div>
                      <input
                        type="text"
                        placeholder={t("e.g. Mapbox, NASA, custom...")}
                        value={layer.dataSource || ""}
                        onChange={(e) =>
                          updateLayerProperty(
                            layer.id,
                            "dataSource",
                            e.target.value,
                          )
                        }
                        className="w-full bg-black border border-white/20 px-2 py-1 text-xs text-white outline-none focus:border-white/50 mb-3"
                      />
                    </div>
                  )}

                  <div
                    className={`flex flex-col gap-1 mt-1 ${layer.type === "deepstate" ? "" : "pt-2 border-t border-white/10"}`}
                  >
                    <div className="flex justify-between items-end">
                      <label className="text-[10px] text-white font-semibold tracking-wider">
                        {t("OPACITY")}
                      </label>
                      <span className="text-[10px] text-white/70 font-mono">
                        {Math.round(
                          (layer.opacity ??
                            (layer.type === "deepstate" ||
                            layer.type === "nighttime"
                              ? 0.5
                              : 1.0)) * 100,
                        )}
                        %
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={
                        (layer.opacity ??
                          (layer.type === "deepstate" ||
                          layer.type === "nighttime"
                            ? 0.5
                            : 1.0)) * 100
                      }
                      onChange={(e) =>
                        updateLayerProperty(
                          layer.id,
                          "opacity",
                          Number(e.target.value) / 100,
                        )
                      }
                      className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                    />
                  </div>

                  {(layer.type === "raster" || layer.type === "satellite") && (
                    <details className="mt-3 group">
                      <summary className="text-[10px] text-white font-semibold tracking-wider cursor-pointer select-none hover:text-white transition-colors flex items-center justify-between uppercase">
                        {t("Adjustments")}
                        <span className="group-open:rotate-180 transition-transform text-xs">
                          ▼
                        </span>
                      </summary>
                      <div className="pt-3 pb-1 flex flex-col gap-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between items-end">
                            <label className="text-[10px] text-white font-semibold tracking-wider">
                              {t("BRIGHTNESS")}
                            </label>
                            <span className="text-[10px] text-white/70 font-mono">
                              {Math.round((layer.brightness ?? 0) * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min="-100"
                            max="100"
                            value={(layer.brightness ?? 0) * 100}
                            onChange={(e) =>
                              updateLayerProperty(
                                layer.id,
                                "brightness",
                                Number(e.target.value) / 100,
                              )
                            }
                            onDoubleClick={() =>
                              updateLayerProperty(layer.id, "brightness", 0)
                            }
                            className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                            title="Double-click to reset"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between items-end">
                            <label className="text-[10px] text-white font-semibold tracking-wider">
                              {t("CONTRAST")}
                            </label>
                            <span className="text-[10px] text-white/70 font-mono">
                              {Math.round((layer.contrast ?? 0) * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min="-100"
                            max="100"
                            value={(layer.contrast ?? 0) * 100}
                            onChange={(e) =>
                              updateLayerProperty(
                                layer.id,
                                "contrast",
                                Number(e.target.value) / 100,
                              )
                            }
                            onDoubleClick={() =>
                              updateLayerProperty(layer.id, "contrast", 0)
                            }
                            className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                            title="Double-click to reset"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between items-end">
                            <label className="text-[10px] text-white font-semibold tracking-wider">
                              {t("SATURATION")}
                            </label>
                            <span className="text-[10px] text-white/70 font-mono">
                              {Math.round((layer.saturation ?? 0) * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min="-100"
                            max="100"
                            value={(layer.saturation ?? 0) * 100}
                            onChange={(e) =>
                              updateLayerProperty(
                                layer.id,
                                "saturation",
                                Number(e.target.value) / 100,
                              )
                            }
                            onDoubleClick={() =>
                              updateLayerProperty(layer.id, "saturation", 0)
                            }
                            className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                            title="Double-click to reset"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between items-end">
                            <label className="text-[10px] text-white font-semibold tracking-wider">
                              {t("HUE ROTATE")}
                            </label>
                            <span className="text-[10px] text-white/70 font-mono">
                              {layer.hue ?? 0}°
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="360"
                            value={layer.hue ?? 0}
                            onChange={(e) =>
                              updateLayerProperty(
                                layer.id,
                                "hue",
                                Number(e.target.value),
                              )
                            }
                            onDoubleClick={() =>
                              updateLayerProperty(layer.id, "hue", 0)
                            }
                            className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                            title="Double-click to reset"
                          />
                        </div>
                      </div>
                    </details>
                  )}
                </div>
              ) : layer.type === "flights" ? (
                <div className="flex flex-col gap-4 pb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white font-semibold tracking-wider uppercase">
                      {t("tail labels")}
                    </span>
                    <button
                      onClick={() =>
                        updateLayerProperty(
                          layer.id,
                          "showCallsigns",
                          !layer.showCallsigns,
                        )
                      }
                      className={`transition-colors ${layer.showCallsigns ? "text-white" : "text-white/50 hover:text-white"}`}
                      title={
                        layer.showCallsigns
                          ? "Hide Callsigns"
                          : "Show Callsigns"
                      }
                    >
                      {layer.showCallsigns ? (
                        <Eye size={18} />
                      ) : (
                        <EyeOff size={18} />
                      )}
                    </button>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] text-white font-semibold tracking-wider">
                      {t("SEARCH CALLSIGN / REGISTRATION")}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Enter callsign..."
                        className="w-full bg-black/50 border border-white/10 px-3 py-1.5 text-sm outline-none focus:border-white/30"
                        onChange={() => setAircraftSearchError(false)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const val = e.currentTarget.value
                              .trim()
                              .toUpperCase();
                            if (val) {
                              setAircraftSearchError(false);
                              const event = new CustomEvent("searchAircraft", {
                                detail: val,
                              });
                              window.dispatchEvent(event);
                            }
                          }
                        }}
                      />
                    </div>
                    {aircraftSearchError && (
                      <div className="text-red-500 text-[10px] mt-1">
                        {t("Callsign not found in visible airspace, try zooming out")}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] text-white font-semibold tracking-wider uppercase">
                      {selectedAircraftId
                        ? `${t("color")} (AIRCRAFT ${selectedAircraftId})`
                        : t("global aircraft color")}
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {colorPalette.map((color) => (
                        <button
                          key={color}
                          onClick={() => {
                            if (selectedAircraftId) {
                              const existingColors = layer.aircraftColors || {};
                              updateLayerProperty(layer.id, "aircraftColors", {
                                ...existingColors,
                                [String(selectedAircraftId)]: color,
                              });
                            } else {
                              updateLayerProperty(
                                layer.id,
                                "globalAircraftColor",
                                color,
                              );
                            }
                          }}
                          className="w-6 h-6 flex-shrink-0 transition-colors relative"
                          style={{ backgroundColor: color }}
                          title={color}
                        >
                          {((selectedAircraftId &&
                            layer.aircraftColors?.[
                              String(selectedAircraftId)
                            ] === color) ||
                            (!selectedAircraftId &&
                              layer.globalAircraftColor === color)) && (
                            <div className="absolute inset-0 flex items-center justify-center mix-blend-difference text-white text-xs">
                              ✓
                            </div>
                          )}
                        </button>
                      ))}
                      <button
                        key="transparent"
                        onClick={() => {
                          if (selectedAircraftId) {
                            const existingColors = { ...layer.aircraftColors };
                            delete existingColors[String(selectedAircraftId)];
                            updateLayerProperty(
                              layer.id,
                              "aircraftColors",
                              existingColors,
                            );
                          } else {
                            updateLayerProperty(
                              layer.id,
                              "globalAircraftColor",
                              undefined,
                            );
                          }
                        }}
                        className="w-6 h-6 relative overflow-hidden flex-shrink-0 transition-colors"
                        title={t("Reset to Default White")}
                      >
                        <div className="absolute inset-0 bg-white/10 flex items-center justify-center">
                          <div className="w-full h-0 border-t border-red-500 transform rotate-45"></div>
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 mt-2 border-t border-white/10 pt-3">
                    <div className="flex justify-between items-end">
                      <label className="text-[10px] text-white font-semibold tracking-wider">
                        {t("FLIGHTPATH OPACITY")}
                      </label>
                      <span className="text-[10px] text-white/70 font-mono">
                        {Math.round((layer.flightpathOpacity ?? 0.8) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={(layer.flightpathOpacity ?? 0.8) * 100}
                      onChange={(e) =>
                        updateLayerProperty(
                          layer.id,
                          "flightpathOpacity",
                          Number(e.target.value) / 100,
                        )
                      }
                      className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                    />
                  </div>
                </div>
              ) : layer.type === "vessels" ? (
                <div className="flex flex-col gap-4 pb-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] text-white font-semibold tracking-wider uppercase">
                      {selectedVesselMmsi
                        ? `${t("color")} (VESSEL MMSI: ${selectedVesselMmsi})`
                        : t("global vessel color")}
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {colorPalette.map((color) => (
                        <button
                          key={color}
                          onClick={() => {
                            if (selectedVesselMmsi) {
                              const existingColors = layer.vesselColors || {};
                              updateLayerProperty(layer.id, "vesselColors", {
                                ...existingColors,
                                [String(selectedVesselMmsi)]: color,
                              });
                            } else {
                              updateLayerProperty(
                                layer.id,
                                "globalVesselColor",
                                color,
                              );
                            }
                          }}
                          className="w-6 h-6 flex-shrink-0 transition-colors relative"
                          style={{ backgroundColor: color }}
                          title={color}
                        >
                          {((selectedVesselMmsi &&
                            layer.vesselColors?.[String(selectedVesselMmsi)] ===
                              color) ||
                            (!selectedVesselMmsi &&
                              layer.globalVesselColor === color)) && (
                            <div className="absolute inset-0 flex items-center justify-center mix-blend-difference text-white text-xs">
                              ✓
                            </div>
                          )}
                        </button>
                      ))}
                      <button
                        key="transparent"
                        onClick={() => {
                          if (selectedVesselMmsi) {
                            const existingColors = { ...layer.vesselColors };
                            delete existingColors[String(selectedVesselMmsi)];
                            updateLayerProperty(
                              layer.id,
                              "vesselColors",
                              existingColors,
                            );
                          } else {
                            updateLayerProperty(
                              layer.id,
                              "globalVesselColor",
                              undefined,
                            );
                          }
                        }}
                        className="w-6 h-6 relative overflow-hidden flex-shrink-0 transition-colors"
                        title={t("Reset to Default White")}
                      >
                        <div className="absolute inset-0 bg-white/10 flex items-center justify-center">
                          <div className="w-full h-0 border-t border-red-500 transform rotate-45"></div>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              ) : layer.type === "weather_forecast" ? (
                <div className="flex flex-col gap-4 pb-2">

                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-end">
                      <label className="text-[10px] text-white/50 font-semibold tracking-wider uppercase">
                        {t("OPACITY")}
                      </label>
                      <span className="text-[10px] text-white/70 font-mono">
                        {Math.round((layer.opacity ?? 0.75) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={Math.round((layer.opacity ?? 0.75) * 100)}
                      onChange={(e) =>
                        updateLayerProperty(
                          layer.id,
                          "opacity",
                          Number(e.target.value) / 100,
                        )
                      }
                      className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                    />
                  </div>


                  <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-white/10">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() =>
                          updateLayerProperty(
                            layer.id,
                            "showCityTemperatures",
                            layer.showCityTemperatures !== false,
                          )
                        }
                        className="flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-[10px] font-semibold tracking-wider uppercase text-left"
                      >
                        {t("City Temp.")}
                        <div
                          className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${layer.showCityTemperatures !== false ? "bg-white" : "bg-white/20"}`}
                        >
                          <div
                            className={`w-3 h-3 rounded-full absolute top-1 transition-all ${layer.showCityTemperatures !== false ? "left-5 bg-black" : "left-1 bg-white"}`}
                          />
                        </div>
                      </button>
                      <button
                        onClick={() =>
                          updateLayerProperty(
                            layer.id,
                            "showCityWeatherIcons",
                            layer.showCityWeatherIcons !== false,
                          )
                        }
                        className={`flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-[10px] font-semibold tracking-wider uppercase text-left ${layer.showCityTemperatures === false && layer.showCityWeatherIcons === false ? "opacity-50" : ""}`}
                      >
                        {t("City Icons")}
                        <div
                          className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${layer.showCityWeatherIcons !== false ? "bg-white" : "bg-white/20"}`}
                        >
                          <div
                            className={`w-3 h-3 rounded-full absolute top-1 transition-all ${layer.showCityWeatherIcons !== false ? "left-5 bg-black" : "left-1 bg-white"}`}
                          />
                        </div>
                      </button>
                      <button
                        onClick={() =>
                          updateLayerProperty(
                            layer.id,
                            "limitCityWeatherToGermany",
                            !layer.limitCityWeatherToGermany,
                          )
                        }
                        className="flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-[10px] font-semibold tracking-wider uppercase text-left col-span-2"
                      >
                        {t("Limit to Germany")}
                        <div
                          className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${layer.limitCityWeatherToGermany ? "bg-white" : "bg-white/20"}`}
                        >
                          <div
                            className={`w-3 h-3 rounded-full absolute top-1 transition-all ${layer.limitCityWeatherToGermany ? "left-5 bg-black" : "left-1 bg-white"}`}
                          />
                        </div>
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      updateLayerProperty(
                        layer.id,
                        "showWindParticles",
                        !layer.showWindParticles,
                      )
                    }
                    className={`w-full py-2 flex items-center justify-center gap-2 text-sm transition-colors border border-white/20 rounded-full mt-2 ${layer.showWindParticles ? "bg-white text-black font-semibold" : "text-white/60 hover:text-white hover:bg-white/5"}`}
                  >
                    {t("Wind Overlay")}
                  </button>

                  {layer.showWindParticles && (
                    <div className="flex flex-col gap-4 mt-2 pt-4 border-t border-white/10">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() =>
                            updateLayerProperty(
                              layer.id,
                              "windParticleSizeBySpeed",
                              layer.windParticleSizeBySpeed !== true,
                            )
                          }
                          className="flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-[10px] font-semibold tracking-wider uppercase text-left"
                        >
                          {t("Size by speed")}
                          <div
                            className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${layer.windParticleSizeBySpeed === true ? "bg-white" : "bg-white/20"}`}
                          >
                            <div
                              className={`w-3 h-3 rounded-full absolute top-1 transition-all ${layer.windParticleSizeBySpeed === true ? "left-5 bg-black" : "left-1 bg-white"}`}
                            />
                          </div>
                        </button>
                        <button
                          onClick={() =>
                            updateLayerProperty(
                              layer.id,
                              "windParticleSpeedBySpeed",
                              layer.windParticleSpeedBySpeed === false,
                            )
                          }
                          className="flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-[10px] font-semibold tracking-wider uppercase text-left"
                        >
                          {t("Motion by speed")}
                          <div
                            className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${layer.windParticleSpeedBySpeed !== false ? "bg-white" : "bg-white/20"}`}
                          >
                            <div
                              className={`w-3 h-3 rounded-full absolute top-1 transition-all ${layer.windParticleSpeedBySpeed !== false ? "left-5 bg-black" : "left-1 bg-white"}`}
                            />
                          </div>
                        </button>

                      </div>

                      <div className="flex flex-col gap-1 mt-2 border-t border-white/10 pt-3">
                        <div className="flex justify-between items-end">
                          <label className="text-[10px] text-white/50 font-semibold tracking-wider">
                            {t("WIND OPACITY")}
                          </label>
                          <span className="text-[10px] text-white/70 font-mono">
                            {Math.round((layer.windOpacity ?? 1) * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={(layer.windOpacity ?? 1) * 100}
                          onChange={(e) =>
                            updateLayerProperty(
                              layer.id,
                              "windOpacity",
                              Number(e.target.value) / 100,
                            )
                          }
                          className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-end">
                          <label className="text-[10px] text-white/50 font-semibold tracking-wider">
                            {t("PARTICLE SIZE")}
                          </label>
                          <span className="text-[10px] text-white/70 font-mono">
                            {(layer.windParticleSize ?? 1.2).toFixed(1)}px
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="3"
                          step="0.1"
                          value={layer.windParticleSize ?? 1.2}
                          onChange={(e) =>
                            updateLayerProperty(
                              layer.id,
                              "windParticleSize",
                              Number(e.target.value),
                            )
                          }
                          className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-end">
                          <label className="text-[10px] text-white/50 font-semibold tracking-wider">
                            {t("PARTICLE TRAIL")}
                          </label>
                          <span className="text-[10px] text-white/70 font-mono">
                            {Math.round(layer.windParticleTrail ?? 90)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={layer.windParticleTrail ?? 90}
                          onChange={(e) =>
                            updateLayerProperty(
                              layer.id,
                              "windParticleTrail",
                              Number(e.target.value),
                            )
                          }
                          className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Swatches */}
                  <div className="flex flex-wrap gap-1">
                    {colorPalette.map(renderColorSwatch)}
                    {renderColorSwatch("transparent")}
                  </div>

                  <div className="flex items-center justify-between">
                    {/* Toggle fill / outline target & Swap */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditTarget("fill")}
                        className={`p-1 flex items-center justify-center transition-colors ${editTarget === "fill" ? "text-white" : "text-white/50 hover:text-white"}`}
                        title={t("Edit Fill")}
                      >
                        <Square size={16} fill="currentColor" stroke="none" />
                      </button>
                      <button
                        onClick={() => setEditTarget("outline")}
                        className={`p-1 flex items-center justify-center transition-colors ${editTarget === "outline" ? "text-white" : "text-white/50 hover:text-white"}`}
                        title={t("Edit Outline")}
                      >
                        <Square size={16} />
                      </button>
                      <button
                        onClick={handleSwap}
                        className="text-white/50 hover:text-white transition-colors p-1 rounded-full"
                        title={t("Swap Fill and Outline")}
                      >
                        <RefreshCcw size={16} />
                      </button>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      {saveAsPreset && (
                        <button
                          onClick={() => saveAsPreset(layer)}
                          className="text-white/50 hover:text-white transition-colors p-1"
                          title={t("Save as Preset")}
                        >
                          <BookmarkPlus size={16} />
                        </button>
                      )}
                      {duplicateLayer && (
                        <button
                          onClick={() => duplicateLayer(layer.id)}
                          className="text-white/50 hover:text-white transition-colors p-1"
                          title={t("Duplicate Layer")}
                        >
                          <Copy size={16} />
                        </button>
                      )}
                      <button
                        onClick={handleReset}
                        className="text-white/50 hover:text-white transition-colors p-1 rounded-full"
                        title={t("Reset Styles")}
                      >
                        <RotateCcw size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Opacity slider */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-end">
                      <label className="text-[10px] text-white font-semibold tracking-wider">
                        {t("OPACITY")}
                      </label>
                      <span className="text-[10px] text-white/70 font-mono">
                        {Math.round(
                          (editTarget === "fill"
                            ? currentFillOpacity
                            : currentOutlineOpacity) * 100,
                        )}
                        %
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={
                        (editTarget === "fill"
                          ? currentFillOpacity
                          : currentOutlineOpacity) * 100
                      }
                      onChange={(e) =>
                        handleOpacityChange(Number(e.target.value) / 100)
                      }
                      className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Outline width slider */}
                  <div className="flex flex-col gap-1 pb-2">
                    <div className="flex justify-between items-end">
                      <label className="text-[10px] text-white font-semibold tracking-wider">
                        {t("STROKE WIDTH")}
                      </label>
                      <span className="text-[10px] text-white/70 font-mono">
                        {currentOutlineWidth}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="20"
                      value={currentOutlineWidth}
                      onChange={(e) =>
                        handleWidthChange(Number(e.target.value))
                      }
                      className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {layer.type === "split" && (
            <div className="flex flex-col w-full">
              {layer.splitLayers?.map((child) => (
                <LayerItem
                  key={child.id}
                  {...props}
                  layer={child}
                  isNestedChild={true}
                />
              ))}
              {Array.from({ length: 2 - (layer.splitLayers?.length || 0) }).map(
                (_, i) => (
                  <div
                    key={`empty-${i}`}
                    data-drop-zone="split-container"
                    data-layer-id={layer.id}
                    className={`ml-6 transition-all duration-300 ${isDraggingLayer ? "h-12 mt-[2px]" : "h-0 overflow-hidden"}`}
                  >
                    <div
                      className={`relative h-full flex items-center justify-center select-none transition-colors duration-200 border-2 border-dashed ${isDraggingLayer ? "border-white bg-white/5" : "border-transparent bg-transparent"} rounded-full`}
                    >
                      <span className="text-xs text-white/40 font-semibold tracking-wider uppercase">
                        DROP LAYER HERE
                      </span>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </Wrapper>
    </div>
  );
}

const ScreenshotMap = ({ styleUrl, onReady }: { styleUrl: string, onReady: (dataUrl: string) => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!containerRef.current) return;
    let mapStyle = styleUrl;
    if (typeof styleUrl === 'string' && styleUrl.startsWith('solid:')) {
      mapStyle = {
        version: 8,
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: { 'background-color': styleUrl.replace('solid:', '') }
          }
        ]
      } as any;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [10.45, 51.16],
      zoom: 4,
      preserveDrawingBuffer: true,
      interactive: false,
      attributionControl: false
    } as any);

    let isRemoved = false;
    map.once('idle', () => {
      if (isRemoved) return;
      try {
        const data = map.getCanvas().toDataURL('image/png');
        onReady(data);
      } catch (e) {
        console.error("Screenshot capture failed:", e);
      }
    });

    return () => {
      if (!isRemoved) {
        isRemoved = true;
        map.remove();
      }
    };
  }, [styleUrl, onReady]);

  return (
    <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '256px', height: '256px' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
