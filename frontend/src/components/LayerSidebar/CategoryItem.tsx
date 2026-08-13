import React, { useRef, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { GripVertical, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { customConfirm } from "../../utils/dialogService";
import { useTranslation } from "../../contexts/I18nContext";


export const CategoryItem = ({
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
      <div className="glass-outlined-container relative flex flex-col transition-all duration-300 w-full rounded-3xl overflow-hidden">
        <div className="relative p-3 flex items-center justify-between gap-3 bg-black">
          <div className="flex items-center gap-2 flex-1">
            <div
              onPointerDown={(e) => controls.start(e)}
              className="cursor-grab active:cursor-grabbing shrink-0 flex items-center p-1"
            >
              <GripVertical size={14} className="text-ui-text/30" />
            </div>
            <button
              onClick={() =>
                setExpandedCategories((prev: any) => ({
                  ...prev,
                  [category.id]: !isExpanded,
                }))
              }
              className="p-1 transition-colors text-ui-text/50 hover:text-ui-text shrink-0"
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
                  className="w-full bg-black border border-ui-border text-sm font-semibold tracking-wide px-1 outline-none text-ui-text focus:border-ui-text/50"
                />
              ) : (
                <div
                  className="text-sm font-semibold tracking-wide text-ui-text truncate cursor-text"
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
            className="text-ui-text/30 hover:text-ui-text transition-colors p-1 shrink-0"
            title={t("Delete Category")}
          >
            <Trash2 size={14} />
          </button>
        </div>

        {isExpanded && (
          <div
            className="flex flex-wrap gap-2 items-center p-3 bg-black border-t border-ui-border/50"
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
                className="w-10 h-10 relative group cursor-grab active:cursor-grabbing flex items-center justify-center bg-black text-ui-text shrink-0"
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
                  className="absolute inset-0 bg-ui-text text-ui-bg hidden group-hover:flex items-center justify-center text-xs font-bold transition-opacity"
                  title={t("Remove icon")}
                >
                  ×
                </button>
              </div>
            ))}

            <label
              className="w-10 h-10 border border-ui-border flex items-center justify-center bg-black text-ui-text hover:bg-ui-text hover:text-ui-bg transition-colors shrink-0 cursor-pointer"
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
      </div>
    </Reorder.Item>
  );
};


