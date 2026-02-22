#!/bin/bash

# ZmRef - Установка AppImage версии
# Скрипт для установки ZmRef AppImage в систему

set -e

APP_NAME="ZmRef"
APP_VERSION="1.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPIMAGE_SRC="$SCRIPT_DIR/../dist/ZmRef-${APP_VERSION}.AppImage"
APP_DEST="/opt/zmref"

echo "╔════════════════════════════════════════════╗"
echo "║     ZmRef - Установка AppImage версии     ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# Проверка root прав
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Требуется запуск от root (sudo)"
    echo "   Используйте: sudo ./build/install-appimage.sh"
    exit 1
fi

# Проверка AppImage
if [ ! -f "$APPIMAGE_SRC" ]; then
    echo "❌ AppImage не найден: $APPIMAGE_SRC"
    echo "   Убедитесь, что сборка успешна: npm run build:linux"
    exit 1
fi

# Проверка libvips
echo "🔍 Проверка зависимостей..."
if ! command -v vips &> /dev/null && ! ldconfig -p | grep -q libvips; then
    echo "⚠️  libvips не найден!"
    echo ""
    
    # Определение пакетного менеджера
    if command -v pacman &> /dev/null; then
        echo "📦 Установка libvips через pacman..."
        pacman -S --noconfirm libvips
    elif command -v apt &> /dev/null; then
        echo "📦 Установка libvips через apt..."
        apt update && apt install -y libvips42
    elif command -v dnf &> /dev/null; then
        echo "📦 Установка libvips через dnf..."
        dnf install -y libvips
    else
        echo "⚠️  Установите libvips вручную для вашей системы"
    fi
fi
echo "   ✓ libvips установлен"

# Создание директорий
echo ""
echo "📁 Создание директорий..."
mkdir -p "$APP_DEST"
mkdir -p "/usr/share/icons/hicolor/256x256/apps"
mkdir -p "/usr/share/applications"

# Копирование AppImage
echo ""
echo "📦 Копирование AppImage..."
cp "$APPIMAGE_SRC" "$APP_DEST/ZmRef-${APP_VERSION}.AppImage"
chmod +x "$APP_DEST/ZmRef-${APP_VERSION}.AppImage"
echo "   ✓ AppImage скопирован в $APP_DEST"

# Копирование иконки
echo ""
echo "🖼️  Установка иконки..."
cp "$SCRIPT_DIR/zmref.png" "/usr/share/icons/hicolor/256x256/apps/zmref.png"
cp "$SCRIPT_DIR/zmref.png" "/usr/share/icons/hicolor/512x512/apps/zmref.png"
echo "   ✓ Иконка установлена"

# Создание desktop файла
echo ""
echo "📄 Создание desktop файла..."
cat > "/usr/share/applications/zmref.desktop" << EOF
[Desktop Entry]
Name=ZmRef
Comment=Minimalist Reference Image Viewer
Exec=$APP_DEST/ZmRef-${APP_VERSION}.AppImage %U
Terminal=false
Type=Application
Icon=zmref
StartupWMClass=zmref
Categories=Graphics;Viewer;
MimeType=image/png;image/jpeg;image/jpg;image/webp;image/gif;image/svg+xml;
Keywords=reference;images;canvas;organizer;
EOF
chmod +x "/usr/share/applications/zmref.desktop"
echo "   ✓ Desktop файл создан"

# Обновление кэшей
echo ""
echo "🔄 Обновление кэшей..."
if command -v update-desktop-database &> /dev/null; then
    update-desktop-database /usr/share/applications 2>/dev/null && echo "   ✓ Desktop database" || true
fi
if command -v gtk-update-icon-cache &> /dev/null; then
    gtk-update-icon-cache -f /usr/share/icons/hicolor 2>/dev/null && echo "   ✓ Icon cache" || true
fi

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║          Установка завершена!             ║"
echo "╚════════════════════════════════════════════╝"
echo ""
echo "✓ Запуск из меню приложений"
echo "✓ Или командой: $APP_DEST/ZmRef-${APP_VERSION}.AppImage"
echo ""
echo "Для удаления:"
echo "  sudo rm -rf $APP_DEST"
echo "  sudo rm /usr/share/icons/hicolor/*/apps/zmref.png"
echo "  sudo rm /usr/share/applications/zmref.desktop"
echo "  sudo update-desktop-database"
echo ""
