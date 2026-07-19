
# NETRA32 - Full-Stack WiFi Sensing System

A complete, 100% offline IoT system for WiFi-based sensing using ESP32 hardware and a FastAPI backend.

## Quick Start

### 1. Backend Setup
```bash
cd ui/backend
pip install -r requirements.txt
python main.py
```

### 2. Frontend
Open your browser at `http://localhost:8000`

### 3. ESP32 Firmware
Choose either **Arduino (PlatformIO)** or **ESP-IDF**:

#### Option A: Arduino (PlatformIO)
- Open `firmware/` in PlatformIO
- Change `NODE_ID` in `src/main.cpp` for each node (0-3)
- Set WiFi SSID/password or use WiFiManager captive portal
- Upload to your ESP32

#### Option B: ESP-IDF
- Navigate to `firmware/esp-idf`
- Edit `main/netra32_main.c` to set `NODE_ID`, `WIFI_SSID`, `WIFI_PASS`, `BACKEND_HOST`
- Build and flash using `idf.py build flash monitor`

## Project Structure
```
netra32/
├── firmware/         # ESP32 embedded firmware
├── ui/               # Web frontend and FastAPI backend
├── docs/             # Documentation
└── ARCHITECTURE.md   # System architecture breakdown
```

## Features
- 100% offline operation
- 4-node ESP32 support
- Real-time data streaming
- ML-powered anomaly detection
- Responsive web UI
- Dark/light mode support

## Communication
ESP32 nodes send data via HTTP POST to `http://[backend-ip]:8000/api/hardware/telemetry`
