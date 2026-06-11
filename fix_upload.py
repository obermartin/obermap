import re

with open('frontend/src/components/LayerSidebar.tsx', 'r') as f:
    tsx = f.read()

old_upload = """              labelTemplates: {
                ...prev.labelTemplates,
                availableTemplates: list
              }
            }));
          });
      } else {"""
new_upload = """              labelTemplates: {
                ...prev.labelTemplates,
                availableTemplates: list,
                hiddenTemplates: (prev.labelTemplates?.hiddenTemplates || []).filter(id => id !== data.name)
              }
            }));
          });
      } else {"""
tsx = tsx.replace(old_upload, new_upload)

with open('frontend/src/components/LayerSidebar.tsx', 'w') as f:
    f.write(tsx)

print("Upload fixed")
