with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    text = f.read()

start_str = "  useEffect(() => {\n    if (!mapContainer.current) return;\n\n    setMapLoaded(false);"
start_idx = text.find(start_str)

if start_idx != -1:
    brace_count = 0
    in_block = False
    
    for i in range(start_idx, len(text)):
        if text[i] == '{':
            brace_count += 1
            in_block = True
        elif text[i] == '}':
            brace_count -= 1
            
        if in_block and brace_count == 0:
            end_idx = text.find(");", i)
            if end_idx != -1:
                block_text = text[start_idx:end_idx + 2]
                with open('init_block_full.txt', 'w') as out:
                    out.write(block_text)
                print("Extracted full init block.")
                break
else:
    print("Could not find start of init block.")
