import * as vscode from 'vscode';

interface RouteInfo {
    line: number;
    path: string;
    method: string;
    fullPath: string;
}

export function activate(context: vscode.ExtensionContext) {
    let isEnabled = true;
    let decorationType: vscode.TextEditorDecorationType | undefined;

    // Create decoration type for route annotations
    function createDecorationType() {
        return vscode.window.createTextEditorDecorationType({
            after: {
                contentText: '',
                color: new vscode.ThemeColor('editorCodeLens.foreground'),
                fontStyle: 'italic',
                margin: '0 0 0 20px'
            }
        });
    }

    decorationType = createDecorationType();

    // Parse route groups and extract prefix for each line
    function parseRouteGroups(content: string): { [line: number]: string } {
        const linePrefixes: { [line: number]: string } = {};
        const lines = content.split('\n');
        const groupStack: string[] = ['']; // Initialize with an empty prefix for the base level
        const braceLevelStack: number[] = [0]; // Tracks the brace level at which each prefix was pushed

        let currentBraceDepth = 0; // Current nesting depth of braces

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Calculate brace changes for the current line
            const openBraces = (line.match(/\{/g) || []).length;
            const closeBraces = (line.match(/\}/g) || []).length;
            currentBraceDepth += openBraces - closeBraces;

            // --- Detect Group Start ---
            let prefixMatch: RegExpMatchArray | null = null;
            let isGroupStart = false;

            // Match various prefix definitions followed by a group
            // 1. Route::group(['prefix' => '...'], function() { ... })
            prefixMatch = trimmedLine.match(
                /Route::group\s*\(\s*\[\s*['"]prefix['"]\s*=>\s*['"]([^'"]+)['"]/
            );
            if (prefixMatch) isGroupStart = true;

            // 2. ->prefix('...')->group( or ->name('...')->group( etc.
            if (!prefixMatch) {
                prefixMatch = trimmedLine.match(/->prefix\s*\(\s*['"]([^'"]+)['"]\s*\)\s*->.*group\s*\(/);
                if (prefixMatch) isGroupStart = true;
            }

            // 3. Route::...()->prefix('...')->group(...)
            if (!prefixMatch) {
                prefixMatch = trimmedLine.match(/Route::\w+\s*\(.*?\)\s*->.*?prefix\s*\(\s*['"]([^'"]+)['"]\s*\).*?->group\s*\(/);
                if (prefixMatch) isGroupStart = true;
            }

            // 4. Route::controller(Controller::class)->prefix('...')->group(...) (More complex, but common)
            if (!prefixMatch) {
                prefixMatch = trimmedLine.match(/Route::controller\s*\(.*?::class\)\s*->prefix\s*\(\s*['"]([^'"]+)['"]\s*\).*?->group\s*\(/);
                if (prefixMatch) isGroupStart = true;
            }
            // 5. Route::prefix('...')->group(...) (A simpler direct prefix group)
            if (!prefixMatch) {
                prefixMatch = trimmedLine.match(/Route::prefix\s*\(\s*['"]([^'"]+)['"]\s*\)\s*->group\s*\(/);
                if (prefixMatch) isGroupStart = true;
            }

            if (isGroupStart && prefixMatch) {
                const prefix = prefixMatch[1];
                const currentPrefix = groupStack[groupStack.length - 1] || '';
                const newPrefix = currentPrefix ? `${currentPrefix}/${prefix}`.replace(/\/+/g, '/') : prefix;
                groupStack.push(newPrefix);
                // The brace depth *after* the opening brace for this group
                braceLevelStack.push(currentBraceDepth);
            }

            // --- Detect Group End ---
            while (braceLevelStack.length > 1 && currentBraceDepth < braceLevelStack[braceLevelStack.length - 1]) {
                groupStack.pop();
                braceLevelStack.pop();
            }

            // Assign the current effective prefix to the current line
            linePrefixes[i] = groupStack[groupStack.length - 1] || '';
        }

        return linePrefixes;
    }

    // Parse routes from content
    function parseRoutes(content: string): RouteInfo[] {
        const routes: RouteInfo[] = [];
        const lines = content.split('\n');
        const prefixesByLine = parseRouteGroups(content);

        let globalBasePrefix = ''; // Will be '/api' or ''
        let fileSpecificPrefix = ''; // Will be '/v1' for api_v1.php or '' for web.php etc.

        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const fileName = activeEditor.document.fileName;

            if (fileName.includes('routes/api.php')) {
                globalBasePrefix = 'api';
            } else if (fileName.includes('routes/api_v1.php')) {
                // This 'v1' comes from `Route::prefix('v1')->group(base_path('routes/api_v1.php'));`
                // in your api.php. In a real scenario, you'd parse api.php to confirm this.
                globalBasePrefix = 'api';
                fileSpecificPrefix = 'v1';
            } else if (fileName.includes('routes/web.php')) {
                globalBasePrefix = ''; // Web routes typically don't have a /api prefix
                fileSpecificPrefix = '';
            }
            // Add other base prefixes for other route files if applicable (e.g., console, channels)
        }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Match Laravel route definitions
            const routeMatch = trimmedLine.match(/Route::(get|post|put|delete|patch|options|any|apiResource)\s*\(\s*['"]([^'"]+)['"]/i);
            if (routeMatch) {
                const method = routeMatch[1].toUpperCase();
                const path = routeMatch[2];

                // Get the prefix determined by parseRouteGroups for this specific line
                const groupPrefix = prefixesByLine[i] || '';

                let calculatedFullPathSegments: string[] = [];

                if (globalBasePrefix) {
                    calculatedFullPathSegments.push(globalBasePrefix);
                }
                if (fileSpecificPrefix) {
                    calculatedFullPathSegments.push(fileSpecificPrefix);
                }
                if (groupPrefix) {
                    calculatedFullPathSegments.push(groupPrefix);
                }

                // Add the route's specific path
                calculatedFullPathSegments.push(path);

                // Join segments and clean up multiple slashes
                const fullPath = `/${calculatedFullPathSegments.join('/')}`.replace(/\/+/g, '/');

                // Handle apiResource routes which generate multiple methods
                if (method === 'APIRESOURCE') {
                    routes.push({
                        line: i,
                        path: path,
                        method: 'APIRESOURCE (Multiple)',
                        fullPath: fullPath // Shows the base resource path
                    });
                } else {
                    routes.push({
                        line: i,
                        path,
                        method,
                        fullPath
                    });
                }
            }
        }
        return routes;
    }

    // Update decorations for the active editor
    function updateDecorations(editor: vscode.TextEditor) {
        if (!decorationType || !isEnabled) {
            return;
        }

        const document = editor.document;
        const fileName = document.fileName;

        // Only process files within the 'routes/' directory and ending with '.php'
        if (!fileName.includes('routes/') || !fileName.endsWith('.php')) {
            // Clear decorations if it's not a relevant routes file
            editor.setDecorations(decorationType, []);
            return;
        }

        const content = document.getText();
        const routes = parseRoutes(content);
        const decorations: vscode.DecorationOptions[] = [];

        for (const route of routes) {
            const routeLine = document.lineAt(route.line);
            const lineEndPosition = routeLine.range.end;

            const decoration: vscode.DecorationOptions = {
                range: new vscode.Range(lineEndPosition, lineEndPosition),
                renderOptions: {
                    after: {
                        contentText: ` 🧩 ${route.fullPath}`,
                        color: new vscode.ThemeColor('editorCodeLens.foreground'),
                        fontStyle: 'italic',
                        margin: '0 0 0 20px'
                    }
                }
            };
            decorations.push(decoration);
        }

        editor.setDecorations(decorationType, decorations);
    }

    // Clear decorations
    function clearDecorations() {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && decorationType) {
            activeEditor.setDecorations(decorationType, []);
        }
    }

    // Toggle command
    const toggleCommand = vscode.commands.registerCommand('laravelRoutes.toggle', () => {
        isEnabled = !isEnabled;

        if (isEnabled) {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                updateDecorations(activeEditor);
            }
            vscode.window.showInformationMessage('Laravel Route annotations enabled');
        } else {
            clearDecorations();
            vscode.window.showInformationMessage('Laravel Route annotations disabled');
        }
    });

    // Listen for active editor changes
    const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && isEnabled) {
            updateDecorations(editor);
        } else if (!editor) {
            clearDecorations();
        }
    });

    // Listen for document changes
    const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(event => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && event.document === activeEditor.document && isEnabled) {
            setTimeout(() => {
                if (vscode.window.activeTextEditor?.document === event.document) {
                    updateDecorations(activeEditor);
                }
            }, 500);
        }
    });

    // Initial decoration for active editor when the extension activates
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && isEnabled) {
        updateDecorations(activeEditor);
    }

    // Register disposables to clean up resources when the extension is deactivated
    context.subscriptions.push(
        toggleCommand,
        onDidChangeActiveTextEditor,
        onDidChangeTextDocument,
        decorationType
    );
}

export function deactivate() {
    // No specific cleanup needed here as disposables handle subscriptions.
}
