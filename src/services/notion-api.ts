import { requestUrl } from 'obsidian';
import { NotionPage, NotionBlock } from '../types';
import { Logger } from '../utils/logger';
import { Validator } from '../utils/validator';

export class NotionAPIService {
	private apiToken: string;
	private apiVersion: string = '2022-06-28';
	private baseUrl: string = 'https://api.notion.com/v1';
	private logger: Logger;

	constructor(apiToken: string, logger: Logger) {
		this.apiToken = apiToken;
		this.logger = logger;
	}

	/** Wait between requests. Notion allows about 3 requests per second. */
	static rateLimitDelay = 350;
	/** Notion accepts at most 100 child blocks per request. */
	static readonly MAX_BLOCKS_PER_REQUEST = 100;

	private async makeRequest(url: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: any) {
		const headers = {
			'Authorization': `Bearer ${this.apiToken}`,
			'Notion-Version': this.apiVersion,
			'Content-Type': 'application/json',
		};

		for (let attempt = 0; ; attempt++) {
			await new Promise(resolve => setTimeout(resolve, NotionAPIService.rateLimitDelay));

			// throw: false so we can read Notion's error message instead of a generic one.
			const response = await requestUrl({
				url,
				method,
				headers,
				body: body ? JSON.stringify(body) : undefined,
				throw: false,
			});

			// Rate limited: wait as long as Notion asks, then try again (a few times).
			if (response.status === 429 && attempt < 3) {
				const header = response.headers?.['retry-after'] ?? response.headers?.['Retry-After'];
				const retryAfter = header !== undefined && Number.isFinite(Number(header)) ? Number(header) : 1;
				await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
				continue;
			}

			if (response.status >= 400) {
				let message = `HTTP ${response.status}`;
				try {
					message = response.json?.message || response.text || message;
				} catch {
					// body was not JSON
				}
				this.logger.warn(`Notion API ${method} ${url} failed: ${message}`);
				throw new Error(`Notion: ${message}`);
			}

			if (!Validator.isValidNotionResponse(response)) {
				throw new Error('Invalid response from Notion API');
			}

			return response;
		}
	}

	/** The title text of a database page, whatever its title property is called. */
	static getPageTitle(page: NotionPage): string {
		const titleProp: any = Object.values(page.properties || {})
			.find((prop: any) => prop?.type === 'title' || Array.isArray(prop?.title));
		return (titleProp?.title || []).map((t: any) => t.plain_text ?? t.text?.content ?? '').join('');
	}

	private titleProperties(schema: any, title: string): any {
		const name = Object.entries(schema?.properties || {})
			.find(([, prop]: [string, any]) => prop.type === 'title')?.[0] || 'Name';
		return { [name]: { title: [{ text: { content: title } }] } };
	}

	async createPage(databaseId: string, title: string, blocks: any[]): Promise<string> {
		// First check what properties are available in the database
		let schema;
		try {
			schema = await this.getDatabaseSchema(databaseId);
		} catch (error) {
			this.logger.warn('Could not fetch database schema, proceeding with default properties');
		}

		const properties = this.titleProperties(schema, title);

		const body = {
			parent: { database_id: databaseId },
			properties,
			children: blocks.slice(0, NotionAPIService.MAX_BLOCKS_PER_REQUEST),
		};

		const response = await this.makeRequest(`${this.baseUrl}/pages`, 'POST', body);
		const pageId = response.json?.id;
		if (!pageId) {
			throw new Error(`Failed to create page: ${response.status}`);
		}
		// The rest of a long note goes in separate requests.
		await this.appendBlocks(pageId, blocks.slice(NotionAPIService.MAX_BLOCKS_PER_REQUEST));
		return pageId;
	}

