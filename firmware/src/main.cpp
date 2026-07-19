
#include &lt;Arduino.h&gt;
#include &lt;WiFiManager.h&gt;
#include &lt;WiFi.h&gt;
#include &lt;HTTPClient.h&gt;
#include &lt;ArduinoJson.h&gt;
#include &lt;time.h&gt;

// Configuration
#define NODE_ID 0  // Change this for each node (0-3)
#define BACKEND_URL "http://192.168.1.100:8000/api/hardware/telemetry"
#define NTP_SERVER "pool.ntp.org"
#define GMT_OFFSET_SEC 0
#define DAYLIGHT_OFFSET_SEC 0

WiFiManager wm;
HTTPClient http;

void setupTimeSync() {
  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER);
  Serial.println("Waiting for time sync...");
  time_t now = time(nullptr);
  while (now &lt; 8 * 3600 * 2) {
    delay(500);
    Serial.print(".");
    now = time(nullptr);
  }
  Serial.println("\nTime synced!");
}

String getTimestamp() {
  time_t now = time(nullptr);
  struct tm timeinfo;
  localtime_r(&amp;now, &amp;timeinfo);
  char buf[64];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &amp;timeinfo);
  return String(buf);
}

float readRSSI() {
  return WiFi.RSSI();
}

void sendTelemetry() {
  if (!WiFi.isConnected()) {
    Serial.println("WiFi not connected");
    return;
  }

  DynamicJsonDocument doc(1024);
  doc["node_id"] = NODE_ID;
  doc["timestamp"] = getTimestamp();
  doc["rssi"] = readRSSI();
  
  // Simulate CSI data
  JsonObject csi = doc["csi_data"].to&lt;JsonObject&gt;();
  JsonArray amplitude = csi["amplitude"].to&lt;JsonArray&gt;();
  for (int i = 0; i &lt; 30; i++) {
    amplitude.add(random(50, 100) / 100.0);
  }
  doc["variance"] = random(1, 10) / 10.0;

  String payload;
  serializeJson(doc, payload);
  
  http.begin(BACKEND_URL);
  http.addHeader("Content-Type", "application/json");
  
  int httpCode = http.POST(payload);
  
  if (httpCode &gt; 0) {
    Serial.printf("HTTP Status: %d\n", httpCode);
    Serial.println(http.getString());
  } else {
    Serial.printf("Error: %s\n", http.errorToString(httpCode).c_str());
  }
  
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  // WiFiManager auto-connect with portal
  WiFi.mode(WIFI_STA);
  bool res = wm.autoConnect("NETRA32-AP");
  
  if (!res) {
    Serial.println("Failed to connect, restarting...");
    ESP.restart();
  } else {
    Serial.println("Connected!");
  }
  
  setupTimeSync();
}

void loop() {
  sendTelemetry();
  delay(1000);  // Send every second
}
