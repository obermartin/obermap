import os

html_path = '/Users/obermartin/Documents/CURRENT/BILD/OBERMAP2/frontend/public/user_guide.html'

with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

# Extract styles
style_start = html.find('<style>')
style_end = html.find('</style>') + 8
styles = html[style_start:style_end]

# Extract container
container_start = html.find('<div class="container">')
container_end = html.find('</div>\n\n  <script') + 6
if container_end < 6:
    container_end = html.find('</div>\n  <script') + 6

container_en = html[container_start:container_end]

# Translate container content
container_de = container_en

translations = {
    'Back to Overview': 'Zurück zur Übersicht',
    'User Guide': 'Benutzerhandbuch',
    'Welcome to <strong>OBERMAP STUDIO</strong>, a comprehensive map annotation, routing, and layer management tool\n      designed for deep cartographic analysis and visualization. This guide will walk you through all the available\n      tools, features, and shortcuts.': 'Willkommen bei <strong>OBERMAP STUDIO</strong>, einem umfassenden Tool für Karten-Annotationen, Routenplanung und Layer-Verwaltung für tiefgehende kartografische Analysen und Visualisierungen. Diese Anleitung führt Sie durch alle verfügbaren Werkzeuge, Funktionen und Tastenkombinationen.',
    'The Interface Overview': 'Übersicht der Benutzeroberfläche',
    'The interface is divided into several key sections:': 'Die Benutzeroberfläche ist in mehrere Hauptbereiche unterteilt:',
    '<strong>Main Map Area</strong>: Your canvas for navigation, drawing, and visualization.': '<strong>Hauptkartenbereich</strong>: Ihre Leinwand für Navigation, Zeichnen und Visualisierung.',
    '<strong>Toolbar (Bottom Left)</strong>: Contains all the drawing, routing, and styling tools.': '<strong>Werkzeugleiste (Unten Links)</strong>: Enthält alle Zeichen-, Routen- und Styling-Werkzeuge.',
    '<strong>Layer Manager (Bottom Left Icon)</strong>: Access specialized map layers like Satellite, DeepState,\n        Wildfires, Air Traffic, and Vessels.': '<strong>Layer-Manager (Symbol unten links)</strong>: Zugriff auf spezielle Karten-Layer wie Satellit, DeepState, Waldbrände, Flugverkehr und Schiffsverkehr.',
    '<strong>Saved Views (Top Left)</strong>: Save and quickly navigate between different camera angles and\n        locations.': '<strong>Gespeicherte Ansichten (Oben Links)</strong>: Speichern und schnelles Navigieren zwischen verschiedenen Kamerawinkeln und Orten.',
    'The Toolbar Tools': 'Die Werkzeugleiste',
    'The Toolbar is the heart of your annotation workflow. You can toggle it open or closed using the <strong>"X" /\n        "Menu"</strong> button on the far right of the toolbar.': 'Die Werkzeugleiste ist das Herzstück Ihres Annotations-Workflows. Sie können sie über die Schaltfläche <strong>"X" / "Menü"</strong> ganz rechts in der Leiste ein- und ausklappen.',
    'Select Place / Country (Highlight)': 'Ort / Land auswählen (Hervorheben)',
    '<strong>What it does</strong>: Allows you to click on specific places or countries highlight them\n        automatically.': '<strong>Was es macht</strong>: Ermöglicht es Ihnen, auf bestimmte Orte oder Länder zu klicken, um diese automatisch hervorzuheben.',
    '<strong>How to use</strong>: Select the tool, choose a color and fill opacity, and click on the map. Clicking\n        on a place label will highlight that label, clicking on an empty area of the map will highlight the country you\n        clicked in.': '<strong>Bedienung</strong>: Wählen Sie das Werkzeug, eine Farbe und eine Fülldeckkraft und klicken Sie auf die Karte. Wenn Sie auf das Label eines Ortes klicken, wird dieses hervorgehoben. Klicken Sie auf einen leeren Bereich der Karte, wird das angeklickte Land hervorgehoben.',
    '<strong>NOTE</strong>: Adding a highlight will automatically add a camera view button with the current map\n        view (position, zoom, bearing, pitch).': '<strong>HINWEIS</strong>: Das Hinzufügen einer Hervorhebung erstellt automatisch eine Kameraansicht-Schaltfläche mit der aktuellen Kartenansicht (Position, Zoom, Ausrichtung, Neigung).',
    'Label': 'Beschriftung',
    '<strong>What it does</strong>: Drops a customizable text label anywhere on the map.': '<strong>Was es macht</strong>: Platziert eine anpassbare Textbeschriftung an einer beliebigen Stelle auf der Karte.',
    '<strong>How to use</strong>: Select the tool, pick a color, and click on the map. A prompt will appear asking\n        you to enter your text. Press <code>Enter</code> to save.': '<strong>Bedienung</strong>: Wählen Sie das Werkzeug, eine Farbe und klicken Sie auf die Karte. Ein Dialogfeld fordert Sie auf, Ihren Text einzugeben. Drücken Sie <code>Enter</code>, um zu speichern.',
    '<strong>NOTE</strong>: Adding a label will automatically add a camera view button with the current map view\n        (position, zoom, bearing, pitch).': '<strong>HINWEIS</strong>: Das Hinzufügen einer Beschriftung erstellt automatisch eine Kameraansicht-Schaltfläche mit der aktuellen Kartenansicht (Position, Zoom, Ausrichtung, Neigung).',
    'Paint (Freehand)': 'Zeichnen (Freihand)',
    '<strong>What it does</strong>: Draw arbitrary, freehand lines.': '<strong>Was es macht</strong>: Zeichnet beliebige, freihändige Linien.',
    '<strong>How to use</strong>: Click and drag across the map to draw.': '<strong>Bedienung</strong>: Klicken und ziehen Sie über die Karte, um zu zeichnen.',
    'Polygon': 'Polygon',
    '<strong>What it does</strong>: Draw custom geometric shapes.': '<strong>Was es macht</strong>: Zeichnet benutzerdefinierte geometrische Formen.',
    '<strong>How to use</strong>: Click on the map to drop vertices. Double-click to complete the shape.': '<strong>Bedienung</strong>: Klicken Sie auf die Karte, um Eckpunkte zu setzen. Ein Doppelklick schließt die Form ab.',
    'Circle': 'Kreis',
    '<strong>What it does</strong>: Draw perfect circles with a specific radius.': '<strong>Was es macht</strong>: Zeichnet perfekte Kreise mit einem bestimmten Radius.',
    '<strong>How to use</strong>: Click to set the center point, then drag outwards to define the radius. The\n        radius distance is dynamically displayed at the top of the screen while drawing.': '<strong>Bedienung</strong>: Klicken Sie, um den Mittelpunkt festzulegen, und ziehen Sie dann nach außen, um den Radius zu bestimmen. Die Entfernung des Radius wird während des Zeichnens oben auf dem Bildschirm dynamisch angezeigt.',
    'Arrow': 'Pfeil',
    '<strong>What it does</strong>: Draw directional arrows.': '<strong>Was es macht</strong>: Zeichnet Richtungspfeile.',
    '<strong>How to use</strong>: Either click and drag to draw an arrow or click once for the start of the arrow\n        (the tail), and click again for the end\n        (the head).': '<strong>Bedienung</strong>: Entweder klicken und ziehen, um einen Pfeil zu zeichnen, oder einmal für den Start (Ende des Pfeils) klicken und ein zweites Mal für das Ziel (Spitze) klicken.',
    'Measure': 'Messen',
    '<strong>What it does</strong>: Measure distance along a multi-segment path.': '<strong>Was es macht</strong>: Misst Entfernungen entlang eines mehrteiligen Pfads.',
    '<strong>How to use</strong>: Click to add points along your path. The total accumulated distance (in\n        kilometers) is displayed dynamically as you move your cursor, and permanent distance markers are placed at each\n        point. Double-click to complete.': '<strong>Bedienung</strong>: Klicken Sie, um Punkte entlang Ihres Pfads hinzuzufügen. Die Gesamtdistanz (in Kilometern) wird dynamisch angezeigt, während Sie den Mauszeiger bewegen, und dauerhafte Entfernungsmarkierungen werden an jedem Punkt platziert. Ein Doppelklick schließt die Messung ab.',
    'Route Planner': 'Routenplaner',
    '<strong>What it does</strong>: Generates accurate routes using real-world road and transit data.': '<strong>Was es macht</strong>: Generiert genaue Routen basierend auf realen Straßen- und Nahverkehrsdaten.',
    '<strong>How to use</strong>:': '<strong>Bedienung</strong>:',
    'Select the Route tool.': 'Wählen Sie das Routen-Werkzeug.',
    'Choose your travel mode from the sub-menu: <strong>Car</strong>, <strong>Walk</strong>, or\n            <strong>Train</strong>.': 'Wählen Sie Ihre Reiseart aus dem Untermenü: <strong>Auto</strong>, <strong>Fußgänger</strong> oder\n            <strong>Zug</strong>.',
    'Click points on the map to generate the route segment by segment.': 'Klicken Sie auf Punkte auf der Karte, um die Route Abschnitt für Abschnitt zu generieren.',
    'The distance and estimated travel time will be displayed along the route. Double-click to complete.': 'Distanz und geschätzte Reisezeit werden entlang der Route angezeigt. Ein Doppelklick schließt die Route ab.',
    'Add Icon': 'Symbol hinzufügen',
    '<strong>What it does</strong>: Place pre-designed SVG icons onto the map (e.g., military symbols, vehicles,\n        custom markers).': '<strong>Was es macht</strong>: Platziert vorgefertigte SVG-Symbole auf der Karte (z.B. militärische Symbole, Fahrzeuge, benutzerdefinierte Markierungen).',
    'Select the tool to open the Icon Gallery.': 'Wählen Sie das Werkzeug, um die Symbolgalerie zu öffnen.',
    'Use the <strong>Left/Right arrows</strong> to switch between different icon categories.': 'Nutzen Sie die <strong>Links/Rechts-Pfeile</strong>, um zwischen Symbolkategorien zu wechseln.',
    'Either click an icon to select it (and then click on the map to place it), or click and drag the icon\n            directly from the menu onto the map.': 'Klicken Sie entweder auf ein Symbol, um es auszuwählen (und klicken Sie dann auf die Karte, um es zu platzieren), oder ziehen Sie das Symbol per Drag & Drop direkt aus dem Menü auf die Karte.',
    'Styling Your Annotations': 'Ihre Annotationen anpassen',
    'Whenever you have a drawing tool selected (like Paint, Polygon, or Circle), formatting options appear in the\n      toolbar.': 'Wann immer ein Zeichenwerkzeug ausgewählt ist (wie Freihand, Polygon oder Kreis), erscheinen Formatierungsoptionen in der Werkzeugleiste.',
    '<strong>Colors</strong>: Pick from the predefined color palette.': '<strong>Farben</strong>: Wählen Sie aus der vordefinierten Farbpalette.',
    '<strong>Stroke Type</strong>: Choose between <strong>Solid</strong>, <strong>Dashed</strong>, or\n        <strong>Dotted</strong> lines.': '<strong>Linienart</strong>: Wählen Sie zwischen <strong>durchgezogenen (Solid)</strong>, <strong>gestrichelten (Dashed)</strong> oder\n        <strong>gepunkteten (Dotted)</strong> Linien.',
    '<strong>Fill Opacity</strong>: Adjust the slider to make the interior of polygons, circles, and highlights\n        more or less transparent.': '<strong>Fülldeckkraft</strong>: Passen Sie den Schieberegler an, um das Innere von Polygonen, Kreisen und Hervorhebungen mehr oder weniger transparent zu machen.',
    '<em>Note: You can change the style of an existing annotation by clicking on it to select it (it will glow), and\n        then modifying the color, stroke, or fill in the toolbar. Label backplates are not affected by the opacity\n        slider.</em>': '<em>Hinweis: Sie können den Stil einer vorhandenen Annotation ändern, indem Sie sie anklicken, um sie auszuwählen (sie wird leuchten), und dann Farbe, Strich oder Füllung in der Werkzeugleiste ändern. Hintergrundflächen von Beschriftungen werden vom Deckkraft-Regler nicht beeinflusst.</em>',
    'Saving, Deleting, and Exporting': 'Speichern, Löschen und Exportieren',
    'On the right side of the open toolbar, you have three important actions:': 'Auf der rechten Seite der geöffneten Werkzeugleiste haben Sie drei wichtige Aktionen:',
    '<strong>Delete (Trash Icon)</strong>:': '<strong>Löschen (Mülleimer-Symbol)</strong>:',
    'If an annotation is currently selected (glowing), clicking this deletes <em>only</em> that annotation.': 'Wenn eine Annotation aktuell ausgewählt ist, löscht ein Klick <em>nur</em> diese Annotation.',
    'If no annotation is selected, clicking this deletes <em>all</em> annotations of the currently active tool\n            type (e.g., deletes all polygons if the Polygon tool is active).': 'Ist keine Annotation ausgewählt, löscht ein Klick <em>alle</em> Annotationen des gerade aktiven Werkzeugtyps (z.B. alle Polygone, wenn das Polygon-Werkzeug aktiv ist).',
    '<strong>Save (Disk Icon)</strong>: Saves your current annotations, layer configurations, and default map view\n        to the backend server.': '<strong>Speichern (Disketten-Symbol)</strong>: Speichert Ihre aktuellen Annotationen, Layer-Konfigurationen und die Standard-Kartenansicht auf dem Server.',
    '<strong>Export (Download Icon)</strong>: Downloads all your current annotations into a standardized\n        <code>GeoJSON</code> file, which can be imported into GeoLayers or GIS software (like QGIS or ArcGIS).': '<strong>Exportieren (Download-Symbol)</strong>: Lädt all Ihre aktuellen Annotationen in eine standardisierte\n        <code>GeoJSON</code>-Datei herunter, die in GeoLayers oder GIS-Software (wie QGIS oder ArcGIS) importiert werden kann.',
    'Layer Management': 'Layer-Verwaltung',
    'Click the <strong>Layers icon</strong> (looks like a stack of papers) on the far bottom left to open the Layer\n      Sidebar.': 'Klicken Sie auf das <strong>Layer-Symbol</strong> (sieht aus wie ein Stapel Papiere) ganz unten links, um die Layer-Seitenleiste zu öffnen.',
    '<strong>Drag and Drop</strong>: Reorder layers by dragging them up or down. Layers at the top render above\n        layers at the bottom.': '<strong>Drag & Drop</strong>: Ordnen Sie Layer durch Ziehen nach oben oder unten neu an. Oben stehende Layer verdecken darunterliegende Layer.',
    '<strong>Visibility</strong>: Toggle the "eye" icon to show or hide a layer.': '<strong>Sichtbarkeit</strong>: Klicken Sie auf das "Auge"-Symbol, um einen Layer ein- oder auszublenden.',
    '<strong>Special Layers</strong>:': '<strong>Spezielle Layer</strong>:',
    '<strong>Split View</strong>: An advanced layer type that lets you place two different maps side-by-side\n            with a\n            movable slider to compare them. Double-click the dividing line to toggle betweel vertical and horizontal\n            split.': '<strong>Split View (Geteilte Ansicht)</strong>: Ein erweiterter Layertyp, mit dem Sie zwei verschiedene Karten nebeneinander platzieren können, inklusive verschiebbarem Regler zum Vergleichen. Ein Doppelklick auf die Trennlinie wechselt zwischen vertikaler und horizontaler Teilung.',
    '<strong>DeepState (Ukraine Current)</strong>: Real-time mapping of the conflict in Ukraine. If you want to\n            display historical data click the edit icon to reveal a date picker.': '<strong>DeepState (Aktuell Ukraine)</strong>: Echtzeitkarte des Konflikts in der Ukraine. Um historische Daten anzuzeigen, klicken Sie auf das Bearbeiten-Symbol, um eine Datumsauswahl zu öffnen.',
    '<strong>Wildfires (EFFIS)</strong>: Live and historical Copernicus wildfire data. You can filter by date\n            range.': '<strong>Waldbrände (EFFIS)</strong>: Aktuelle und historische Copernicus-Waldbranddaten. Sie können nach einem Datumsbereich filtern.',
    '<strong>Air Traffic & Maritime Traffic</strong>: Live tracking of aircraft and maritime ships. Clicking on\n            them\n            reveals detailed metadata (callsigns, origins, etc.).': '<strong>Flug- und Schiffsverkehr</strong>: Live-Tracking von Flugzeugen und Schiffen. Ein Klick darauf offenbart detaillierte Metadaten (Rufzeichen, Herkunft, etc.).',
    'Icon Library': 'Symbolbibliothek',
    'The middle tab in the Layer Sidebar (image icon) opens the <strong>Icon Library</strong>. Here you can manage the custom SVG icons available in the <strong>Add Icon</strong> tool.': 'Der mittlere Reiter in der Layer-Seitenleiste (Bild-Symbol) öffnet die <strong>Symbolbibliothek</strong>. Hier können Sie die benutzerdefinierten SVG-Symbole für das Werkzeug <strong>Symbol hinzufügen</strong> verwalten.',
    '<strong>Categories</strong>: Organize your icons into groups. Click on a category name to rename it, or click the trash icon to delete it.': '<strong>Kategorien</strong>: Gruppieren Sie Ihre Symbole. Klicken Sie auf einen Kategorienamen, um ihn umzubenennen, oder auf das Mülleimer-Symbol, um ihn zu löschen.',
    '<strong>Add New Icons</strong>: Click the <strong>+</strong> button within a category to upload individual SVG files, or click <strong>Upload Icon Set</strong> at the bottom to upload multiple SVGs into a brand new category at once.': '<strong>Neue Symbole hinzufügen</strong>: Klicken Sie auf das <strong>+</strong>-Symbol in einer Kategorie, um einzelne SVG-Dateien hochzuladen, oder klicken Sie unten auf <strong>Symbol-Set hochladen</strong>, um mehrere SVGs gleichzeitig in eine komplett neue Kategorie hochzuladen.',
    '<strong>Reordering</strong>: Drag and drop categories to reorder them, or drag and drop individual icons to reorder them within their category.': '<strong>Neu anordnen</strong>: Ziehen Sie Kategorien per Drag & Drop, um sie neu anzuordnen, oder ziehen Sie einzelne Symbole, um sie innerhalb ihrer Kategorie neu anzuordnen.',
    'Base Map & App Settings': 'Basiskarte & App-Einstellungen',
    'The rightmost tab in the Layer Sidebar (gear icon) opens the <strong>App Configuration</strong> panel.': 'Der ganz rechte Reiter in der Layer-Seitenleiste (Zahnrad-Symbol) öffnet das <strong>App-Konfigurationspanel</strong>.',
    '<strong>Color Palette</strong>: Customize the quick-select colors available in the toolbar. Click the <strong>+</strong> icon to add new hex colors, or click the <strong>×</strong> on an existing color to remove it. You can also drag and drop colors to reorder them.': '<strong>Farbpalette</strong>: Passen Sie die Schnellwahl-Farben für die Werkzeugleiste an. Klicken Sie auf das <strong>+</strong>-Symbol, um neue Hex-Farben hinzuzufügen, oder auf das <strong>×</strong> bei einer vorhandenen Farbe, um sie zu entfernen. Sie können Farben auch per Drag & Drop neu anordnen.',
    '<strong>Default Map Layers</strong>: Toggle which layers (e.g., DeepState, Air Traffic, Satellite) are automatically loaded and visible when a new show is created.': '<strong>Standard-Kartenlayer</strong>: Legen Sie fest, welche Layer (z.B. DeepState, Flugverkehr, Satellit) beim Erstellen einer neuen Show automatisch geladen und eingeblendet werden sollen.',
    '<strong>Default View</strong>: Click <strong>Capture Current View</strong> to save the exact camera position (zoom, pitch, bearing) as the default starting view when loading the application.': '<strong>Standardansicht</strong>: Klicken Sie auf <strong>Aktuelle Ansicht erfassen</strong>, um die exakte Kameraposition (Zoom, Neigung, Ausrichtung) als Startansicht beim Laden der App zu speichern.',
    '<strong>Base Map & API Settings</strong>: Expand these sections to configure your Mapbox Token and Style, OpenSky API credentials (for Air Traffic), AISStream API key (for Maritime Traffic), and Google Maps API key (for Train routing).': '<strong>Basiskarte & API-Einstellungen</strong>: Klappen Sie diese Bereiche aus, um Ihren Mapbox-Token und -Stil, die OpenSky-API-Zugangsdaten (für Flugverkehr), den AISStream-API-Key (für Schiffsverkehr) sowie den Google Maps API-Key (für die Routenplanung bei Zügen) zu konfigurieren.',
    'Saved Views': 'Gespeicherte Ansichten',
    'On the right side of the screen, you\'ll find the <strong>Saved Views</strong> menu.': 'Auf der rechten Seite des Bildschirms finden Sie das Menü für <strong>Gespeicherte Ansichten</strong>.',
    'This tool allows you to save specific camera angles, zoom levels, and coordinates.': 'Mit diesem Werkzeug können Sie bestimmte Kamerawinkel, Zoomstufen und Koordinaten speichern.',
    'Click <strong>Capture View</strong> to save your current screen position.': 'Klicken Sie auf <strong>Ansicht erfassen</strong>, um Ihre aktuelle Bildschirmposition zu speichern.',
    'You can name these views to easily jump back to critical locations with a smooth 3D fly-over animation.': 'Sie können diese Ansichten benennen, um mit einer flüssigen 3D-Fluganimation einfach zu wichtigen Orten zurückzuspringen.',
    'Pro Tips': 'Profi-Tipps',
    '<strong>Select Mode</strong>: If you want to interact with your annotations (to change their color or delete\n        them), make sure you either have the specific tool selected, or close the toolbar to enter "Select Mode".': '<strong>Auswahl-Modus</strong>: Wenn Sie mit Ihren Annotationen interagieren möchten (um Farbe zu ändern oder sie zu löschen), stellen Sie sicher, dass Sie entweder das spezifische Werkzeug ausgewählt haben oder klappen Sie die Werkzeugleiste ein, um in den "Auswahl-Modus" zu wechseln.',
    '<strong>3D Navigation</strong>: Hold down the <code>Right Mouse Button</code> (or\n        <code>Ctrl + Left Click</code>) and drag to change the pitch (tilt) and bearing (rotation) of the map.': '<strong>3D-Navigation</strong>: Halten Sie die <code>rechte Maustaste</code> (oder\n        <code>Strg + Linksklick</code>) gedrückt und ziehen Sie die Maus, um die Neigung (Pitch) und die Ausrichtung (Bearing/Rotation) der Karte zu ändern.',
    '<strong>Smart Labels</strong>: Exported GeoJSON files automatically carry over the text from your Labels and\n        Highlights into the <code>name</code> property of the exported file for seamless compatibility with other\n        software.': '<strong>Smarte Beschriftungen</strong>: Exportierte GeoJSON-Dateien übernehmen automatisch den Text von Ihren Beschriftungen und Hervorhebungen in die <code>name</code>-Eigenschaft der exportierten Datei für eine nahtlose Kompatibilität mit anderer Software.'
}

