import { TFile, Notice, Modal, App } from 'obsidian';
import { NotionAPIService } from './notion-api';
import { MarkdownConverter } from './markdown-converter';
import { Logger } from '../utils/logger';
import { SyncStatusModal } from './sync-status-modal';

interface SyncOperation {
	type: 'upload' | 'download' | 'delete';
	file: TFile;
	data?: any;
	timestamp: number;
	retries: number;
}

interface SyncMetadata {
	notionId: string | null;
	lastSyncTime: number;
	localChecksum: string;
	notionChecksum: string;
}

interface NotionData {
	id: string;
	blocks: any[];
}

export class SyncManager {
	public app: App;
	public notionAPI: NotionAPIService;
	public markdownConverter: MarkdownConverter;
	public logger: Logger;
	public plugin: any;
	public syncQueue: SyncOperation[];
	public isOnline: boolean;
	public syncInProgress: Set<string>;
	public debounceTimers: Map<string, NodeJS.Timeout>;
	public statusBarEl: HTMLElement | null;
	public statusModal: SyncStatusModal;
	public fileNotionMap: Map<string, string>; // filePath -> notionId mapping
	public onlineHandler: () => void;
	public offlineHandler: () => void;

	constructor(app: App, notionAPI: NotionAPIService, markdownConverter: MarkdownConverter, logger: Logger, plugin: any) {
		this.app = app;
		this.notionAPI = notionAPI;
		this.markdownConverter = markdownConverter;
		this.logger = logger;
		this.plugin = plugin;
		this.syncQueue = [];
		this.isOnline = true;
		this.syncInProgress = new Set();
		this.debounceTimers = new Map();
		this.statusBarEl = null;
		this.statusModal = new SyncStatusModal(app);
		this.fileNotionMap = new Map();
		
		this.onlineHandler = () => {
			this.isOnline = true;
			this.updateStatus('syncing');
			this.processQueue();
		};

		this.offlineHandler = () => {
			this.isOnline = false;
			this.updateStatus('offline');
		};
		
		this.setupEventListeners();
		this.setupNetworkMonitoring();
		this.createStatusBar();
		this.buildFileNotionMap(); // Build initial mapping
	}

	setupEventListeners(): void {
		// All automatic sync operations are disabled
		// Deletions will be handled during manual upload
	}

	setupNetworkMonitoring(): void {
		window.addEventListener('online', this.onlineHandler);
		window.addEventListener('offline', this.offlineHandler);
	}

	createStatusBar(): void {
		this.statusBarEl = this.plugin.addStatusBarItem();
		if (this.statusBarEl) {
			this.statusBarEl.addClass('notion-sync-status');
			this.statusBarEl.title = 'Click to view sync status';
			this.statusBarEl.onclick = () => {
				this.statusModal.open();
			};
		}
		this.updateStatus('synced');
	}

	updateStatus(status: 'synced' | 'syncing' | 'offline' | 'conflicts'): void {
		const icons = {
			synced: '✅',
			syncing: '🔄',
			offline: '📡',
			conflicts: '⚠️'
		};
		
		if (this.statusBarEl) {
			// Use status modal data if available, otherwise use the passed status
			const modalStatus = this.statusModal.getCurrentStatus();
			
			if (modalStatus.hasOperations) {
				this.statusBarEl.setText(`${modalStatus.icon} ${modalStatus.text}`);
				if (modalStatus.pendingCount > 0) {
					this.statusBarEl.addClass('spinning-icon');
				} else {
					this.statusBarEl.removeClass('spinning-icon');
				}
			} else {
				this.statusBarEl.setText(`${icons[status]} Notion`);
				this.statusBarEl.removeClass('spinning-icon');
			}
		}
	}

	debounceFileSync(file: TFile): void {
		// Disabled: No automatic sync
	}

	async handleFileChange(file: TFile): Promise<void> {
		// Disabled: No automatic sync
	}

	async syncExistingFile(file: TFile, metadata: SyncMetadata): Promise<void> {
		// Disabled: No automatic sync
	}

