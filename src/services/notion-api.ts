import { requestUrl } from 'obsidian';
import { NotionPage, NotionBlock } from '../types';
import { Logger } from '../utils/logger';
import { Validator } from '../utils/validator';

export class NotionAPIService {
	private apiToken: string;
	private apiVersion: string = '2022-06-28';
	private baseUrl: string = 'https://api.notion.com/v1';
	private logger: Logger;
	private rateLimitDelay: number = 100; // ms between requests

	constructor(apiToken: string, logger: Logger) {
		this.apiToken = apiToken;
		this.logger = logger;
	}

	private async makeRequest(url: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: any) {
		const headers = {
			'Authorization': `Bearer ${this.apiToken}`,
			'Notion-Version': this.apiVersion,
			'Content-Type': 'application/json',
		};

		try {
			// Add small delay to respect rate limits
			await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));

			const response = await requestUrl({
				url,
				method,
				headers,
				body: body ? JSON.stringify(body) : undefined,
			});

			// Check for error status codes
			if (response.status >= 400) {
				let errorMessage = 'Unknown error';
				let errorDetails: any = {};
				
				// Log the raw response for debugging
				this.logger.error(`Raw error response:`, {
					status: response.status,
					headers: response.headers,
					text: response.text,
					json: response.json,
					arrayBuffer: response.arrayBuffer
				});
				
				try {
					// Parse the error response - try different methods
					if (response.json) {
						errorDetails = response.json;
						errorMessage = errorDetails.message || errorDetails.object || 'API Error';
					} else if (response.text) {
						// Try to parse text as JSON
						try {
							errorDetails = JSON.parse(response.text);
							errorMessage = errorDetails.message || errorDetails.object || 'API Error';
						} catch (textParseError) {
							errorMessage = response.text;
						}
					}
					
					// Log full error details
					this.logger.error(`Notion API Error Details:`, {
						status: response.status,
						message: errorMessage,
						code: errorDetails.code,
						details: errorDetails
					});
				} catch (parseError) {
					this.logger.error(`Could not parse error response:`, parseError);
				}
				
				throw new Error(`Request failed, status ${response.status}: ${errorMessage}`);
			}

			if (!Validator.isValidNotionResponse(response)) {
				throw new Error('Invalid response from Notion API');
			}

			return response;
		} catch (error) {
			this.logger.error(`API request failed: ${method} ${url}`, error);
			throw error;
		}
	}

	async createPage(databaseId: string, title: string, blocks: any[]): Promise<string> {
		// First check what properties are available in the database
		let schema;
		try {
			schema = await this.getDatabaseSchema(databaseId);
		} catch (error) {
			this.logger.warn('Could not fetch database schema, proceeding with default properties');
		}

		// Build properties object based on available schema
		const properties: any = {};
		
		// Handle title property
		if (schema?.properties?.Name?.type === 'title') {
			properties.Name = { title: [{ text: { content: title } }] };
		} else if (schema?.properties?.Title?.type === 'title') {
			properties.Title = { title: [{ text: { content: title } }] };
		} else {
			// Find the title property dynamically
			const titleProperty = Object.entries(schema?.properties || {})
				.find(([name, prop]: [string, any]) => prop.type === 'title');
			
			if (titleProperty) {
				const [titlePropName] = titleProperty;
				properties[titlePropName] = { title: [{ text: { content: title } }] };
			} else {
				// Fallback
				properties.Name = { title: [{ text: { content: title } }] };
			}
		}

		const body = {
			parent: { database_id: databaseId },
			properties,
			children: blocks,
		};

		const response = await this.makeRequest(`${this.baseUrl}/pages`, 'POST', body);
		
		if (response.status === 200 && response.json?.id) {
			return response.json.id;
		} else {
			throw new Error(`Failed to create page: ${response.status}`);
		}
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

		const properties: any = {};
		
		// Handle title property
		if (schema?.properties?.Name?.type === 'title') {
			properties.Name = { title: [{ text: { content: title } }] };
		} else if (schema?.properties?.Title?.type === 'title') {
			properties.Title = { title: [{ text: { content: title } }] };
		} else {
			// Find the title property dynamically or fallback
			const titleProperty = Object.entries(schema?.properties || {})
				.find(([name, prop]: [string, any]) => prop.type === 'title');
			
			if (titleProperty) {
				const [titlePropName] = titleProperty;
				properties[titlePropName] = { title: [{ text: { content: title } }] };
			} else {
				properties.Name = { title: [{ text: { content: title } }] };
			}
		}

		const body = { properties };

		const response = await this.makeRequest(`${this.baseUrl}/pages/${pageId}`, 'PATCH', body);
		
		if (response.status !== 200) {
			throw new Error(`Failed to update page: ${response.status}`);
		}
	}

	async getPageBlocks(pageId: string): Promise<NotionBlock[]> {
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

		return allBlocks;
	}

	async deleteBlock(blockId: string): Promise<void> {
		const response = await this.makeRequest(`${this.baseUrl}/blocks/${blockId}`, 'DELETE');
		
		if (response.status !== 200) {
			throw new Error(`Failed to delete block: ${response.status}`);
		}
	}

	async appendBlocks(parentId: string, blocks: any[]): Promise<void> {
		// Append blocks in smaller batches to avoid API limits
		const batchSize = 10;
		
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
		const blocks = await this.getPageBlocks(pageId);
		
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