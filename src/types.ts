export interface PluginSettings {
	notionAPIToken: string;
	databaseID: string;
	/** Notion pages this plugin created or pulled for this vault. Only these are ever archived. */
	ownedPageIds: string[];
}

export interface NotionPage {
	id: string;
	archived?: boolean;
	properties: Record<string, any>;
}

export interface NotionBlock {
	id: string;
	type: string;
	has_children: boolean;
	/** Child blocks, filled in by NotionAPIService.getPageBlocks. */
	children?: NotionBlock[];
	[key: string]: any;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	notionAPIToken: '',
	databaseID: '',
	ownedPageIds: [],
};