	async resolveConflict(file: TFile, notionData: NotionData): Promise<void> {
		this.updateStatus('conflicts');
		
		const choice = await this.showConflictDialog(file, notionData);
		
		switch (choice) {
			case 'local':
				this.queueOperation('upload', file);
				break;
			case 'notion':
				this.queueOperation('download', file, notionData);
				break;
			case 'diff':
				await this.showDifferences(file, notionData);
				// After showing diff, ask again
				await this.resolveConflict(file, notionData);
				break;
			case 'skip':
				// Do nothing
				break;
		}
	}

	showConflictDialog(file: TFile, notionData: NotionData): Promise<string> {
		return new Promise((resolve) => {
			new ConflictModal(this.app, file, notionData, resolve).open();
		});
	}

	async showDifferences(file: TFile, notionData: NotionData): Promise<void> {
		const localContent = await this.app.vault.read(file);
		const notionContent = await this.convertNotionToMarkdown(notionData);
		
		new DiffModal(this.app, file.name, localContent, notionContent).open();
	}

	queueOperation(type: 'upload' | 'download' | 'delete', file: TFile, data?: any): void {
		const operation: SyncOperation = {
			type,
			file,
			data,
			timestamp: Date.now(),
			retries: 0
		};

		this.syncQueue.push(operation);
		
		if (this.isOnline) {
			this.processQueue();
		}
	}

	async processQueue(): Promise<void> {
		if (this.syncQueue.length === 0) {
			this.updateStatus('synced');
			return;
		}

		this.updateStatus('syncing');

		while (this.syncQueue.length > 0 && this.isOnline) {
			const operation = this.syncQueue.shift();
			
			if (!operation) continue;
			
			try {
				await this.executeOperation(operation);
			} catch (error) {
				if (this.isNetworkError(error)) {
					// Put operation back and stop processing
					this.syncQueue.unshift(operation);
					this.isOnline = false;
					this.updateStatus('offline');
					break;
				} else {
					// Non-network error - retry up to 3 times
					operation.retries = (operation.retries || 0) + 1;
					if (operation.retries < 3) {
						this.syncQueue.push(operation);
					} else {
						this.logger.error(`Failed to sync ${operation.file.name} after 3 retries: ${error.message}`);
					}
				}
			}
		}

		this.updateStatus(this.syncQueue.length > 0 ? 'offline' : 'synced');
		
		// Auto-cleanup completed operations when queue is done
		if (this.syncQueue.length === 0) {
			this.statusModal.cleanupOldOperations();
		}
	}

	async executeOperation(operation: SyncOperation): Promise<void> {
		const { type, file, data } = operation;
		
		this.syncInProgress.add(file.path);
		
		// Add to status modal
		this.statusModal.addOperation(type, file.name);
		this.statusModal.updateOperation(file.name, 'processing');
		this.updateStatus('syncing');

		try {
			switch (type) {
				case 'upload':
					await this.uploadFile(file);
					break;
				case 'download':
					await this.downloadFile(file, data);
					break;
				case 'delete':
					await this.deleteNotionPage(data.notionId);
					break;
			}
			
			// Mark as completed
			this.statusModal.updateOperation(file.name, 'completed');
			this.logger.info(`Successfully ${type}ed ${file.name}`);
		} catch (error) {
			// Mark as failed
			this.statusModal.updateOperation(file.name, 'failed', error.message);
			this.logger.error(`Failed to ${type} ${file.name}: ${error.message}`);
			throw error; // Re-throw so processQueue can handle retries
		} finally {
			this.syncInProgress.delete(file.path);
			this.updateStatus(this.syncQueue.length > 0 ? 'syncing' : 'synced');
		}
	}

