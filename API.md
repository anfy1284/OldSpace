# Протокол взаимодействия (WebSocket API)

Все управляющие сообщения передаются в формате JSON через постоянное WebSocket-соединение. Передача содержимого файлов осуществляется через отдельные HTTP-запросы.

## 1. Авторизация (Handshake)
При подключении Агент отправляет первое сообщение:
```json
{
  "action": "auth",
  "token": "AGENT_SECRET_TOKEN",
  "agent_id": "unique_agent_id"
}
```
**Ответ сервера:**
```json
{ "status": "ok" } // или { "status": "error", "message": "..." }
```

## 2. Команды Сервер -> Агент

### А. Сохранение файла (UPLOAD)
Сервер просит Агента скачать файл по ссылке и сохранить у себя.
**Запрос:**
```json
{
  "action": "upload",
  "request_id": "req_123",
  "file_info": {
    "id": "file_555",
    "name": "document.pdf",
    "owner_id": "user_1",
    "size": 102400
  },
  "download_url": "https://server.com/api/temp/download/token123"
}
```
**Логика Агента:**
1. Агент делает `GET` запрос на `download_url`.
2. Сохраняет поток данных в `storage_path` под уникальным именем.
3. Записывает метаданные в SQLite.
4. Отправляет ответ.

### Б. Отдача файла (DOWNLOAD)
Сервер просит Агента загрузить файл на сервер.
**Запрос:**
```json
{
  "action": "download",
  "request_id": "req_124",
  "file_id": "file_555",
  "upload_url": "https://server.com/api/temp/upload/token456"
}
```
**Логика Агента:**
1. Агент ищет файл в SQLite по `file_id`.
2. Читает файл с диска.
3. Делает `POST` (или `PUT`) запрос на `upload_url` с телом файла.
4. Отправляет ответ.

### В. Удаление файла (DELETE)
**Запрос:**
```json
{
  "action": "delete",
  "request_id": "req_125",
  "file_id": "file_555"
}
```
**Логика Агента:**
1. Удаляет файл физически.
2. Удаляет запись из БД.
3. Отправляет ответ.

### Г. Статус (INFO)
**Запрос:**
```json
{ "action": "info", "request_id": "req_126" }
```

## 3. Ответы Агент -> Сервер
На каждую команду Агент отправляет ответ с тем же `request_id`.

**Успех:**
```json
{
  "action": "response",
  "request_id": "req_123",
  "status": "success",
  "data": { ... } // Опциональные данные (например, текущее свободное место)
}
```

**Ошибка:**
```json
{
  "action": "response",
  "request_id": "req_123",
  "status": "error",
  "message": "File not found / Disk full / Network error"
}
```
