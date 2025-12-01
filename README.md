# OldSpace — архитектура проекта

Этот документ описывает архитектуру проекта, ключевые модули и потоки данных. Он предназначен для разработчиков (людей) и для AI-инструментов, чтобы быстро понять устройство системы и безопасно вносить изменения.

## Обзор

Проект — это модульная платформа на Node.js с уровнями:
- Ядро `drive_root`: общий HTTP‑сервер, сессии, базовые модели БД, контент-тайпы, глобальный контекст.
- Прикладной уровень `drive_forms`: эндпоинты для фронтенда, загрузка клиентских скриптов приложений, свои модели и события.
- Приложения `apps/*`: изолированные модули (tetris, login, calculator, messenger) со своей конфигурацией, ресурсами, серверной логикой и (опционально) моделями БД.

Главная точка входа: `main_server.js`.

## Структура каталогов (смысловые узлы)

- `main_server.js`: инициализация БД (миграции) и запуск HTTP‑сервера.
- `server.config.json`: выбор активного прикладного уровня (например, `drive_forms`) и его псевдонима (`app`).
- `drive_root/`
	- `server.js`: фабрика сервера (`createServer`), раздача статики `/res/public|protected`, делегирование в активный уровень `/<appAlias>`.
	- `globalServerContext.js`: общий контекст (типы контента, доступ к БД через Sequelize, утилиты по предопределённым данным, получение пользователя по сессии, кэш моделей).
	- `init.js`: код инициализации уровня ядра.
	- `db/`: настройки и миграции ядра (Users, Sessions, DefaultValues), менеджер сессий.
- `drive_forms/`
	- `server.js`: обработчики `/<appAlias>/...` для ресурсов, динамической загрузки приложений и RPC‑вызовов методов приложений.
	- `globalServerContext.js`: контекст уровня форм (доступ к ролям, системам, создание пользователей/гостей, связка с событийнoй шиной).
	- `eventBus.js`: простой асинхронный шина‑событий.
	- `db/`: модели уровня форм (Systems, AccessRoles, UserSystems) и миграции + агрегация моделей приложений.
	- `resources/`: публичные/защищённые статические ресурсы.
- `apps/<name>/`
	- `config.json`: декларация уровня доступа (`access`) и систем (`system`).
	- `server.js`: серверные методы приложения (например, `login.loginAsGuest`).
	- `db/` (опционально): модели и предопределённые данные приложения.
	- `resources/public|protected`: клиентские и защищённые файлы.

## Жизненный цикл запуска

1) `node main_server.js`
	 - Запускает `drive_root/db/createDB.js` (миграции ядра + предопределённые данные уровня `root`).
	 - После удачной миграции ядра запускается `drive_forms/db/createDB.js` (уровень `forms` + модели приложений).
2) Инициализация уровней:
	 - Ядро: `drive_root/init.js` (если есть код).
	 - Активный прикладной уровень: `drive_forms/init.js`.
	 - Инициализация приложений из `drive_forms/apps.json` (выполняет их `init.js`, если существует).
3) Старт HTTP‑сервера из `drive_root/server.js`.

## Роутинг и ресурсы

- Корень `/`: отдаёт стартовую страницу активного прикладного уровня (`<appDir>/<appIndexPage>`, из `server.config.json`).
- Статика ядра: `/res/public/*` и `/res/protected/*` (реализовано в `drive_root/server.js`).
	- Доступ к `protected` сейчас заглушка (всегда 403) — требуется реализовать реальную проверку.
- Прикладной уровень `/<appAlias>` (обычно `app`): реализовано в `drive_forms/server.js`.
	- `/<appAlias>/res/public/*` и `/<appAlias>/res/protected/*` — статика уровня форм.
	- `/<appAlias>/loadApps` (GET/POST) — возвращает склеенный `client.js` приложений, доступных пользователю по его роли.
	- `/<appAlias>/call` (POST) — универсальный RPC: `{ app, method, params }` вызывает `apps/<app>/server.js[method]`.

## Сессии и аутентификация

- Сессии: `drive_root/db/sessionManager.js`
	- Ищет/создаёт запись в таблице `sessions`, кэширует в памяти (Map), устанавливает cookie `sessionID`.
- Пользователь по сессии: `drive_root/globalServerContext.getUserBySessionID(sessionID)`.
- Пример логина гостя: `apps/login/server.js -> loginAsGuest()` создаёт гостя и привязывает к `sessionID`.

## База данных и миграции

- ORM: Sequelize, настройки в `drive_root/db/dbSettings.json` (PostgreSQL).
- Схема определяется декларативно через файлы `db/db.js` на каждом уровне (ядро, формы, приложений).
- Миграции:
	- Ядро: `drive_root/db/createDB.js`
	- Формы (+ модели приложений): `drive_forms/db/createDB.js`
	- Алгоритм: сравнение текущей схемы с декларацией; при несовпадении — бэкап таблицы, пересоздание по актуальной схеме, перенос совместимых данных, сброс sequence.
