export interface PluginSettings {
	notionAPIToken: string;
	databaseID: string;
}

export interface NotionPage {
	id: string;
	properties: {
		Name: {
			title: Array<{
				text: {
					content: string;
				};
			}>;
		};
		Tags?: {
			multi_select: Array<{
				name: string;
			}>;
		};
	};
}

export interface NotionBlock {
	id: string;
	type: string;
	has_children: boolean;
	[key: string]: any;
}

export interface SyncResult {
	success: boolean;
	fileName: string;
	error?: string;
	notionId?: string;
	operation: 'create' | 'update' | 'download';
}

export interface SyncStats {
	totalFiles: number;
	successful: number;
	failed: number;
	errors: string[];
}

export const DEFAULT_SETTINGS: PluginSettings = {
	notionAPIToken: '',
	databaseID: '',
}; 