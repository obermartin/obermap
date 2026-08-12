// @ts-nocheck
import React, { useRef, useState, useEffect } from "react";
import { Reorder, motion, AnimatePresence } from "framer-motion";
import { Upload, Link, X, Layers, Trash2, RefreshCcw, Copy, Settings, Save, Loader2, Image as ImageIcon, ChevronDown, ChevronRight, Video, Home, Tag, Download, Crop } from "lucide-react";
import { useTranslation } from "../../../contexts/I18nContext";
import { parseMapFileWithIds } from "../../../utils/fileUtils";
import { customAlert, customConfirm, customPrompt } from "../../../utils/dialogService";
import { globalLabelManager } from "../../../labels/LabelMarkerManager";
import { DEFAULT_LAYERS } from "../constants";
import { TemplatePreview } from "../TemplatePreview";
import { CategoryItem } from "../CategoryItem";
import { LayerItem } from "../LayerItem";
import { ScreenshotMap } from "../ScreenshotMap";
import type { AppSettings, MapLayer, BaseMapStyle } from "../../../types";
import type { LayerSidebarTabProps } from "./types";

import { GeneralSettings } from "./settings/GeneralSettings";
import { ColorPaletteSettings } from "./settings/ColorPaletteSettings";
import { BasemapSettings } from "./settings/BasemapSettings";
import { TerrainSettings } from "./settings/TerrainSettings";
import { AdvancedSettings } from "./settings/AdvancedSettings";

export const SettingsTab = (props: LayerSidebarTabProps) => {
  const { settings, setSettings, currentShow } = props;

  return (
    <React.Fragment>
      <div className="p-4 flex flex-col gap-6 flex-1 overflow-y-auto custom-scrollbar">
        <GeneralSettings settings={settings} setSettings={setSettings} currentShow={currentShow} />
        <ColorPaletteSettings settings={settings} setSettings={setSettings} />
        <BasemapSettings settings={settings} setSettings={setSettings} />
        <TerrainSettings settings={settings} setSettings={setSettings} />
        <AdvancedSettings settings={settings} setSettings={setSettings} />
      </div>
    </React.Fragment>
  );
};
