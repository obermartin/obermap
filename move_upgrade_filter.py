with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    text = f.read()

import re

# find upgradeLegacyFilter function block
start_idx = text.find("  const upgradeLegacyFilter = (filter: any): any => {")
if start_idx != -1:
    end_idx = text.find("  };", start_idx) + 4
    func_text = text[start_idx:end_idx]
    
    # remove from MapboxMap.tsx
    text = text[:start_idx] + text[end_idx:]
    with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
        f.write(text)
        
    # convert const upgradeLegacyFilter = ... to export const upgradeLegacyFilter
    func_text = func_text.replace("  const upgradeLegacyFilter", "export const upgradeLegacyFilter")
    
    # append to mapUtils.ts
    with open('frontend/src/utils/mapUtils.ts', 'a') as f:
        f.write("\n" + func_text + "\n")
        
    print("Moved upgradeLegacyFilter to mapUtils.ts")
else:
    print("Could not find upgradeLegacyFilter")

