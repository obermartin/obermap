import re

with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    mapbox = f.read()

start_str = "  // Synchronize dynamic map layers\n  useEffect(() => {\n"
start_idx = mapbox.find(start_str)

if start_idx == -1:
    print("Could not find start_str")
else:
    # Find the first brace
    brace_start = mapbox.find("{", start_idx)
    open_braces = 0
    in_string = False
    escape = False
    quote_char = None
    
    end_idx = -1
    for i in range(brace_start, len(mapbox)):
        char = mapbox[i]
        
        if in_string:
            if escape:
                escape = False
            elif char == '\\':
                escape = True
            elif char == quote_char:
                in_string = False
        else:
            if char in ["'", '"', '`']:
                in_string = True
                quote_char = char
            elif char == '{':
                open_braces += 1
            elif char == '}':
                open_braces -= 1
                if open_braces == 0:
                    end_idx = i + 1
                    break

    if end_idx != -1:
        # We found the end of the block body: `}`
        # The effect ends with `  }, [deps]);`
        closing_semicolon = mapbox.find(";", end_idx) + 1
        effect_block = mapbox[start_idx:closing_semicolon]
        print(f"Effect block length: {len(effect_block)}")
        print(f"Effect block dependencies: {effect_block.split('}')[-1]}")
        with open('effect_block.txt', 'w') as f:
            f.write(effect_block)
    else:
        print("Could not find end of effect.")
