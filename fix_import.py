import re

with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    content = f.read()

content = content.replace("import { useAnnotationTools }\nimport { useDisasterAlerts } from '../hooks/useDisasterAlerts'; from '../hooks/useAnnotationTools';", "import { useAnnotationTools } from '../hooks/useAnnotationTools';\nimport { useDisasterAlerts } from '../hooks/useDisasterAlerts';")

with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(content)
