import re

with open('../label sources/manifest-builder.html', 'r') as f:
    html = f.read()

# Replace:
#         <input type="text" id="previewSecondary" value="STATION" placeholder="secondary text" disabled>
#         </div>
#       </div>
#       <div class="typography-panels" style="display: flex; border-top: 1px solid var(--border);">

# With:
#         <input type="text" id="previewSecondary" value="STATION" placeholder="secondary text" disabled>
#       </div>
#       <div class="typography-panels" style="display: flex; border-top: 1px solid var(--border);">

target = '''        <input type="text" id="previewSecondary" value="STATION" placeholder="secondary text" disabled>
        </div>
      </div>
      <div class="typography-panels" style="display: flex; border-top: 1px solid var(--border);">'''

replacement = '''        <input type="text" id="previewSecondary" value="STATION" placeholder="secondary text" disabled>
      </div>
      <div class="typography-panels" style="display: flex; border-top: 1px solid var(--border);">'''

html = html.replace(target, replacement)

with open('../label sources/manifest-builder.html', 'w') as f:
    f.write(html)

print("Fixed tags")
