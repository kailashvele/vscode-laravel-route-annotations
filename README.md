# Laravel Route Annotations

A lightweight VS Code extension that displays route path annotations above Laravel route definitions in `routes/web.php` | `routes/api.php`.

## Features

- **Automatic Route Detection**: Scans `routes/web.php` | `routes/api.php` and detects Laravel route definitions (`Route::get`, `Route::post`, etc.)
- **Path Annotations**: Shows gray-colored decorations above each route with the full path: `🧩 Route Path: /users/{id}`
- **Route Group Support**: Handles `Route::group` with prefix parsing for nested routes
- **Toggle On/Off**: Use `Cmd+Shift+U` (Mac) or `Ctrl+Shift+U` (Windows) to toggle annotations
- **Real-time Updates**: Annotations update automatically as you edit your routes file

## Usage

1. Open a Laravel project in VS Code
2. Navigate to `routes/web.php` and `routes/api.php` or `routes/<any_nested_included_routes>`
3. Route annotations will appear automatically above each route definition
4. Use the keyboard shortcut to toggle annotations on/off

## Supported Route Methods

- `Route::get`
- `Route::post`
- `Route::put`
- `Route::delete`
- `Route::patch`
- `Route::options`
- `Route::any`

## Example

Given this routes file:

```php
<?php

Route::get('/users', [UserController::class, 'index']);
Route::post('/users', [UserController::class, 'store']);

Route::group(['prefix' => 'api'], function () {
    Route::get('/posts/{id}', [PostController::class, 'show']);
});
```

The extension will display:

```php
<?php

🧩 Route Path: /users
Route::get('/users', [UserController::class, 'index']);
🧩 Route Path: /users
Route::post('/users', [UserController::class, 'store']);

Route::group(['prefix' => 'api'], function () {
    🧩 Route Path: /api/posts/{id}
    Route::get('/posts/{id}', [PostController::class, 'show']);
});
```

## Commands

- `Laravel Routes: Toggle Annotations` - Toggle route annotations on/off

## Keyboard Shortcuts

- **Mac**: `Cmd+Shift+U`
- **Windows/Linux**: `Ctrl+Shift+U`

## Requirements

- VS Code 1.74.0 or higher
- PHP language support (for file detection)

## Limitations

- Currently only supports static route group parsing (no dynamic prefix evaluation)
- Only processes `routes/web.php` | `routes/api.php` files
- Uses regex-based parsing (not a full PHP AST parser)

## Development

To build and test this extension:

1. Clone the repository
2. Run `npm install`
3. Run `npm run compile`
4. Press F5 to launch Extension Development Host
5. Open a Laravel project with `routes/web.php` | `routes/api.php`

## Packaging

To create a `.vsix` package:

```bash
npm install -g vsce
vsce package
```

Then install with:
```bash
code --install-extension laravel-route-annotations-1.0.0.vsix
```

## License

MIT
