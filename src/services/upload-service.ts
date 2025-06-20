import { TFile, stringifyYaml } from 'obsidian';
import { NotionAPIService } from './notion-api';
import { MarkdownConverter } from './markdown-converter';
import { Logger } from '../utils/logger';
import { Validator } from '../utils/validator';
import { SyncResult, SyncStats } from '../types';

export class UploadService {
	private notionAPI: NotionAPIService;
	private markdownConverter: MarkdownConverter;
	private logger: Logger;

	constructor(notionAPI: NotionAPIService, markdownConverter: MarkdownConverter, logger: Logger) {
		this.notionAPI = notionAPI;
		this.markdownConverter = markdownConverter;
		this.logger = logger;
	}

	async uploadFile(file: TFile, app: any): Promise<SyncResult> {
		try {
			// Read file content
			const markdown = await app.vault.read(file);
			const metadata = app.metadataCache.getFileCache(file);
			
			// Parse frontmatter and content
			const { frontmatter, content } = this.markdownConverter.parseMarkdownWithFrontmatter(markdown);
			
			// Convert content to Notion blocks
			const blocks = this.markdownConverter.markdownToNotionBlocks(content);
			
			// Create title with file path for uniqueness
			const title = `${file.path}:${file.basename}`;
			
			// Check if page already exists
			const existingNotionId = frontmatter.notionID;
			
			// Check if we have the database ID
			if (!app.plugin?.settings?.databaseID) {
				throw new Error('Database ID not configured in plugin settings');
			}
			
			let notionId: string;
			
			if (existingNotionId) {
				// Update existing page
				await this.notionAPI.updatePage(existingNotionId, title);
				await this.notionAPI.clearPageBlocks(existingNotionId);
				await this.notionAPI.appendBlocks(existingNotionId, blocks);
				notionId = existingNotionId;
			} else {
				// Create new page
				notionId = await this.notionAPI.createPage(
					app.plugin.settings.databaseID,
					title,
					blocks
				);
			}
			
			// Update file with Notion metadata
			await this.updateFileMetadata(file, notionId, frontmatter, app);
			
			return {
				success: true,
				fileName: file.name,
				notionId,
				operation: existingNotionId ? 'update' : 'create'
			};
			
		} catch (error) {
			this.logger.error(`Failed to upload ${file.name}: ${error.message}`);
			
			return {
				success: false,
				fileName: file.name,
				error: error.message || 'Unknown error occurred',
				operation: 'create'
			};
		}
	}

	async uploadAllFiles(files: TFile[], app: any): Promise<SyncStats> {
		const stats: SyncStats = {
			totalFiles: files.length,
			successful: 0,
			failed: 0,
			errors: []
		};

		// Process files in batches to avoid overwhelming the API
		const batchSize = 5;
		
		for (let i = 0; i < files.length; i += batchSize) {
			const batch = files.slice(i, i + batchSize);
			
			const batchPromises = batch.map(file => this.uploadFile(file, app));
			const results = await Promise.allSettled(batchPromises);
			
			// Process results
			for (const result of results) {
				if (result.status === 'fulfilled') {
					const syncResult = result.value;
					if (syncResult.success) {
						stats.successful++;
					} else {
						stats.failed++;
						stats.errors.push(`${syncResult.fileName}: ${syncResult.error}`);
					}
				} else {
					stats.failed++;
					stats.errors.push(`Unexpected error: ${result.reason}`);
				}
			}
			
			// Small delay between batches
			if (i + batchSize < files.length) {
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		}

		return stats;
	}

	private async updateFileMetadata(file: TFile, notionId: string, existingFrontmatter: any, app: any): Promise<void> {
		try {
			const markdown = await app.vault.read(file);
			const { content } = this.markdownConverter.parseMarkdownWithFrontmatter(markdown);
			
			// Update frontmatter
			const updatedFrontmatter = {
				...existingFrontmatter,
				notionID: notionId,
				link: `https://www.notion.so/${notionId.replace(/-/g, '')}`,
				lastSync: new Date().toISOString(),
				filePath: file.path
			};
			
			// Reconstruct the file with updated frontmatter
			const yamlHeader = stringifyYaml(updatedFrontmatter).trim();
			const newContent = `---\n${yamlHeader}\n---\n${content}`;
			
			await app.vault.modify(file, newContent);
		} catch (error) {
			// Silent fail for metadata updates
		}
	}


} 