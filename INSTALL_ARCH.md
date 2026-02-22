# ZmRef для Arch Linux

## Быстрый старт

### Важное обновление: Зависимость libvips

ZmRef использует библиотеку `sharp` для обработки изображений, которая требует **libvips**.

**Перед сборкой или установкой установите libvips:**

```bash
# Arch Linux
sudo pacman -S libvips

# Debian/Ubuntu
sudo apt install libvips42 libvips-dev

# Fedora
sudo dnf install libvips
```

---

### Вариант 1: Установка AppImage (Рекомендуется)

**Установка в систему:**

```bash
# 1. Установите libvips (обязательно!)
sudo pacman -S libvips

# 2. Запустите скрипт установки
cd "/path/to/zmref/build"
sudo ./install-appimage.sh
```

**Что делает скрипт:**
- Копирует AppImage в `/opt/zmref/`
- Устанавливает иконку в систему
- Создаёт .desktop файл в меню приложений
- Проверяет и устанавливает libvips при необходимости
- Обновляет кэши

**Запуск:**
- Из меню приложений
- Или командой: `/opt/zmref/ZmRef-1.0.0.AppImage`

---

## Вариант 2: Распакованная версия (без FUSE)

Этот вариант работает без FUSE и интегрируется в систему.

```bash
# Запустите скрипт установки
cd build/
./install-unpacked.sh
```

**Что делает скрипт:**
- Копирует файлы в `~/opt/zmref/`
- Устанавливает иконку
- Создаёт .desktop файл в меню приложений
- Обновляет кэши

**Запуск:**
- Из меню приложений
- Или командой: `~/opt/zmref/zmref`

---

## Вариант 2: AppImage (Требует FUSE)

```bash
# Конвертируйте deb в tar.gz
deb2targz ZmRef-1.0.0.deb

# Распакуйте
tar -xzf ZmRef-1.0.0.tar.gz

# Запустите
./usr/bin/zmref
```

---

## Вариант 3: Прямой запуск AppImage (без установки)

```bash
# Сделайте AppImage исполняемым
chmod +x dist/ZmRef-1.0.0.AppImage

# Запустите
./dist/ZmRef-1.0.0.AppImage
```

**Примечание:** Требуется FUSE для работы AppImage.

---

## Вариант 4: Прямой запуск из сборки

```bash
# Перейдите в директорию сборки
cd dist/linux-unpacked/

# Запустите
./zmref
```

---

## Зависимости

Для работы ZmRef требуются:

**Обязательно:**
```bash
# libvips для обработки изображений (sharp)
sudo pacman -S libvips

# Остальные зависимости
sudo pacman -S gtk3 libnotify libxss libxtst at-spi2-atk libuuid
```

Или установите все зависимости одной командой:

```bash
sudo pacman -S --needed gtk3 libnotify libxss libxtst at-spi2-atk libuuid nss alsa-lib libvips
```

---

## Удаление

### Для AppImage установки:
```bash
# Удалите приложение
sudo rm -rf /opt/zmref

# Удалите иконку
sudo rm /usr/share/icons/hicolor/*/apps/zmref.png

# Удалите desktop файл
sudo rm /usr/share/applications/zmref.desktop

# Обновите кэши
sudo update-desktop-database
```

### Для распакованной версии:
```bash
# Удалите приложение
rm -rf ~/opt/zmref

# Удалите иконку
rm ~/.local/share/icons/hicolor/512x512/apps/zmref.png

# Удалите desktop файл
rm ~/.local/share/applications/zmref.desktop

# Обновите кэши
update-desktop-database ~/.local/share/applications
gtk-update-icon-cache -f ~/.local/share/icons/hicolor
```

---

## Структура сборки

```
dist/
├── ZmRef-1.0.0.AppImage          # AppImage для установки
├── linux-unpacked/               # Распакованная версия
│   ├── zmref                     # Исполняемый файл
│   ├── resources/                # Ресурсы приложения
│   └── lib/                      # Библиотеки
└── build/
    ├── install-appimage.sh       # Скрипт установки AppImage
    ├── install-unpacked.sh       # Скрипт установки распакованной версии
    ├── post-install.sh           # Скрипт проверки зависимостей
    ├── zmref.desktop             # Desktop файл
    └── *.png                     # Иконки
```

---

## Интеграция с системой

### После установки AppImage (скрипт install-appimage.sh):

- ✓ Иконка появится в меню приложений
- ✓ Приложение будет в категории "Графика"
- ✓ Поддержка ассоциации файлов изображений
- ✓ Автоматическое обновление системных кэшей
- ✓ Доступно из любого места через команду `zmref`

### После установки распакованной версии (скрипт install-unpacked.sh):

- ✓ Иконка появится в меню приложений (локально)
- ✓ Приложение доступно через `~/opt/zmref/zmref`
- ✓ Ассоциация файлов изображений

---

## Сборка из исходников

```bash
# 1. Установите libvips (обязательно!)
sudo pacman -S libvips

# 2. Установите зависимости
npm install

# 3. Переустановите sharp для правильной платформы
npm install --platform=linux --arch=x64 sharp

# 4. Соберите AppImage и DEB
npm run build:linux

# 5. Найдите сборки в dist/
ls dist/
```

### Если возникает ошибка sharp при запуске:

```bash
# Пересоберите sharp для версии Electron
npm rebuild sharp --target=34.0.0 --dist-url=https://electronjs.org/headers

# Затем соберите заново
npm run build
```

---

## Поддержка

- GitHub: https://github.com/zanmaer/zmref
- License: MIT
