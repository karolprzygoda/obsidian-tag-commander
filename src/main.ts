import {
  AbstractInputSuggest,
  App,
  ButtonComponent,
  FuzzySuggestModal,
  Menu,
  MenuItem,
  Modal,
  Notice,
  Plugin,
  Setting,
  TAbstractFile,
  TFile,
  TFolder,
  ToggleComponent,
} from 'obsidian';

// ============================================================================
// Types & Interfaces
// ============================================================================

type TagAction = 'add' | 'remove' | 'edit';

interface FolderOptions {
  includeSubfolders: boolean;
  depthLevel: number; // -1 for infinity
}

interface FrontMatter {
  tags?: string | string[];
  [key: string]: unknown;
}

// ============================================================================
// Tag Suggester (Autocomplete)
// ============================================================================

class TagSuggest extends AbstractInputSuggest<string> {
  private allTags: string[];
  private textInputEl: HTMLInputElement;

  constructor(app: App, inputEl: HTMLInputElement, allTags: string[]) {
    super(app, inputEl);
    this.textInputEl = inputEl;
    this.allTags = allTags;
  }

  getSuggestions(inputStr: string): string[] {
    const lowerInput = inputStr.toLowerCase().trim();
    if (!lowerInput) return this.allTags.slice(0, 20);

    // Handle comma-separated input - suggest for last segment
    const segments = inputStr.split(',');
    const lastSegment = segments[segments.length - 1]?.trim().toLowerCase() ?? '';

    if (!lastSegment) return this.allTags.slice(0, 20);

    return this.allTags.filter((tag) => tag.toLowerCase().includes(lastSegment)).slice(0, 20);
  }

  renderSuggestion(tag: string, el: HTMLElement): void {
    el.createEl('div', { text: tag, cls: 'tag-suggest-item' });
  }

  selectSuggestion(tag: string): void {
    const currentValue = this.textInputEl.value;
    const segments = currentValue.split(',');

    // Replace last segment with selected tag
    segments[segments.length - 1] = ' ' + tag;
    this.textInputEl.value = segments.join(',').trim();
    this.textInputEl.trigger('input');
    this.close();
  }
}

// ============================================================================
// Folder Picker Modal
// ============================================================================

class FolderPickerModal extends FuzzySuggestModal<TFolder> {
  private folders: TFolder[];
  private onChoose: (folder: TFolder) => void;

  constructor(app: App, onChoose: (folder: TFolder) => void) {
    super(app);
    this.onChoose = onChoose;
    this.folders = this.getAllFolders();
    this.setPlaceholder('Select a folder...');
  }

  private getAllFolders(): TFolder[] {
    const folders: TFolder[] = [];
    const root = this.app.vault.getRoot();

    const collectFolders = (folder: TFolder) => {
      folders.push(folder);
      for (const child of folder.children) {
        if (child instanceof TFolder) {
          collectFolders(child);
        }
      }
    };

    collectFolders(root);
    return folders;
  }

  getItems(): TFolder[] {
    return this.folders;
  }

  getItemText(folder: TFolder): string {
    return folder.path || '/';
  }

  onChooseItem(folder: TFolder): void {
    this.onChoose(folder);
  }
}

// ============================================================================
// File/Folder Selection Modal (for commands)
// ============================================================================

class FileSelectionModal extends Modal {
  private plugin: TagCommanderPlugin;
  private action: TagAction;
  private selectionMode: 'folder' | 'files' = 'folder';
  private selectedFolder: TFolder | null = null;
  private selectedFiles: TFile[] = [];
  private folderOptions: FolderOptions = {
    includeSubfolders: true,
    depthLevel: -1,
  };
  private contentContainer: HTMLElement | null = null;