- Предопределённые данные (seed):
	- Таблица `default_values` (модель `DefaultValues`) хранит связь «уровень + defaultValueId + таблица → фактический recordId».
	- Уровень указывается в `server_config.json` (напр. `root`, `forms`) и для приложений — имя приложения.
	- Обработка данных: `processDefaultValues` в `drive_root/globalServerContext.js` помечает записи `_level` и проверяет уникальность `id` в пределах уровня.
	- Загрузка/сопоставление — в скриптах `createDB.js` соответствующих уровней.

Ключевые таблицы ядра:
- `users` — пользователи (без явного пароля в выборке по умолчанию, пароль хранится как `password_hash`).
- `sessions` — активные сессии (`sessionId`, связь на `users.id`, поддержка гостевых сессий).
- `default_values` — реестр сопоставлений seed‑записей по уровням.

Ключевые таблицы уровня форм:
- `systems`, `access_roles`, `user_systems` — модель доступа пользователей к системам и ролям.

Пример таблиц приложения (messenger):
- `Messenger_Chats`, `Messenger_Messages`, `Messenger_ChatMembers`.

## Глобальные контексты

- `drive_root/globalServerContext.js`:
	- `getContentType(file)`: маппинг расширений на content‑type.
	- `modelsDB` и `initModelsDB()`: сбор и подготовка моделей из `drive_root/db/db.js` + `drive_forms/db/db.js`.
	- `getUserBySessionID(sessionID)`: поиск пользователя через `sessions` и `users`.
	- Утилиты для предопределённых значений: `loadDefaultValuesFromDB`, `getDefaultValue(s)`, `reloadDefaultValues`.

- `drive_forms/globalServerContext.js`:
	- `loadApps(user)`: возвращает объединённый клиентский код доступных приложений с учётом роли пользователя.
	- `getUserAccessRole(user)`: вычисляет роль по связке `user_systems` → `access_roles`.
	- `createNewUser(sessionID, name, systems, roles)` и `createGuestUser(...)`: транзакционное создание пользователя и привязок.

## Событийная шина (EventBus)

- Реализация: `drive_forms/eventBus.js` (простая асинхронная шина).
- Пример использования: `apps/messenger/server.js` подписывается на `userCreated` и создаёт личный чат новому пользователю.

## Приложения (apps/*)

- Конфигурация: `apps/<name>/config.json`
	- `system`: список систем, к которым относится приложение.
	- `access`: роли доступа (напр. `admin`, `public`, `nologged`).
- Серверные методы: экспортируются из `apps/<name>/server.js` и вызываются RPC‑эндпоинтом `/<appAlias>/call`.
- Клиентский код: `resources/public/client.js` попадает в ответ `/<appAlias>/loadApps` при наличии доступа.
- Модели БД (опционально): `apps/<name>/db/db.js` и `defaultValues.json`, подхватываются миграциями уровня форм.

## Безопасность и доступ

- Проверка доступа к `protected`‑ресурсам пока не реализована (возвращает 403). Требуется внедрить реальную авторизацию по `sessionID` и ролям.
- Cookie сессии: `sessionID` (HttpOnly). Для API‑вызовов роль пользователя определяется по сессии.

## Как добавить новое приложение

1) Создайте каталог `apps/<myapp>/` со структурой:

```
apps/<myapp>/
	config.json
	server.js
	resources/
		public/
			client.js
		protected/
	db/                # опционально
		db.js            # модели
		defaultValues.json
```

2) Добавьте приложение в `drive_forms/apps.json`:

```json
{
	"name": "<myapp>",
	"path": "/<myapp>"
}
```

3) (Опционально) определите модели и предустановленные данные. Миграции уровня форм подхватят их при старте.

4) Реализуйте серверные методы в `server.js` и фронтенд в `resources/public/client.js`.

## Запуск и разработка

Требуется PostgreSQL (параметры в `drive_root/db/dbSettings.json`).

Команды (Windows PowerShell):

```powershell
# 1) Применить миграции и сиды ядра + форм (+модели приложений)
node drive_root\db\createDB.js

# 2) Запустить сервер
node main_server.js
```

Сервер стартует на `http://localhost:3000` (порт можно задать `PORT`).

## Полезные ориентиры для AI‑инструментов

- Входной сервер: `drive_root/server.js#createServer`, логика роута — `handleRequest`.
- Делегирование прикладному уровню: `server.config.json → appDir/appAlias/appHandler`.
- Универсальный RPC для приложений: `drive_forms/server.js` эндпоинт `/<appAlias>/call`.
- Роли и доступ: `drive_forms/globalServerContext.getUserAccessRole`, таблицы `systems`, `access_roles`, `user_systems`.
- Сессии: `drive_root/db/sessionManager.js`, cookie `sessionID`.
- Предопределённые данные: таблица `default_values` и функции `processDefaultValues`, миграции `createDB.js`.
- Расширение схемы БД приложением: `apps/<name>/db/db.js` — автоматически подхватывается миграторами форм.

## Известные ограничения / TODO

- Реализовать реальную проверку доступа к `protected`‑ресурсам.
- Стандартизировать ответы ошибок RPC, добавить валидацию входа.
- Добавить скрипты в `package.json` для удобного запуска.

