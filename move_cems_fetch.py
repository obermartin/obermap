import re

with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    content = f.read()

# We need to find the block of cemsFetchQueue stuff
cems_queue_regex = r"(const MAX_CONCURRENT_CEMS_FETCHES = [\s\S]*?    \}\n  \}\n\})"
match = re.search(cems_queue_regex, content)
if match:
    cems_block = match.group(1)
    # Remove it from MapboxMap.tsx
    content = content.replace(cems_block, "")
    with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
        f.write(content)
    
    # Append to mapUtils.ts and export
    cems_block = cems_block.replace("function enqueueCemsFetch", "export function enqueueCemsFetch")
    cems_block = cems_block.replace("async function safeFetchCemsJson", "export async function safeFetchCemsJson")
    
    with open('frontend/src/utils/mapUtils.ts', 'a') as f:
        f.write("\n\n" + cems_block + "\n")
    print("Moved CEMS fetch queue to mapUtils.ts")
else:
    print("Could not find CEMS fetch queue block")