for eng, ger in translations.items():
    container_de = container_de.replace(eng, ger)

container_en = container_en.replace('class="container"', 'class="container" id="content-en"')
container_de = container_de.replace('class="container"', 'class="container" id="content-de" style="display: none;"')

new_styles = styles.replace('</style>', '''
    .lang-toggle {
      position: absolute;
      top: 40px;
      right: 40px;
      background-color: #000000;
      color: #ffffff;
      border: 1px solid #ffffff;
      padding: 8px 12px;
      font-size: 16px;
      cursor: pointer;
      user-select: none;
      transition: all 0.2s;
      z-index: 1000;
      font-weight: bold;
    }
    .lang-toggle:hover {
      background-color: #ffffff;
      color: #000000;
    }
  </style>''')

new_html = html[:style_start] + new_styles + html[style_end:container_start] + f"""  <div class="lang-toggle" id="langToggleBtn" onclick="toggleLanguage()">
    🇩🇪 DE
  </div>

""" + container_en + "\n\n" + container_de + """

  <script src="https://unpkg.com/lucide@latest"></script>
  <script>
    lucide.createIcons();

    let currentLang = 'en';
    function toggleLanguage() {
      if (currentLang === 'en') {
        currentLang = 'de';
        document.getElementById('content-en').style.display = 'none';
        document.getElementById('content-de').style.display = 'block';
        document.getElementById('langToggleBtn').innerHTML = '🇬🇧 EN';
        document.title = 'OBERMAP STUDIO Benutzerhandbuch';
      } else {
        currentLang = 'en';
        document.getElementById('content-en').style.display = 'block';
        document.getElementById('content-de').style.display = 'none';
        document.getElementById('langToggleBtn').innerHTML = '🇩🇪 DE';
        document.title = 'OBERMAP STUDIO User Guide';
      }
    }
  </script>
</body>
</html>
"""

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(new_html)