	async updatePage(pageId: string, title: string): Promise<void> {
		// Get the database schema to determine the correct property names
		let schema;
		try {
			// We need to get the page first to find its database
			const pageResponse = await this.makeRequest(`${this.baseUrl}/pages/${pageId}`, 'GET');
			const databaseId = pageResponse.json?.parent?.database_id;
			if (databaseId) {
				schema = await this.getDatabaseSchema(databaseId);
			}
		} catch (error) {
			this.logger.warn('Could not fetch schema for update, using defaults');
		}

		const properties = this.titleProperties(schema, title);

		const body = { properties };

		const response = await this.makeRequest(`${this.baseUrl}/pages/${pageId}`, 'PATCH', body);
		
		if (response.status !== 200) {
			throw new Error(`Failed to update page: ${response.status}`);
		}
	}

	/** All blocks of a page. With deep = true, nested blocks (sub-lists, table rows) are put in block.children. */
	async getPageBlocks(pageId: string, deep: boolean = true): Promise<NotionBlock[]> {
		let allBlocks: NotionBlock[] = [];
		let cursor: string | undefined = undefined;

		do {
			const url = `${this.baseUrl}/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`;
			const response = await this.makeRequest(url, 'GET');

			if (response.status === 200 && response.json?.results) {
				allBlocks = allBlocks.concat(response.json.results);
				cursor = response.json.next_cursor;
			} else {
				throw new Error(`Failed to get page blocks: ${response.status}`);
			}
		} while (cursor);

		if (deep) {
			for (const block of allBlocks) {
				if (block.has_children && block.type !== 'child_page' && block.type !== 'child_database') {
					block.children = await this.getPageBlocks(block.id, true);
				}
			}
		}

		return allBlocks;
	}

	async deleteBlock(blockId: string): Promise<void> {
		const response = await this.makeRequest(`${this.baseUrl}/blocks/${blockId}`, 'DELETE');
		
		if (response.status !== 200) {
			throw new Error(`Failed to delete block: ${response.status}`);
		}
	}

	async appendBlocks(parentId: string, blocks: any[]): Promise<void> {
		const batchSize = NotionAPIService.MAX_BLOCKS_PER_REQUEST;
		
		for (let i = 0; i < blocks.length; i += batchSize) {
			const batch = blocks.slice(i, i + batchSize);
			const body = { children: batch };

			const response = await this.makeRequest(`${this.baseUrl}/blocks/${parentId}/children`, 'PATCH', body);
			
			if (response.status !== 200) {
				throw new Error(`Failed to append blocks: ${response.status}`);
			}
		}
	}

	async clearPageBlocks(pageId: string): Promise<void> {
		const blocks = await this.getPageBlocks(pageId, false);

		// Delete blocks in reverse order to avoid reference issues
		for (const block of blocks.reverse()) {
			await this.deleteBlock(block.id);
		}
	}

	async queryDatabase(databaseId: string): Promise<NotionPage[]> {
		let allPages: NotionPage[] = [];
		let cursor: string | undefined = undefined;

		do {
			const body: any = {};
			if (cursor) {
				body.start_cursor = cursor;
			}

			const response = await this.makeRequest(`${this.baseUrl}/databases/${databaseId}/query`, 'POST', body);

			if (response.status === 200 && response.json?.results) {
				const validPages = response.json.results.filter(Validator.isValidNotionPage);
				allPages = allPages.concat(validPages);
				cursor = response.json.next_cursor;
			} else {
				throw new Error(`Failed to query database: ${response.status}`);
			}
		} while (cursor);

		return allPages;
	}

	async getDatabaseSchema(databaseId: string): Promise<any> {
		const response = await this.makeRequest(`${this.baseUrl}/databases/${databaseId}`, 'GET');
		
		if (response.status === 200 && response.json) {
			return response.json;
		} else {
			throw new Error(`Failed to get database schema: ${response.status}`);
		}
	}

	async deletePage(pageId: string): Promise<void> {
		// Notion doesn't have a delete API, but we can archive the page
		const body = {
			archived: true
		};

		const response = await this.makeRequest(`${this.baseUrl}/pages/${pageId}`, 'PATCH', body);
		
		if (response.status !== 200) {
			throw new Error(`Failed to archive page: ${response.status}`);
		}
	}
} 