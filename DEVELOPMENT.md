# Разработка Monster Order Desk

Этот файл содержит команды ежедневной разработки. Назначение, API и ограничения описаны в [README.md](README.md), архитектура и потоки — в [ARCHITECTURE.md](ARCHITECTURE.md), история работ — в [Changelog.md](Changelog.md).

## Быстрый запуск

```bash
npm install
npm run dev
```

Клиент доступен на `http://localhost:5173`, сервер — на `http://localhost:3000`.
Перед запуском задайте `ODATA_BASE_URL`, `ODATA_USERNAME` и `ODATA_PASSWORD` в `.env`. Секреты не добавляйте в код и логи.

Веб-режим и desktop-режим используют разные способы конфигурации: для `npm run dev` и `npm start` используется `.env`/окружение, а установленный Electron запускается с параметрами из `%APPDATA%\Monster Order Desk\config.json`, которые задаются через окно «Настройки».

## Режимы запуска Electron

`npm run dev:electron` поднимает три связанных процесса: Express на `127.0.0.1:3000`, Vite на
`127.0.0.1:5173` и Electron. Главный процесс открывает Vite через `VITE_DEV_SERVER_URL`; изменения
renderer видны через HMR, а изменения main/preload требуют перезапуска Electron.

`npm run build:electron` не запускает приложение и не создаёт installer: он собирает production
клиент и сервер, копирует assets и компилирует `electron/main.ts` и `electron/preload.ts` в
`dist-electron`. Для проверки реального desktop-потока используйте `npm run test:e2e:electron`, а
для выдаваемых Windows-файлов — `npm run package:win`.

В Electron настройки не читаются из `.env` после установки. Окно «Настройки» проверяет переданные
параметры через `POST /api/documents/test-connection`, сохраняет их через IPC, а новый экземпляр
встроенного сервера подхватывает их только после перезапуска приложения.

## Основные команды

```bash
npm run typecheck       # проверка TypeScript
npm run lint            # проверка ESLint
npm run format:check    # проверка Prettier
npm test                # модульные тесты и тесты маршрутов
npm run test:e2e        # Playwright, нужен доступ к демо-1С
npm run test:e2e:user-scenarios  # E2E сценарий с перебором заказов, скриншотами и PDF
npm run test:e2e:electron        # E2E сценарий в среде Electron со скриншотами и PDF в отдельной папке
npm run build           # production-сборка клиента и сервера
npm run build:electron  # сборка настольного приложения Electron (клиент, сервер и main/preload)
npm run dev:electron    # запуск Electron в режиме разработки
npm run package:win     # упаковка готового .exe / инсталлятора под Windows
```

`npm run package:win` также включает `build/windows/README.txt` в оба Windows-дистрибутива как `resources/README.txt`. После изменения файлов в `build/windows/` повторно запускайте упаковку.

Перед изменением интеграции сначала запускайте узкие тесты соответствующего сервиса, затем полный набор проверок.

## Проверка по слоям

- Изменения расчётов, валидации и OData: соответствующий unit/route-тест, затем `npm test`.
- Изменения React/UI: `npm run typecheck`, `npm run lint`, браузерный E2E и проверка desktop/mobile.
- Изменения Electron main/preload или упаковки: `npm run typecheck`, `npm run build:electron`,
  `npm run test:e2e:electron`; перед выпуском `npm run package:win`.
- Изменения только документации: `npx prettier --check README.md ARCHITECTURE.md DEVELOPMENT.md
SETUP.md Changelog.md build/windows/README.txt`.

Не запускайте сценарии, которые могут создать реализацию в общей 1С, без явного согласования тестовых
данных. Electron E2E использует реальные HTTP-вызовы, если они не перехвачены тестом, и может изменить
демо-базу.

## Отладка в VS Code

- `F5` → `Full Stack` запускает клиент и сервер в режиме отладки.
- `Ctrl+Shift+B` запускает задачу сборки.
- `Ctrl+Shift+P` → `Tasks: Run Task` открывает задачи проекта:
  - `Build Electron` — полная сборка настольного приложения (`npm run build:electron`);
  - `Test: OData Connection` — проверка соединения с 1С (читает `ODATA_USERNAME` и `ODATA_PASSWORD` из окружения);
  - `Test: User Scenarios with Screenshots and PDF` — комплексный браузерный E2E-тест со скриншотами и PDF-документами выдачи в `output-artifacts/web/`;
  - `Test: Electron Scenarios with Screenshots and PDF` — E2E-тест настольного Electron-приложения с сохранением артефактов в `output-artifacts/electron/`.

Конфигурации находятся в `.vscode/launch.json`, задачи — в `.vscode/tasks.json`, настройки форматирования и ESLint — в `.vscode/settings.json`.

## Контрольный список перед завершением

1. Проверить изменение в модуле-владельце и связанном контракте.
2. Не подменять отсутствующие данные нулём или тестовыми значениями.
3. Для записи в 1С отдельно проверить защиту от повторного POST.
4. Выполнить `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` и `npm run build`.
5. Для изменений интерфейса проверить desktop и mobile, для OData — демо-данные без сброса базы.

## Тестовые данные

Эталонный заказ и ожидаемые суммы находятся в тестах и README. Список штрихкодов демо-базы для
проверки остатков хранится в `src/shared/demoBarcodes.ts`: его используют и интерфейс, и сценарий
`e2e/barcode-search.spec.ts`. Не дублируйте этот список в исходном коде клиента или теста.

E2E-проверки требуют доступной конфигурации 1С и переменных окружения, если соответствующий запрос
не перехвачен внутри сценария. Реальные пароли в документации не приводятся.
