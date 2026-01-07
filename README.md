# Tag Commander

Advanced tag management plugin for [Obsidian](https://obsidian.md) - Add, Remove, and Edit tags across files and folders with ease.

![Obsidian](https://img.shields.io/badge/Obsidian-v1.0.0+-7C3AED?logo=obsidian&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

## Features

### 🏷️ Add Tags

- Add single or multiple tags (comma-separated) to files
- Autocomplete suggestions from existing vault tags
- Duplicate prevention - won't add tags that already exist

### 🗑️ Remove Tags

- Batch removal with toggle switches
- Visual list of all tags in selected files
- Remove multiple tags at once

### ✏️ Edit / Rename Tags

- Select source tag from dropdown
- Enter new tag name with autocomplete
- **Conditional Upsert** - optionally add the new tag to files that don't have the source tag

### 📁 Folder Operations

- Process entire folders at once
- **Include Subfolders** toggle
- **Depth Level** selector (1, 2, 3, 5, 10, or infinite)

## Usage

### Context Menu (File Explorer)

1. Right-click on a file, multiple files, or a folder in the file explorer
2. Select **"Tag Commander"** from the context menu
3. Choose: **Add Tags**, **Remove Tags**, or **Edit Tags**

### Command Palette

Press `Ctrl/Cmd + P` and search for:

- **"Tag Commander: Add Tags..."**
- **"Tag Commander: Remove Tags..."**
- **"Tag Commander: Edit Tags..."**

Each command opens a selection modal where you can:

- Select a folder (with subfolder options)
- Select individual files

## Installation

### From Obsidian Community Plugins

1. Open **Settings** → **Community plugins**
2. Click **Browse** and search for "Tag Commander"
3. Click **Install**, then **Enable**

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [releases page](https://github.com/karolprzygoda/tag-commander/releases)
2. Create folder: `YourVault/.obsidian/plugins/tag-commander/`
3. Copy the downloaded files into this folder
4. Reload Obsidian
5. Enable the plugin in **Settings** → **Community plugins**

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- pnpm

### Setup

```bash
# Clone the repository
git clone https://github.com/karolprzygoda/tag-commander.git
cd tag-commander

# Install dependencies
pnpm install

# Build for production
pnpm run build

# Development mode (watch for changes)
pnpm run dev
```

## License

MIT License - see [LICENSE](LICENSE) for details.
