import { PluginSettings } from '../types';

export class Validator {
	static validateSettings(settings: PluginSettings): { isValid: boolean; errors: string[] } {
		const errors: string[] = [];

		if (!settings.notionAPIToken || settings.notionAPIToken.trim() === '') {
			errors.push('Notion API token is required');
		}

		if (!settings.databaseID || settings.databaseID.trim() === '') {
			errors.push('Database ID is required');
		}

		return {
			isValid: errors.length === 0,
			errors
		};
	}

	static isValidNotionResponse(response: any): boolean {
		return response && typeof response === 'object' && response.status !== undefined;
	}

	static isValidNotionPage(page: any): boolean {
		return page && 
			   page.id && 
			   page.properties && 
			   page.properties.Name && 
			   page.properties.Name.title && 
			   Array.isArray(page.properties.Name.title);
	}

	static validateFilePath(filePath: string): boolean {
		// Check for invalid characters and ensure it's a markdown file
		const invalidChars = /[<>:"|?*]/;
		return !invalidChars.test(filePath) && filePath.endsWith('.md');
	}

	static sanitizeFileName(fileName: string): string {
		// Remove or replace invalid characters
		return fileName
			.replace(/[<>:"|?*]/g, '_')
			.replace(/\s+/g, ' ')
			.trim();
	}
} 