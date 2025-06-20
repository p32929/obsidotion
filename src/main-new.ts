import {
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
} from 'obsidian';

import { PluginSettings, DEFAULT_SETTINGS, SyncStats } from './types';
import { Logger } from './utils/logger';
import { Validator } from './utils/validator';
import { NotionAPIService } from './services/notion-api';
import { MarkdownConverter } from './services/markdown-converter';
import { UploadService } from './services/upload-service';
import { DownloadService } from './services/download-service';
// @ts-ignore
import { SyncManager } from './services/sync-manager';
export default class ObsidotionPlugin extends Plugin {
	settings: PluginSettings;
	private notionAPI: NotionAPIService;
	private markdownConverter: MarkdownConverter;
	private uploadService: UploadService;
	private downloadService: DownloadService;
	private syncManager: any; // Using any to avoid TypeScript issues
	public logger: Logger;

	async onload() {
		console.log('Loading Obsidotion plugin...');
		
		// Initialize logger first
		this.logger = new Logger('Obsidotion');
		
		await this.loadSettings();
		this.notionAPI = new NotionAPIService(this.settings.notionAPIToken, this.logger);
		this.markdownConverter = new MarkdownConverter(this.logger);
		this.uploadService = new UploadService(this.notionAPI, this.markdownConverter, this.logger);
		this.downloadService = new DownloadService(this.notionAPI, this.markdownConverter, this.logger);

		// Initialize sync manager for deletion handling only
		this.syncManager = new SyncManager(
			this.app,
			this.notionAPI,
			this.markdownConverter,
			this.logger,
			this
		);

		// Add settings tab
		this.addSettingTab(new ObsidotionSettingTab(this.app, this));

		// Add ribbon button for uploading to Notion
		this.addRibbonIcon('cloud-upload', 'Upload to Notion', async (evt: MouseEvent) => {
			if (!this.settings.notionAPIToken || !this.settings.databaseID) {
				new Notice('Please configure API token and database ID in settings first');
				return;
			}
			
			try {
				new Notice('Uploading files to Notion...');
				await this.uploadToNotion();
				new Notice('Successfully uploaded files to Notion');
			} catch (error) {
				new Notice(`Failed to upload to Notion: ${error.message}`);
				this.logger.error('Upload to Notion failed:', error);
			}
		});

		// Add ribbon button for pulling from Notion
		this.addRibbonIcon('cloud-download', 'Pull from Notion', async (evt: MouseEvent) => {
			if (!this.settings.notionAPIToken || !this.settings.databaseID) {
				new Notice('Please configure API token and database ID in settings first');
				return;
			}
			
			// Ask for confirmation
			const confirmed = await this.showPullConfirmation();
			if (!confirmed) return;
			
			try {
				new Notice('Pulling changes from Notion...');
				await this.pullFromNotion();
				new Notice('Successfully pulled changes from Notion');
			} catch (error) {
				new Notice(`Failed to pull from Notion: ${error.message}`);
				this.logger.error('Pull from Notion failed:', error);
			}
		});

		// Validate settings on startup
		this.validateSettingsOnStartup();
		
		// Debug: Log API token status (first few characters only)
		if (this.settings.notionAPIToken) {
			const tokenPreview = this.settings.notionAPIToken.substring(0, 10) + '...';
			this.logger.debug(`API Token loaded: ${tokenPreview}`);
		} else {
			this.logger.warn('No API token found in settings');
		}

		// No automatic startup checks - all sync operations are manual

		this.logger.success('Obsidotion plugin loaded successfully');
	}

	async onunload() {
		console.log('Unloading Obsidotion plugin...');
		
		// Clean up sync manager
		if (this.syncManager) {
			this.syncManager.destroy();
		}
		
		this.logger.info('Obsidotion plugin unloaded');
	}

	async loadSettings() {
		const savedSettings = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings);
		
