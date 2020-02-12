import { Uri, window, Range, TextEditorRevealType, QuickPickItem, ExtensionContext, tasks, ProgressLocation, TaskExecution, EventEmitter } from 'vscode';
import { ITaskInfo, TaskfileExtensionContext } from './tasks';
import { TaskfileTask } from './taskfileTreeDataProvider';
import * as path from 'path';
import { taskFromInfo } from './taskfileTaskProvider';
import { BINARY_PATH_KEY, LANGUAGE_SERVER_BINARY_PATH } from './constants';
import { downloadAsset, getOSInfo, fetchAssets, getLatestRelease } from './install';
import { TaskController } from './taskController';

export class Commands {
	runningTasks = new Map<string, TaskController>();

	_onDidUpdateTaskState = new EventEmitter();
	onDidUpdateTaskState = this._onDidUpdateTaskState.event;
	private ctx: TaskfileExtensionContext;

	constructor(ctx: TaskfileExtensionContext) {
		this.ctx = ctx;
	}

	async promptTaskChoice(tasks: ITaskInfo[]): Promise<ITaskInfo|null>{
		const pick = window.createQuickPick();
		const actionMap = new Map<string, ITaskInfo>();
		const items: QuickPickItem[] = [];
		tasks.forEach((task) => {
			const label = `${path.basename(path.dirname(task.scope))}: ${task.task.value}`;
			actionMap.set(label, task);
			items.push({ label });
		});
		pick.items = items;
		return new Promise((resolve) => {
			pick.onDidChangeSelection(async (choices) => {
				pick.dispose();
				const [choice] = choices;
				if (!choice) {
					return resolve(null);
				}
				const info = actionMap.get(choice.label);
				if (!info) {
					return resolve(null);
				}
				return resolve(info);
			});
			pick.show();
		});
	}
	
	async open(info?: ITaskInfo|TaskfileTask): Promise<void> {
		if (info instanceof TaskfileTask) {
			info = info.task;
		}
		if (!info) {
			const tasks = await this.ctx.resolver.provideTasks();
			const newTask = await this.promptTaskChoice(tasks);
			if (!newTask) {
				return;
			}
			return this.open(newTask);
		}
		const doc = await window.showTextDocument(Uri.file(info.scope));
		const range = new Range(info.task.startLine, info.task.startCol, info.task.endLine, info.task.endCol);
		doc.revealRange(range, TextEditorRevealType.InCenter);
	}
	
	isRunning(task: ITaskInfo) {
		const key = Commands.getRunningTaskKey(task);
		return this.runningTasks.has(key);
	}
	
	async run(_context : ExtensionContext, info? : ITaskInfo|TaskfileTask, watch = false): Promise<void> {
		if (info instanceof TaskfileTask) {
			info = info.task;
		}
		if (!info) {
			const tasks = await this.ctx.resolver.provideTasks();
			const newTask = await this.promptTaskChoice(tasks);
			if (!newTask) {
				return;
			}
			return this.run(_context, newTask, watch);
		}
		const binaryPath: string|undefined = _context.globalState.get(BINARY_PATH_KEY);
		if (!binaryPath) {
			throw new Error('Task is not installed');
		}
		const t = taskFromInfo(info, binaryPath, watch);
		const execution = await tasks.executeTask(t);
		const controller = new TaskController(execution, info);
		_context.subscriptions.push(controller.onDidEndTask(() => this.stop(info)));
		this.runningTasks.set(Commands.getRunningTaskKey(info), controller);
		this._onDidUpdateTaskState.fire();
	}
	
	async stop(info?: ITaskInfo|TaskfileTask): Promise<void> {
		if (info instanceof TaskfileTask) {
			info = info.task;
		}
		if (!info) {
			const tasks = [...this.runningTasks.values()].map(c => c.task);
			const newTask = await this.promptTaskChoice(tasks);
			if (!newTask) {
				return;
			}
			return this.stop(newTask);
		}
		const key = Commands.getRunningTaskKey(info);
		const controller = this.runningTasks.get(key);
		if (!controller) {
			return;
		}
		controller.dispose();
		this.runningTasks.delete(key);
		this._onDidUpdateTaskState.fire();
	}
	
	static getRunningTaskKey(task: ITaskInfo) {
		return `${task.scope}:${task.task.value}`;
	}

	async restartLSP(ctx : ExtensionContext) {
		await this.ctx.restartLanguageClient(ctx);
	}

	async updateLSP(ctx : ExtensionContext) {
		ctx.globalState.update(LANGUAGE_SERVER_BINARY_PATH, null);
		await this.restartLSP(ctx);
	}
	
	async install(_context : ExtensionContext) {
		window.withProgress({
			location: ProgressLocation.Notification,
			title: 'Installing go-task',
			cancellable: true,
		}, (progress, token) => {
			progress.report({ increment: 0, message: 'Fetching releases' });
			return getLatestRelease()
				.then((latest) => {
					if (token.isCancellationRequested) {
						return;
					}
					progress.report({ increment: 25, message: `Getting assets for v${latest}` });
					return fetchAssets(latest)
						.then((assets) => {
							if (token.isCancellationRequested) {
								return;
							}
							const info = getOSInfo();
							const asset = assets.find(asset => asset.name === info.name);
							if (!asset) {
								throw new Error('Could not find asset');
							}
							if (!_context.storagePath) {
								throw new Error('Storage not available');
							}
							progress.report({ increment: 50, message: 'Downloading binary' });
							return downloadAsset(asset, info.platform, _context.storagePath)
								.then((binaryPath) => {
									if (token.isCancellationRequested) {
										return;
									}
									progress.report({ increment: 100, message: 'go-task installed' });
									_context.globalState.update(BINARY_PATH_KEY, binaryPath);
								});
						});
				});
		});
	}	
}