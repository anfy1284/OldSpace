# Техническое Задание (ТЗ) на доработку Агента (Remote Storage Agent)

Необходимо обновить или проверить реализацию Агента для совместимости с текущей версией Node.js сервера.

## 1. Подключение и Авторизация
*   **WebSocket URL:** `ws://<SERVER_HOST>/ws` (или `wss://` если используется SSL).
*   **Handshake:** Сразу после подключения отправить JSON:
    ```json
    {
      "action": "auth",
      "token": "YOUR_SECRET_TOKEN",
      "agent_id": "UNIQUE_AGENT_ID"
    }
    ```
*   **Ожидание:** Сервер ответит `{"status": "ok"}` или `{"status": "error", ...}`.

## 2. Обработка команд от Сервера

Агент должен слушать входящие JSON-сообщения и реагировать на поле `action`.

### А. Команда `upload` (Сохранить файл)
Сервер просит Агента скачать файл (который пользователь загрузил на сервер) и сохранить его у себя.

**Формат команды:**
```json
{
  "action": "upload",
  "request_id": "req_...",
  "file_info": {
    "id": "file_unique_name.ext",  // Имя файла для сохранения на диске
    "name": "original_name.ext",   // Оригинальное имя (для метаданных)
    "size": 12345,
    "owner_id": 1
  },
  "download_url": "http://<SERVER_HOST>/api/apps/fileSystem/agent/download_temp/<REQUEST_ID>"
}
```

**Действия Агента:**
1.  Выполнить HTTP GET запрос на `download_url`.
2.  Сохранить полученный поток данных в локальное хранилище под именем `file_info.id`.
3.  Сохранить метаданные файла в локальную БД (SQLite).
4.  Отправить ответ об успехе:
    ```json
    {
      "action": "response",
      "request_id": "req_...",
      "status": "success"
    }
    ```
    В случае ошибки: `status: "error"`, `message: "..."`.

### Б. Команда `download` (Отдать файл)
Сервер просит Агента загрузить файл обратно на сервер (чтобы отдать его пользователю).

**Формат команды:**
```json
{
  "action": "download",
  "request_id": "req_...",
  "file_id": "file_unique_name.ext", // ID файла на диске агента
  "upload_url": "http://<SERVER_HOST>/api/apps/fileSystem/agent/upload_temp/<REQUEST_ID>"
}
```

**Действия Агента:**
1.  Найти файл в локальном хранилище по `file_id`.
2.  Выполнить HTTP POST (или PUT) запрос на `upload_url`, передав содержимое файла в теле запроса (stream).
3.  Отправить ответ об успехе:
    ```json
    {
      "action": "response",
      "request_id": "req_...",
      "status": "success"
    }
    ```

### В. Команда `delete` (Удалить файл)
**Формат команды:**
```json
{
  "action": "delete",
  "request_id": "req_...",
  "file_id": "file_unique_name.ext"
}
```

**Действия Агента:**
1.  Удалить файл с диска.
2.  Удалить запись из локальной БД.
3.  Отправить ответ `success`.

## 3. Важные изменения в API
Обратите внимание, что URL для скачивания/загрузки временных файлов теперь имеют структуру:
`/api/apps/fileSystem/agent/...`
Агент должен использовать URL, переданный в полях `download_url` и `upload_url` "как есть", не пытаясь конструировать его самостоятельно.
