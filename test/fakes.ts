// In-memory Obsidian vault and an in-memory Notion API that answers requestUrl calls.
import { TFile, TFolder, setRequestHandler } from 'obsidian';

export class FakeVault {
	files = new Map<string, string>();
	folders = new Set<string>();
	unreadable = new Set<string>();

	constructor(initial: Record<string, string> = {}) {
		for (const [path, text] of Object.entries(initial)) this.files.set(path, text);
	}

	getMarkdownFiles() {
		return [...this.files.keys()].filter(p => p.endsWith('.md')).map(p => new TFile(p));
	}
	async read(file: TFile) {
		if (this.unreadable.has(file.path)) throw new Error('disk error');
		const text = this.files.get(file.path);
		if (text === undefined) throw new Error(`No file ${file.path}`);
		return text;
	}
	async modify(file: TFile, text: string) { this.files.set(file.path, text); }
	async create(path: string, text: string) {
		if (this.files.has(path)) throw new Error('File already exists');
		this.files.set(path, text);
		return new TFile(path);
	}
	getAbstractFileByPath(path: string) {
		if (this.files.has(path)) return new TFile(path);
		if (this.folders.has(path)) return new TFolder(path);
		return null;
	}
	async createFolder(path: string) { this.folders.add(path); }
	rename(from: string, to: string) { this.files.set(to, this.files.get(from)!); this.files.delete(from); }
	delete(path: string) { this.files.delete(path); }
}

interface Page { id: string; title: string; archived: boolean; database: string }

/** Enough of the Notion API for the plugin, with Notion's request limits enforced. */
export class FakeNotion {
	pages = new Map<string, Page>();
	blocks = new Map<string, any[]>(); // parent id -> child blocks
	requests: { method: string; path: string; body: any }[] = [];
	rateLimitOnce = false;
	private nextId = 1;

	constructor(public databaseId = 'db1') {
		setRequestHandler(req => this.handle(req));
	}

	private id() { return `id-${this.nextId++}`; }

	/** Make a page directly "in Notion", like a user would. */
	addPage(title: string, blocks: any[]) {
		const id = this.id();
		this.pages.set(id, { id, title, archived: false, database: this.databaseId });
		this.store(id, blocks);
		return id;
	}

	/** Replace a page's content directly "in Notion". */
	setBlocks(pageId: string, blocks: any[]) {
		this.blocks.set(pageId, []);
		this.store(pageId, blocks);
	}

	writes() { return this.requests.filter(r => r.method !== 'GET' && !r.path.endsWith('/query')); }

	private store(parentId: string, blocks: any[]) {
		if (blocks.length > 100) throw this.error(400, `body.children.length should be ≤ 100, instead was ${blocks.length}`);
		const list = this.blocks.get(parentId) || [];
		for (const block of blocks) {
			const data = { ...block[block.type] };
			for (const rt of data.rich_text || []) {
				if ((rt.text?.content || '').length > 2000) throw this.error(400, 'rich_text content length should be ≤ 2000');
			}
			const children = data.children || [];
			delete data.children;
			const id = this.id();
			list.push({ object: 'block', id, type: block.type, has_children: children.length > 0, [block.type]: data });
			this.blocks.set(parentId, list);
			if (children.length) this.store(id, children);
		}
		this.blocks.set(parentId, list);
	}

	private error(status: number, message: string) {
		return Object.assign(new Error(message), { status });
	}

	private pageJson(page: Page) {
		return {
			object: 'page', id: page.id, archived: page.archived,
			parent: { type: 'database_id', database_id: page.database },
			properties: { Name: { id: 'title', type: 'title', title: [{ type: 'text', plain_text: page.title, text: { content: page.title } }] } },
		};
	}

	private paginate(items: any[], cursor?: string | null) {
		const start = cursor ? Number(cursor) : 0;
		const results = items.slice(start, start + 100);
		const next = start + 100 < items.length ? String(start + 100) : null;
		return { object: 'list', results, next_cursor: next, has_more: next !== null };
	}

	private async handle(req: { url: string; method: string; body?: string }) {
		const url = new URL(req.url);
		const path = url.pathname.replace(/^\/v1/, '');
		const body = req.body ? JSON.parse(req.body) : undefined;
		this.requests.push({ method: req.method, path, body });

		if (this.rateLimitOnce) {
			this.rateLimitOnce = false;
			return { status: 429, headers: { 'retry-after': '0' }, json: { message: 'rate limited' }, text: '' };
		}

		try {
			const json = this.route(req.method, path, url, body);
			return { status: 200, headers: {}, json, text: JSON.stringify(json) };
		} catch (error) {
			const status = error.status || 500;
			return { status, headers: {}, json: { object: 'error', message: error.message }, text: error.message };
		}
	}

	private route(method: string, path: string, url: URL, body: any): any {
		let m: RegExpMatchArray | null;
		if (method === 'GET' && (m = path.match(/^\/databases\/([^/]+)$/))) {
			return { object: 'database', id: m[1], properties: { Name: { id: 'title', type: 'title', title: {} } } };
		}
		if (method === 'POST' && (m = path.match(/^\/databases\/([^/]+)\/query$/))) {
			const pages = [...this.pages.values()].filter(p => p.database === m![1] && !p.archived).map(p => this.pageJson(p));
			return this.paginate(pages, body?.start_cursor);
		}
		if (method === 'POST' && path === '/pages') {
			const id = this.id();
			const title = Object.values<any>(body.properties)[0].title[0].text.content;
			this.pages.set(id, { id, title, archived: false, database: body.parent.database_id });
			this.store(id, body.children || []);
			return this.pageJson(this.pages.get(id)!);
		}
		if ((m = path.match(/^\/pages\/([^/]+)$/))) {
			const page = this.pages.get(m[1]);
			if (!page) throw this.error(404, 'Could not find page');
			if (method === 'PATCH') {
				if (body.archived) page.archived = true;
				if (body.properties) page.title = Object.values<any>(body.properties)[0].title[0].text.content;
			}
			return this.pageJson(page);
		}
		if ((m = path.match(/^\/blocks\/([^/]+)\/children$/))) {
			if (method === 'GET') return this.paginate(this.blocks.get(m[1]) || [], url.searchParams.get('start_cursor'));
			if (method === 'PATCH') { this.store(m[1], body.children); return { object: 'list', results: [] }; }
		}
		if (method === 'DELETE' && (m = path.match(/^\/blocks\/([^/]+)$/))) {
			for (const [parent, list] of this.blocks) {
				const index = list.findIndex(b => b.id === m![1]);
				if (index >= 0) { list.splice(index, 1); this.blocks.set(parent, list); return { object: 'block', id: m[1], archived: true }; }
			}
			throw this.error(404, 'Could not find block');
		}
		throw this.error(400, `Unhandled ${method} ${path}`);
	}

	/** Plain text of a page's top-level blocks, for easy assertions. */
	text(pageId: string) {
		return (this.blocks.get(pageId) || [])
			.map(b => (b[b.type].rich_text || []).map((t: any) => t.text.content).join(''))
			.join('\n');
	}
}
