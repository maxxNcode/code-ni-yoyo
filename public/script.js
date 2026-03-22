// State
        let currentProjectId = null;
        let currentFileId = null;
        let isEditing = false;
        let isAdmin = localStorage.getItem('adminToken') !== null;
        let isSidebarVisible = true;
        let folderState = {}; // Tracks open/closed status by path: {'src': true, 'src/components': false}

        // Sidebar Resize State
        let isResizing = false;
        let sidebarStartX = 0;
        let sidebarStartWidth = 0;

        // Elements
        let quillDocsEditor = null;
        const elMobileOverlay = document.getElementById('mobile-overlay');
        const elBtnToggleFiles = document.getElementById('btn-toggle-files');
        const elFilesList = document.getElementById('files-list');
        const elFilesColumn = document.getElementById('files-column');
        const elEditorArea = document.getElementById('editor-area');
        const elEmptyState = document.getElementById('empty-state');
        const elCurrentProjectTitle = document.getElementById('current-project-title');
        const elCurrentFileName = document.getElementById('current-file-name');
        const elCodeViewer = document.getElementById('code-viewer');
        const elCodeEditor = document.getElementById('code-editor');
        let monacoEditor = null;
        const elViewMode = document.getElementById('view-mode');
        const elEditMode = document.getElementById('edit-mode');
        const elBtnEditToggle = document.getElementById('btn-edit-toggle');
        const elBtnSave = document.getElementById('btn-save');
        const elLoginModal = document.getElementById('login-modal');
        const elBtnShowLogin = document.getElementById('btn-show-login');
        const elBtnLogout = document.getElementById('btn-logout');
        const btnDeleteProj = document.getElementById('btn-delete-project');

        // File Icons Helper
        function getFileIcon(filename) {
            const ext = filename.split('.').pop().toLowerCase();
            switch (ext) {
                case 'js': case 'jsx': case 'ts': return '<svg class="w-4 h-4 text-yellow-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>';
                case 'html': return '<svg class="w-4 h-4 text-orange-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 22h20L12 2zm0 3.8L18.4 19H5.6L12 5.8z"/></svg>';
                case 'css': return '<svg class="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor"><path d="M2.5 4h19l-1.6 15L12 21.5 4.1 19 2.5 4zm3.3 3.5l.5 6h7.7l-.3 3.2-2.7.7-2.7-.7-.2-2h-2.5l.4 4 4.8 1.5 5-1.5.8-8.7H5.8z"/></svg>';
                case 'json': return '<svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M4 7v10c0 2 1.5 3 3 3h10c2.5 0 3-1.5 3-3V7c0-2.5-.5-3-3-3H7c-1.5 0-3 1-3 3z"/></svg>';
                case 'md': return '<svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"></path></svg>';
                case 'pdf': return '<svg class="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>';
                case 'docx': return '<svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>';
                default: return '<svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>';
            }
        }

        // Initialize
        async function init() {
            updateAuthUI();
            await loadProjects();

            // Initialize Monaco Editor
            require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' }});
            require(['vs/editor/editor.main'], function() {
                monacoEditor = monaco.editor.create(elCodeEditor, {
                    value: '',
                    language: 'javascript',
                    theme: 'vs-dark',
                    automaticLayout: true,
                    wordWrap: 'off',
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: '"Fira Code", monospace'
                });
            });

            // Initialize Quill
            quillDocsEditor = new Quill('#document-editor', {
                theme: 'snow',
                modules: {
                    toolbar: [
                        [{ 'font': [] }, { 'size': [] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'color': [] }, { 'background': [] }],
                        [{ 'header': '1' }, { 'header': '2' }, 'blockquote'],
                        [{ 'list': 'ordered' }, { 'list': 'bullet' }, { 'indent': '-1' }, { 'indent': '+1' }],
                        [{ 'align': [] }],
                        ['link', 'image'],
                        ['clean']
                    ]
                }
            });

            // Initialize sidebar resize handler
            initializeSidebarResize();
        }

        // Sidebar Resize Handler
        function initializeSidebarResize() {
            const resizeHandle = document.getElementById('sidebar-resize-handle');
            const filesColumn = document.getElementById('files-column');

            if (!resizeHandle || !filesColumn) return;

            // Load saved width from localStorage
            const savedWidth = localStorage.getItem('sidebar-width');
            if (savedWidth) {
                document.documentElement.style.setProperty('--sidebar-width', savedWidth + 'px');
            }

            resizeHandle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isResizing = true;
                sidebarStartX = e.clientX;
                sidebarStartWidth = filesColumn.offsetWidth;

                resizeHandle.classList.add('resizing');
                document.body.style.userSelect = 'none';
                document.body.style.cursor = 'col-resize';

                const onMouseMove = (moveEvent) => {
                    if (!isResizing) return;

                    const delta = moveEvent.clientX - sidebarStartX;
                    let newWidth = sidebarStartWidth + delta;

                    // Enforce min/max constraints
                    newWidth = Math.max(200, Math.min(600, newWidth));

                    document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
                };

                const onMouseUp = () => {
                    if (!isResizing) return;
                    isResizing = false;

                    // Save width to localStorage
                    const finalWidth = filesColumn.offsetWidth;
                    localStorage.setItem('sidebar-width', finalWidth);

                    resizeHandle.classList.remove('resizing');
                    document.body.style.userSelect = '';
                    document.body.style.cursor = '';

                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        }

        // --- Layout Logic ---
        let isFilesVisible = false;

        function toggleFiles() {
            isFilesVisible = !isFilesVisible;

            if (isFilesVisible) {
                document.body.classList.add('sidebar-open');
                if (window.innerWidth >= 768) {
                    elFilesColumn.style.display = 'flex';
                } else {
                    elMobileOverlay.classList.remove('hidden');
                    setTimeout(() => elMobileOverlay.classList.remove('opacity-0'), 10);
                }
                elBtnToggleFiles.classList.add('text-emerald-400', 'bg-slate-800/50');
            } else {
                document.body.classList.remove('sidebar-open');
                if (window.innerWidth >= 768) {
                    elFilesColumn.style.display = 'none';
                }
                elBtnToggleFiles.classList.remove('text-emerald-400', 'bg-slate-800/50');
                elMobileOverlay.classList.add('opacity-0');
                setTimeout(() => elMobileOverlay.classList.add('hidden'), 300);
            }
        }

        function showDashboard() {
            document.getElementById('editor-view').classList.add('hidden');
            document.getElementById('dashboard-view').classList.remove('hidden');
            if (isFilesVisible) toggleFiles();
            currentProjectId = null;
            document.getElementById('input-search-projects').value = '';
            renderProjects(allProjects);
        }

        window.addEventListener('resize', () => {
            if (window.innerWidth >= 768 && isFilesVisible) {
                elFilesColumn.style.display = 'flex';
            } else if (window.innerWidth >= 768 && !isFilesVisible) {
                elFilesColumn.style.display = 'none';
            }
        });

        // --- Auth Logic ---
        function updateAuthUI() {
            const adminElements = document.querySelectorAll('.admin-only');
            if (isAdmin) {
                adminElements.forEach(el => el.classList.remove('hidden'));
                elBtnShowLogin.classList.add('hidden');
                elBtnLogout.classList.remove('hidden');
            } else {
                adminElements.forEach(el => el.classList.add('hidden'));

                // Hide specific flex forms safely
                document.getElementById('btn-dashboard-new-project').classList.add('hidden');
                document.getElementById('container-new-file').classList.add('hidden');

                elBtnShowLogin.classList.remove('hidden');
                elBtnLogout.classList.add('hidden');
                if (isEditing) toggleEditMode();
            }
        }

        elBtnShowLogin.addEventListener('click', () => {
            elLoginModal.classList.remove('hidden');
            setTimeout(() => document.getElementById('input-password').focus(), 100);
        });

        elBtnLogout.addEventListener('click', () => {
            localStorage.removeItem('adminToken');
            isAdmin = false;
            updateAuthUI();
            showToast("Logged out successfully");

            if (currentProjectId) selectProject(currentProjectId, elCurrentProjectTitle.innerText);
        });

        document.getElementById('form-login').addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = document.getElementById('input-password').value;
            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });
                if (!res.ok) throw new Error("Invalid password");
                const data = await res.json();
                localStorage.setItem('adminToken', data.token);
                isAdmin = true;
                elLoginModal.classList.add('hidden');
                document.getElementById('input-password').value = '';
                updateAuthUI();
                showToast("Logged in as Admin", "success");

                if (currentProjectId) selectProject(currentProjectId, elCurrentProjectTitle.innerText);
                if (currentFileId) selectFile(currentFileId, elCurrentFileName.innerText);

            } catch (e) {
                showToast(e.message, "error");
            }
        });

        function showToast(message, type = "success") {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');

            const isError = type === "error";
            const bgClass = isError ? "bg-red-50" : "bg-emerald-50";
            const borderClass = isError ? "border-red-500/30" : "border-emerald-500/30";
            const textClass = isError ? "text-red-600" : "text-emerald-700";
            const icon = isError
                ? `<svg class="w-5 h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
                : `<svg class="w-5 h-5 text-emerald-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;

            toast.className = `flex items-center p-4 px-5 rounded-lg border shadow-xl ${bgClass} ${borderClass} font-medium animate-slide-up pointer-events-auto transition-all duration-300`;
            toast.innerHTML = `${icon} <span class="${textClass} text-sm">${message}</span>`;

            container.appendChild(toast);

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(10px) scale(0.95)';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        async function copyCode() {
            const textToCopy = elCodeViewer.textContent;
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(textToCopy);
                } else {
                    const textArea = document.createElement("textarea");
                    textArea.value = textToCopy;
                    textArea.style.position = "fixed";
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    const successful = document.execCommand('copy');
                    document.body.removeChild(textArea);
                    if (!successful) throw new Error("Copy command failed");
                }
                showToast("Code copied to clipboard!");
            } catch (err) {
                showToast("Failed to copy code.", "error");
            }
        }

        // --- API Helpers ---
        async function api(endpoint, method = 'GET', data = null) {
            const options = { method, headers: {} };
            const token = localStorage.getItem('adminToken');
            if (token) {
                options.headers['Authorization'] = `Bearer ${token}`;
            }
            if (data) {
                options.headers['Content-Type'] = 'application/json';
                options.body = JSON.stringify(data);
            }
            const response = await fetch('/api' + endpoint, options);
            if (!response.ok) {
                const err = await response.json();
                if (response.status === 401 && isAdmin) {
                    localStorage.removeItem('adminToken');
                    isAdmin = false;
                    updateAuthUI();
                    showToast("Session expired. Please log in again.", "error");
                } else if (response.status !== 401) {
                    showToast('Error: ' + err.error, "error");
                }
                throw new Error(err.error);
            }
            return response.json();
        }

        // --- Project Logic ---
        let allProjects = [];
        let fileCache = {};

        async function loadProjects() {
            try {
                allProjects = await api('/projects');
                renderProjects(allProjects);
            } catch (e) {
                // handle silently or redirect
            }
        }

        function renderProjects(projectsArray) {
            const grid = document.getElementById('dashboard-projects-grid');
            grid.innerHTML = '';

            if (projectsArray.length === 0) {
                grid.innerHTML = `<div class="col-span-full text-center py-20 text-slate-500">No projects found. Create one to get started!</div>`;
                return;
            }

            projectsArray.forEach(p => {
                const card = document.createElement('div');
                card.className = "group relative bg-slate-800/20 hover:bg-slate-800/40 border border-slate-700/50 hover:border-emerald-500/50 rounded-2xl p-6 transition-all duration-300 cursor-pointer animate-slide-up shadow-lg hover:shadow-emerald-500/10 flex flex-col justify-between h-40";
                card.onclick = () => selectProject(p.id, p.name);

                card.innerHTML = `
                    <div class="flex items-start justify-between">
                        <div class="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                        </div>
                    </div>
                    <div class="mt-4">
                        <h3 class="font-bold text-slate-200 text-lg truncate group-hover:text-emerald-300 transition-colors">${escapeHTML(p.name)}</h3>
                    </div>
                `;
                grid.appendChild(card);
            });
        }

        document.getElementById('input-search-projects').addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = allProjects.filter(p => p.name.toLowerCase().includes(term));
            renderProjects(filtered);
        });

        async function promptCreateProject() {
            const name = prompt("Enter a name for the new project:");
            if (!name || name.trim() === '') return;

            const passcode = prompt("Security Check: Please set a secret deletion passcode to protect this project:");
            if (!passcode || passcode.trim() === '') {
                showToast("Project creation cancelled. A passcode is required.", "error");
                return;
            }

            try {
                const newProject = await api('/projects', 'POST', {
                    name: name.trim(),
                    passcode: passcode.trim()
                });
                await loadProjects();
                selectProject(newProject.id, newProject.name);
                showToast("Project created successfully", "success");
            } catch (e) { }
        }

        async function selectProject(id, name) {
            document.getElementById('dashboard-view').classList.add('hidden');
            document.getElementById('editor-view').classList.remove('hidden');

            currentProjectId = id;
            currentFileId = null;
            fileCache = {}; // Clear file cache when switching projects
            elCurrentProjectTitle.innerHTML = `<svg class="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path></svg> ${escapeHTML(name)}`;
            elBtnToggleFiles.classList.remove('hidden');

            // Start files open automatically
            if (!isFilesVisible) toggleFiles();

            const containerNewFolder = document.getElementById('btn-new-folder').parentElement;
            if (isAdmin) {
                btnDeleteProj.parentElement.classList.remove('hidden');
            } else {
                btnDeleteProj.parentElement.classList.add('hidden');
            }

            await loadProjects();
            await loadFiles();
        }

        async function deleteCurrentProject() {
            if (!currentProjectId) return;
            if (!confirm("Are you sure you want to delete this project and ALL its files? This action cannot be undone.")) return;

            async function attemptDelete(passcode = null) {
                try {
                    const data = passcode ? { passcode } : {};
                    await api(`/projects/${currentProjectId}`, 'DELETE', data);
                    currentProjectId = null;
                    showDashboard();
                    showToast("Project deleted");
                    await loadProjects();
                } catch (e) {
                    if (e.message && e.message.includes("Passcode required")) {
                        const enteredPasscode = prompt("Please enter the project passcode to delete it:");
                        if (enteredPasscode !== null) {
                            attemptDelete(enteredPasscode);
                        }
                    }
                }
            }

            attemptDelete();
        }

        // --- File Logic ---
        async function loadFiles() {
            if (!currentProjectId) return;
            const [files, folders] = await Promise.all([
                api(`/projects/${currentProjectId}/files`),
                api(`/projects/${currentProjectId}/folders`)
            ]);
            elFilesList.innerHTML = '';

            if (files.length === 0 && folders.length === 0) {
                elFilesList.innerHTML = `
                <div class="text-[13px] text-slate-500 text-center mt-6 p-4 border border-slate-800/60 rounded-lg border-dashed">
                    No files yet.<br><span class="text-slate-600 mt-1 block">Create one to get started.</span>
                </div>`;
                return;
            }

            // Collect all paths from files and folders
            const allPaths = new Set();

            // Add file directory paths
            files.forEach(f => {
                const parts = f.filename.split('/');
                let path = '';
                for (let i = 0; i < parts.length - 1; i++) {
                    path += (i === 0 ? '' : '/') + parts[i];
                    allPaths.add(path);
                }
            });

            // Add empty folder paths
            folders.forEach(folder => {
                allPaths.add(folder.path);
            });

            Object.keys(folderState).forEach(k => { if (!allPaths.has(k)) delete folderState[k]; });

            // Group files by directory based on slashes in filename
            const tree = { name: 'root', path: '', files: [], dirs: {} };

            // First, add empty folders to the tree
            folders.forEach(folder => {
                const parts = folder.path.split('/');
                let currentLevel = tree;
                let currentPath = '';

                for (let i = 0; i < parts.length; i++) {
                    const dirName = parts[i];
                    currentPath += (i === 0 ? '' : '/') + dirName;

                    if (!currentLevel.dirs[dirName]) {
                        currentLevel.dirs[dirName] = { name: dirName, path: currentPath, files: [], dirs: {} };
                        if (folderState[currentPath] === undefined) folderState[currentPath] = true;
                    }
                    currentLevel = currentLevel.dirs[dirName];
                }
                // Mark this folder as an empty folder
                currentLevel.isEmptyFolder = true;
                currentLevel.folderId = folder.id;
            });

            // Then add files to the tree
            files.forEach(f => {
                const parts = f.filename.split('/');
                let currentLevel = tree;
                let currentPath = '';

                for (let i = 0; i < parts.length - 1; i++) {
                    const dirName = parts[i];
                    currentPath += (i === 0 ? '' : '/') + dirName;

                    if (!currentLevel.dirs[dirName]) {
                        currentLevel.dirs[dirName] = { name: dirName, path: currentPath, files: [], dirs: {} };
                        if (folderState[currentPath] === undefined) folderState[currentPath] = true;
                    }
                    currentLevel = currentLevel.dirs[dirName];
                }
                currentLevel.files.push(f);
            });

            function renderTree(node, depth = 0, isParentOpen = true) {
                const paddingLeft = depth * 14;

                // Render directories
                Object.keys(node.dirs).sort().forEach(dirName => {
                    const childNode = node.dirs[dirName];
                    const isOpen = folderState[childNode.path];

                    const dirDiv = document.createElement('div');
                    // Hide if parent is closed
                    dirDiv.className = `w-full text-left px-3 py-1.5 rounded-lg text-[13px] font-semibold flex items-center justify-between group transition-colors ${!isParentOpen ? 'hidden' : 'text-slate-400 hover:bg-slate-800/40 cursor-pointer border border-transparent hover:border-slate-700/30'}`;
                    dirDiv.style.paddingLeft = `${paddingLeft + 12}px`;

                    // Folder Icon + Chevron
                    const chevron = isOpen
                        ? `<svg class="w-3.5 h-3.5 mr-1 text-slate-500 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>`
                        : `<svg class="w-3.5 h-3.5 mr-1 text-slate-500 transition-transform -rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>`;

                    // Contextual New File and Delete Folder buttons (admins only)
                    const actionBtns = isAdmin ? `
                        <div class="flex items-center gap-1">
                            <button class="opacity-0 group-hover:opacity-100 hover:text-emerald-400 p-1 rounded-md transition-all z-10" onclick="event.stopPropagation(); promptNewFile('${childNode.path}')" title="New file here">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                            </button>
                            ${childNode.isEmptyFolder ? `
                            <button class="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1 rounded-md transition-all z-10" onclick="event.stopPropagation(); deleteFolder(${childNode.folderId})" title="Delete folder">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                            ` : ''}
                        </div>
                    ` : '';

                    dirDiv.innerHTML = `
                        <div class="flex items-center truncate">
                            ${chevron}
                            <svg class="w-4 h-4 text-emerald-500/70 mr-2" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path></svg>
                            <span class="truncate transition-colors group-hover:text-slate-200">${escapeHTML(dirName)}</span>
                        </div>
                        ${actionBtns}
                    `;

                    dirDiv.onclick = () => {
                        folderState[childNode.path] = !folderState[childNode.path];
                        loadFiles(); // Re-render tree
                    };

                    elFilesList.appendChild(dirDiv);

                    // Recursively render children, passing down visibility state
                    renderTree(childNode, depth + 1, isParentOpen && isOpen);
                });

                // Render files
                node.files.sort((a, b) => a.filename.localeCompare(b.filename)).forEach(f => {
                    const btn = document.createElement('button');
                    const isActive = currentFileId === f.id;
                    const fileNameOnly = f.filename.split('/').pop();

                    btn.className = `w-full text-left px-3 py-2 rounded-lg text-[13px] mb-[1px] font-mono transition-all flex items-center gap-2.5 border border-transparent ${!isParentOpen ? 'hidden' : isActive
                        ? 'bg-slate-800/80 text-emerald-300 border-slate-700/50 shadow-sm'
                        : 'text-slate-300 hover:bg-slate-800/40 hover:text-slate-200'
                        }`;
                    btn.style.paddingLeft = `${paddingLeft + 24}px`;

                    btn.innerHTML = `${getFileIcon(fileNameOnly)} <span class="truncate">${escapeHTML(fileNameOnly)}</span>`;
                    btn.onclick = () => selectFile(f.id, f.filename);
                    elFilesList.appendChild(btn);
                });
            }

            renderTree(tree);
        }

        document.getElementById('form-new-file').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentProjectId) return;
            const input = document.getElementById('input-file-name');
            try {
                const newFile = await api(`/projects/${currentProjectId}/files`, 'POST', {
                    filename: input.value,
                    content: '// Empty file...'
                });
                input.value = '';
                await loadFiles();
                selectFile(newFile.id, newFile.filename);
                showToast("File created");
            } catch (e) { }
        });

        async function selectFile(id, filename) {
            currentFileId = id;
            elEmptyState.classList.add('hidden');
            elEditorArea.classList.remove('hidden');
            document.getElementById('file-indicator').classList.remove('hidden');
            document.getElementById('file-actions').classList.remove('hidden');
            elCurrentFileName.innerText = filename;

            // On mobile, hide the sidebars when a file is selected
            if (window.innerWidth < 768) {
                if (isFilesVisible) toggleFiles();
            }

            const btnDeleteFile = document.getElementById('btn-delete-file');
            if (isAdmin) {
                btnDeleteFile.classList.remove('hidden');
                elBtnEditToggle.classList.remove('hidden');
            } else {
                btnDeleteFile.classList.add('hidden');
                elBtnEditToggle.classList.add('hidden');
            }

            // Visually highlight active file without fetching entire tree
            highlightSidebarFile(id);

            try {
                let content = '';
                let fileType = 'code';

                // Fetch from cache if available, else API
                if (fileCache[id] !== undefined) {
                    content = fileCache[id].content;
                    fileType = fileCache[id].fileType;
                } else {
                    const fileData = await api(`/files/${id}`);
                    content = fileData.content || '';
                    fileType = fileData.file_type || 'code';
                    fileCache[id] = { content, fileType }; // Store in cache
                }

                currentFileType = fileType;

                // Hide both code and document editors initially
                elViewMode.classList.add('hidden');
                elEditMode.classList.add('hidden');
                document.getElementById('document-mode').classList.add('hidden');
                const pMode = document.getElementById('pdf-mode');
                if (pMode) pMode.classList.add('hidden');

                if (fileType === 'pdf') {
                    if (pMode) pMode.classList.remove('hidden');
                    document.getElementById('pdf-viewer').src = `data:application/pdf;base64,${content}`;
                    elBtnEditToggle.classList.add('hidden'); // PDF is view only
                } else if (fileType === 'document') {
                    // Display document editor
                    const docViewer = document.getElementById('document-viewer');

                    quillDocsEditor.clipboard.dangerouslyPasteHTML(content);
                    docViewer.innerHTML = content;

                    elBtnEditToggle.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg> Edit`;
                    elBtnEditToggle.classList.remove('hidden');

                    document.getElementById('document-mode').classList.remove('hidden');
                    if (isEditing) toggleEditMode();
                } else {
                    // Display code editor
                    const ext = filename.split('.').pop();
                    
                    if (monacoEditor) {
                        monacoEditor.setValue(content);
                        let lang = 'javascript';
                        switch(ext) {
                            case 'html': lang = 'html'; break;
                            case 'css': lang = 'css'; break;
                            case 'json': lang = 'json'; break;
                            case 'md': lang = 'markdown'; break;
                            case 'py': lang = 'python'; break;
                            case 'ts': lang = 'typescript'; break;
                        }
                        monaco.editor.setModelLanguage(monacoEditor.getModel(), lang);
                    } else {
                        // Backup if monaco hasn't loaded yet
                        setTimeout(() => selectFile(id, filename), 200);
                        return;
                    }

                    // Set language class correctly for Highlight.js refresh
                    elCodeViewer.className = `h-full block p-6 text-[13px] leading-relaxed font-mono selection:bg-emerald-500/30 language-${ext}`;
                    elCodeViewer.textContent = content;
                    hljs.highlightElement(elCodeViewer);

                    // Load and render highlights
                    await loadHighlights();
                    updateHighlightButtonVisibility();

                    elViewMode.classList.remove('hidden');
                }

                // Default to view mode
                if (isEditing) toggleEditMode();
            } catch (e) { }
        }

        function highlightSidebarFile(activeId) {
            const buttons = elFilesList.querySelectorAll('button');
            buttons.forEach(btn => {
                // reset styling
                btn.classList.remove('bg-slate-800/80', 'text-emerald-300', 'border-slate-700/50', 'shadow-sm');
                btn.classList.add('text-slate-300', 'hover:bg-slate-800/40', 'hover:text-slate-200');
            });

            // Re-apply active state logic when the user clicks a file button again
            const activeBtn = Array.from(buttons).find(b => b.onclick && b.onclick.toString().includes(`selectFile(${activeId}`));
            if (activeBtn) {
                activeBtn.classList.add('bg-slate-800/80', 'text-emerald-300', 'border-slate-700/50', 'shadow-sm');
                activeBtn.classList.remove('text-slate-300', 'hover:bg-slate-800/40', 'hover:text-slate-200');
            }
        }

        async function saveFile() {
            if (!currentFileId) return;

            const originalText = elBtnSave.innerHTML;
            elBtnSave.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Saving`;

            try {
                let newContent;

                if (currentFileType === 'document') {
                    newContent = quillDocsEditor.root.innerHTML;
                } else {
                    newContent = monacoEditor ? monacoEditor.getValue() : elCodeViewer.textContent;
                }

                await api(`/files/${currentFileId}`, 'PUT', { content: newContent });

                if (currentFileType === 'code') {
                    fileCache[currentFileId] = { content: newContent, fileType: currentFileType }; // Update cache
                    elCodeViewer.textContent = newContent;
                    hljs.highlightElement(elCodeViewer);
                } else {
                    document.getElementById('document-viewer').innerHTML = newContent;
                }

                showToast("File saved successfully!");
                toggleEditMode();
            } catch (e) {
                showToast("Failed to save: " + e.message, 'error');
            } finally {
                elBtnSave.innerHTML = originalText;
            }
        }

        async function deleteCurrentFile() {
            if (!currentFileId) return;
            if (!confirm(`Are you sure you want to delete "${elCurrentFileName.innerText}"?`)) return;
            try {
                await api(`/files/${currentFileId}`, 'DELETE');
                currentFileId = null;
                elEditorArea.classList.add('hidden');
                document.getElementById('file-indicator').classList.add('hidden');
                document.getElementById('file-actions').classList.add('hidden');
                elEmptyState.classList.remove('hidden');
                showToast("File deleted");
                await loadFiles();
            } catch (e) { }
        }

        // --- Contextual File/Folder Creation ---
        async function promptNewFolder() {
            const folderName = prompt("Enter new folder name (e.g. 'src' or 'images'):");
            if (!folderName || folderName.trim() === '') return;

            try {
                await api(`/projects/${currentProjectId}/folders`, 'POST', {
                    path: folderName.trim()
                });
                await loadFiles();
                showToast("Folder created", "success");
            } catch (e) {
                showToast("Failed to create folder", "error");
            }
        }

        async function deleteFolder(folderId) {
            if (!confirm("Are you sure you want to delete this empty folder?")) return;

            try {
                await api(`/folders/${folderId}`, 'DELETE');
                await loadFiles();
                showToast("Folder deleted", "success");
            } catch (e) {
                showToast("Failed to delete folder", "error");
            }
        }

        function promptNewFile(dirPath) {
            const input = document.getElementById('input-file-name');
            input.value = dirPath + '/';
            input.focus();

            // Highlight the text cursor at the end
            setTimeout(() => {
                input.selectionStart = input.selectionEnd = input.value.length;
            }, 50);
        }

        // --- UI Interactions ---
        function toggleEditMode() {
            isEditing = !isEditing;

            // Handle document editing separately
            if (currentFileType === 'document') {
                toggleDocumentEditMode();
                if (isEditing) {
                    elBtnEditToggle.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg> Cancel`;
                    elBtnEditToggle.classList.replace('bg-indigo-500/10', 'bg-slate-700');
                    elBtnEditToggle.classList.replace('text-indigo-400', 'text-slate-300');
                    elBtnSave.classList.remove('hidden');
                    document.getElementById('btn-back-dashboard').classList.add('hidden');
                    document.getElementById('btn-toggle-files').classList.add('hidden');
                } else {
                    elBtnEditToggle.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg> Edit`;
                    elBtnEditToggle.classList.replace('bg-slate-700', 'bg-indigo-500/10');
                    elBtnEditToggle.classList.replace('text-slate-300', 'text-indigo-400');
                    elBtnSave.classList.add('hidden');
                    document.getElementById('btn-back-dashboard').classList.remove('hidden');
                    document.getElementById('btn-toggle-files').classList.remove('hidden');
                }
                return;
            }

            // Handle code editing
            if (isEditing) {
                elViewMode.classList.add('hidden');
                elEditMode.classList.remove('hidden');
                elBtnEditToggle.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg> Cancel`;
                elBtnEditToggle.classList.replace('bg-indigo-500/10', 'bg-slate-700');
                elBtnEditToggle.classList.replace('text-indigo-400', 'text-slate-300');
                elBtnSave.classList.remove('hidden');
                document.getElementById('btn-back-dashboard').classList.add('hidden');
                document.getElementById('btn-toggle-files').classList.add('hidden');
                updateHighlightButtonVisibility();
                if (monacoEditor) monacoEditor.focus();
            } else {
                elEditMode.classList.add('hidden');
                elViewMode.classList.remove('hidden');
                elBtnEditToggle.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg> Edit`;
                elBtnEditToggle.classList.replace('bg-slate-700', 'bg-indigo-500/10');
                elBtnEditToggle.classList.replace('text-slate-300', 'text-indigo-400');
                elBtnSave.classList.add('hidden');
                document.getElementById('btn-back-dashboard').classList.remove('hidden');
                document.getElementById('btn-toggle-files').classList.remove('hidden');
                updateHighlightButtonVisibility();

                // Revert to viewer content if cancelled
                if (monacoEditor) monacoEditor.setValue(elCodeViewer.textContent);
            }
        }

        // Utils
        function escapeHTML(str) {
            return str.replace(/[&<>'"]/g,
                tag => ({
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    "'": '&#39;',
                    '"': '&quot;'
                }[tag])
            );
        }

        // --- DOCUMENT EDITOR FUNCTIONS ---
        let currentFileType = 'code';

        async function uploadDocumentFile() {
            if (!currentProjectId || !isAdmin) {
                showToast('Unable to upload file', 'error');
                return;
            }

            const fileInput = document.getElementById('file-upload-input');
            const file = fileInput.files[0];

            if (!file) return;

            const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
            if (!validTypes.includes(file.type)) {
                showToast('Only PDF and DOCX files are allowed', 'error');
                return;
            }

            const formData = new FormData();
            formData.append('file', file);

            try {
                const response = await fetch(`/api/projects/${currentProjectId}/files/upload`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                    },
                    body: formData
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Upload failed');
                }

                const newFile = await response.json();
                fileCache[newFile.id] = { content: newFile.content, fileType: newFile.file_type };

                // Clear input
                fileInput.value = '';

                // Reload files and select the new one
                await loadFiles();
                showToast('Document uploaded successfully!', 'success');
            } catch (error) {
                showToast('Failed to upload: ' + error.message, 'error');
            }
        }

        function formatDocumentFontSize() {
            const select = document.getElementById('doc-font-size');
            const value = select.value;
            if (value) {
                document.execCommand('fontSize', false, value);
                select.value = '';
            }
        }

        function toggleDocumentEditMode() {
            const docContainer = document.getElementById('document-editor-container');
            const docViewer = document.getElementById('document-viewer');

            if (isEditing) {
                // Switch to edit mode
                docContainer.classList.remove('hidden');
                docContainer.classList.add('flex');
                docViewer.classList.add('hidden');
                quillDocsEditor.focus();
            } else {
                // Switch to view mode
                docContainer.classList.add('hidden');
                docContainer.classList.remove('flex');
                docViewer.classList.remove('hidden');
                docViewer.innerHTML = quillDocsEditor.root.innerHTML;
            }
        }

        async function saveDocumentFile() {
            if (!currentFileId || !isAdmin) return;

            const content = quillDocsEditor.root.innerHTML;

            try {
                await api(`/files/${currentFileId}`, 'PUT', { content });
                showToast('Document saved successfully', 'success');
            } catch (error) {
                showToast('Failed to save document: ' + error.message, 'error');
            }
        }

        // --- HIGHLIGHTING FUNCTIONS ---
        let currentHighlights = [];

        async function loadHighlights() {
            if (!currentFileId) return;
            try {
                currentHighlights = await api(`/files/${currentFileId}/highlights`);
                renderHighlights();
            } catch (e) {
                console.error('Failed to load highlights:', e);
            }
        }

        function renderHighlights() {
            // Clear previous highlighted elements
            const existingHighlights = document.querySelectorAll('.highlight-mark');
            existingHighlights.forEach(el => {
                const parent = el.parentNode;
                while (el.firstChild) {
                    parent.insertBefore(el.firstChild, el);
                }
                parent.removeChild(el);
            });

            if (!currentHighlights || currentHighlights.length === 0) return;

            // Get the total text content
            const textContent = elCodeViewer.textContent;

            // Create a new container to rebuild with highlights
            const container = document.createElement('span');
            let lastIndex = 0;

            // Sort highlights by start position
            const sortedHighlights = [...currentHighlights].sort((a, b) => a.start_pos - b.start_pos);

            sortedHighlights.forEach(highlight => {
                const { start_pos, end_pos } = highlight;

                // Add text before highlight
                if (start_pos > lastIndex) {
                    container.appendChild(document.createTextNode(textContent.substring(lastIndex, start_pos)));
                }

                // Add highlighted text
                const highlightSpan = document.createElement('span');
                highlightSpan.className = 'highlight-mark';
                highlightSpan.textContent = textContent.substring(start_pos, end_pos);
                highlightSpan.dataset.highlightId = highlight.id;
                highlightSpan.onclick = (e) => {
                    e.stopPropagation();
                    showHighlightMenu(highlight.id, e);
                };
                container.appendChild(highlightSpan);

                lastIndex = end_pos;
            });

            // Add remaining text
            if (lastIndex < textContent.length) {
                container.appendChild(document.createTextNode(textContent.substring(lastIndex)));
            }

            // Replace content while preserving Highlight.js styling
            elCodeViewer.innerHTML = '';
            elCodeViewer.appendChild(container);
        }

        function getSelectionPositions() {
            const selection = window.getSelection();
            if (!selection.rangeCount || selection.toString() === '') {
                return null;
            }

            const range = selection.getRangeAt(0);
            const preContent = elCodeViewer.textContent;

            // Calculate positions relative to code viewer content
            const treWalker = document.createTreeWalker(
                elCodeViewer,
                NodeFilter.SHOW_TEXT,
                null
            );

            let charCount = 0;
            let startPos = -1;
            let endPos = -1;
            let node;

            while (node = treWalker.nextNode()) {
                const nextChar = charCount + node.length;

                if (startPos === -1 && range.startContainer === node) {
                    startPos = charCount + range.startOffset;
                }

                if (range.endContainer === node) {
                    endPos = charCount + range.endOffset;
                    break;
                }

                charCount = nextChar;
            }

            if (startPos === -1 || endPos === -1) {
                return null;
            }

            return { start: startPos, end: endPos, text: selection.toString() };
        }

        async function highlightSelectedText() {
            if (isAdmin === false) {
                showToast('Only admins can highlight text', 'error');
                return;
            }

            const positions = getSelectionPositions();
            if (!positions) {
                showToast('Please select text to highlight', 'warning');
                return;
            }

            try {
                const highlight = await api(`/files/${currentFileId}/highlights`, 'POST', {
                    start_pos: positions.start,
                    end_pos: positions.end,
                    text: positions.text
                });

                currentHighlights.push(highlight);
                renderHighlights();
                window.getSelection().removeAllRanges();
                showToast('Text highlighted successfully', 'success');
            } catch (error) {
                showToast('Failed to highlight text: ' + error.message, 'error');
            }
        }

        async function clearHighlight() {
            if (isAdmin === false) {
                showToast('Only admins can delete highlights', 'error');
                return;
            }

            const selection = window.getSelection();
            if (!selection.rangeCount || selection.toString() === '') {
                showToast('Please select a highlighted text to clear', 'warning');
                return;
            }

            const positions = getSelectionPositions();
            if (!positions) return;

            // Find overlapping highlights
            const toDelete = currentHighlights.filter(h =>
                h.start_pos <= positions.end && h.end_pos >= positions.start
            );

            if (toDelete.length === 0) {
                showToast('No highlights found in selection', 'warning');
                return;
            }

            for (const highlight of toDelete) {
                try {
                    await api(`/highlights/${highlight.id}`, 'DELETE');
                    currentHighlights = currentHighlights.filter(h => h.id !== highlight.id);
                } catch (error) {
                    showToast('Failed to delete highlight: ' + error.message, 'error');
                }
            }

            renderHighlights();
            window.getSelection().removeAllRanges();
            showToast('Highlights cleared', 'success');
        }

        function showHighlightMenu(highlightId, event) {
            if (!isAdmin) return;

            if (confirm('Delete this highlight?')) {
                currentHighlights = currentHighlights.filter(h => h.id !== highlightId);
                api(`/highlights/${highlightId}`, 'DELETE').then(() => {
                    renderHighlights();
                    showToast('Highlight deleted', 'success');
                }).catch(err => {
                    showToast('Failed to delete highlight', 'error');
                });
            }
        }

        // Add support for showing/hiding highlight buttons in view mode
        function updateHighlightButtonVisibility() {
            const highlightBtn = document.getElementById('btn-highlight');
            const clearBtn = document.getElementById('btn-clear-highlight');

            if (!currentFileId || isEditing || !isAdmin) {
                highlightBtn?.classList.add('hidden');
                clearBtn?.classList.add('hidden');
            } else {
                highlightBtn?.classList.remove('hidden');
                clearBtn?.classList.remove('hidden');
            }
        }

        // Start App
        init();