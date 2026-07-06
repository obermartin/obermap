import re

with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    text = f.read()

with open('block__Update_mapbox_features_when_annotations_change.txt', 'r') as f:
    block1 = f.read()

with open('block__Animation_Loop_for_Reveals.txt', 'r') as f:
    block2 = f.read()

with open('block__Update_selected_annotation_filter.txt', 'r') as f:
    block3 = f.read()

# Replace block1 with the hook call
hook_call = """  useAnnotationsStream({
    map: mapRef.current,
    mapLoaded,
    annotations,
    setAnnotations,
    selectedAnnotationId,
    setSelectedAnnotationId,
    revealedTriggers,
    hiddenTriggers,
    triggerProgressRef,
    triggerTimestampsRef,
    animationTick,
    setAnimationTick
  });"""

text = text.replace(block1, hook_call)
text = text.replace(block2, "")
text = text.replace(block3, "")

# remove local refs from MapboxMap.tsx
text = re.sub(r'  const baseFeaturesRef = useRef<\{ \[id: string\]: any \}>\(\{\}\);\n', '', text)
text = re.sub(r'  const activeFeaturesRef = useRef<\{ \[id: string\]: any \}>\(\{\}\);\n', '', text)
text = re.sub(r'  const markersRef = useRef<\{ \[id: string\]: maplibregl\.Marker \}>\(\{\}\);\n', '', text)
text = re.sub(r'  const cachedTurfDataRef = useRef<\{ \[id: string\]: any \}>\(\{\}\);\n', '', text)
# setAnnotationsRef is actually used in MapboxMap.tsx for other things! Wait. I will leave it in MapboxMap.tsx if it's used elsewhere, but useAnnotationsStream needs its own or we can just pass it.
# Actually let's not remove setAnnotationsRef from MapboxMap.tsx just yet.

# Add import
text = text.replace(
    "import { useMapInitialization } from '../hooks/useMapInitialization';",
    "import { useMapInitialization } from '../hooks/useMapInitialization';\nimport { useAnnotationsStream } from '../hooks/useAnnotationsStream';"
)

with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(text)


hook_content = f"""import {{ useEffect, useRef }} from 'react';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import type {{ Annotation }} from '../types';

export interface AnnotationsStreamProps {{
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  annotations: Annotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  selectedAnnotationId: string | null;
  setSelectedAnnotationId: React.Dispatch<React.SetStateAction<string | null>>;
  revealedTriggers: Set<string>;
  hiddenTriggers: Set<string>;
  triggerProgressRef: React.MutableRefObject<Record<string, number>>;
  triggerTimestampsRef: React.MutableRefObject<Record<string, number>>;
  animationTick: number;
  setAnimationTick: React.Dispatch<React.SetStateAction<number>>;
}}

export const useAnnotationsStream = ({{
  map,
  mapLoaded,
  annotations,
  setAnnotations,
  selectedAnnotationId,
  setSelectedAnnotationId,
  revealedTriggers,
  hiddenTriggers,
  triggerProgressRef,
  triggerTimestampsRef,
  animationTick,
  setAnimationTick
}}: AnnotationsStreamProps) => {{
  const baseFeaturesRef = useRef<{{ [id: string]: any }}>({{}});
  const activeFeaturesRef = useRef<{{ [id: string]: any }}>({{}});
  const markersRef = useRef<{{ [id: string]: maplibregl.Marker }}>({{}});
  const cachedTurfDataRef = useRef<{{ [id: string]: any }}>({{}});
  const setAnnotationsRef = useRef(setAnnotations);

  useEffect(() => {{
    setAnnotationsRef.current = setAnnotations;
  }}, [setAnnotations]);

{block1}

{block2}

{block3}
}};
"""

with open('frontend/src/hooks/useAnnotationsStream.ts', 'w') as f:
    f.write(hook_content)

print("Generated useAnnotationsStream.ts!")
