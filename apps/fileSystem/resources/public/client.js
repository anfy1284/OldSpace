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

    // Create main container
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.height = '100%';
    container.style.width = '100%';

    // Left panel - tree view
    const treePanel = document.createElement('div');
    treePanel.style.width = '30%';
    treePanel.style.borderRight = '2px inset #c0c0c0';
    treePanel.style.padding = '5px';
    treePanel.style.overflowY = 'auto';

    // Right panel - file list
    const filePanel = document.createElement('div');
    filePanel.style.width = '70%';
    filePanel.style.padding = '5px';
    filePanel.style.display = 'flex';
    filePanel.style.flexDirection = 'column';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.style.display = 'flex';
    toolbar.style.gap = '5px';
    toolbar.style.marginBottom = '5px';

    const newFolderBtn = document.createElement('button');
    newFolderBtn.textContent = 'New Folder';
    newFolderBtn.style.padding = '2px 10px';

    const uploadBtn = document.createElement('button');
    uploadBtn.textContent = 'Upload';
    uploadBtn.style.padding = '2px 10px';

    toolbar.appendChild(newFolderBtn);
    toolbar.appendChild(uploadBtn);

    // File list
    const fileList = document.createElement('div');
    fileList.style.flex = '1';
    fileList.style.border = '2px inset #c0c0c0';
    fileList.style.padding = '5px';
    fileList.style.overflowY = 'auto';

    // Drag and drop zone
    const dropZone = document.createElement('div');
    dropZone.style.border = '2px dashed #808080';
    dropZone.style.padding = '20px';
    dropZone.style.textAlign = 'center';
    dropZone.style.marginTop = '10px';
    dropZone.style.backgroundColor = '#f0f0f0';
    dropZone.textContent = 'Drop files here to upload';

    filePanel.appendChild(toolbar);
    filePanel.appendChild(fileList);
    filePanel.appendChild(dropZone);

    container.appendChild(treePanel);
    container.appendChild(filePanel);

    form.Draw(document.body);
    const contentArea = form.getContentArea();
    contentArea.appendChild(container);

    // Load tree
    loadTree();

    // Load files
    loadFiles();

    // Event listeners
    newFolderBtn.onclick = () => createFolder();
    uploadBtn.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.onchange = (e) => uploadFiles(e.target.files);
        input.click();
    };

    // Drag and drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.backgroundColor = '#e0e0e0';
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.style.backgroundColor = '#f0f0f0';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.backgroundColor = '#f0f0f0';
        uploadFiles(e.dataTransfer.files);
    });

    async function loadTree() {
        // TODO: Load folder tree
        treePanel.innerHTML = '<div>Root</div>';
    }

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
            item.style.cursor = 'pointer';

            const icon = document.createElement('span');
            icon.textContent = file.isFolder ? '📁' : '📄';
            icon.style.marginRight = '5px';

            const name = document.createElement('span');
            name.textContent = file.name;

            item.appendChild(icon);
            item.appendChild(name);

            if (file.isFolder) {
                item.onclick = () => {
                    currentDirId = file.id;
                    loadFiles();
                };
            }

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
}