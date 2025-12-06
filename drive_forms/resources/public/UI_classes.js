
class UIObject {
    constructor() {
        this.element = null;
        this.parent = null;
        this.children = [];
        this.x = 0;
        this.y = 0;
        this.width = 0;
        this.height = 0;
        this.z = 0;
    }
    // Setters / Getters for geometry & depth
    setX(x) { 
        this.x = x; 
        if (this.element) this.element.style.left = x + 'px';
    }
    getX() { return this.x; }
    setY(y) { 
        this.y = y; 
        if (this.element) this.element.style.top = y + 'px';
    }
    getY() { return this.y; }
    setWidth(width) { 
        this.width = width; 
        if (this.element) this.element.style.width = width + 'px';
    }
    getWidth() { return this.width; }
    setHeight(height) { 
        this.height = height; 
        if (this.element) this.element.style.height = height + 'px';
    }
    getHeight() { return this.height; }
    setZ(z) { this.z = z; }
    getZ() { return this.z; }
    // Optional element accessor
    getElement() { return this.element; }
    setElement(el) { this.element = el; }

    // Загрузка client_config.json (ленивая, с кешированием)
    static loadClientConfig() {
        if (UIObject._clientConfig) return Promise.resolve(UIObject._clientConfig);
        if (UIObject._clientConfigPromise) return UIObject._clientConfigPromise;
        if (typeof fetch !== 'function') {
            UIObject._clientConfig = {};
            return Promise.resolve(UIObject._clientConfig);
        }
        UIObject._clientConfigPromise = fetch('/app/res/public/client_config.json')
            .then(r => r.ok ? r.json() : {})
            .then(json => {
                UIObject._clientConfig = json || {};
                return UIObject._clientConfig;
            })
            .catch(() => {
                UIObject._clientConfig = {};
                return UIObject._clientConfig;
            });
        return UIObject._clientConfigPromise;
    }

    static getClientConfigValue(key, def) {
        const cfg = UIObject._clientConfig;
        return (cfg && Object.prototype.hasOwnProperty.call(cfg, key)) ? cfg[key] : def;
    }

    // Utility: brighten a CSS color by amount (0-255). Supports #RGB, #RRGGBB and rgb()/rgba().
    static brightenColor(color, amount = 20) {
        try {
            if (!color || typeof color !== 'string') return color;
            const clamp = (v) => Math.max(0, Math.min(255, v | 0));

            const trim = color.trim();
            // Hex formats
            if (trim[0] === '#') {
                let hex = trim.slice(1);
                if (hex.length === 3) {
                    // Expand #RGB to #RRGGBB
                    hex = hex.split('').map(ch => ch + ch).join('');
                }
                if (hex.length === 6) {
                    const r = parseInt(hex.slice(0, 2), 16);
                    const g = parseInt(hex.slice(2, 4), 16);
                    const b = parseInt(hex.slice(4, 6), 16);
                    const rr = clamp(r + amount).toString(16).padStart(2, '0');
                    const gg = clamp(g + amount).toString(16).padStart(2, '0');
                    const bb = clamp(b + amount).toString(16).padStart(2, '0');
                    return `#${rr}${gg}${bb}`;
                }
                return trim; // Unknown hex length, return as-is
            }

            // rgb() / rgba()
            const rgbMatch = trim.match(/^rgba?\(([^)]+)\)$/i);
            if (rgbMatch) {
                const parts = rgbMatch[1].split(',').map(p => p.trim());
                // Expect at least r,g,b
                const r = clamp(parseFloat(parts[0]));
                const g = clamp(parseFloat(parts[1]));
                const b = clamp(parseFloat(parts[2]));
                const a = parts[3] !== undefined ? parseFloat(parts[3]) : null;
                const rr = clamp(r + amount);
                const gg = clamp(g + amount);
                const bb = clamp(b + amount);
                return a === null ? `rgb(${rr}, ${gg}, ${bb})` : `rgba(${rr}, ${gg}, ${bb}, ${a})`;
            }

            // Fallback: return original if format unsupported
            return color;
        } catch (_) {
            return color;
        }
    }

    // Helper to style elements
    static styleElement(element, x, y, w, h, fSize) {
        if (element && typeof element.getElement === 'function') {
            const el = element.getElement();
            if (el) {
                el.style.position = 'absolute';
                el.style.left = x + 'px';
                el.style.top = y + 'px';
                el.style.width = w + 'px';
                el.style.height = h + 'px';
                el.style.fontSize = fSize + 'px';
            }
        }
    }

    setParent(parent) {
        this.parent = parent;
    }

    getParent() {
        return this.parent || null;
    }

    addChild(child) {
        this.children.push(child);
        child.setParent(this);
    }

    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index > -1) {
            this.children.splice(index, 1);
            child.setParent(null);
        }
    }

    getChildren() {
        return this.children || [];
    }

    Draw(container) {
        // Метод для отрисовки элемента
    }

    onClick(event) {
        // Метод обработки клика
    }

    onDoubleClick(event) {
        // Метод обработки двойного клика
    }

    onLeftClick(event) {
        // Метод обработки левого клика
    }

    onHover(event) {
        // Метод обработки наведения
    }

    onMouseDown(event) {
        // Метод обработки нажатия кнопки мыши
    }

    onMouseUp(event) {
        // Метод обработки отпускания кнопки мыши
    }

    onKeyPressed(event) {
        // Метод обработки нажатия клавиши
    }
}

