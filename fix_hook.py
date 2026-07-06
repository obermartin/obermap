with open('frontend_backup_after_flight_fix/src/components/MapboxMap.tsx', 'r') as f:
    content = f.read()

start_idx = content.find("  // Polling for flights\n")
end_idx = content.find("  // Fetch geometry when selectedCycloneId changes\n")

if start_idx != -1 and end_idx != -1:
    flights_logic = content[start_idx:end_idx]
    
    with open('flights_logic.txt', 'w') as out:
        out.write(flights_logic)
else:
    print("Could not find start or end idx")
