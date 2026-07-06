with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    text = f.read()

start_idx = text.find("  useEffect(() => {\n    if (!mapContainer.current) return;")
end_idx = text.find("  }, [settings.defaultView, mapStyleKey, forceRemount, t]);", start_idx)
if start_idx != -1 and end_idx != -1:
    with open('init_block.txt', 'w') as f:
        f.write(text[start_idx:end_idx + 60])
    print("Extracted initialization block.")
