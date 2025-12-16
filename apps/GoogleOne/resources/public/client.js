(function () {
    const API_BASE = '/api/apps/GoogleOne';
    
    const form = new Form();
    form.setTitle('Google Drive Integration');
    form.setWidth(500);
    form.setHeight(450);
    form.setAnchorToWindow('center');
    form.Draw(document.body);

    const content = form.getContentArea();
    content.style.overflow = 'hidden'; // We'll manage layout manually

    // Status Label
    const statusLabel = new Label(null);
    statusLabel.setText('Status: Loading...');
    statusLabel.setX(20);
    statusLabel.setY(410);
    statusLabel.setWidth(460);
    statusLabel.Draw(content);

    // Container for controls
    const controlsContainer = document.createElement('div');
    controlsContainer.style.position = 'absolute';
    controlsContainer.style.top = '10px';
    controlsContainer.style.left = '10px';
    controlsContainer.style.right = '10px';
    controlsContainer.style.bottom = '50px';
    content.appendChild(controlsContainer);

    // Controls
    let txtClientId, txtClientSecret, txtFolderName;
    let btnSave, btnConnect, btnDisconnect;
    let lblInstructions;

    function createControls() {
        // Instructions
        const redirectUri = window.location.protocol + '//' + window.location.host + API_BASE + '/auth/callback';
        
        lblInstructions = new Label(null);
        lblInstructions.setX(10);
        lblInstructions.setY(0);
        lblInstructions.setWidth(460);
        lblInstructions.Draw(controlsContainer);
        if (lblInstructions.element) {
            lblInstructions.element.style.whiteSpace = 'normal';
            lblInstructions.element.style.height = 'auto';
            lblInstructions.element.style.lineHeight = '1.4';
            lblInstructions.element.innerHTML = 
                '<b>Step-by-step Guide:</b><br>' +
                '1. Go to <a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console</a> and create a new project.<br>' +
                '2. Enable API: <a href="https://console.cloud.google.com/marketplace/product/google/drive.googleapis.com" target="_blank">Google Drive API Page</a> -> Click <b>Enable</b>.<br>' +
                '3. Go to <b>APIs & Services</b> -> <b>Credentials</b> -> <b>Create Credentials</b> -> <b>OAuth client ID</b>.<br>' +
                '4. Configure <b>OAuth Consent Screen</b> (User Type: External). <span style="color:red;font-weight:bold;">IMPORTANT:</span> Add your email to <b>Test users</b>!<br>' +
                '5. Select Application type: <b>Web application</b>.<br>' +
                '6. Add this <b>Authorized redirect URI</b>:<br>' +
                `<input type="text" value="${redirectUri}" readonly style="width:100%; border:1px solid #ccc; background:#f0f0f0; font-family:monospace; padding:2px; margin:2px 0;">` +
                '<div style="font-size:0.85em; color:#444; margin-bottom:4px;">(Note: Google allows <b>http://localhost</b> for development/testing)</div>' +
                '7. Copy <b>Client ID</b> and <b>Client Secret</b> below.';
        }

        const labelWidth = 130;
        const controlX = 150;
        const controlWidth = 300;
        let y = 200; // Increased top margin for longer instructions

        // Folder Name
        const lblFolder = new Label(null);
        lblFolder.setText('Folder Name:');
        lblFolder.setAlign('right');
        lblFolder.setWidth(labelWidth);
        lblFolder.setX(10);
        lblFolder.setY(y + 4);
        lblFolder.Draw(controlsContainer);

        txtFolderName = new TextBox(null);
        txtFolderName.setX(controlX);
        txtFolderName.setY(y);
        txtFolderName.setWidth(controlWidth);
        txtFolderName.setHeight(22);
        txtFolderName.Draw(controlsContainer);

        y += 30;

        // Client ID
        const lblId = new Label(null);
        lblId.setText('Client ID:');
        lblId.setAlign('right');
        lblId.setWidth(labelWidth);
        lblId.setX(10);
        lblId.setY(y + 4);
        lblId.Draw(controlsContainer);

        txtClientId = new TextBox(null);
        txtClientId.setX(controlX);
        txtClientId.setY(y);
        txtClientId.setWidth(controlWidth);
        txtClientId.setHeight(22);
        txtClientId.Draw(controlsContainer);

        y += 30;

        // Client Secret
        const lblSecret = new Label(null);
        lblSecret.setText('Client Secret:');
        lblSecret.setAlign('right');
        lblSecret.setWidth(labelWidth);
        lblSecret.setX(10);
        lblSecret.setY(y + 4);
        lblSecret.Draw(controlsContainer);

        txtClientSecret = new TextBox(null);
        txtClientSecret.setX(controlX);
        txtClientSecret.setY(y);
        txtClientSecret.setWidth(controlWidth);
        txtClientSecret.setHeight(22);
        txtClientSecret.Draw(controlsContainer);
        if (txtClientSecret.element) txtClientSecret.element.type = 'password';

        // Buttons
        const btnY = 360; // Relative to form content area, not container

        btnSave = new Button(null);
        btnSave.setCaption('Save Config');
        btnSave.setX(20);
        btnSave.setY(btnY);
        btnSave.setWidth(100);
        btnSave.setHeight(26);
        btnSave.Draw(content);
        btnSave.onClick = saveConfig;

        btnConnect = new Button(null);
        btnConnect.setCaption('Connect');
        btnConnect.setX(130);
        btnConnect.setY(btnY);
        btnConnect.setWidth(100);
        btnConnect.setHeight(26);
        btnConnect.Draw(content);
        btnConnect.onClick = connectGoogle;

        btnDisconnect = new Button(null);
        btnDisconnect.setCaption('Disconnect');
        btnDisconnect.setX(380);
        btnDisconnect.setY(btnY);
        btnDisconnect.setWidth(100);
        btnDisconnect.setHeight(26);
        btnDisconnect.Draw(content);
        btnDisconnect.onClick = disconnectGoogle;

        // Initial Layout Update
        updateLayout();
    }

    function updateLayout() {
        const w = form.getWidth();
        const h = form.getHeight();
        
        // Calculate content height (approximate if not rendered yet)
        let contentH = h - 28; // Title bar ~28px
        if (content && content.clientHeight > 0) {
            contentH = content.clientHeight;
        }

        // Buttons positioning (Fixed at bottom)
        const btnY = contentH - 36;

        if (btnSave) {
            btnSave.setX(20);
            btnSave.setY(btnY);
        }

        if (btnConnect) {
            btnConnect.setX(w - 120);
            btnConnect.setY(btnY);
        }

        if (btnDisconnect) {
            btnDisconnect.setX(w - 120);
            btnDisconnect.setY(btnY);
        }

        // Status Label
        if (statusLabel) {
            statusLabel.setY(btnY - 25);
            statusLabel.setWidth(w - 40);
        }

        // Resize Inputs
        // Container width is w - 20 (left:10, right:10)
        const containerW = w - 20;
        // Input starts at 150. We want 10px margin on right.
        const inputW = Math.max(50, containerW - 160); 

        if (txtFolderName) txtFolderName.setWidth(inputW);
        if (txtClientId) txtClientId.setWidth(inputW);
        if (txtClientSecret) txtClientSecret.setWidth(inputW);
        
        if (lblInstructions) lblInstructions.setWidth(containerW - 20);
    }

    // Hook resize events
    const originalOnResize = form.onResize ? form.onResize.bind(form) : null;
    form.onResize = () => {
        if (originalOnResize) originalOnResize();
        updateLayout();
    };
    form.onResizing = () => {
        updateLayout();
    };

    createControls();

    async function loadStatus() {
        try {
            const res = await fetch(API_BASE + '/get_status');
            const data = await res.json();

            if (data.connected) {
                statusLabel.setText('Status: Connected to Google Drive');
                if (statusLabel.element) statusLabel.element.style.color = 'green';
                
                // Hide inputs? Or make them readonly?
                // For now, let's keep them editable but show disconnect button
                btnDisconnect.setVisible(true);
                btnConnect.setVisible(false);
                btnSave.setVisible(true); // Allow changing folder name
            } else {
                statusLabel.setText('Status: Not Connected');
                if (statusLabel.element) statusLabel.element.style.color = 'red';

                btnDisconnect.setVisible(false);
                btnConnect.setVisible(data.hasClientId);
                btnSave.setVisible(true);
            }

            if (data.folderName) txtFolderName.setText(data.folderName);
            // We don't get client ID/Secret back for security/simplicity in this endpoint, 
            // but user might want to see them. 
            // If we want to show them, we need to update server to return them (masked).
            // For now, fields will be empty on load, which is safer.
            
        } catch (e) {
            statusLabel.setText('Error: ' + e.message);
        }
    }

    async function saveConfig() {
        const clientId = txtClientId.getText();
        const clientSecret = txtClientSecret.getText();
        const folderName = txtFolderName.getText();

        try {
            const res = await fetch(API_BASE + '/save_config', {
                method: 'POST',
                body: JSON.stringify({ clientId, clientSecret, folderName })
            });
            const data = await res.json();
            if (data.success) {
                alert('Configuration saved!');
                loadStatus();
            } else {
                alert('Error: ' + data.error);
            }
        } catch (e) {
            alert('Error saving config');
        }
    }

    async function connectGoogle() {
        try {
            const res = await fetch(API_BASE + '/auth_url');
            const data = await res.json();
            if (data.url) {
                // Redirect the whole page to auth URL
                window.location.href = data.url;
            } else {
                alert('Error getting auth URL: ' + data.error);
            }
        } catch (e) {
            alert('Error connecting');
        }
    }

    async function disconnectGoogle() {
        if (!confirm('Are you sure you want to disconnect?')) return;
        try {
            await fetch(API_BASE + '/disconnect');
            loadStatus();
        } catch (e) {
            alert('Error disconnecting');
        }
    }

    // Initial load
    loadStatus();

})();
