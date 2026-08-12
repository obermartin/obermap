import type { AppSettings, MapLayer } from '../types';
import { updateLayerRecursively } from '../utils/layerUtils';
import { customAlert } from '../utils/dialogService';
import { parseMapFileWithIds } from '../utils/fileUtils';

interface UseLayerManagementProps {
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  t: (key: string) => string;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

export function useLayerManagement({ setSettings, t, fileInputRef }: UseLayerManagementProps) {
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
        animationTriggerId: undefined,
        hideAnimationTriggerId: undefined,
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

  return {
    saveAsPreset,
    toggleLayerVisibility,
    removeLayer,
    renameLayer,
    duplicateLayer,
    handleDragEnd,
    handleFileUpload
  };
}
