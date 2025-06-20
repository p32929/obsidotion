import { Modal, App } from 'obsidian';

interface SyncOperation {
	type: 'upload' | 'download' | 'delete';
	fileName: string;
	status: 'pending' | 'processing' | 'completed' | 'failed';
	error?: string;
}

export class SyncStatusModal extends Modal {
	private operations: SyncOperation[] = [];
	private contentContainer: HTMLElement;
	private headerEl: HTMLElement;
	private operationsContainer: HTMLElement;
	private footerEl: HTMLElement;
	private isVisible = false;

	constructor(app: App) {
		super(app);
		this.containerEl.addClass('sync-status-modal');
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.isVisible = true;

		// Header with animated icon
		this.headerEl = contentEl.createDiv({ cls: 'sync-status-header' });
		this.updateHeader();

		// Operations list
		this.operationsContainer = contentEl.createDiv({ cls: 'sync-operations-container' });
		
		// Footer with summary
		this.footerEl = contentEl.createDiv({ cls: 'sync-status-footer' });
		this.updateFooter();

		this.updateOperationsList();
	}

	onClose(): void {
		this.isVisible = false;
		const { contentEl } = this;
		contentEl.empty();
	}

	private updateHeader(): void {
		if (!this.headerEl) return;
		
		this.headerEl.empty();
		
		const iconEl = this.headerEl.createSpan({ cls: 'sync-status-icon' });
		const titleEl = this.headerEl.createSpan({ cls: 'sync-status-title' });
		
		const pendingOps = this.operations.filter(op => op.status === 'pending' || op.status === 'processing');
		const completedOps = this.operations.filter(op => op.status === 'completed');
		const failedOps = this.operations.filter(op => op.status === 'failed');

		if (pendingOps.length > 0) {
			iconEl.innerHTML = '🔄';
			iconEl.addClass('spinning');
			titleEl.textContent = `Syncing ${pendingOps.length} file${pendingOps.length > 1 ? 's' : ''}...`;
		} else if (failedOps.length > 0) {
			iconEl.innerHTML = '⚠️';
			titleEl.textContent = `Sync completed with ${failedOps.length} error${failedOps.length > 1 ? 's' : ''}`;
		} else if (completedOps.length > 0) {
			iconEl.innerHTML = '✅';
			titleEl.textContent = `Sync completed successfully`;
		} else {
			iconEl.innerHTML = '📡';
			titleEl.textContent = 'Sync Status';
		}
	}

	private updateOperationsList(): void {
		if (!this.operationsContainer) return;
		
		this.operationsContainer.empty();

		if (this.operations.length === 0) {
			const emptyEl = this.operationsContainer.createDiv({ cls: 'sync-empty-state' });
			emptyEl.innerHTML = `
				<div class="sync-empty-icon">📄</div>
				<div class="sync-empty-text">No sync operations</div>
				<div class="sync-empty-subtext">Files will appear here when syncing</div>
			`;
			return;
		}

		this.operations.forEach((operation, index) => {
			const opEl = this.operationsContainer.createDiv({ cls: 'sync-operation-item' });
			
			// Status icon
			const statusEl = opEl.createSpan({ cls: 'sync-operation-status' });
			this.updateOperationStatus(statusEl, operation);
			
			// File name
			const nameEl = opEl.createSpan({ cls: 'sync-operation-name' });
			nameEl.textContent = operation.fileName;
			
			// Type badge
			const typeEl = opEl.createSpan({ cls: `sync-operation-type sync-type-${operation.type}` });
			typeEl.textContent = operation.type.toUpperCase();
			
			// Error message if failed
			if (operation.status === 'failed' && operation.error) {
				const errorEl = opEl.createDiv({ cls: 'sync-operation-error' });
				errorEl.textContent = operation.error;
			}
			
			// Add animation class for new items
			if (operation.status === 'processing') {
				opEl.addClass('sync-operation-processing');
			}
		});
	}

	private updateOperationStatus(statusEl: HTMLElement, operation: SyncOperation): void {
		statusEl.className = 'sync-operation-status';
		
		switch (operation.status) {
			case 'pending':
				statusEl.innerHTML = '⏳';
				statusEl.addClass('sync-status-pending');
				break;
			case 'processing':
				statusEl.innerHTML = '🔄';
				statusEl.addClass('sync-status-processing', 'spinning');
				break;
			case 'completed':
				statusEl.innerHTML = '✅';
				statusEl.addClass('sync-status-completed');
				break;
			case 'failed':
				statusEl.innerHTML = '❌';
				statusEl.addClass('sync-status-failed');
				break;
		}
	}

