import { TFile, normalizePath, stringifyYaml } from 'obsidian';
import { NotionAPIService } from './notion-api';
import { MarkdownConverter } from './markdown-converter';
import { Logger } from '../utils/logger';
import { Validator } from '../utils/validator';
import { SyncResult, SyncStats, NotionPage } from '../types';

export class DownloadService {
	private notionAPI: NotionAPIService;
	private markdownConverter: MarkdownConverter;
	private logger: Logger;

	constructor(notionAPI: NotionAPIService, markdownConverter: MarkdownConverter, logger: Logger) {
		this.notionAPI = notionAPI;
		this.markdownConverter = markdownConverter;
		this.logger = logger;
	}

	async downloadAllPages(app: any, databaseId: string): Promise<SyncStats> {
		try {
			this.logger.info('Starting download from Notion database');
			
			// Fetch all pages from database
			const pages = await this.notionAPI.queryDatabase(databaseId);
			
			const stats: SyncStats = {
				totalFiles: pages.length,
				successful: 0,
				failed: 0,
				errors: []
			};

			// Process pages in batches
			const batchSize = 5;
			
			for (let i = 0; i < pages.length; i += batchSize) {
				const batch = pages.slice(i, i + batchSize);
				
				this.logger.info(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(pages.length / batchSize)}`);
				
				const batchPromises = batch.map(page => this.downloadPage(page, app));
				const results = await Promise.all(batchPromises.map(p => p.catch(e => ({ success: false, error: e.message }))));
				
				// Process results
				for (const result of results) {
					if (result.success) {
						stats.successful++;
					} else {
						stats.failed++;
						stats.errors.push(result.error || 'Unknown error');
					}
				}
				
				// Small delay between batches
				if (i + batchSize < pages.length) {
					await new Promise(resolve => setTimeout(resolve, 1000));
				}
			}

			this.logger.info(`Download completed. Success: ${stats.successful}, Failed: ${stats.failed}`);
			return stats;
			
		} catch (error) {
			this.logger.error('Failed to download pages from Notion', error);
			throw error;
		}
	}

	async downloadPage(page: NotionPage, app: any): Promise<SyncResult> {
		try {
			// Extract title and validate
			const titleProperty = page.properties.Name;
			if (!titleProperty?.title?.[0]?.text?.content) {
				throw new Error('Page has no valid title');
			}

			const fullTitle = titleProperty.title[0].text.content;
			const separatorIndex = fullTitle.lastIndexOf(':');
			
			if (separatorIndex === -1) {
				throw new Error('Page title does not contain path separator');
			}

			const filePath = fullTitle.substring(0, separatorIndex);
			const fileName = fullTitle.substring(separatorIndex + 1);
			
			// Validate file path
			if (!Validator.validateFilePath(filePath)) {
				throw new Error(`Invalid file path: ${filePath}`);
			}

			this.logger.info(`Downloading page: ${fileName}`);

			// Get page blocks
			const blocks = await this.notionAPI.getPageBlocks(page.id);
			
			// Convert blocks to markdown
			const content = await this.markdownConverter.notionBlocksToMarkdown(blocks);
			
			// Create frontmatter
			const frontmatter = {
				notionID: page.id,
				link: `https://www.notion.so/${page.id.replace(/-/g, '')}`,
				lastSync: new Date().toISOString(),
				filePath: filePath
			};
			
			// Create full file content
			const yamlHeader = stringifyYaml(frontmatter).trim();
			const fileContent = `---\n${yamlHeader}\n---\n${content}`;
			
			// Ensure directory exists
			const normalizedPath = normalizePath(filePath);
			const dirPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
			
			if (dirPath && !(await app.vault.adapter.exists(dirPath))) {
				await app.vault.adapter.mkdir(dirPath);
			}
			
			// Create or update file
			const existingFile = app.vault.getAbstractFileByPath(normalizedPath);
			
			if (existingFile && existingFile instanceof TFile) {
				await app.vault.modify(existingFile, fileContent);
				this.logger.success(`Updated file: ${normalizedPath}`);
			} else {
				await app.vault.create(normalizedPath, fileContent);
				this.logger.success(`Created file: ${normalizedPath}`);
			}
			
			return {
				success: true,
				fileName: fileName,
				notionId: page.id,
				operation: 'download'
			};
			
		} catch (error) {
			this.logger.error(`Failed to download page`, error);
			return {
				success: false,
				fileName: 'unknown',
				error: error.message,
				operation: 'download'
			};
		}
	}

	async downloadSinglePage(pageId: string, app: any): Promise<SyncResult> {
		try {
			// This would require implementing a way to get a single page
			// For now, we'll use the existing bulk download and filter
			throw new Error('Single page download not yet implemented');
		} catch (error) {
			return {
				success: false,
				fileName: 'unknown',
				error: error.message,
				operation: 'download'
			};
		}
	}
} 