	async uploadFile(file: TFile): Promise<void> {
		const markdown = await this.app.vault.read(file);
		const { frontmatter, content } = this.markdownConverter.parseMarkdownWithFrontmatter(markdown);
		
		const blocks = this.markdownConverter.markdownToNotionBlocks(content);
		const title = `${file.path}:${file.basename}`;

		let notionId: string;
		
		if (frontmatter.notionID) {
			// Update existing
			await this.notionAPI.updatePage(frontmatter.notionID, title);
			await this.notionAPI.clearPageBlocks(frontmatter.notionID);
			await this.notionAPI.appendBlocks(frontmatter.notionID, blocks);
			notionId = frontmatter.notionID;
		} else {
			// Create new
			notionId = await this.notionAPI.createPage(
				this.plugin.settings.databaseID,
				title,
				blocks
			);
		}

		// Update sync metadata
		await this.updateSyncMetadata(file, notionId);
		
		this.logger.success(`Synced ${file.name} to Notion`);
	}

	async downloadFile(file: TFile, notionData: NotionData): Promise<void> {
		const markdownContent = await this.convertNotionToMarkdown(notionData);
		await this.app.vault.modify(file, markdownContent);
		
		// Update sync metadata
		await this.updateSyncMetadata(file, notionData.id);
		
		this.logger.success(`Downloaded ${file.name} from Notion`);
	}

	async handleFileDeletion(file: TFile): Promise<void> {
		// Use the cached notionId since the file is already deleted
		const notionId = this.fileNotionMap.get(file.path);
		if (notionId) {
			this.logger.info(`File ${file.name} deleted locally. Notion ID: ${notionId}`);
			const choice = await this.showDeleteConfirmation(file);
			if (choice === 'delete') {
				this.queueOperation('delete', file, { notionId });
				// Remove from our cache
				this.fileNotionMap.delete(file.path);
			}
		} else {
			this.logger.info(`File ${file.name} deleted but no Notion ID found - nothing to delete from Notion`);
		}
	}

	showDeleteConfirmation(file: TFile): Promise<string> {
		return new Promise((resolve) => {
			new DeleteConfirmModal(this.app, file.name, resolve).open();
		});
	}

	async handleFileRename(file: TFile, oldPath: string): Promise<void> {
		// Update cache - remove old path and add new path
		const notionId = this.fileNotionMap.get(oldPath);
		if (notionId) {
			this.fileNotionMap.delete(oldPath);
			this.fileNotionMap.set(file.path, notionId);
			
			// Update Notion page title
			const newTitle = `${file.path}:${file.basename}`;
			await this.notionAPI.updatePage(notionId, newTitle);
		}
	}

	async handleNotionPageDeleted(file: TFile): Promise<void> {
		const choice = await this.showPageDeletedDialog(file);
		if (choice === 'remove') {
			await this.removeSyncMetadata(file);
		}
	}

	showPageDeletedDialog(file: TFile): Promise<string> {
		return new Promise((resolve) => {
			new PageDeletedModal(this.app, file.name, resolve).open();
		});
	}

	// Utility methods
	async getSyncMetadata(file: TFile): Promise<SyncMetadata> {
		const content = await this.app.vault.read(file);
		const { frontmatter } = this.markdownConverter.parseMarkdownWithFrontmatter(content);
		
		return {
			notionId: frontmatter.notionID || null,
			lastSyncTime: frontmatter.lastSync ? new Date(frontmatter.lastSync).getTime() : 0,
			localChecksum: frontmatter.localChecksum || '',
			notionChecksum: frontmatter.notionChecksum || ''
		};
	}

	async updateSyncMetadata(file: TFile, notionId: string): Promise<void> {
		const content = await this.app.vault.read(file);
		const { frontmatter, content: markdownContent } = this.markdownConverter.parseMarkdownWithFrontmatter(content);
		
		const currentHash = await this.getFileHash(file);
		const notionData = await this.getNotionPageData(notionId);
		const notionHash = this.getNotionContentHash(notionData);

		const updatedFrontmatter = {
			...frontmatter,
			notionID: notionId,
			lastSync: new Date().toISOString(),
			localChecksum: currentHash,
			notionChecksum: notionHash,
			link: `https://www.notion.so/${notionId.replace(/-/g, '')}`
		};

		const yamlHeader = this.stringifyYaml(updatedFrontmatter).trim();
		const newContent = `---\n${yamlHeader}\n---\n${markdownContent}`;
		
		await this.app.vault.modify(file, newContent);
		
		// Update our cache
		this.fileNotionMap.set(file.path, notionId);
	}