class Form extends UIObject {

    constructor() {
        super();
        this.title = '';
        this.titleBar = null;
        this.titleTextElement = null;
        this.contentArea = null;
        this.movable = true;
        this.resizable = true;
        this.isDragging = false;
        this.isResizing = false;
        this.resizeDirection = null;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.anchorToWindow = null; // 'center', 'bottom-right', или null
        this.windowResizeHandler = null;
        this.lockAspectRatio = false; // Блокировка изменения пропорций
        this.initialAspectRatio = 0; // Начальное соотношение сторон
        this.btnMaximize = null; // Ссылка на кнопку максимизации
        this.btnMaximizeCanvas = null; // Canvas с иконкой кнопки maximize
        this.isMaximized = false;
        this.restoreX = 0;
        this.restoreY = 0;
        this.restoreWidth = 0;
        this.restoreHeight = 0;
    }

    activate() {
        if (this.element) {
            // Деактивируем все другие формы
            Form._allForms.forEach(form => {
                if (form !== this) {
                    form.deactivate();
                }
            });

            this.z = ++Form._globalZIndex;
            this.element.style.zIndex = this.z;
            this.element.focus();

            // Делаем заголовок синим
            if (this.titleBar) {
                this.titleBar.style.backgroundColor = '#000080';
            }

            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('form-activated', { detail: { form: this } }));
            }
        }
    }

    deactivate() {
        // Делаем заголовок темно-серым
        if (this.titleBar) {
            this.titleBar.style.backgroundColor = '#808080';
        }
    }

    setTitle(title) {
        this.title = title;
        if (this.titleTextElement) {
            this.titleTextElement.textContent = title;
        } else if (this.titleBar) {
            this.titleBar.textContent = title;
        }
    }

    getTitle() {
        return this.title;
    }

    setMovable(value) {
        this.movable = value;
    }

    getMovable() {
        return this.movable;
    }

    setResizable(value) {
        this.resizable = value;
    }

    getResizable() {
        return this.resizable;
    }

    setLockAspectRatio(value) {
        this.lockAspectRatio = value;
        // Обновляем состояние кнопки maximize
        if (this.btnMaximize && this.btnMaximizeCanvas) {
            this.btnMaximize.disabled = value;
            this.btnMaximize.style.cursor = value ? 'not-allowed' : 'pointer';

            // Перерисовываем иконку с нужным цветом
            const ctx = this.btnMaximizeCanvas.getContext('2d');
            ctx.clearRect(0, 0, 12, 12);

            if (value) {
                // Неактивная - цвет темной границы (нижняя и правая кромка)
                const baseColor = UIObject.getClientConfigValue('defaultColor', '#c0c0c0');
                ctx.fillStyle = UIObject.brightenColor(baseColor, -60);
            } else {
                // Активная - черная
                ctx.fillStyle = '#000000';
            }

            ctx.fillRect(2, 2, 8, 1); // Верхняя линия
            ctx.fillRect(2, 2, 1, 8); // Левая линия
            ctx.fillRect(9, 2, 1, 8); // Правая линия
            ctx.fillRect(2, 9, 8, 1); // Нижняя линия
        }
    }

    getLockAspectRatio() {
        return this.lockAspectRatio;
    }

    setAnchorToWindow(anchor) {
        this.anchorToWindow = anchor;
        if (anchor && !this.windowResizeHandler) {
            this.windowResizeHandler = () => this.updatePositionOnResize();
            window.addEventListener('resize', this.windowResizeHandler);
        } else if (!anchor && this.windowResizeHandler) {
            window.removeEventListener('resize', this.windowResizeHandler);
            this.windowResizeHandler = null;
        }
    }

    getAnchorToWindow() {
        return this.anchorToWindow;
    }

    getContentArea() {
        return this.contentArea;
    }

    updatePositionOnResize() {
        if (this.anchorToWindow === 'center') {
            this.setX((window.innerWidth - this.width) / 2);
            
            const availableHeight = window.innerHeight - Form.topOffset - Form.bottomOffset;
            let newY = Form.topOffset + (availableHeight - this.height) / 2;
            
            if (newY < Form.topOffset) newY = Form.topOffset;
            this.setY(newY);
        } else if (this.anchorToWindow === 'bottom-right') {
            this.setX(window.innerWidth - this.width - 40);
            this.setY(window.innerHeight - this.height - 60);
        }

        if (this.element) {
            this.element.style.left = this.x + 'px';
            this.element.style.top = this.y + 'px';
        }
    }

    Draw(container) {
        if (!this.element) {
            // Сохраняем начальное соотношение сторон для lockAspectRatio
            if (this.width > 0 && this.height > 0) {
                this.initialAspectRatio = this.width / this.height;
            }

            this.element = document.createElement('div');
            this.element.style.position = 'absolute';
            this.element.style.left = this.x + 'px';
            this.element.style.top = this.y + 'px';
            this.element.style.width = this.width + 'px';
            this.element.style.height = this.height + 'px';
            this.element.style.zIndex = this.z;
            this.element.tabIndex = 0;
            this.element.style.outline = 'none';

            // Добавляем форму в глобальный массив
            Form._allForms.push(this);

            // Ретро-стиль: объёмная рамка
            // Используем client_config.json (если загружен) или значение по умолчанию
            const initialBg = UIObject.getClientConfigValue('defaultColor', '#c0c0c0');
            const bgColor = initialBg;
            this.element.style.backgroundColor = bgColor;

            this.element.style.borderTop = `2px solid ${UIObject.brightenColor(bgColor, 60)}`;
            this.element.style.borderLeft = `2px solid ${UIObject.brightenColor(bgColor, 60)}`;
            this.element.style.borderRight = `2px solid ${UIObject.brightenColor(bgColor, -60)}`;
            this.element.style.borderBottom = `2px solid ${UIObject.brightenColor(bgColor, -60)}`;
            this.element.style.boxSizing = 'border-box';

            // Асинхронно догружаем конфиг и обновляем цвета, если он ещё не был загружен
            UIObject.loadClientConfig().then(cfg => {
                const finalColor = UIObject.getClientConfigValue('defaultColor', bgColor);
                if (finalColor !== bgColor) {
                    this.element.style.backgroundColor = finalColor;
                    this.element.style.borderTop = `2px solid ${UIObject.brightenColor(finalColor, 60)}`;
                    this.element.style.borderLeft = `2px solid ${UIObject.brightenColor(finalColor, 60)}`;
                    this.element.style.borderRight = `2px solid ${UIObject.brightenColor(finalColor, -60)}`;
                    this.element.style.borderBottom = `2px solid ${UIObject.brightenColor(finalColor, -60)}`;
                }
            });

            // Создаём заголовок (изначально неактивный - темно-серый)
            this.titleBar = document.createElement('div');
            this.titleBar.style.backgroundColor = '#808080';
            this.titleBar.style.color = '#ffffff';
            this.titleBar.style.fontWeight = 'bold';
            this.titleBar.style.fontSize = '14px';
            this.titleBar.style.padding = '2px 4px';
            this.titleBar.style.cursor = 'default';
            this.titleBar.style.userSelect = 'none';
            this.titleBar.style.display = 'flex';
            this.titleBar.style.justifyContent = 'space-between';
            this.titleBar.style.alignItems = 'center';

            // Текст заголовка
            this.titleTextElement = document.createElement('span');
            this.titleTextElement.textContent = this.title;
            this.titleBar.appendChild(this.titleTextElement);

            // Контейнер для кнопок
            const buttonsContainer = document.createElement('div');
            buttonsContainer.style.display = 'flex';
            buttonsContainer.style.gap = '2px';
            buttonsContainer.style.flexShrink = '0'; // Запрещаем сжимать кнопки
            buttonsContainer.style.marginLeft = 'auto'; // Прижимаем вправо (на всякий случай)

            // Базовый стиль для кнопок заголовка (размер/выравнивание и т.п.)
            const buttonStyle = {
                width: '18px',
                height: '18px',
                padding: '0',
                margin: '0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: '18px',
                boxSizing: 'border-box',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                cursor: 'default'
            };

            // Функция применения цветов для кнопок заголовка
            const applyTitleButtonColors = (el, base) => {
                const light = UIObject.brightenColor(base, 60);
                const dark = UIObject.brightenColor(base, -60);
                el.style.backgroundColor = base;
                el.style.borderTop = `1px solid ${light}`;
                el.style.borderLeft = `1px solid ${light}`;
                el.style.borderRight = `1px solid ${dark}`;
                el.style.borderBottom = `1px solid ${dark}`;
                el.style.boxSizing = 'border-box';
                el.style.cursor = 'default';
            };

            // Кнопка минимизации
            const btnMinimize = document.createElement('button');
            Object.assign(btnMinimize.style, buttonStyle);
            const canvasMin = document.createElement('canvas');
            canvasMin.width = 12;
            canvasMin.height = 12;
            const ctxMin = canvasMin.getContext('2d');
            ctxMin.fillStyle = '#000000';
            ctxMin.fillRect(2, 9, 8, 1); // Горизонтальная линия внизу
            btnMinimize.appendChild(canvasMin);
            // Применяем 3D-стиль по теме
            applyTitleButtonColors(btnMinimize, UIObject.getClientConfigValue('defaultColor', initialBg));
            buttonsContainer.appendChild(btnMinimize);

            // Кнопка максимизации
            const btnMaximize = document.createElement('button');
            Object.assign(btnMaximize.style, buttonStyle);
            const canvasMax = document.createElement('canvas');
            canvasMax.width = 12;
            canvasMax.height = 12;
            const ctxMax = canvasMax.getContext('2d');
            ctxMax.fillStyle = '#000000';
            ctxMax.fillRect(2, 2, 8, 1); // Верхняя линия
            ctxMax.fillRect(2, 2, 1, 8); // Левая линия
            ctxMax.fillRect(9, 2, 1, 8); // Правая линия
            ctxMax.fillRect(2, 9, 8, 1); // Нижняя линия
            btnMaximize.appendChild(canvasMax);
            // Применяем 3D-стиль по теме
            applyTitleButtonColors(btnMaximize, UIObject.getClientConfigValue('defaultColor', initialBg));
            buttonsContainer.appendChild(btnMaximize);

            // Сохраняем ссылку на кнопку maximize и её canvas
            this.btnMaximize = btnMaximize;
            this.btnMaximizeCanvas = canvasMax;

            // Применяем блокировку если установлена
            if (this.lockAspectRatio) {
                this.setLockAspectRatio(true);
            }

            // Кнопка закрытия
            const btnClose = document.createElement('button');
            Object.assign(btnClose.style, buttonStyle);
            const canvasClose = document.createElement('canvas');
            canvasClose.width = 12;
            canvasClose.height = 12;
            const ctxClose = canvasClose.getContext('2d');
            ctxClose.strokeStyle = '#000000';
            ctxClose.lineWidth = 1.5;
            ctxClose.beginPath();
            ctxClose.moveTo(3, 3);
            ctxClose.lineTo(9, 9);
            ctxClose.moveTo(9, 3);
            ctxClose.lineTo(3, 9);
            ctxClose.stroke();
            btnClose.appendChild(canvasClose);
            // Применяем 3D-стиль по теме
            applyTitleButtonColors(btnClose, UIObject.getClientConfigValue('defaultColor', initialBg));
            buttonsContainer.appendChild(btnClose);

            this.titleBar.appendChild(buttonsContainer);
            this.element.appendChild(this.titleBar);

            // Актуализируем цвета кнопок после загрузки client_config (если ещё не загружен)
            UIObject.loadClientConfig().then(() => {
                const base = UIObject.getClientConfigValue('defaultColor', initialBg);
                applyTitleButtonColors(btnMinimize, base);
                applyTitleButtonColors(btnMaximize, base);
                applyTitleButtonColors(btnClose, base);
            });

            // Handlers
            btnMinimize.onclick = (e) => {
                e.stopPropagation();
                this.minimize();
            };
            btnMaximize.onclick = (e) => {
                e.stopPropagation();
                this.maximize();
            };
            btnClose.onclick = (e) => {
                e.stopPropagation();
                this.close();
            };

            // Создаём область контента
            this.contentArea = document.createElement('div');
            this.contentArea.style.position = 'relative';
            this.contentArea.style.width = '100%';
            this.contentArea.style.overflow = 'auto';
            this.contentArea.style.boxSizing = 'border-box';
            this.element.appendChild(this.contentArea);

            // Устанавливаем высоту contentArea после добавления в DOM
            // (когда titleBar.offsetHeight уже доступен)
            setTimeout(() => {
                if (this.contentArea && this.titleBar) {
                    this.contentArea.style.height = 'calc(100% - ' + (this.titleBar.offsetHeight + 0) + 'px)';
                }
            }, 0);

            // Добавляем перетаскивание формы за заголовок
            if (this.movable) {
                this.titleBar.style.cursor = 'move';

                this.titleBar.addEventListener('mousedown', (e) => {
                    if (e.target === this.titleBar || e.target.tagName === 'SPAN') {
                        this.isDragging = true;
                        this.dragOffsetX = e.clientX - this.x;
                        this.dragOffsetY = e.clientY - this.y;
                        e.preventDefault();
                    }
                });

                document.addEventListener('mousemove', (e) => {
                    if (this.isDragging) {
                        this.setX(e.clientX - this.dragOffsetX);
                        let newY = e.clientY - this.dragOffsetY;
                        
                        // Ограничение сверху
                        if (newY < Form.topOffset) newY = Form.topOffset;
                        
                        // Ограничение снизу (чтобы окно не уходило под панель задач)
                        // Разрешаем уходить вниз, но не глубже чем bottomOffset
                        // Или лучше жестко ограничить? "не должны подлезать под меню"
                        // Сделаем жесткое ограничение нижней границы окна
                        const maxBottom = window.innerHeight - Form.bottomOffset;
                        if (newY + this.height > maxBottom) {
                            newY = maxBottom - this.height;
                            // Если окно выше рабочей области, прижимаем к верху
                            if (newY < Form.topOffset) newY = Form.topOffset;
                        }

                        this.setY(newY);
                        this.element.style.left = this.x + 'px';
                        this.element.style.top = this.y + 'px';
                    }
                });

                document.addEventListener('mouseup', () => {
                    this.isDragging = false;
                });
            }

            // Добавляем изменение размеров формы
            if (this.resizable) {
                const resizeBorderSize = 4;

                this.element.addEventListener('mousemove', (e) => {
                    if (this.isResizing) return;

                    const rect = this.element.getBoundingClientRect();
                    const mouseX = e.clientX;
                    const mouseY = e.clientY;

                    const nearLeft = mouseX >= rect.left && mouseX <= rect.left + resizeBorderSize;
                    const nearRight = mouseX >= rect.right - resizeBorderSize && mouseX <= rect.right;
                    const nearTop = mouseY >= rect.top && mouseY <= rect.top + resizeBorderSize;
                    const nearBottom = mouseY >= rect.bottom - resizeBorderSize && mouseY <= rect.bottom;

                    if ((nearLeft && nearTop) || (nearRight && nearBottom)) {
                        this.element.style.cursor = 'nwse-resize';
                    } else if ((nearRight && nearTop) || (nearLeft && nearBottom)) {
                        this.element.style.cursor = 'nesw-resize';
                    } else if (nearRight || nearLeft) {
                        this.element.style.cursor = 'ew-resize';
                    } else if (nearBottom || nearTop) {
                        this.element.style.cursor = 'ns-resize';
                    } else {
                        this.element.style.cursor = 'default';
                    }
                });

                this.element.addEventListener('mousedown', (e) => {
                    const rect = this.element.getBoundingClientRect();
                    const mouseX = e.clientX;
                    const mouseY = e.clientY;

                    const nearLeft = mouseX >= rect.left && mouseX <= rect.left + resizeBorderSize;
                    const nearRight = mouseX >= rect.right - resizeBorderSize && mouseX <= rect.right;
                    const nearTop = mouseY >= rect.top && mouseY <= rect.top + resizeBorderSize;
                    const nearBottom = mouseY >= rect.bottom - resizeBorderSize && mouseY <= rect.bottom;

                    if (nearLeft || nearRight || nearTop || nearBottom) {
                        this.isResizing = true;
                        this.resizeDirection = {
                            left: nearLeft,
                            right: nearRight,
                            top: nearTop,
                            bottom: nearBottom
                        };
                        e.preventDefault();
                    }
                });

                document.addEventListener('mousemove', (e) => {
                    if (this.isResizing) {
                        if (this.lockAspectRatio) {
                            // При блокировке пропорций изменяем оба размера пропорционально
                            // Упрощенная реализация для правого нижнего угла (как было)
                            // TODO: Добавить поддержку других углов для lockAspectRatio
                            if (this.resizeDirection.right || this.resizeDirection.bottom) {
                                const newWidth = e.clientX - this.x;
                                const newHeight = e.clientY - this.y;

                                let targetWidth = newWidth;
                                let targetHeight = newHeight;

                                // Определяем что изменяется и вычисляем другое измерение
                                if (this.resizeDirection.right && this.resizeDirection.bottom) {
                                    // Изменяем по углу - берем среднее или по большему изменению
                                    const widthRatio = newWidth / this.width;
                                    const heightRatio = newHeight / this.height;

                                    if (Math.abs(widthRatio - 1) > Math.abs(heightRatio - 1)) {
                                        targetHeight = newWidth / this.initialAspectRatio;
                                    } else {
                                        targetWidth = newHeight * this.initialAspectRatio;
                                    }
                                } else if (this.resizeDirection.right) {
                                    targetHeight = newWidth / this.initialAspectRatio;
                                } else if (this.resizeDirection.bottom) {
                                    targetWidth = newHeight * this.initialAspectRatio;
                                }

                                if (targetWidth > 100 && targetHeight > 50) {
                                    this.setWidth(targetWidth);
                                    this.setHeight(targetHeight);
                                    this.element.style.width = this.width + 'px';
                                    this.element.style.height = this.height + 'px';
                                }
                            }
                        } else {
                            // Обычное изменение размера без блокировки пропорций
                            
                            // Right
                            if (this.resizeDirection.right) {
                                const newWidth = e.clientX - this.x;
                                // Проверяем минимальную ширину с учетом заголовка
                                if (this.titleBar) {
                                    const titleBarHeight = this.titleBar.offsetHeight;
                                    const tempWidth = this.element.style.width;
                                    this.element.style.width = newWidth + 'px';
                                    const newTitleBarHeight = this.titleBar.offsetHeight;
                                    // Если заголовок начал переноситься на новую строку, откатываем
                                    if (newTitleBarHeight > titleBarHeight || newWidth < 120) {
                                        this.element.style.width = tempWidth;
                                    } else if (newWidth > 100) {
                                        this.setWidth(newWidth);
                                        this.element.style.width = this.width + 'px';
                                    }
                                } else if (newWidth > 100) {
                                    this.setWidth(newWidth);
                                    this.element.style.width = this.width + 'px';
                                }
                            }

                            // Left
                            if (this.resizeDirection.left) {
                                const newWidth = (this.x + this.width) - e.clientX;
                                if (newWidth > 100) {
                                    // Проверка заголовка
                                    if (this.titleBar) {
                                        const titleBarHeight = this.titleBar.offsetHeight;
                                        const tempWidth = this.element.style.width;
                                        this.element.style.width = newWidth + 'px';
                                        const newTitleBarHeight = this.titleBar.offsetHeight;
                                        if (newTitleBarHeight > titleBarHeight || newWidth < 120) {
                                            this.element.style.width = tempWidth;
                                        } else {
                                            this.setX(e.clientX);
                                            this.setWidth(newWidth);
                                            this.element.style.left = this.x + 'px';
                                            this.element.style.width = this.width + 'px';
                                        }
                                    } else {
                                        this.setX(e.clientX);
                                        this.setWidth(newWidth);
                                        this.element.style.left = this.x + 'px';
                                        this.element.style.width = this.width + 'px';
                                    }
                                }
                            }

                            // Bottom
                            if (this.resizeDirection.bottom) {
                                const newHeight = e.clientY - this.y;
                                if (newHeight > 50) {
                                    this.setHeight(newHeight);
                                    this.element.style.height = this.height + 'px';
                                }
                            }

                            // Top
                            if (this.resizeDirection.top) {
                                let newY = e.clientY;
                                // Ограничение сверху
                                if (newY < Form.topOffset) newY = Form.topOffset;
                                
                                const newHeight = (this.y + this.height) - newY;
                                if (newHeight > 50) {
                                    this.setY(newY);
                                    this.setHeight(newHeight);
                                    this.element.style.top = this.y + 'px';
                                    this.element.style.height = this.height + 'px';
                                }
                            }
                        }
                        // Вызываем onResizing во время изменения размера
                        this.onResizing();
                    }
                });

                document.addEventListener('mouseup', () => {
                    if (this.isResizing) {
                        this.isResizing = false;
                        this.resizeDirection = null;
                        // Вызываем onResize после завершения изменения размера
                        this.onResize();
                    }
                });
            }
        }

        if (container) {
            container.appendChild(this.element);
        }

        // Добавляем обработчики событий для формы
        this.element.addEventListener('mousedown', (e) => {
            this.activate();
        });

        this.element.addEventListener('click', (e) => {
            this.onClick(e);
        });

        this.element.addEventListener('dblclick', (e) => {
            this.onDoubleClick(e);
        });

        this.element.addEventListener('mouseover', (e) => {
            this.onHover(e);
        });

        // Глобальный обработчик клавиш - срабатывает только для верхней формы
        if (!Form._globalKeyHandler) {
            Form._globalKeyHandler = (e) => {
                // Находим форму с максимальным z
                let topForm = null;
                let maxZ = -1;
                Form._allForms.forEach(form => {
                    if (form.z > maxZ) {
                        maxZ = form.z;
                        topForm = form;
                    }
                });

                // Вызываем onKeyPressed только у верхней формы
                if (topForm) {
                    topForm.onKeyPressed(e);
                }
            };

            Form._globalKeyUpHandler = (e) => {
                // Находим форму с максимальным z
                let topForm = null;
                let maxZ = -1;
                Form._allForms.forEach(form => {
                    if (form.z > maxZ) {
                        maxZ = form.z;
                        topForm = form;
                    }
                });

                // Вызываем onKeyReleased только у верхней формы
                if (topForm) {
                    topForm.onKeyReleased(e);
                }
            };

            document.addEventListener('keydown', Form._globalKeyHandler);
            document.addEventListener('keyup', Form._globalKeyUpHandler);
        }

        // Сохраняем ссылку на экземпляр формы в элементе
        this.element._formInstance = this;
        this.element.setAttribute('data-is-form', 'true');

        // Устанавливаем z-index для новой формы
        this.z = ++Form._globalZIndex;
        this.element.style.zIndex = this.z;

        // Dispatch creation event
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('form-created', { detail: { form: this } }));
        }

        return this.element;
    }

    close() {
        if (this.element) {
            this.element.remove();
        }
        const index = Form._allForms.indexOf(this);
        if (index > -1) {
            Form._allForms.splice(index, 1);
        }
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('form-destroyed', { detail: { form: this } }));
        }
    }

    minimize() {
        if (this.element) {
            this.element.style.display = 'none';
        }
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('form-minimized', { detail: { form: this } }));
        }
    }
    
    restore() {
        if (this.element) {
            this.element.style.display = '';
            this.activate();
        }
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('form-restored', { detail: { form: this } }));
        }
    }

    maximize() {
        if (this.isMaximized) {
            // Restore
            this.setX(this.restoreX);
            this.setY(this.restoreY);
            this.setWidth(this.restoreWidth);
            this.setHeight(this.restoreHeight);
            this.isMaximized = false;
        } else {
            // Maximize
            this.restoreX = this.x;
            this.restoreY = this.y;
            this.restoreWidth = this.width;
            this.restoreHeight = this.height;
            
            this.setX(0);
            this.setY(Form.topOffset);
            this.setWidth(window.innerWidth);
            this.setHeight(window.innerHeight - Form.topOffset - Form.bottomOffset);
            this.isMaximized = true;
        }
    }

    onClick(event) {
        // Handle click event
    }

    onDoubleClick(event) {
        // Handle double click event
    }

    onLeftClick(event) {
        // Handle left click event
    }

    onHover(event) {
        // Handle hover event
    }

    onMouseDown(event) {
        // Handle mouse down event
    }

    onMouseUp(event) {
        // Handle mouse up event
    }

    onKeyPressed(event) {
        // Handle key pressed event
    }

    onKeyReleased(event) {
        // Handle key released event
    }

    onResizing() {
        // Handle resizing event (called during resize)
    }

    onResize() {
        // Handle resize event (called after resize completes)
    }
}