  constructor(plugin: TagCommanderPlugin, action: TagAction) {
    super(plugin.app);
    this.plugin = plugin;
    this.action = action;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('tag-commander-modal');

    const actionName =
      this.action === 'add' ? 'Add tags'
      : this.action === 'remove' ? 'Remove tags'
      : 'Edit tags';

    contentEl.createEl('h2', { text: `${actionName} - select target` });
    contentEl.createEl('p', {
      text: 'Choose files or a folder to operate on',
      cls: 'tag-commander-subtitle',
    });

    // Selection mode
    new Setting(contentEl)
      .setName('Selection mode')
      .setDesc('Choose how to select target files')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('folder', 'Select a folder')
          .addOption('files', 'Select individual files')
          .setValue(this.selectionMode)
          .onChange((value) => {
            this.selectionMode = value as 'folder' | 'files';
            this.renderSelectionContent();
          }),
      );

    this.contentContainer = contentEl.createDiv({
      cls: 'tag-commander-selection-content',
    });
    this.renderSelectionContent();

    // Action buttons
    const buttonContainer = contentEl.createDiv({
      cls: 'tag-commander-button-row',
    });

    new ButtonComponent(buttonContainer).setButtonText('Cancel').onClick(() => this.close());

    new ButtonComponent(buttonContainer)
      .setButtonText('Continue')
      .setCta()
      .onClick(() => this.handleContinue());
  }

  private renderSelectionContent() {
    if (!this.contentContainer) return;
    this.contentContainer.empty();

    if (this.selectionMode === 'folder') {
      this.renderFolderSelection(this.contentContainer);
    } else {
      this.renderFileSelection(this.contentContainer);
    }
  }

  private renderFolderSelection(container: HTMLElement) {
    // Folder picker button
    const folderSetting = new Setting(container)
      .setName('Target folder')
      .setDesc(this.selectedFolder ? `Selected: ${this.selectedFolder.path || '/'}` : 'No folder selected');

    folderSetting.addButton((button) =>
      button.setButtonText('Browse...').onClick(() => {
        new FolderPickerModal(this.app, (folder) => {
          this.selectedFolder = folder;
          folderSetting.setDesc(`Selected: ${folder.path || '/'}`);
        }).open();
      }),
    );

    // Subfolder options
    new Setting(container)
      .setName('Include subfolders')
      .setDesc('Process files in subdirectories')
      .addToggle((toggle) =>
        toggle.setValue(this.folderOptions.includeSubfolders).onChange((value) => {
          this.folderOptions.includeSubfolders = value;
        }),
      );

    new Setting(container)
      .setName('Depth level')
      .setDesc('How deep to traverse (-1 for infinite)')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('-1', 'Infinite')
          .addOption('1', '1 level')
          .addOption('2', '2 levels')
          .addOption('3', '3 levels')
          .addOption('5', '5 levels')
          .addOption('10', '10 levels')
          .setValue(String(this.folderOptions.depthLevel))
          .onChange((value) => {
            this.folderOptions.depthLevel = parseInt(value);
          }),
      );
  }

  private renderFileSelection(container: HTMLElement) {
    const allFiles = this.app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path));

    container.createEl('p', {
      text: `Select files to process (${this.selectedFiles.length} selected):`,
      cls: 'tag-commander-batch-desc',
    });

    const listContainer = container.createDiv({ cls: 'tag-commander-tag-list' });

    allFiles.forEach((file) => {
      const itemEl = listContainer.createDiv({ cls: 'tag-commander-tag-item' });

      new ToggleComponent(itemEl).setValue(this.selectedFiles.includes(file)).onChange((value) => {
        if (value) {
          this.selectedFiles.push(file);
        } else {
          this.selectedFiles = this.selectedFiles.filter((f) => f !== file);
        }
        // Update count
        const desc = container.querySelector('.tag-commander-batch-desc');
        if (desc) {
          desc.textContent = `Select files to process (${this.selectedFiles.length} selected):`;
        }
      });

      itemEl.createEl('span', { text: file.path, cls: 'tag-commander-tag-label' });
    });
  }

  private handleContinue() {
    let files: TFile[] = [];
    let folder: TFolder | null = null;

    if (this.selectionMode === 'folder') {
      if (!this.selectedFolder) {
        new Notice('Please select a folder');
        return;
      }
      folder = this.selectedFolder;
      files = this.plugin.getFilesFromFolder(
        this.selectedFolder,
        this.folderOptions.includeSubfolders,
        this.folderOptions.depthLevel,
      );
    } else {
      if (this.selectedFiles.length === 0) {
        new Notice('Please select at least one file');
        return;
      }
      files = this.selectedFiles;
    }

    if (files.length === 0) {
      new Notice('No Markdown files found in selection');
      return;
    }

    this.close();

    // Open the appropriate modal
    switch (this.action) {
      case 'add':
        new AddTagsModal(this.plugin, files, folder).open();
        break;
      case 'remove':
        new RemoveTagsModal(this.plugin, files, folder).open();
        break;
      case 'edit':
        new EditTagsModal(this.plugin, files, folder).open();
        break;
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// ============================================================================
// Base Tag Modal
// ============================================================================

abstract class BaseTagModal extends Modal {
  protected plugin: TagCommanderPlugin;
  protected files: TFile[];
  protected folder: TFolder | null;
  protected folderOptions: FolderOptions;
  protected existingTags: string[];

  constructor(plugin: TagCommanderPlugin, files: TFile[], folder: TFolder | null = null) {
    super(plugin.app);
    this.plugin = plugin;
    this.files = files;
    this.folder = folder;
    this.folderOptions = {
      includeSubfolders: true,
      depthLevel: -1,
    };
    this.existingTags = [];
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('tag-commander-modal');

    // If operating on a folder, show folder options first
    if (this.folder) {
      this.renderFolderOptions(contentEl);
    }

    // Load existing tags from target files
    await this.loadExistingTags();

    // Render specific modal content
    this.renderContent(contentEl);
  }

  protected renderFolderOptions(container: HTMLElement) {
    const folderSection = container.createDiv({
      cls: 'tag-commander-folder-options',
    });
    folderSection.createEl('h4', { text: 'Folder options' });
    folderSection.createEl('p', {
      text: `Target: ${this.folder?.path || '/'}`,
      cls: 'tag-commander-folder-path',
    });

    new Setting(folderSection)
      .setName('Include subfolders')
      .setDesc('Process files in subdirectories')
      .addToggle((toggle) =>
        toggle.setValue(this.folderOptions.includeSubfolders).onChange(async (value) => {
          this.folderOptions.includeSubfolders = value;
          await this.refreshFilesFromFolder();
        }),
      );

    new Setting(folderSection)
      .setName('Depth level')
      .setDesc('How deep to traverse (-1 for infinite)')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('-1', 'Infinite')
          .addOption('1', '1 level')
          .addOption('2', '2 levels')
          .addOption('3', '3 levels')
          .addOption('5', '5 levels')
          .addOption('10', '10 levels')
          .setValue(String(this.folderOptions.depthLevel))
          .onChange(async (value) => {
            this.folderOptions.depthLevel = parseInt(value);
            await this.refreshFilesFromFolder();
          }),
      );

    // Show file count
    this.fileCountEl = folderSection.createEl('p', {
      text: `Files to process: ${this.files.length}`,
      cls: 'tag-commander-file-count',
    });
  }

  protected fileCountEl: HTMLElement | null = null;

  protected async refreshFilesFromFolder() {
    if (this.folder) {
      this.files = this.plugin.getFilesFromFolder(
        this.folder,
        this.folderOptions.includeSubfolders,
        this.folderOptions.depthLevel,
      );
      if (this.fileCountEl) {
        this.fileCountEl.setText(`Files to process: ${this.files.length}`);
      }
      await this.loadExistingTags();
      this.onTagsReloaded();
    }
  }

  protected async loadExistingTags() {
    const tagSet = new Set<string>();

    for (const file of this.files) {
      const tags = await this.plugin.getTagsFromFile(file);
      tags.forEach((tag) => tagSet.add(tag));
    }

    this.existingTags = Array.from(tagSet).sort();
  }

  // Called when tags need to be reloaded (for refresh)
  protected onTagsReloaded() {}

  abstract renderContent(container: HTMLElement): void;

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// ============================================================================
// Add Tags Modal
// ============================================================================

class AddTagsModal extends BaseTagModal {
  private inputEl: HTMLInputElement | null = null;

  renderContent(container: HTMLElement) {
    container.createEl('h2', { text: 'Add tags' });
    container.createEl('p', {
      text: `Adding tags to ${this.files.length} file(s)`,
      cls: 'tag-commander-subtitle',
    });

    // Tags to Add section
    const inputSection = container.createDiv({ cls: 'tag-commander-input-section' });

    inputSection.createEl('div', {
      text: 'Tags to add',
      cls: 'tag-commander-input-label',
    });
    inputSection.createEl('div', {
      text: 'Enter tags separated by commas (e.g., project, important, todo)',
      cls: 'tag-commander-input-desc',
    });

    // Full-width input field
    this.inputEl = inputSection.createEl('input', {
      type: 'text',
      placeholder: 'tag1, tag2, tag3...',
      cls: 'tag-commander-tag-input',
    });

    // Add tag suggestions
    new TagSuggest(this.app, this.inputEl, this.getAllVaultTags());

    // Handle Enter key
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.handleSubmit();
      }
    });

    // Existing tags hint
    if (this.existingTags.length > 0) {
      const hintEl = container.createDiv({ cls: 'tag-commander-existing-tags' });
      hintEl.createEl('span', { text: 'Existing tags in selection: ' });
      const tagsPreview = this.existingTags.slice(0, 10).join(', ');
      hintEl.createEl('code', {
        text: tagsPreview + (this.existingTags.length > 10 ? '...' : ''),
      });
    }

    // Action buttons
    const buttonContainer = container.createDiv({
      cls: 'tag-commander-button-row',
    });

    new ButtonComponent(buttonContainer).setButtonText('Cancel').onClick(() => this.close());

    new ButtonComponent(buttonContainer)
      .setButtonText('Add tags')
      .setCta()
      .onClick(() => this.handleSubmit());
  }

  private getAllVaultTags(): string[] {
    const tags = new Set<string>();

    // Access internal API for all tags - getTags() returns Record<string, number>
    const metadataCache = this.app.metadataCache as { getTags?: () => Record<string, number> };
    if (typeof metadataCache.getTags === 'function') {
      const tagCache = metadataCache.getTags();
      Object.keys(tagCache).forEach((tag) => {
        tags.add(tag.replace(/^#/, ''));
      });
    }

    return Array.from(tags).sort();
  }

  private async handleSubmit() {
    if (!this.inputEl) return;

    const inputValue = this.inputEl.value.trim();
    if (!inputValue) {
      new Notice('Please enter at least one tag');
      return;
    }

    const tagsToAdd = this.plugin.parseTags(inputValue);
    if (tagsToAdd.length === 0) {
      new Notice('No valid tags provided');
      return;
    }

    let successCount = 0;
    let skipCount = 0;

    for (const file of this.files) {
      const result = await this.plugin.addTagsToFile(file, tagsToAdd);
      if (result.added > 0) successCount++;
      if (result.skipped > 0) skipCount++;
    }

    new Notice(`Added tags to ${successCount} file(s)` + (skipCount > 0 ? ` (${skipCount} duplicates skipped)` : ''));
    this.close();
  }
}

// ============================================================================
// Remove Tags Modal
// ============================================================================

class RemoveTagsModal extends BaseTagModal {
  private selectedTags: Set<string> = new Set();

  renderContent(container: HTMLElement) {
    container.createEl('h2', { text: 'Remove tags' });
    container.createEl('p', {
      text: `Removing tags from ${this.files.length} file(s)`,
      cls: 'tag-commander-subtitle',
    });

    if (this.existingTags.length === 0) {
      container.createEl('p', {
        text: 'No tags found in selected files.',
        cls: 'tag-commander-no-tags',
      });
      return;
    }

    container.createEl('p', {
      text: 'Select the tags you want to remove:',
      cls: 'tag-commander-batch-desc',
    });

    const listContainer = container.createDiv({ cls: 'tag-commander-tag-list' });

    this.existingTags.forEach((tag) => {
      const itemEl = listContainer.createDiv({ cls: 'tag-commander-tag-item' });

      new ToggleComponent(itemEl).setValue(this.selectedTags.has(tag)).onChange((value) => {
        if (value) {
          this.selectedTags.add(tag);
        } else {
          this.selectedTags.delete(tag);
        }
      });

      itemEl.createEl('span', { text: tag, cls: 'tag-commander-tag-label' });
    });

    // Action buttons
    const buttonContainer = container.createDiv({
      cls: ['tag-commander-button-row', 'tag-commander-button-row-remove'],
    });

    new ButtonComponent(buttonContainer).setButtonText('Cancel').onClick(() => this.close());

    new ButtonComponent(buttonContainer)
      .setButtonText('Remove tags')
      .setCta()
      .onClick(() => this.handleSubmit());
  }

  protected onTagsReloaded() {
    this.selectedTags.clear();
  }

  private async handleSubmit() {
    if (this.selectedTags.size === 0) {
      new Notice('Please select at least one tag to remove');
      return;
    }

    const tagsToRemove = Array.from(this.selectedTags);
    let successCount = 0;

    for (const file of this.files) {
      const removed = await this.plugin.removeTagsFromFile(file, tagsToRemove);
      if (removed > 0) successCount++;
    }

    new Notice(`Removed ${tagsToRemove.length} tag(s) from ${successCount} file(s)`);
    this.close();
  }
}

// ============================================================================
// Edit Tags Modal
// ============================================================================

interface TagEdit {
  originalTag: string;
  newTag: string;
  enabled: boolean;
}

class EditTagsModal extends BaseTagModal {
  private tagEdits: Map<string, TagEdit> = new Map();
  private addToFilesWithoutTag: boolean = false;
  private listContainer: HTMLElement | null = null;

  renderContent(container: HTMLElement) {
    container.createEl('h2', { text: 'Edit / rename tags' });
    container.createEl('p', {
      text: `Editing tags in ${this.files.length} file(s)`,
      cls: 'tag-commander-subtitle',
    });

    if (this.existingTags.length === 0) {
      container.createEl('p', {
        text: 'No tags found in selected files.',
        cls: 'tag-commander-no-tags',
      });
      return;
    }

    // Tags list
    this.listContainer = container.createDiv({ cls: 'tag-commander-edit-list' });

    // Initialize edits from existing tags
    this.initializeTagEdits();
    this.renderTagRows();

    // Global option for adding to files without the tag
    new Setting(container)
      .setName('Add to files without tag')
      .setDesc("If enabled, files that don't have the original tag will receive the new tag")
      .addToggle((toggle) =>
        toggle.setValue(this.addToFilesWithoutTag).onChange((value) => {
          this.addToFilesWithoutTag = value;
        }),
      )
      .setClass('tag-commander-setting-item');

    // Action buttons
    const buttonContainer = container.createDiv({
      cls: 'tag-commander-button-row',
    });

    new ButtonComponent(buttonContainer).setButtonText('Cancel').onClick(() => this.close());

    new ButtonComponent(buttonContainer)
      .setButtonText('Rename tags')
      .setCta()
      .onClick(() => this.handleSubmit());
  }

  private initializeTagEdits() {
    this.tagEdits.clear();

    this.existingTags.forEach((tag) => {
      this.tagEdits.set(tag, {
        originalTag: tag,
        newTag: tag,
        enabled: false,
      });
    });
  }

  private renderTagRows() {
    if (!this.listContainer) return;
    this.listContainer.empty();

    const headerEl = this.listContainer.createDiv({ cls: 'tag-commander-edit-header' });
    headerEl.createEl('span', { text: '', cls: 'tag-commander-edit-header-toggle' });
    headerEl.createEl('span', { text: 'Current tag', cls: 'tag-commander-edit-header-tag' });
    headerEl.createEl('span', { text: 'New name', cls: 'tag-commander-edit-header-new' });

    this.tagEdits.forEach((edit) => {
      this.renderTagRow(edit);
    });
  }

  private renderTagRow(edit: TagEdit) {
    if (!this.listContainer) return;

    const rowEl = this.listContainer.createDiv({ cls: 'tag-commander-edit-row' });

    // Enable toggle
    const toggleContainer = rowEl.createDiv({ cls: 'tag-commander-edit-cell-toggle' });
    new ToggleComponent(toggleContainer).setValue(edit.enabled).onChange((value) => {
      edit.enabled = value;
      rowEl.toggleClass('tag-commander-edit-row-enabled', value);
    });

    // Original tag name (label)
    const tagContainer = rowEl.createDiv({ cls: 'tag-commander-edit-cell-tag' });
    tagContainer.createEl('span', { text: edit.originalTag, cls: 'tag-commander-tag-label' });

    // New tag name input
    const newTagContainer = rowEl.createDiv({ cls: 'tag-commander-edit-cell-new' });
    const inputEl = newTagContainer.createEl('input', {
      type: 'text',
      cls: 'tag-commander-edit-input',
      value: edit.newTag,
      placeholder: 'new-tag-name',
    });
    inputEl.addEventListener('input', () => {
      edit.newTag = inputEl.value.trim();
    });
  }

  protected onTagsReloaded() {
    this.initializeTagEdits();
    this.renderTagRows();
  }

  private async handleSubmit() {
    const enabledEdits = Array.from(this.tagEdits.values()).filter(
      (e) => e.enabled && e.newTag.length > 0 && e.originalTag !== e.newTag,
    );

    if (enabledEdits.length === 0) {
      new Notice('Please enable at least one tag to rename and provide a new name');
      return;
    }

    let renamedCount = 0;
    let addedCount = 0;

    for (const file of this.files) {
      for (const edit of enabledEdits) {
        const result = await this.plugin.editTagInFile(file, edit.originalTag, edit.newTag, this.addToFilesWithoutTag);

        if (result === 'renamed') renamedCount++;
        else if (result === 'added') addedCount++;
      }
    }

    let message = `Renamed ${renamedCount} tag(s)`;
    if (addedCount > 0) {
      message += `, added ${addedCount}`;
    }
    new Notice(message);
    this.close();
  }
}

// ============================================================================
// Main Plugin Class
// ============================================================================

export default class TagCommanderPlugin extends Plugin {
  async onload() {
    console.debug('Loading Tag Commander plugin');

    // Register context menu events
    this.registerContextMenuEvents();

    // Register global commands
    this.registerCommands();
  }

  onunload() {
    console.debug('Unloading Tag Commander plugin');
  }

  // ========================================================================
  // Context Menu Registration
  // ========================================================================

  private registerContextMenuEvents() {
    // File context menu (single or multiple files)
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file, source) => {
        if (source === 'file-explorer-context-menu') {
          this.addTagCommanderMenu(menu, file);
        }
      }),
    );

    // Multiple files selection context menu
    this.registerEvent(
      this.app.workspace.on('files-menu', (menu, files, source) => {
        if (source === 'file-explorer-context-menu') {
          this.addTagCommanderMenuForFiles(menu, files);
        }
      }),
    );
  }

  private addTagCommanderMenu(menu: Menu, file: TAbstractFile) {
    menu.addSeparator();

    menu.addItem((item: MenuItem) => {
      item.setTitle('Tag commander').setIcon('tag');

      // setSubmenu exists at runtime but is not in type definitions
      const subMenu = (item as MenuItem & { setSubmenu: () => Menu }).setSubmenu();

      if (file instanceof TFolder) {
        // Folder context
        subMenu.addItem((subItem: MenuItem) => {
          subItem
            .setTitle('Add tags...')
            .setIcon('plus')
            .onClick(() => {
              const files = this.getFilesFromFolder(file, true, -1);
              new AddTagsModal(this, files, file).open();
            });
        });

        subMenu.addItem((subItem: MenuItem) => {
          subItem
            .setTitle('Remove tags...')
            .setIcon('minus')
            .onClick(() => {
              const files = this.getFilesFromFolder(file, true, -1);
              new RemoveTagsModal(this, files, file).open();
            });
        });

        subMenu.addItem((subItem: MenuItem) => {
          subItem
            .setTitle('Edit tags...')
            .setIcon('pencil')
            .onClick(() => {
              const files = this.getFilesFromFolder(file, true, -1);
              new EditTagsModal(this, files, file).open();
            });
        });
      } else if (file instanceof TFile && file.extension === 'md') {
        // Single file context
        subMenu.addItem((subItem: MenuItem) => {
          subItem
            .setTitle('Add tags...')
            .setIcon('plus')
            .onClick(() => {
              new AddTagsModal(this, [file]).open();
            });
        });

        subMenu.addItem((subItem: MenuItem) => {
          subItem
            .setTitle('Remove tags...')
            .setIcon('minus')
            .onClick(() => {
              new RemoveTagsModal(this, [file]).open();
            });
        });

        subMenu.addItem((subItem: MenuItem) => {
          subItem
            .setTitle('Edit tags...')
            .setIcon('pencil')
            .onClick(() => {
              new EditTagsModal(this, [file]).open();
            });
        });
      }
    });
  }

  private addTagCommanderMenuForFiles(menu: Menu, files: TAbstractFile[]) {
    const mdFiles = files.filter((f): f is TFile => f instanceof TFile && f.extension === 'md');

    if (mdFiles.length === 0) return;

    menu.addSeparator();

    menu.addItem((item: MenuItem) => {
      item.setTitle('Tag commander').setIcon('tag');

      // setSubmenu exists at runtime but is not in type definitions
      const subMenu = (item as MenuItem & { setSubmenu: () => Menu }).setSubmenu();

      subMenu.addItem((subItem: MenuItem) => {
        subItem
          .setTitle(`Add tags to ${mdFiles.length} files...`)
          .setIcon('plus')
          .onClick(() => {
            new AddTagsModal(this, mdFiles).open();
          });
      });

      subMenu.addItem((subItem: MenuItem) => {
        subItem
          .setTitle(`Remove tags from ${mdFiles.length} files...`)
          .setIcon('minus')
          .onClick(() => {
            new RemoveTagsModal(this, mdFiles).open();
          });
      });

      subMenu.addItem((subItem: MenuItem) => {
        subItem
          .setTitle(`Edit tags in ${mdFiles.length} files...`)
          .setIcon('pencil')
          .onClick(() => {
            new EditTagsModal(this, mdFiles).open();
          });
      });
    });
  }

  // ========================================================================
  // Command Registration
  // ========================================================================

  private registerCommands() {
    // Commands that open file/folder selection modal first
    this.addCommand({
      id: 'add-tags',
      name: 'Add tags...',
      callback: () => new FileSelectionModal(this, 'add').open(),
    });

    this.addCommand({
      id: 'remove-tags',
      name: 'Remove tags...',
      callback: () => new FileSelectionModal(this, 'remove').open(),
    });

    this.addCommand({
      id: 'edit-tags',
      name: 'Edit tags...',
      callback: () => new FileSelectionModal(this, 'edit').open(),
    });
  }

  // ========================================================================
  // File & Tag Utilities
  // ========================================================================

  getFilesFromFolder(
    folder: TFolder,
    includeSubfolders: boolean,
    depthLevel: number,
    currentDepth: number = 0,
  ): TFile[] {
    const files: TFile[] = [];

    for (const child of folder.children) {
      if (child instanceof TFile && child.extension === 'md') {
        files.push(child);
      } else if (child instanceof TFolder && includeSubfolders && (depthLevel === -1 || currentDepth < depthLevel)) {
        files.push(...this.getFilesFromFolder(child, includeSubfolders, depthLevel, currentDepth + 1));
      }
    }

    return files;
  }

  async getTagsFromFile(file: TFile): Promise<string[]> {
    const tags: string[] = [];

    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter: FrontMatter) => {
        if (frontmatter.tags) {
          if (Array.isArray(frontmatter.tags)) {
            tags.push(...frontmatter.tags.map((t) => String(t).replace(/^#/, '')));
          } else if (typeof frontmatter.tags === 'string') {
            tags.push(frontmatter.tags.replace(/^#/, ''));
          }
        }
      });
    } catch {
      // File might not have frontmatter
    }

    return tags;
  }

  parseTags(input: string): string[] {
    return input
      .split(',')
      .map((tag) => tag.trim().replace(/^#/, ''))
      .filter((tag) => tag.length > 0);
  }

  async addTagsToFile(file: TFile, tagsToAdd: string[]): Promise<{ added: number; skipped: number }> {
    let added = 0;
    let skipped = 0;

    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter: FrontMatter) => {
        // Initialize tags array if doesn't exist
        if (!frontmatter.tags) {
          frontmatter.tags = [];
        }

        // Ensure tags is an array
        if (!Array.isArray(frontmatter.tags)) {
          frontmatter.tags = [frontmatter.tags];
        }

        // Normalize existing tags (remove # prefix)
        frontmatter.tags = frontmatter.tags.map((t) => String(t).replace(/^#/, ''));

        // Add new tags, avoiding duplicates
        for (const tag of tagsToAdd) {
          const normalizedTag = tag.replace(/^#/, '');
          if (!frontmatter.tags.includes(normalizedTag)) {
            frontmatter.tags.push(normalizedTag);
            added++;
          } else {
            skipped++;
          }
        }
      });
    } catch (error) {
      console.error(`Error adding tags to ${file.path}:`, error);
    }

    return { added, skipped };
  }

  async removeTagsFromFile(file: TFile, tagsToRemove: string[]): Promise<number> {
    let removed = 0;

    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter: FrontMatter) => {
        if (!frontmatter.tags) return;

        // Ensure tags is an array
        if (!Array.isArray(frontmatter.tags)) {
          frontmatter.tags = [frontmatter.tags];
        }

        // Normalize tags to remove
        const normalizedToRemove = tagsToRemove.map((t) => t.replace(/^#/, '').toLowerCase());

        // Filter out tags to remove
        const originalLength = frontmatter.tags.length;
        frontmatter.tags = frontmatter.tags.filter((t) => {
          const normalized = String(t).replace(/^#/, '').toLowerCase();
          return !normalizedToRemove.includes(normalized);
        });

        removed = originalLength - frontmatter.tags.length;

        // Remove empty tags array
        if (frontmatter.tags.length === 0) {
          delete frontmatter.tags;
        }
      });
    } catch (error) {
      console.error(`Error removing tags from ${file.path}:`, error);
    }

    return removed;
  }

  async editTagInFile(
    file: TFile,
    sourceTag: string,
    targetTag: string,
    conditionalUpsert: boolean,
  ): Promise<'renamed' | 'added' | 'none'> {
    let result: 'renamed' | 'added' | 'none' = 'none';

    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter: FrontMatter) => {
        // Initialize tags array if needed for upsert
        if (!frontmatter.tags) {
          if (conditionalUpsert) {
            frontmatter.tags = [targetTag.replace(/^#/, '')];
            result = 'added';
          }
          return;
        }

        // Ensure tags is an array
        if (!Array.isArray(frontmatter.tags)) {
          frontmatter.tags = [frontmatter.tags];
        }

        // Normalize
        frontmatter.tags = frontmatter.tags.map((t) => String(t).replace(/^#/, ''));

        const normalizedSource = sourceTag.replace(/^#/, '').toLowerCase();
        const normalizedTarget = targetTag.replace(/^#/, '');

        // Find and replace source tag
        const sourceIndex = frontmatter.tags.findIndex((t) => t.toLowerCase() === normalizedSource);

        if (sourceIndex !== -1) {
          // Check if target already exists
          const targetExists = frontmatter.tags.some((t) => t.toLowerCase() === normalizedTarget.toLowerCase());

          if (targetExists) {
            // Just remove source, target already exists
            frontmatter.tags.splice(sourceIndex, 1);
          } else {
            // Replace source with target
            frontmatter.tags[sourceIndex] = normalizedTarget;
          }
          result = 'renamed';
        } else if (conditionalUpsert) {
          // Source not found, add target if upsert enabled
          const targetExists = frontmatter.tags.some((t) => t.toLowerCase() === normalizedTarget.toLowerCase());

          if (!targetExists) {
            frontmatter.tags.push(normalizedTarget);
            result = 'added';
          }
        }

        // Clean up empty tags array
        if (frontmatter.tags.length === 0) {
          delete frontmatter.tags;
        }
      });
    } catch (error) {
      console.error(`Error editing tags in ${file.path}:`, error);
    }

    return result;
  }
}
