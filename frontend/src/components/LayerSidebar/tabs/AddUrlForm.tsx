import React, { useState } from "react";
import { Link } from "lucide-react";
import { useTranslation } from "../../../contexts/I18nContext";
import type { AppSettings, MapLayer } from "../../../types";

export interface AddUrlFormProps {
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export const AddUrlForm: React.FC<AddUrlFormProps> = ({ setSettings }) => {
  const { t } = useTranslation();
  const [urlInput, setUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);

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

  if (showUrlInput) {
    return (
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
    );
  }

  return (
    <button
      onClick={() => setShowUrlInput(true)}
      className="w-full py-2 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-sm transition-colors rounded-full glass-bottom-btn"
    >
      <Link size={16} /> {t("Add WMTS/WMS URL")}
    </button>
  );
};