// Статические свойства для управления формами
Form._globalZIndex = 0;
Form._allForms = []; // Массив всех созданных форм
Form.topOffset = 0; // Отступ сверху (например, для меню)
Form.bottomOffset = 0; // Отступ снизу (например, для панели задач)

// Активируем самую верхнюю форму после загрузки страницы
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        // Даем время для создания всех форм
        setTimeout(() => {
            if (Form._allForms.length > 0) {
                // Находим форму с максимальным z
                let topForm = null;
                let maxZ = -1;
                Form._allForms.forEach(form => {
                    if (form.z > maxZ) {
                        maxZ = form.z;
                        topForm = form;
                    }
                });

                // Активируем верхнюю форму
                if (topForm) {
                    topForm.activate();
                }
            }
        }, 100);
    });
}

class Button extends UIObject {

    constructor(parentElement = null) {
        super();
        this.caption = '';
        this.x = 0;
        this.y = 0;
        this.z = 0;
        if (parentElement) {
            this.parentElement = parentElement;
        } else {
            this.parentElement = null;
        }
    }

    setCaption(caption) {
        this.caption = caption;
        if (this.element) {
            this.element.textContent = caption;
        }
    }

    getCaption() {
        return this.caption;
    }

    Draw(container) {
        if (!this.element) {
            this.element = document.createElement('button');
            this.element.textContent = this.caption;

            // Если parentElement не задан, используем абсолютное позиционирование
            if (!this.parentElement) {
                this.element.style.position = 'absolute';
                this.element.style.left = this.x + 'px';
                this.element.style.top = this.y + 'px';
                this.element.style.width = this.width + 'px';
                this.element.style.height = this.height + 'px';
                this.element.style.zIndex = this.z;
            }

            // Ретро-стиль кнопки (цвета из client_config)
            const btnBase = UIObject.getClientConfigValue('defaultColor', '#c0c0c0');
            const btnLight = UIObject.brightenColor(btnBase, 60);
            const btnDark = UIObject.brightenColor(btnBase, -60);
            this.element.style.backgroundColor = btnBase;
            this.element.style.borderTop = `2px solid ${btnLight}`;
            this.element.style.borderLeft = `2px solid ${btnLight}`;
            this.element.style.borderRight = `2px solid ${btnDark}`;
            this.element.style.borderBottom = `2px solid ${btnDark}`;
            this.element.style.fontFamily = 'MS Sans Serif, sans-serif';
            this.element.style.fontSize = '11px';
            this.element.style.cursor = 'default';
            this.element.style.outline = 'none';
            this.element.style.boxSizing = 'border-box';

            // Догружаем конфиг и при необходимости актуализируем цвета
            UIObject.loadClientConfig().then(() => {
                const base = UIObject.getClientConfigValue('defaultColor', btnBase);
                const light = UIObject.brightenColor(base, 60);
                const dark = UIObject.brightenColor(base, -60);
                this.element.style.backgroundColor = base;
                this.element.style.borderTop = `2px solid ${light}`;
                this.element.style.borderLeft = `2px solid ${light}`;
                this.element.style.borderRight = `2px solid ${dark}`;
                this.element.style.borderBottom = `2px solid ${dark}`;
            });

            // Эффект нажатия
            this.element.addEventListener('mousedown', (e) => {
                this.element.style.borderTop = '2px solid #808080';
                this.element.style.borderLeft = '2px solid #808080';
                this.element.style.borderRight = '2px solid #ffffff';
                this.element.style.borderBottom = '2px solid #ffffff';
                this.onMouseDown(e);

                // Обработчик отпускания кнопки мыши где угодно
                const mouseUpHandler = (e) => {
                    this.element.style.borderTop = '2px solid #ffffff';
                    this.element.style.borderLeft = '2px solid #ffffff';
                    this.element.style.borderRight = '2px solid #808080';
                    this.element.style.borderBottom = '2px solid #808080';
                    this.onMouseUp(e);
                    document.removeEventListener('mouseup', mouseUpHandler);
                };
                document.addEventListener('mouseup', mouseUpHandler);
            });

            this.element.addEventListener('click', (e) => {
                this.onClick(e);
            });

            this.element.addEventListener('dblclick', (e) => {
                this.onDoubleClick(e);
            });

            this.element.addEventListener('mouseover', (e) => {
                this.onHover(e);
            });
        }

        if (container) {
            container.appendChild(this.element);
        }

        return this.element;
    }
}

