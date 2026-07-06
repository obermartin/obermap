import re

with open('frontend/src/hooks/useAnnotationTools.ts', 'r') as f:
    hook = f.read()

hook = hook.replace("selectedIconId: string | undefined;", "selectedIconId: string | null | undefined;")

lines = hook.split("\n")
# remove duplicate imports
seen = set()
new_lines = []
for line in lines:
    if line.startswith("import maplibregl"):
        if "maplibregl" not in seen:
            seen.add("maplibregl")
            new_lines.append(line)
    elif line.startswith("import { customAlert, customPrompt }"):
        continue # remove unused imports
    else:
        new_lines.append(line)

hook = "\n".join(new_lines)
hook = hook.replace("import type { Annotation, ToolType, StrokeType, RouteMode, AppSettings } from '../types';", "import type { Annotation, ToolType, StrokeType, RouteMode, AppSettings } from '../types';\nimport { createArrowFeatures } from '../utils/mapUtils';")

with open('frontend/src/hooks/useAnnotationTools.ts', 'w') as f:
    f.write(hook)

print("Final fix 2 done.")
