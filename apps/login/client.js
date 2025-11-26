//Используем классы из файла UI_classes.js
//Для ввода текста используется TextBox
const loginForm = new Form()
loginForm.setTitle('Login');
loginForm.setWidth(300);
loginForm.setHeight(350);
loginForm.setX(100);
loginForm.setY(100);
loginForm.setAnchorToWindow('center');
//loginForm.setModal(true);

loginForm.lblUsername = null;
loginForm.txtUsername = null;
loginForm.lblPassword = null;
loginForm.txtPassword = null;
loginForm.btnLogin = null;
loginForm.btnCreate = null;
loginForm.btnGuest = null;
loginForm.contentArea = null;

loginForm.onDraw = function (parent) {
    Form.prototype.onDraw.call(this, parent);

    this.contentArea = this.getContentArea();
    if (!this.contentArea) return;

    // Username
    this.lblUsername = new Label(this.contentArea);
    this.lblUsername.setText('Username:');
    this.lblUsername.onDraw(this.contentArea);

    this.txtUsername = new TextBox(this.contentArea);
    this.txtUsername.onDraw(this.contentArea);

    // Password
    this.lblPassword = new Label(this.contentArea);
    this.lblPassword.setText('Password:');
    this.lblPassword.onDraw(this.contentArea);

    this.txtPassword = new TextBox(this.contentArea);
    this.txtPassword.onDraw(this.contentArea);
    this.txtPassword.element.type = 'password';

    // Buttons
    this.btnLogin = new Button(this.contentArea);
    this.btnLogin.setCaption('Login');
    this.btnLogin.onDraw(this.contentArea);
    this.btnLogin.onClick = function () {
        const username = loginForm.txtUsername.getText();
        const password = loginForm.txtPassword.getText();
        alert('Username: ' + username + '\nPassword: ' + password);
    };

    this.btnCreate = new Button(this.contentArea);
    this.btnCreate.setCaption('Create Login');
    this.btnCreate.onDraw(this.contentArea);
    this.btnCreate.onClick = function () {
        callServerMethod('login', 'testConnection', {})
            .then(result => {
                loginForm.txtUsername.setText(result);
            })
            .catch(err => {
                loginForm.txtUsername.setText('Ошибка: ' + err.message);
            });
    };

    this.btnGuest = new Button(this.contentArea);
    this.btnGuest.setCaption('Login as Guest');
    this.btnGuest.onDraw(this.contentArea);

    setTimeout(() => {
        this.reDraw();
    }, 50);
}

loginForm.reDraw = function () {
    if (!this.contentArea) return;

    const width = this.contentArea.clientWidth;
    const height = this.contentArea.clientHeight;

    // Количество элементов: 2 label + 2 textbox + 3 button + 6 gap + 2 padding
    const numLabels = 2;
    const numTextboxes = 2;
    const numButtons = 3;
    const numGaps = 6;
    const numPaddings = 2;

    // Пропорционально высоте контейнера
    const minPadding = 16;
    const minGap = 8;
    const minLabelHeight = 16;
    const minElementHeight = 26;
    const minFontSize = 13;

    // Сумма минимальных высот
    const minTotal = minPadding * 2 + minGap * numGaps + minLabelHeight * numLabels + minElementHeight * (numTextboxes + numButtons);
    const scale = Math.max(height / minTotal, 1);

    const padding = Math.round(minPadding * scale);
    const gap = Math.round(minGap * scale);
    const labelHeight = Math.round(minLabelHeight * scale);
    const elementHeight = Math.round(minElementHeight * scale);
    const fontSize = Math.round(minFontSize * scale);

    let currentTop = padding;
    const inputWidth = width - (padding * 2);

    // Username
    UIObject.styleElement(this.lblUsername, padding, currentTop, inputWidth, labelHeight, fontSize, 1, false);
    currentTop += labelHeight + gap;
    UIObject.styleElement(this.txtUsername, padding, currentTop, inputWidth, elementHeight, fontSize, 1, false);
    currentTop += elementHeight + gap;

    // Password
    UIObject.styleElement(this.lblPassword, padding, currentTop, inputWidth, labelHeight, fontSize, 1, false);
    currentTop += labelHeight + gap;
    UIObject.styleElement(this.txtPassword, padding, currentTop, inputWidth, elementHeight, fontSize, 1, false);
    currentTop += elementHeight + gap;

    // Buttons - Vertical Column, Equal Sizes
    // Login Button
    UIObject.styleElement(this.btnLogin, padding, currentTop, inputWidth, elementHeight, fontSize, 1, false);
    this.btnLogin.element.style.fontWeight = 'bold';
    currentTop += elementHeight + gap;

    // Create Login Button
    UIObject.styleElement(this.btnCreate, padding, currentTop, inputWidth, elementHeight, fontSize, 1, false);
    currentTop += elementHeight + gap;

    // Guest Button
    UIObject.styleElement(this.btnGuest, padding, currentTop, inputWidth, elementHeight, fontSize, 1, false);
}

loginForm.onResizing = function () {
    this.reDraw();
}

loginForm.onDraw(document.body);
