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
        const groupStack: string[] = ['']; // Initialize with an empty prefix
        const braceBalanceStack: { line: number; balance: number }[] = []; // Track brace balance for each group

        // A simplified approach for brace counting to correctly determine group boundaries
        let currentBraceLevel = 0;
        const groupStartLineMap = new Map<number, string>(); // Maps opening brace line to prefix

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Check for Route::group start with prefix or chained prefix group
            let groupMatch: RegExpMatchArray | null = null;

            // 1. Match: Route::group(['prefix' => '...'], function() { ... })
            groupMatch = trimmedLine.match(
                /Route::group\s*\(\s*\[\s*['"]prefix['"]\s*=>\s*['"]([^'"]+)['"]/
            );

            // 2. Match: Any chain with ->prefix('...')->group(
            if (!groupMatch) {
                groupMatch = trimmedLine.match(/->prefix\s*\(\s*['"]([^'"]+)['"]\s*\)\s*->.*group\s*\(/);
            }

            // 3. Match: Route::...()->prefix('...')->group(...)
            if (!groupMatch) {
                groupMatch = trimmedLine.match(/Route::\w+\s*\(.*?\)\s*->.*?prefix\s*\(\s*['"]([^'"]+)['"]\s*\).*?->group\s*\(/);
            }

            // Calculate brace changes for the current line
            const openBraces = (line.match(/\{/g) || []).length;
            const closeBraces = (line.match(/\}/g) || []).length;
            currentBraceLevel += openBraces - closeBraces;

            if (groupMatch) {
                const prefix = groupMatch[1];
                const currentPrefix = groupStack[groupStack.length - 1] || '';
                const newPrefix = currentPrefix ? `${currentPrefix}/${prefix}`.replace(/\/+/g, '/') : prefix;
                groupStack.push(newPrefix);
                // Mark the start of this group's scope
                groupStartLineMap.set(i, newPrefix); // Store prefix for this line
                braceBalanceStack.push({ line: i, balance: currentBraceLevel });
            }

            // Determine if a group is ending
            // We need to check if a closing brace corresponds to an active group on the stack
            if (closeBraces > 0) {
                for (let k = 0; k < closeBraces; k++) {
                    // Find the most recent group that can be closed by this brace
                    if (braceBalanceStack.length > 0) {
                        const lastGroup = braceBalanceStack[braceBalanceStack.length - 1];
                        // If the current brace level matches the balance when the group started (minus the group's own open brace)
                        // This logic needs to be careful with nested anonymous functions without groups
                        // A more robust solution might involve AST parsing.
                        // For regex-based parsing, we assume that a closing brace at the same level as a group's opening brace closes that group.

                        // Simple check: if current brace balance is less than the last group's start balance, pop
                        // This is an imperfect heuristic for complex PHP structures, but works for common Laravel group syntax.
                        if (currentBraceLevel < lastGroup.balance) {
                            groupStack.pop();
                            braceBalanceStack.pop();
                        }
                    }
                }
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

        // This is a simplification. For a real multi-file scenario,
        // you'd need to parse the including file (e.g., api.php)
        // to determine the base prefix for api_v1.php.
        // For this example, we'll assume a 'v1' base prefix if it's api_v1.php.
        let basePrefix = '';
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document.fileName.includes('routes/api_v1.php')) {
            basePrefix = 'v1'; // This should come from parsing api.php
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

                let fullPath = '';
                if (basePrefix && groupPrefix) {
                    fullPath = `/${basePrefix}/${groupPrefix}/${path}`.replace(/\/+/g, '/');
                } else if (basePrefix) {
                    fullPath = `/${basePrefix}/${path}`.replace(/\/+/g, '/');
                } else if (groupPrefix) {
                    fullPath = `/${groupPrefix}/${path}`.replace(/\/+/g, '/');
                } else {
                    fullPath = path;
                }

                // Handle apiResource routes
                if (method === 'APIRESOURCE') {
                    // For apiResource, the path is typically singular, like 'activity-categories'
                    // This simplification just shows the base resource path.
                    // A more detailed implementation would generate all resource paths (GET, POST, PUT, DELETE).
                    routes.push({
                        line: i,
                        path: path,
                        method: 'APIRESOURCE (Multiple)', // Indicate it's a resource
                        fullPath: fullPath
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

        // Only process routes files
        if (!fileName.includes('routes/') || !fileName.endsWith('.php')) {
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
        }
    });

    // Listen for document changes
    const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(event => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && event.document === activeEditor.document && isEnabled) {
            // Debounce updates
            setTimeout(() => {
                if (vscode.window.activeTextEditor?.document === event.document) {
                    updateDecorations(activeEditor);
                }
            }, 500);
        }
    });

    // Initial decoration for active editor
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && isEnabled) {
        updateDecorations(activeEditor);
    }

    // Register disposables
    context.subscriptions.push(
        toggleCommand,
        onDidChangeActiveTextEditor,
        onDidChangeTextDocument,
        decorationType // decorationType itself needs to be disposed when extension is deactivated
    );
}

export function deactivate() {
    // Cleanup handled by disposables
}