class TextBox extends UIObject {

    constructor(parentElement = null) {
        super();
        this.text = '';
        this.placeholder = '';
        this.readOnly = false;
        this.maxLength = null;
        this.parentElement = parentElement;
    }

    setText(text) {
        this.text = text;
        if (this.element) {
            this.element.value = text;
        }
    }

    getText() {
        return this.element ? this.element.value : this.text;
    }

    setPlaceholder(placeholder) {
        this.placeholder = placeholder;
        if (this.element) {
            this.element.placeholder = placeholder;
        }
    }

    getPlaceholder() {
        return this.placeholder;
    }

    setReadOnly(readOnly) {
        this.readOnly = readOnly;
        if (this.element) {
            this.element.readOnly = readOnly;
        }
    }

    getReadOnly() {
        return this.readOnly;
    }

    setMaxLength(maxLength) {
        this.maxLength = maxLength;
        if (this.element && maxLength) {
            this.element.maxLength = maxLength;
        }
    }

    getMaxLength() {
        return this.maxLength;
    }

    Draw(container) {
        if (!this.element) {
            this.element = document.createElement('input');
            this.element.type = 'text';
            this.element.value = this.text;
            this.element.placeholder = this.placeholder;
            this.element.readOnly = this.readOnly;

            // Добавляем уникальный id для устранения предупреждения браузера
            this.element.id = 'textbox_' + Math.random().toString(36).substr(2, 9);
            this.element.name = this.element.id;

            if (this.maxLength) {
                this.element.maxLength = this.maxLength;
            }

            // Позиционирование
            if (!this.parentElement) {
                this.element.style.position = 'absolute';
                this.element.style.left = this.x + 'px';
                this.element.style.top = this.y + 'px';
                this.element.style.zIndex = this.z;
            }

            this.element.style.width = this.width + 'px';
            this.element.style.height = this.height + 'px';

            // Ретро-стиль текстового поля: белый фон, границы по теме из client_config
            const tbBase = UIObject.getClientConfigValue('defaultColor', '#c0c0c0');
            const tbLight = UIObject.brightenColor(tbBase, 60);
            const tbDark = UIObject.brightenColor(tbBase, -60);
            this.element.style.backgroundColor = '#ffffff';
            this.element.style.borderTop = `2px solid ${tbDark}`;
            this.element.style.borderLeft = `2px solid ${tbDark}`;
            this.element.style.borderRight = `2px solid ${tbLight}`;
            this.element.style.borderBottom = `2px solid ${tbLight}`;
            this.element.style.fontFamily = 'MS Sans Serif, sans-serif';
            this.element.style.fontSize = '11px';
            this.element.style.padding = '2px 4px';
            this.element.style.outline = 'none';
            this.element.style.boxSizing = 'border-box';

            // Догружаем конфиг и обновляем при необходимости
            UIObject.loadClientConfig().then(() => {
                const base = UIObject.getClientConfigValue('defaultColor', tbBase);
                const light = UIObject.brightenColor(base, 60);
                const dark = UIObject.brightenColor(base, -60);
                this.element.style.backgroundColor = '#ffffff';
                this.element.style.borderTop = `2px solid ${dark}`;
                this.element.style.borderLeft = `2px solid ${dark}`;
                this.element.style.borderRight = `2px solid ${light}`;
                this.element.style.borderBottom = `2px solid ${light}`;
            });

            // События
            this.element.addEventListener('input', (e) => {
                this.text = e.target.value;
            });

            this.element.addEventListener('click', (e) => {
                this.onClick(e);
            });

            this.element.addEventListener('dblclick', (e) => {
                this.onDoubleClick(e);
            });

            this.element.addEventListener('keydown', (e) => {
                this.onKeyPressed(e);
            });

            this.element.addEventListener('focus', (e) => {
                this.element.style.borderTop = '2px solid #000080';
                this.element.style.borderLeft = '2px solid #000080';
            });

            this.element.addEventListener('blur', (e) => {
                this.element.style.borderTop = '2px solid #808080';
                this.element.style.borderLeft = '2px solid #808080';
            });
        }

        if (container) {
            container.appendChild(this.element);
        }

        return this.element;
    }
}

