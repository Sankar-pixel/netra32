
#include &lt;stdio.h&gt;
#include &lt;string.h&gt;
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_system.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "esp_http_client.h"
#include "esp_timer.h"
#include "cJSON.h"
#include "time.h"

/* Configuration */
#define NODE_ID 0
#define BACKEND_HOST "192.168.1.100"
#define BACKEND_PORT 8000
#define BACKEND_PATH "/api/hardware/telemetry"
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASS "YOUR_WIFI_PASSWORD"
#define TELEMETRY_INTERVAL_MS 1000

static const char *TAG = "netra32_node";

/* HTTP client event handler */
esp_err_t _http_event_handler(esp_http_client_event_t *evt)
{
    switch(evt-&gt;event_id) {
        case HTTP_EVENT_ERROR:
            ESP_LOGI(TAG, "HTTP_EVENT_ERROR");
            break;
        case HTTP_EVENT_ON_CONNECTED:
            ESP_LOGI(TAG, "HTTP_EVENT_ON_CONNECTED");
            break;
        case HTTP_EVENT_HEADER_SENT:
            ESP_LOGI(TAG, "HTTP_EVENT_HEADER_SENT");
            break;
        case HTTP_EVENT_ON_HEADER:
            ESP_LOGI(TAG, "HTTP_EVENT_ON_HEADER, key=%s, value=%s", evt-&gt;header_key, evt-&gt;header_value);
            break;
        case HTTP_EVENT_ON_DATA:
            ESP_LOGI(TAG, "HTTP_EVENT_ON_DATA, len=%d", evt-&gt;data_len);
            if (!esp_http_client_is_chunked_response(evt-&gt;client)) {
                printf("%.*s", evt-&gt;data_len, (char*)evt-&gt;data);
            }
            break;
        case HTTP_EVENT_ON_FINISH:
            ESP_LOGI(TAG, "HTTP_EVENT_ON_FINISH");
            break;
        case HTTP_EVENT_DISCONNECTED:
            ESP_LOGI(TAG, "HTTP_EVENT_DISCONNECTED");
            break;
        default:
            break;
    }
    return ESP_OK;
}

/* Initialize NVS */
static void initialize_nvs(void)
{
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);
}

/* WiFi event handler */
static void wifi_event_handler(void* arg, esp_event_base_t event_base,
                               int32_t event_id, void* event_data)
{
    if (event_base == WIFI_EVENT &amp;&amp; event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT &amp;&amp; event_id == WIFI_EVENT_STA_DISCONNECTED) {
        esp_wifi_connect();
    } else if (event_base == IP_EVENT &amp;&amp; event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;
        ESP_LOGI(TAG, "Got IP: " IPSTR, IP2STR(&amp;event-&gt;ip_info.ip));
    }
}

/* Initialize WiFi */
static void wifi_init(void)
{
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&amp;cfg));
    esp_event_handler_instance_t instance_any_id;
    esp_event_handler_instance_t instance_got_ip;
    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &amp;wifi_event_handler, NULL, &amp;instance_any_id));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &amp;wifi_event_handler, NULL, &amp;instance_got_ip));
    wifi_config_t wifi_config = {
        .sta = {
            .ssid = WIFI_SSID,
            .password = WIFI_PASS,
            .threshold.authmode = WIFI_AUTH_WPA2_PSK,
            .sae_pwe_h2e = WPA3_SAE_PWE_BOTH,
        },
    };
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &amp;wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());
    ESP_LOGI(TAG, "WiFi initialized");
}

/* Get current timestamp */
static void get_timestamp(char* buffer, size_t size)
{
    time_t now;
    time(&amp;now);
    struct tm timeinfo;
    localtime_r(&amp;now, &amp;timeinfo);
    strftime(buffer, size, "%Y-%m-%dT%H:%M:%SZ", &amp;timeinfo);
}

/* Generate random telemetry data (for demo) */
static float random_float(float min, float max)
{
    return min + (float)rand() / (float)(RAND_MAX / (max - min));
}

/* Send telemetry to backend */
static void send_telemetry_task(void *pvParameters)
{
    char url[64];
    snprintf(url, sizeof(url), "http://%s:%d%s", BACKEND_HOST, BACKEND_PORT, BACKEND_PATH);

    while(true) {
        esp_http_client_config_t config = {
            .url = url,
            .event_handler = _http_event_handler,
            .method = HTTP_METHOD_POST,
        };
        esp_http_client_handle_t client = esp_http_client_init(&amp;config);

        /* Create JSON payload */
        cJSON *root = cJSON_CreateObject();
        char timestamp[32];
        get_timestamp(timestamp, sizeof(timestamp));
        cJSON_AddNumberToObject(root, "node_id", NODE_ID);
        cJSON_AddStringToObject(root, "timestamp", timestamp);
        cJSON_AddNumberToObject(root, "rssi", random_float(-85, -50));
        cJSON_AddNumberToObject(root, "variance", random_float(0.2, 0.95));

        /* CSI data */
        cJSON *csi_data = cJSON_CreateObject();
        cJSON *amplitude = cJSON_CreateArray();
        for(int i=0; i&lt;30; i++) {
            cJSON_AddItemToArray(amplitude, cJSON_CreateNumber((double)random_float(0.1, 0.99)));
        }
        cJSON_AddItemToObject(csi_data, "amplitude", amplitude);
        cJSON_AddItemToObject(root, "csi_data", csi_data);

        char *post_data = cJSON_Print(root);
        esp_http_client_set_post_field(client, post_data, strlen(post_data));
        esp_http_client_set_header(client, "Content-Type", "application/json");

        /* Perform HTTP request */
        esp_err_t err = esp_http_client_perform(client);
        if(err == ESP_OK) {
            ESP_LOGI(TAG, "Status=%d, content_length=%lld",
                     esp_http_client_get_status_code(client),
                     esp_http_client_get_content_length(client));
        } else {
            ESP_LOGE(TAG, "Request failed: %s", esp_err_to_name(err));
        }

        /* Cleanup */
        cJSON_Delete(root);
        free(post_data);
        esp_http_client_cleanup(client);
        vTaskDelay(pdMS_TO_TICKS(TELEMETRY_INTERVAL_MS));
    }
}

void app_main(void)
{
    ESP_LOGI(TAG, "NETRA32 Node %d Startup", NODE_ID);
    initialize_nvs();
    wifi_init();
    /* Wait for connection */
    vTaskDelay(pdMS_TO_TICKS(3000));
    /* Start telemetry task */
    xTaskCreate(send_telemetry_task, "send_telemetry_task", 4096, NULL, 5, NULL);
}
