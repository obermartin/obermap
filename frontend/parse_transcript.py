import json
import re

with open('/Users/obermartin/.gemini/antigravity/brain/cf4cac6a-5cc9-403f-b240-68761f6ea4c4/.system_generated/logs/transcript_full.jsonl', 'r') as f:
    for line in f:
        data = json.loads(line)
        if data.get('type') == 'USER_INPUT' and 'OSM Liberty' in data.get('content', ''):
            content = data['content']
            idx = content.find('{')
            if idx != -1:
                json_str = content[idx:]
                # Extract up to the matching closing brace
                open_braces = 0
                end_idx = -1
                for i, char in enumerate(json_str):
                    if char == '{': open_braces += 1
                    elif char == '}': 
                        open_braces -= 1
                        if open_braces == 0:
                            end_idx = i
                            break
                if end_idx != -1:
                    json_str = json_str[:end_idx+1]
                try:
                    style = json.loads(json_str)
                    for layer in style.get('layers', []):
                        if layer.get('type') == 'symbol':
                            print(layer.get('id'), layer.get('source-layer'))
                except Exception as e:
                    print("Parse error:", e)