		// Migration: handle old notionAPI property
		if (savedSettings && savedSettings.notionAPI && !savedSettings.notionAPIToken) {
			this.settings.notionAPIToken = savedSettings.notionAPI;
			// Save the migrated settings
			await this.saveData(this.settings);
			this.logger.info('Migrated API token from old settings format');
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
		
		// Update services when settings change - reinitialize if needed
		if (this.settings.notionAPIToken) {
			this.notionAPI = new NotionAPIService(this.settings.notionAPIToken, this.logger);
			
			// Update sync manager with new notion API instance
			if (this.syncManager) {
				this.syncManager.notionAPI = this.notionAPI;
			}
			
			// Update other services too
			if (this.uploadService) {
				this.uploadService = new UploadService(this.notionAPI, this.markdownConverter, this.logger);
			}
			if (this.downloadService) {
				this.downloadService = new DownloadService(this.notionAPI, this.markdownConverter, this.logger);
			}
		}
	}

	private async validateSettingsOnStartup() {
		const validation = Validator.validateSettings(this.settings);
		if (validation.isValid) {
			this.logger.success('Plugin settings are valid');
		} else {
			this.logger.warn('Please check your plugin settings');
			new Notice('Obsidotion: Please configure your Notion API token and database ID in settings');
		}
	}

	async pullFromNotion() {
		this.logger.info('Starting smart pull from Notion...');
		
		// Get all markdown files that have Notion IDs and filter for ones that need updating
		const markdownFiles = this.app.vault.getMarkdownFiles();
		const filesToUpdate = await this.filterFilesForDownload(markdownFiles);

		if (filesToUpdate.length === 0) {
			this.logger.info('No files need downloading - all up to date!');
			return;
		}

		this.logger.info(`Found ${filesToUpdate.length} files that need downloading`);

		// Ask for confirmation since we're replacing local content
		const confirmed = await this.showPullConfirmation();
		if (!confirmed) return;

		// Update files with Notion content
		let successful = 0;
		let failed = 0;
		
		for (const { file, notionId, notionContent } of filesToUpdate) {
			try {
				// Get current frontmatter to preserve it
				const localContent = await this.app.vault.read(file);
				const { frontmatter } = this.markdownConverter.parseMarkdownWithFrontmatter(localContent);
				
				// Calculate content hash for the new content
				const contentHash = this.calculateContentHash(notionContent);
				
				// Replace with Notion content, preserving and updating frontmatter
				const updatedFrontmatter = {
					...frontmatter,
					lastSync: new Date().toISOString(),
					contentHash: contentHash
				};
				
				const yamlHeader = this.stringifyYaml(updatedFrontmatter).trim();
				const newContent = `---\n${yamlHeader}\n---\n${notionContent}`;
				
				await this.app.vault.modify(file, newContent);
				this.logger.info(`Updated ${file.name} with Notion content`);
				successful++;
			} catch (error) {
				this.logger.error(`Failed to update ${file.name}: ${error.message}`);
				failed++;
			}
		}

		this.logger.success(`Completed smart pull from Notion - ${successful} successful, ${failed} failed`);
	}