	private updateFooter(): void {
		if (!this.footerEl) return;
		
		this.footerEl.empty();
		
		if (this.operations.length === 0) return;

		const stats = {
			total: this.operations.length,
			completed: this.operations.filter(op => op.status === 'completed').length,
			failed: this.operations.filter(op => op.status === 'failed').length,
			pending: this.operations.filter(op => op.status === 'pending' || op.status === 'processing').length
		};

		const progressEl = this.footerEl.createDiv({ cls: 'sync-progress-container' });
		
		// Progress bar
		const progressBarEl = progressEl.createDiv({ cls: 'sync-progress-bar' });
		const progressFillEl = progressBarEl.createDiv({ cls: 'sync-progress-fill' });
		
		const completionPercentage = stats.total > 0 ? ((stats.completed + stats.failed) / stats.total) * 100 : 0;
		progressFillEl.style.width = `${completionPercentage}%`;
		
		if (stats.failed > 0) {
			progressFillEl.addClass('sync-progress-error');
		}
		
		// Stats text
		const statsEl = progressEl.createDiv({ cls: 'sync-progress-stats' });
		if (stats.pending > 0) {
			statsEl.textContent = `${stats.completed + stats.failed}/${stats.total} completed`;
		} else {
			statsEl.textContent = `${stats.completed} completed, ${stats.failed} failed`;
		}

		// Close button when done
		if (stats.pending === 0) {
			const closeBtn = this.footerEl.createEl('button', { 
				cls: 'sync-close-button',
				text: 'Close'
			});
			closeBtn.onclick = () => this.close();
		}
	}

	// Public methods for sync manager to call
	addOperation(type: 'upload' | 'download' | 'delete', fileName: string): void {
		this.operations.push({
			type,
			fileName,
			status: 'pending'
		});
		
		if (this.isVisible) {
			this.updateAll();
		}
	}

	updateOperation(fileName: string, status: 'processing' | 'completed' | 'failed', error?: string): void {
		const operation = this.operations.find(op => op.fileName === fileName);
		if (operation) {
			operation.status = status;
			if (error) {
				operation.error = error;
			}
		}
		
		if (this.isVisible) {
			this.updateAll();
		}
	}

	clearOperations(): void {
		this.operations = [];
		if (this.isVisible) {
			this.updateAll();
		}
	}

	private updateAll(): void {
		this.updateHeader();
		this.updateOperationsList();
		this.updateFooter();
	}

	// Get current status for status bar
	getCurrentStatus(): { 
		icon: string; 
		text: string; 
		hasOperations: boolean;
		pendingCount: number;
	} {
		const pendingOps = this.operations.filter(op => op.status === 'pending' || op.status === 'processing');
		const failedOps = this.operations.filter(op => op.status === 'failed');
		
		if (pendingOps.length > 0) {
			return {
				icon: '🔄',
				text: `Syncing ${pendingOps.length}`,
				hasOperations: true,
				pendingCount: pendingOps.length
			};
		} else if (failedOps.length > 0) {
			return {
				icon: '⚠️',
				text: `${failedOps.length} error${failedOps.length > 1 ? 's' : ''}`,
				hasOperations: true,
				pendingCount: 0
			};
		} else if (this.operations.length > 0) {
			return {
				icon: '✅',
				text: 'Synced',
				hasOperations: true,
				pendingCount: 0
			};
		} else {
			return {
				icon: '📡',
				text: 'Notion',
				hasOperations: false,
				pendingCount: 0
			};
		}
	}

	// Auto-cleanup completed operations after delay
	cleanupOldOperations(): void {
		setTimeout(() => {
			this.operations = this.operations.filter(op => 
				op.status === 'pending' || 
				op.status === 'processing' || 
				(op.status === 'failed') // Keep failed operations visible
			);
			
			if (this.isVisible) {
				this.updateAll();
			}
		}, 5000); // Keep completed operations visible for 5 seconds
	}
} 