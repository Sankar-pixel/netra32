
# NETRA32 Firmware for ESP32

This directory contains firmware for ESP32-WROOM-32 nodes (ID 0-3) that send telemetry (RSSI, CSI data, variance) to the NETRA32 backend at http://<your-server-ip>:8000/api/hardware/telemetry.

## Two Options for Firmware

### Option 1: Arduino (Simpler, uses WiFiManager for configuration)
Location: src/main.cpp, configured via platformio.ini.
Quick start (PlatformIO):
1. Open this folder in VSCode with PlatformIO extension
2. Modify `NODE_ID` in src/main.cpp (use unique value from 0-3 for each node)
3. Set BACKEND_URL to point to your NETRA32 backend
4. Build and upload to your ESP32-WROOM-32
5. When powered on, the ESP32 will create a WiFi AP named NETRA32-AP; connect to that, set your network credentials

### Option 2: ESP-IDF (Advanced, pure ESP-IDF)
Location: esp-idf/, CMake build system.
Quick start:
1. Install ESP-IDF (v5.x)
2. Configure via `idf.py menuconfig`
3. Change NODE_ID, WIFI_SSID, WIFI_PASS, BACKEND_HOST/PORT in esp-idf/main/netra32_main.c
4. Build, flash: `idf.py -p COM<your-port> flash monitor`

## Backend Integration
All nodes POST telemetry in this JSON format to /api/hardware/telemetry:
```json
{
    "node_id": 0,
    "timestamp": "2026-07-12T10:55:22.055781",
    "rssi": -65,
    "variance": 0.45,
    "csi_data": {
        "amplitude": [0.1, 0.2, ...]
    }
}
```
The backend then:
- Stores it in SQLite (netra32.db)
- Uses ml.py's IsolationForest for anomaly detection on each node
- Updates the current_sensing_data and broadcasts via WebSocket /ws/sensing
- Updates Detection records with presence/motion info
