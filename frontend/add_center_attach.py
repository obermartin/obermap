with open('../label sources/manifest-builder.html', 'r') as f:
    html = f.read()

# Add center button to pointerAttachFromGrp
pattern = '<button data-val="right" title="Right"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="12.5" y="2" width="1.5" height="12"/><rect x="6.5" y="4" width="6" height="3"/><rect x="2.5" y="9" width="10" height="3"/></svg></button>'
replacement = '<button data-val="center" title="Center"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="7.25" y="2" width="1.5" height="12"/><rect x="5" y="4" width="6" height="3"/><rect x="2" y="9" width="12" height="3"/></svg></button>\n              ' + pattern

# Make sure we only replace it in pointerAttachFromGrp
start_idx = html.find('id="pointerAttachFromGrp"')
if start_idx != -1:
    end_idx = html.find('</div>', start_idx)
    sub_html = html[start_idx:end_idx]
    sub_html = sub_html.replace(pattern, replacement)
    html = html[:start_idx] + sub_html + html[end_idx:]

with open('../label sources/manifest-builder.html', 'w') as f:
    f.write(html)
print("Done")