	async getFileHash(file: TFile): Promise<string> {
		const content = await this.app.vault.read(file);
		const { content: markdownContent } = this.markdownConverter.parseMarkdownWithFrontmatter(content);
		return this.simpleHash(markdownContent);
	}

	simpleHash(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return hash.toString();
	}

	async getNotionPageData(notionId: string): Promise<NotionData | null> {
		try {
			const blocks = await this.notionAPI.getPageBlocks(notionId);
			return { id: notionId, blocks };
		} catch (error) {
			return null; // Page probably deleted
		}
	}

	getNotionContentHash(notionData: NotionData | null): string {
		if (!notionData || !notionData.blocks) return '';
		const content = JSON.stringify(notionData.blocks);
		return this.simpleHash(content);
	}

	async convertNotionToMarkdown(notionData: NotionData): Promise<string> {
		// Convert Notion blocks back to markdown
		return await this.markdownConverter.notionBlocksToMarkdown(notionData.blocks);
	}



	async removeSyncMetadata(file: TFile): Promise<void> {
		const content = await this.app.vault.read(file);
		const { frontmatter, content: markdownContent } = this.markdownConverter.parseMarkdownWithFrontmatter(content);
		
		// Remove Notion-related metadata
		delete frontmatter.notionID;
		delete frontmatter.lastSync;
		delete frontmatter.localChecksum;
		delete frontmatter.notionChecksum;
		delete frontmatter.link;

		const yamlHeader = this.stringifyYaml(frontmatter).trim();
		const newContent = yamlHeader ? `---\n${yamlHeader}\n---\n${markdownContent}` : markdownContent;
		
		await this.app.vault.modify(file, newContent);
		
		// Remove from cache
		this.fileNotionMap.delete(file.path);
	}

	stringifyYaml(obj: any): string {
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

	isNetworkError(error: any): boolean {
		return error.message.includes('network') || 
			   error.message.includes('fetch') ||
			   error.message.includes('timeout') ||
			   error.code === 'ENOTFOUND';
	}

	async deleteNotionPage(notionId: string): Promise<void> {
		try {
			await this.notionAPI.deletePage(notionId);
			this.logger.info(`Successfully archived Notion page: ${notionId}`);
		} catch (error) {
			this.logger.error(`Failed to archive Notion page ${notionId}: ${error.message}`);
			throw error;
		}
	}

	// Startup sync check
	async performStartupSync(): Promise<void> {
		// Startup sync is now handled by the main plugin's checkStartupConflicts method
		// This method only builds the file-to-notion mapping for internal use
		await this.buildFileNotionMap();
	}

	async checkForNotionUpdates(files: TFile[]): Promise<void> {
		// Disabled: No automatic sync operations
		// All sync operations are now manual only
		this.logger.info('Automatic sync disabled - use manual sync buttons');
	}

	async buildFileNotionMap(): Promise<void> {
		// Build a mapping of file paths to Notion IDs by reading all markdown files
		const files = this.app.vault.getMarkdownFiles();
		
		for (const file of files) {
			try {
				const metadata = await this.getSyncMetadata(file);
				if (metadata.notionId) {
					this.fileNotionMap.set(file.path, metadata.notionId);
				}
			} catch (error) {
				// Skip files that can't be read
				continue;
			}
		}
		
		this.logger.info(`Built file-to-Notion mapping for ${this.fileNotionMap.size} files`);
	}

	destroy(): void {
		// Clean up timers
		this.debounceTimers.forEach(timer => clearTimeout(timer));
		this.debounceTimers.clear();
		
		// Remove event listeners
		window.removeEventListener('online', this.onlineHandler);
		window.removeEventListener('offline', this.offlineHandler);
		
		// Clear file mapping
		this.fileNotionMap.clear();
	}
}

// Modal classes for user interaction
class ConflictModal extends Modal {
	private file: TFile;
	private notionData: NotionData;
	private resolve: (value: string) => void;

