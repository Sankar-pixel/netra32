# NETRA32 - Full-Stack IoT System Architecture

## 1. Project Overview

NETRA32 is a complete, 100% offline WiFi sensing system using ESP32 hardware, a FastAPI backend, and a modern web frontend.

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        NETRA32 Ecosystem                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐ │
│  │  ESP32 Node  │    │  ESP32 Node  │    │   ESP32 Node     │ │
│  │    (0-3)     │    │    (0-3)     │    │    (0-3)         │ │
│  └──────┬───────┘    └──────┬───────┘    └────────┬─────────┘ │
│         │                   │                       │           │
│         └───────────────────┼───────────────────────┘           │
│                             │                                   │
│                    ┌────────▼────────┐                          │
│                    │  Local Wi-Fi    │                          │
│                    │  (LAN Only)     │                          │
│                    └────────┬────────┘                          │
│                             │                                   │
│              ┌──────────────▼──────────────┐                    │
│              │   FastAPI Backend Server    │                    │
│              │   (Python)                  │                    │
│              ├─────────────────────────────┤                    │
│              │  • HTTP REST API            │                    │
│              │  • MQTT Broker (Optional)   │                    │
│              │  • WebSocket Streaming      │                    │
│              └──────────────┬──────────────┘                    │
│                             │                                   │
│              ┌──────────────▼──────────────┐                    │
│              │    SQLite Database          │                    │
│              └─────────────────────────────┘                    │
│                                                                 │
│              ┌─────────────────────────────┐                    │
│              │   Web Frontend (HTML/JS)    │                    │
│              └─────────────────────────────┘                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 3. Directory Structure

```
netra32/
├── firmware/               # ESP32 embedded firmware
│   ├── src/                # Main source code
│   │   ├── main.cpp        # Entry point
│   │   ├── wifi_manager.cpp # Wi-Fi provisioning
│   │   ├── time_sync.cpp   # Time synchronization
│   │   └── csi_sensor.cpp  # CSI data capture
│   ├── include/            # Header files
│   ├── lib/                # External libraries
│   └── platformio.ini      # PlatformIO configuration
├── ui/                     # Web frontend (already exists)
│   ├── backend/            # FastAPI backend
│   ├── components/         # UI components
│   └── index.html
├── docs/                   # Documentation
└── README.md
```

## 4. Data Flow

1. **ESP32 Node**: Captures CSI/RSSI data
2. **Time Sync**: Gets local timestamp from NTP or RTC
3. **Wi-Fi Connect**: Uses Wi-Fi manager to connect to LAN
4. **Data Transmit**: Sends JSON payload via HTTP POST to backend
5. **Backend Processing**: Stores data in SQLite, broadcasts via WebSocket
6. **Frontend Display**: Shows real-time data in web UI

## 5. Communication Protocol

- Primary: HTTP POST REST API
- Secondary: MQTT (optional, for low-bandwidth)
- WebSocket: Real-time data streaming to frontend

## 6. Database Schema

See `ui/backend/models.py` for full schema!
