{
    // Copy of callServerMethod for standalone loading
    function callServerMethod(app, method, params = {}) {
        return fetch('/app/call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ app, method, params })
        })
            .then(r => r.json())
            .then(data => {
                if ('error' in data) throw new Error(data.error);
                return data.result;
            });
    }

    const form = new Form();
    form.setTitle('File System Explorer');
    form.setX(100);
    form.setY(100);
    form.setWidth(1000);
    form.setHeight(700);
    form.setAnchorToWindow('center');

    // Current directory
    let currentDirId = null;
    let selectedFileId = null;

    // Create main container
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.height = '100%';
    container.style.width = '100%';
    container.style.boxSizing = 'border-box';



    // Right panel - file list
    const filePanel = document.createElement('div');
    filePanel.style.flex = '1'; // Fill the container width
    filePanel.style.width = '100%'; // Ensure full width
    filePanel.style.height = '100%';

    filePanel.style.padding = '0'; // Remove general padding
    filePanel.style.paddingLeft = '5px'; // Add side/bottom padding for the list content area effectively
    filePanel.style.paddingRight = '5px';
    filePanel.style.paddingBottom = '5px';
    // Toolbar is at the top, we want 0 top padding for it.
    filePanel.style.boxSizing = 'border-box';
    filePanel.style.display = 'flex';
    filePanel.style.flexDirection = 'column';
    filePanel.style.overflow = 'hidden'; // Prevent outer scroll 
    filePanel.style.backgroundColor = '#d4d0c8'; // Win98 background gray

    // Address Bar Row
    const addressRow = document.createElement('div');
    addressRow.style.display = 'flex';
    addressRow.style.alignItems = 'center';
    addressRow.style.padding = '2px 5px';
    addressRow.style.marginBottom = '2px';



    // Using UI_classes TextBox
    const addressInput = new TextBox();
    addressInput.setText('\\');
    // Manually adjust width to fill flexibility
    addressInput.Draw(addressRow);
    addressInput.element.style.position = 'relative';
    addressInput.element.style.flex = '1';
    addressInput.element.style.height = '20px';
    addressInput.element.style.top = '0';
    addressInput.element.style.left = '0';


    addressRow.appendChild(addressInput.element);

    filePanel.appendChild(addressRow);

    // Toolbar
    const toolbar = new Toolbar(filePanel);

    // New Folder
    const btnNewFolder = new ToolbarButton();
    btnNewFolder.setText('New Folder');
    btnNewFolder.setIcon('📁');
    btnNewFolder.setTooltip('Create new folder');
    btnNewFolder.onClick = () => createFolder();
    toolbar.addItem(btnNewFolder);

    // Separator
    toolbar.addItem(new ToolbarSeparator());

    // Upload
    const btnUpload = new ToolbarButton();
    btnUpload.setText('Upload');
    btnUpload.setIcon('⬆️');
    btnUpload.setTooltip('Upload files');
    btnUpload.onClick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.onchange = (e) => uploadFiles(e.target.files);
        input.click();
    };
    toolbar.addItem(btnUpload);

    // Download
    const btnDownload = new ToolbarButton();
    btnDownload.setText('Download');
    btnDownload.setIcon('⬇️');
    btnDownload.setTooltip('Download selected file');
    btnDownload.onClick = () => downloadSelected();
    toolbar.addItem(btnDownload);

    // File list
    const fileList = document.createElement('div');
    fileList.style.flex = '1';
    fileList.style.border = '2px inset #ffffff'; // Win98 inset style often uses light/dark combination, standard inset is fine
    fileList.style.backgroundColor = '#ffffff'; // White background required
    fileList.style.padding = '5px';
    fileList.style.boxSizing = 'border-box';
    fileList.style.overflowY = 'auto';
    // Grid layout for multi-column files
    // Grid layout for multi-column files (Column-Major)
    fileList.style.display = 'grid';
    // Fill vertical space first 
    fileList.style.gridAutoFlow = 'column';
    // Rows fixed height, fill available height
    fileList.style.gridTemplateRows = 'repeat(auto-fill, 24px)';
    // Columns dynamic width
    fileList.style.gridAutoColumns = 'minmax(200px, 1fr)';
    fileList.style.gap = '0 5px'; // Gap between columns primarily

    // prevent default browser behavior for drag and drop globally
    window.addEventListener('dragover', function (e) {
        e.preventDefault();
    }, false);
    window.addEventListener('drop', function (e) {
        e.preventDefault();
    }, false);

    toolbar.Draw(filePanel); // Render toolbar

    filePanel.appendChild(fileList);


    container.appendChild(filePanel);

    form.Draw(document.body);
    const contentArea = form.getContentArea();
    contentArea.appendChild(container);



    // Load files
    loadFiles();

    // Event listeners


    // Drag and drop for file panel
    filePanel.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Stop bubbling so window listener doesn't interfere if needed, though preventDefault is key
        // Optional: Add visual feedback for drop zone if needed, but user requested "not visually distinct" usually means mostly invisible
        // or just subtle. The requirement was "not be allocated separately". 
    });

    filePanel.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            uploadFiles(e.dataTransfer.files);
        }
    });



    async function loadFiles() {
        try {
            const files = await callServerMethod('fileSystem', 'getFiles', { parentId: currentDirId || null });
            renderFiles(files);
        } catch (err) {
            console.error('Error loading files:', err);
        }
    }

    function renderFiles(files) {
        fileList.innerHTML = '';
        files.forEach(file => {
            const item = document.createElement('div');
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.padding = '2px';
            item.style.cursor = 'default';
            item.style.userSelect = 'none';
            item.style.boxSizing = 'border-box'; // Ensure resizing works well
            item.style.height = '24px'; // Fixed height for list items in grid
            item.style.overflow = 'hidden'; // Prevent text spill

            // Selection style
            if (file.id === selectedFileId) {
                item.style.backgroundColor = '#000080';
                item.style.color = '#ffffff';
            } else {
                item.style.backgroundColor = 'transparent';
                item.style.color = '#000000';
            }

            const icon = document.createElement('span');
            icon.textContent = file.isFolder ? '📁' : '📄';
            icon.style.marginRight = '5px';
            icon.style.display = 'flex';
            icon.style.alignItems = 'center';
            icon.style.justifyContent = 'center';
            icon.style.lineHeight = '1';

            const name = document.createElement('span');
            name.textContent = file.name;
            name.style.lineHeight = '1'; // Ensure text doesn't push bounds
            name.style.whiteSpace = 'nowrap';
            name.style.overflow = 'hidden';
            name.style.textOverflow = 'ellipsis'; // Truncate long names

            item.appendChild(icon);
            item.appendChild(name);

            // Click -> Select
            item.onclick = (e) => {
                e.stopPropagation();
                selectedFileId = file.id;
                renderFiles(files); // Re-render to show selection
            };

            // DblClick -> Open if folder
            item.ondblclick = (e) => {
                e.stopPropagation();
                if (file.isFolder) {
                    currentDirId = file.id;
                    selectedFileId = null;
                    loadFiles();
                }
            };

            fileList.appendChild(item);
        });
    }

    async function createFolder() {
        const name = prompt('Enter folder name:');
        if (!name) return;

        try {
            await callServerMethod('fileSystem', 'createFolder', { name, parentId: currentDirId });
            loadFiles();
        } catch (err) {
            console.error('Error creating folder:', err);
        }
    }

    async function uploadFiles(fileList) {
        for (const file of fileList) {
            const formData = new FormData();
            formData.append('app', 'fileSystem');
            formData.append('method', 'uploadFile');
            formData.append('file', file);
            formData.append('parentId', currentDirId || '');

            try {
                const response = await fetch('/app/upload', {
                    method: 'POST',
                    body: formData
                });
                const result = await response.json();
                console.log('Uploaded:', result);
            } catch (err) {
                console.error('Error uploading file:', err);
            }
        }
        loadFiles();
    }
    function base64ToBlob(base64, mime) {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mime });
    }

    async function downloadSelected() {
        if (!selectedFileId) return alert('Select a file to download');
        try {
            const res = await callServerMethod('fileSystem', 'downloadFile', { fileId: selectedFileId });
            if (res.error) return alert(res.error);

            const blob = base64ToBlob(res.file.data, 'application/octet-stream');
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = res.file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error(e);
            alert('Download failed');
        }
    }
}