	constructor(app: App, file: TFile, notionData: NotionData, resolve: (value: string) => void) {
		super(app);
		this.file = file;
		this.notionData = notionData;
		this.resolve = resolve;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		
		contentEl.createEl('h2', { text: `Sync Conflict: ${this.file.name}` });
		contentEl.createEl('p', { text: 'Both local and Notion versions have been modified. Choose how to resolve:' });
		
		const buttonContainer = contentEl.createDiv({ cls: 'conflict-buttons' });
		
		const localBtn = buttonContainer.createEl('button', { text: '📝 Keep Local (Upload)' });
		localBtn.onclick = () => {
			this.resolve('local');
			this.close();
		};
		
		const notionBtn = buttonContainer.createEl('button', { text: '☁️ Use Notion (Download)' });
		notionBtn.onclick = () => {
			this.resolve('notion');
			this.close();
		};
		
		const diffBtn = buttonContainer.createEl('button', { text: '🔍 Show Differences' });
		diffBtn.onclick = () => {
			this.resolve('diff');
			this.close();
		};
		
		const skipBtn = buttonContainer.createEl('button', { text: '⏭️ Skip This Time' });
		skipBtn.onclick = () => {
			this.resolve('skip');
			this.close();
		};
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class DiffModal extends Modal {
	private fileName: string;
	private localContent: string;
	private notionContent: string;

	constructor(app: App, fileName: string, localContent: string, notionContent: string) {
		super(app);
		this.fileName = fileName;
		this.localContent = localContent;
		this.notionContent = notionContent;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		
		contentEl.createEl('h2', { text: `Differences: ${this.fileName}` });
		
		const diffContainer = contentEl.createDiv({ cls: 'diff-container' });
		
		const localDiv = diffContainer.createDiv({ cls: 'diff-panel' });
		localDiv.createEl('h3', { text: 'Local Version' });
		localDiv.createEl('pre', { text: this.localContent });
		
		const notionDiv = diffContainer.createDiv({ cls: 'diff-panel' });
		notionDiv.createEl('h3', { text: 'Notion Version' });
		notionDiv.createEl('pre', { text: this.notionContent });
		
		const closeBtn = contentEl.createEl('button', { text: 'Close' });
		closeBtn.onclick = () => this.close();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class DeleteConfirmModal extends Modal {
	private fileName: string;
	private resolve: (value: string) => void;

	constructor(app: App, fileName: string, resolve: (value: string) => void) {
		super(app);
		this.fileName = fileName;
		this.resolve = resolve;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		
		contentEl.createEl('h2', { text: '🗑️ File Deleted Locally' });
		contentEl.createEl('p', { text: `You deleted "${this.fileName}" from Obsidian.` });
		contentEl.createEl('p', { text: 'What would you like to do with the corresponding page in Notion?' });
		
		const buttonContainer = contentEl.createDiv({ cls: 'delete-buttons' });
		
		const deleteBtn = buttonContainer.createEl('button', { text: '🗑️ Delete from Notion too' });
		deleteBtn.onclick = () => {
			this.resolve('delete');
			this.close();
		};
		
		const keepBtn = buttonContainer.createEl('button', { text: '📄 Keep in Notion' });
		keepBtn.onclick = () => {
			this.resolve('keep');
			this.close();
		};
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class PageDeletedModal extends Modal {
	private fileName: string;
	private resolve: (value: string) => void;

	constructor(app: App, fileName: string, resolve: (value: string) => void) {
		super(app);
		this.fileName = fileName;
		this.resolve = resolve;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		
		contentEl.createEl('h2', { text: 'Page Deleted in Notion' });
		contentEl.createEl('p', { text: `"${this.fileName}" was deleted from Notion. Remove sync metadata?` });
		
		const buttonContainer = contentEl.createDiv({ cls: 'page-deleted-buttons' });
		
		const removeBtn = buttonContainer.createEl('button', { text: '🔗 Remove Sync Metadata' });
		removeBtn.onclick = () => {
			this.resolve('remove');
			this.close();
		};
		
		const keepBtn = buttonContainer.createEl('button', { text: '📄 Keep Metadata' });
		keepBtn.onclick = () => {
			this.resolve('keep');
			this.close();
		};
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
} 