class Label extends UIObject {
    constructor(parentElement = null) {
        super();
        this.text = '';
        this.parentElement = parentElement;
        this.fontSize = '11px';
        this.fontFamily = 'MS Sans Serif, sans-serif';
        this.color = '#000000';
        this.align = 'left';
    }

    setText(text) {
        this.text = text;
        if (this.element) {
            this.element.textContent = text;
        }
    }

    getText() {
        return this.text;
    }

    setFontSize(size) {
        this.fontSize = size;
        if (this.element) {
            this.element.style.fontSize = size;
        }
    }

    setFontWeight(weight) {
        this.fontWeight = weight;
        if (this.element) {
            this.element.style.fontWeight = weight;
        }
    }

    setFontFamily(family) {
        this.fontFamily = family;
        if (this.element) {
            this.element.style.fontFamily = family;
        }
    }

    setColor(color) {
        this.color = color;
        if (this.element) {
            this.element.style.color = color;
        }
    }

    setAlign(align) {
        this.align = align;
        if (this.element) {
            this.element.style.textAlign = align;
        }
    }

    Draw(container) {
        if (!this.element) {
            this.element = document.createElement('span');
            this.element.textContent = this.text;
            this.element.style.fontSize = this.fontSize;
            this.element.style.fontFamily = this.fontFamily;
            this.element.style.color = this.color;
            this.element.style.textAlign = this.align;
            this.element.style.display = 'inline-block';
            this.element.style.boxSizing = 'border-box';

            if (!this.parentElement) {
                this.element.style.position = 'absolute';
                this.element.style.left = this.x + 'px';
                this.element.style.top = this.y + 'px';
                this.element.style.width = this.width ? this.width + 'px' : 'auto';
                this.element.style.height = this.height ? this.height + 'px' : 'auto';
                this.element.style.zIndex = this.z;
            }
        }

        if (container) {
            container.appendChild(this.element);
        }

        return this.element;
    }
}