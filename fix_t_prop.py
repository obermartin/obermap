with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    text = f.read()

# fix useLayerVisibility
text = text.replace(
"""    lastActiveWeatherTimeRef,
    weatherAllValidTimesRef,
    annotations,
    windLastFetchRef
  });""",
"""    lastActiveWeatherTimeRef,
    weatherAllValidTimesRef,
    annotations,
    windLastFetchRef,
    t
  });""")

# fix useFlightStream
text = text.replace(
"""    selectedAircraftId,
    setSelectedAircraftId,
    selectedAircraftMetaRef,
    selectedFlightTrackRef,
    aircraftPopupRef,
  });""",
"""    selectedAircraftId,
    setSelectedAircraftId,
    selectedAircraftMetaRef,
    selectedFlightTrackRef,
    aircraftPopupRef,
    t
  });""")

with open('frontend/src/components/MapboxMap.tsx', 'w') as f:
    f.write(text)

print("Fixed missing t props.")
