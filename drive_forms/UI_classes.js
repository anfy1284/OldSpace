
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
    setX(x) { this.x = x; }
    getX() { return this.x; }
    setY(y) { this.y = y; }
    getY() { return this.y; }
    setWidth(width) { this.width = width; }
    getWidth() { return this.width; }
    setHeight(height) { this.height = height; }
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
        UIObject._clientConfigPromise = fetch('/app/client_config.json')
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

    onDraw(container) {
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
    }
    
    setTitle(title) {
        this.title = title;
        if (this.titleBar) {
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
            this.setY((window.innerHeight - this.height) / 2);
        } else if (this.anchorToWindow === 'bottom-right') {
            this.setX(window.innerWidth - this.width - 40);
            this.setY(window.innerHeight - this.height - 60);
        }
        
        if (this.element) {
            this.element.style.left = this.x + 'px';
            this.element.style.top = this.y + 'px';
        }
    }
    
    onDraw(container) {
        if (!this.element) {
            this.element = document.createElement('div');
            this.element.style.position = 'absolute';
            this.element.style.left = this.x + 'px';
            this.element.style.top = this.y + 'px';
            this.element.style.width = this.width + 'px';
            this.element.style.height = this.height + 'px';
            this.element.style.zIndex = this.z;
            
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
            
            // Создаём заголовок с синей полосой
            this.titleBar = document.createElement('div');
            this.titleBar.style.backgroundColor = '#000080';
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
            const titleText = document.createElement('span');
            titleText.textContent = this.title;
            this.titleBar.appendChild(titleText);
            
            // Контейнер для кнопок
            const buttonsContainer = document.createElement('div');
            buttonsContainer.style.display = 'flex';
            buttonsContainer.style.gap = '2px';

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
                    this.contentArea.style.height = 'calc(100% - ' + this.titleBar.offsetHeight + 'px)';
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
                        this.setY(e.clientY - this.dragOffsetY);
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
                    
                    const nearRight = mouseX >= rect.right - resizeBorderSize && mouseX <= rect.right;
                    const nearBottom = mouseY >= rect.bottom - resizeBorderSize && mouseY <= rect.bottom;
                    
                    if (nearRight && nearBottom) {
                        this.element.style.cursor = 'nwse-resize';
                    } else if (nearRight) {
                        this.element.style.cursor = 'ew-resize';
                    } else if (nearBottom) {
                        this.element.style.cursor = 'ns-resize';
                    } else {
                        this.element.style.cursor = 'default';
                    }
                });
                
                this.element.addEventListener('mousedown', (e) => {
                    const rect = this.element.getBoundingClientRect();
                    const mouseX = e.clientX;
                    const mouseY = e.clientY;
                    
                    const nearRight = mouseX >= rect.right - resizeBorderSize && mouseX <= rect.right;
                    const nearBottom = mouseY >= rect.bottom - resizeBorderSize && mouseY <= rect.bottom;
                    
                    if (nearRight || nearBottom) {
                        this.isResizing = true;
                        this.resizeDirection = {
                            right: nearRight,
                            bottom: nearBottom
                        };
                        e.preventDefault();
                    }
                });
                
                document.addEventListener('mousemove', (e) => {
                    if (this.isResizing) {
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
                                    return;
                                }
                            }
                            
                            if (newWidth > 100) {
                                this.setWidth(newWidth);
                                this.element.style.width = this.width + 'px';
                            }
                        }
                        if (this.resizeDirection.bottom) {
                            const newHeight = e.clientY - this.y;
                            if (newHeight > 50) {
                                this.setHeight(newHeight);
                                this.element.style.height = this.height + 'px';
                            }
                        }
                    }
                });
                
                document.addEventListener('mouseup', () => {
                    this.isResizing = false;
                    this.resizeDirection = null;
                });
            }
        }
        
        if (container) {
            container.appendChild(this.element);
        }
                
        return this.element;
    }
    
    onClick(event) {
        // Handle click event
        console.log('Click event:', event);
    }

    onDoubleClick(event) {
        // Handle double click event
        console.log('Double click event:', event);
    }

    onLeftClick(event) {
        // Handle left click event
        if (event.button === 0) {
            console.log('Left click event:', event);
        }
    }

    onHover(event) {
        // Handle hover event
        console.log('Hover event:', event);
    }

    onMouseDown(event) {
        // Handle mouse down event
        console.log('Mouse down event:', event);
    }

    onMouseUp(event) {
        // Handle mouse up event
        console.log('Mouse up event:', event);
    }

    onKeyPressed(event) {
        // Handle key pressed event
        console.log('Key pressed:', event.key);
    }
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

    onDraw(container) {
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
    
    onDraw(container) {
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