	async uploadToNotion() {
		this.logger.info('Starting smart upload to Notion...');
		
		// First, detect and clean up deleted files from Notion
		await this.cleanupDeletedFiles();
		
		// Get all markdown files and filter for ones that need uploading
		const markdownFiles = this.app.vault.getMarkdownFiles();
		const filesToUpload = await this.filterFilesForUpload(markdownFiles);
		
		if (filesToUpload.length === 0) {
			this.logger.info('No files need uploading - all up to date!');
			return;
		}
		
		this.logger.info(`Found ${filesToUpload.length} files that need uploading (out of ${markdownFiles.length} total)`);
		
		let successful = 0;
		let failed = 0;
		const errors: string[] = [];

		// Process files in batches to avoid overwhelming the API
		const batchSize = 5;
		
		for (let i = 0; i < filesToUpload.length; i += batchSize) {
			const batch = filesToUpload.slice(i, i + batchSize);
			
			const batchPromises = batch.map(file => this.uploadSingleFile(file));
			const results = await Promise.allSettled(batchPromises);
			
			// Process results
			for (const result of results) {
				if (result.status === 'fulfilled') {
					const syncResult = result.value;
					if (syncResult.success) {
						successful++;
					} else {
						failed++;
						errors.push(`${syncResult.fileName}: ${syncResult.error}`);
					}
				} else {
					failed++;
					errors.push(`Unexpected error: ${result.reason}`);
				}
			}
			
			// Small delay between batches
			if (i + batchSize < filesToUpload.length) {
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		}
		
		this.logger.success(`Completed smart upload to Notion - ${successful} successful, ${failed} failed`);
		
		if (errors.length > 0) {
			this.logger.error('Upload errors:', errors);
		}
	}

	private async uploadSingleFile(file: TFile): Promise<{ success: boolean; fileName: string; error?: string }> {
		try {
			// Read file content
			const markdown = await this.app.vault.read(file);
			
			// Parse frontmatter and content
			const { frontmatter, content } = this.markdownConverter.parseMarkdownWithFrontmatter(markdown);
			
			// Convert content to Notion blocks
			const blocks = this.markdownConverter.markdownToNotionBlocks(content);
			
			// Create title with file path for uniqueness
			const title = `${file.path}:${file.basename}`;
			
			// Check if page already exists
			const existingNotionId = frontmatter.notionID;
			
			let notionId: string;
			
			if (existingNotionId) {
				// Update existing page
				await this.notionAPI.updatePage(existingNotionId, title);
				await this.notionAPI.clearPageBlocks(existingNotionId);
				await this.notionAPI.appendBlocks(existingNotionId, blocks);
				notionId = existingNotionId;
				this.logger.info(`Updated existing page: ${file.name}`);
			} else {
				// Create new page
				notionId = await this.notionAPI.createPage(
					this.settings.databaseID,
					title,
					blocks
				);
				this.logger.info(`Created new page: ${file.name}`);
			}
			
			// Update file with Notion metadata
			await this.updateFileMetadata(file, notionId, frontmatter);
			
			return {
				success: true,
				fileName: file.name
			};
			
		} catch (error) {
			this.logger.error(`Failed to upload ${file.name}: ${error.message}`);
			
			return {
				success: false,
				fileName: file.name,
				error: error.message || 'Unknown error occurred'
			};
		}
	}

	private async updateFileMetadata(file: TFile, notionId: string, existingFrontmatter: any): Promise<void> {
		try {
			const markdown = await this.app.vault.read(file);
			const { content } = this.markdownConverter.parseMarkdownWithFrontmatter(markdown);
			
			// Calculate content hash for change detection
			const contentHash = this.calculateContentHash(content);
			
			// Update frontmatter
			const updatedFrontmatter = {
				...existingFrontmatter,
				notionID: notionId,
				link: `https://www.notion.so/${notionId.replace(/-/g, '')}`,
				lastSync: new Date().toISOString(),
				filePath: file.path,
				contentHash: contentHash
			};
			
			// Reconstruct the file with updated frontmatter
			const yamlHeader = this.stringifyYaml(updatedFrontmatter).trim();
			const newContent = `---\n${yamlHeader}\n---\n${content}`;
			
			await this.app.vault.modify(file, newContent);
		} catch (error) {
			// Silent fail for metadata updates
			this.logger.warn(`Failed to update metadata for ${file.name}: ${error.message}`);
		}
	}

	private async filterFilesForUpload(files: TFile[]): Promise<TFile[]> {
		const filesToUpload: TFile[] = [];
		
		for (const file of files) {
			try {
				const content = await this.app.vault.read(file);
				const { frontmatter, content: markdownContent } = this.markdownConverter.parseMarkdownWithFrontmatter(content);
				
				const currentContentHash = this.calculateContentHash(markdownContent);
				
				// Check if file needs uploading
				if (!frontmatter.notionID) {
					// New file - needs uploading
					filesToUpload.push(file);
					this.logger.debug(`${file.name}: New file, needs upload`);
				} else if (frontmatter.contentHash !== currentContentHash) {
					// Content changed - needs uploading
					filesToUpload.push(file);
					this.logger.debug(`${file.name}: Content changed, needs upload`);
				} else if (frontmatter.filePath !== file.path) {
					// File moved/renamed - needs uploading to update title
					filesToUpload.push(file);
					this.logger.debug(`${file.name}: Path changed, needs upload`);
				} else {
					// File is up to date
					this.logger.debug(`${file.name}: Up to date, skipping`);
				}
			} catch (error) {
				// If we can't read the file, skip it
				this.logger.warn(`Cannot read ${file.name}, skipping`);
			}
		}
		
		return filesToUpload;
	}

	private calculateContentHash(content: string): string {
		// Simple hash function for content comparison
		let hash = 0;
		for (let i = 0; i < content.length; i++) {
			const char = content.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return hash.toString();
	}

	private async filterFilesForDownload(files: TFile[]): Promise<{file: TFile, notionId: string, notionContent: string}[]> {
		const filesToDownload: {file: TFile, notionId: string, notionContent: string}[] = [];
		
		for (const file of files) {
			try {
				const content = await this.app.vault.read(file);
				const { frontmatter, content: localContent } = this.markdownConverter.parseMarkdownWithFrontmatter(content);
				
				// Skip files that aren't synced to Notion
				if (!frontmatter.notionID) {
					continue;
				}
				
				// Get Notion content
				const notionBlocks = await this.notionAPI.getPageBlocks(frontmatter.notionID);
				const notionContent = await this.markdownConverter.notionBlocksToMarkdown(notionBlocks);
				
				const localContentHash = this.calculateContentHash(localContent);
				const notionContentHash = this.calculateContentHash(notionContent);
				
				// Check if Notion content is different from local
				if (frontmatter.contentHash !== notionContentHash && localContentHash !== notionContentHash) {
					// Notion has different content than what we last synced, and it's different from current local content
					filesToDownload.push({
						file,
						notionId: frontmatter.notionID,
						notionContent
					});
					this.logger.debug(`${file.name}: Notion content changed, needs download`);
				} else {
					this.logger.debug(`${file.name}: Up to date, skipping`);
				}
			} catch (error) {
				// If we can't read the file or Notion page, skip it
				this.logger.warn(`Cannot check ${file.name} for updates: ${error.message}`);
			}
		}
		
		return filesToDownload;
	}



	private async cleanupDeletedFiles(): Promise<void> {
		this.logger.info('Checking for deleted files to clean up from Notion...');
		
		// Get all current markdown files and their Notion IDs
		const currentFiles = this.app.vault.getMarkdownFiles();
		const currentNotionIds = new Set<string>();
		
		// Build a set of all Notion IDs that still exist locally
		for (const file of currentFiles) {
			try {
				const content = await this.app.vault.read(file);
				const { frontmatter } = this.markdownConverter.parseMarkdownWithFrontmatter(content);
				
				if (frontmatter.notionID) {
					currentNotionIds.add(frontmatter.notionID);
				}
			} catch (error) {
				// Skip files that can't be read
				continue;
			}
		}
		
		// Get all pages from Notion database to find orphaned pages
		try {
			const allNotionPages = await this.notionAPI.queryDatabase(this.settings.databaseID);
			const pagesToDelete: { title: string; notionId: string }[] = [];
			
			for (const page of allNotionPages) {
				const notionId = page.id;
				
				// If this Notion page ID is not found in any local file, it's orphaned
				if (!currentNotionIds.has(notionId)) {
					const title = page.properties?.Name?.title?.[0]?.text?.content || 'Unknown';
					pagesToDelete.push({
						title,
						notionId
					});
				}
			}
			
			// Delete orphaned pages from Notion
			if (pagesToDelete.length > 0) {
				this.logger.info(`Found ${pagesToDelete.length} orphaned pages to remove from Notion`);
				
				for (const { title, notionId } of pagesToDelete) {
					try {
						await this.notionAPI.deletePage(notionId);
						this.logger.info(`Deleted orphaned Notion page: ${title}`);
					} catch (error) {
						this.logger.error(`Failed to delete Notion page ${title}: ${error.message}`);
					}
				}
			} else {
				this.logger.info('No orphaned pages found to clean up');
			}
			
		} catch (error) {
			this.logger.error(`Failed to check for deleted files: ${error.message}`);
		}
	}

	private showPullConfirmation(): Promise<boolean> {
		return new Promise((resolve) => {
			new PullConfirmModal(this.app, resolve).open();
		});
	}

	// Startup conflict check disabled - using manual sync only

	private stringifyYaml(obj: any): string {
		// Simple YAML stringifier
		const lines: string[] = [];
		for (const [key, value] of Object.entries(obj)) {
			if (Array.isArray(value)) {
				lines.push(`${key}:`);
				value.forEach((item: any) => lines.push(`  - ${item}`));
			} else {
				lines.push(`${key}: ${value}`);
			}
		}
		return lines.join('\n');
	}
}

class SyncModal extends Modal {
	private message: string;

	constructor(app: App, message: string) {
		super(app);
		this.message = message;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Sync in Progress' });
		contentEl.createEl('p', { text: this.message });
		contentEl.createEl('p', { text: 'This dialog will close automatically when complete.' });
		
		// Add a simple spinner
		const spinner = contentEl.createEl('div', { cls: 'obsidotion-spinner' });
		spinner.innerHTML = '⟳';
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class ObsidotionSettingTab extends PluginSettingTab {
	plugin: ObsidotionPlugin;

	constructor(app: App, plugin: ObsidotionPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// API Token Setting
		new Setting(containerEl)
			.setName('Notion API Token')
			.addText(text => text
				.setPlaceholder('Notion API Token')
				.setValue(this.plugin.settings.notionAPIToken)
				.onChange(async (value) => {
					this.plugin.settings.notionAPIToken = value;
					await this.plugin.saveSettings();
				}));

		// Database ID Setting
		new Setting(containerEl)
			.setName('Database ID')
			.addText(text => text
				.setPlaceholder('Database ID')
				.setValue(this.plugin.settings.databaseID)
				.onChange(async (value) => {
					this.plugin.settings.databaseID = value;
					await this.plugin.saveSettings();
				}));
	}
}

class PullConfirmModal extends Modal {
	private resolve: (value: boolean) => void;

	constructor(app: App, resolve: (value: boolean) => void) {
		super(app);
		this.resolve = resolve;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		
		contentEl.createEl('h2', { text: 'Replace local files?' });
		contentEl.createEl('p', { text: 'This will replace all synced files with content from Notion.' });
		contentEl.createEl('p', { text: 'Your local changes will be overwritten.' });
		
		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
		buttonContainer.style.display = 'flex';
		buttonContainer.style.gap = '10px';
		buttonContainer.style.marginTop = '20px';
		
		const yesBtn = buttonContainer.createEl('button', { text: 'Yes, Replace' });
		yesBtn.style.backgroundColor = '#e74c3c';
		yesBtn.style.color = 'white';
		yesBtn.style.border = 'none';
		yesBtn.style.padding = '10px 20px';
		yesBtn.style.borderRadius = '5px';
		yesBtn.style.cursor = 'pointer';
		yesBtn.onclick = () => {
			this.resolve(true);
			this.close();
		};
		
		const noBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		noBtn.style.backgroundColor = '#95a5a6';
		noBtn.style.color = 'white';
		noBtn.style.border = 'none';
		noBtn.style.padding = '10px 20px';
		noBtn.style.borderRadius = '5px';
		noBtn.style.cursor = 'pointer';
		noBtn.onclick = () => {
			this.resolve(false);
			this.close();
		};
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// StartupConflictsModal removed - using manual sync only 