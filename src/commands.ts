import { Uri, window, Range, TextEditorRevealType, QuickPickItem, commands, ExtensionContext, tasks, ProgressLocation, TaskExecution, EventEmitter } from 'vscode';
import { ITaskInfo, invalidateTasksCache, provideTasks } from './tasks';
import { TaskfileTask, TaskfileTreeDataProvider } from './taskfileTreeDataProvider';
import * as path from 'path';
import { taskFromInfo } from './taskfileTaskProvider';
import { BINARY_PATH_KEY } from './constants';
import { downloadAsset, getOSInfo, fetchAssets, getLatestRelease } from './install';
import { refreshTasks } from './extension';
import { TaskController } from './taskController';

const runningTasks = new Map<string, TaskController>();

const _onDidUpdateTaskState = new EventEmitter();
export const onDidUpdateTaskState = _onDidUpdateTaskState.event;

async function promptTaskChoice(tasks: ITaskInfo[]): Promise<ITaskInfo|null>{
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

export async function open(info?: ITaskInfo|TaskfileTask): Promise<void> {
	if (info instanceof TaskfileTask) {
		info = info.task;
	}
	if (!info) {
		const tasks = await provideTasks();
		const newTask = await promptTaskChoice(tasks);
		if (!newTask) {
			return;
		}
		return open(newTask);
	}
	const doc = await window.showTextDocument(Uri.file(info.scope));
	const range = new Range(info.task.startLine, info.task.startCol, info.task.endLine, info.task.endCol);
	doc.revealRange(range, TextEditorRevealType.InCenter);
}

export async function refresh(treeDataProvider: TaskfileTreeDataProvider|null) {
	invalidateTasksCache();
	if (treeDataProvider) {
		treeDataProvider.refresh();
	}
}

export function isRunning(task: ITaskInfo) {
	const key = getRunningTaskKey(task);
	return runningTasks.has(key);
}

export async function run(_context : ExtensionContext, info? : ITaskInfo|TaskfileTask, watch = false): Promise<void> {
	if (info instanceof TaskfileTask) {
		info = info.task;
	}
	if (!info) {
		const tasks = await provideTasks();
		const newTask = await promptTaskChoice(tasks);
		if (!newTask) {
			return;
		}
		return run(_context, newTask, watch);
	}
	const binaryPath: string|undefined = _context.globalState.get(BINARY_PATH_KEY);
	if (!binaryPath) {
		throw new Error('Task is not installed');
	}
	const t = taskFromInfo(info, binaryPath, watch);
	const execution = await tasks.executeTask(t);
	const controller = new TaskController(execution, info);
	_context.subscriptions.push(controller.onDidEndTask(() => stop(info)));
	runningTasks.set(getRunningTaskKey(info), controller);
	_onDidUpdateTaskState.fire();
}

export async function stop(info?: ITaskInfo|TaskfileTask): Promise<void> {
	if (info instanceof TaskfileTask) {
		info = info.task;
	}
	if (!info) {
		const tasks = [...runningTasks.values()].map(c => c.task);
		const newTask = await promptTaskChoice(tasks);
		if (!newTask) {
			return;
		}
		return stop(newTask);
	}
	const key = getRunningTaskKey(info);
	const controller = runningTasks.get(key);
	if (!controller) {
		return;
	}
	controller.dispose();
	runningTasks.delete(key);
	_onDidUpdateTaskState.fire();
}

function getRunningTaskKey(task: ITaskInfo) {
	return `${task.scope}:${task.task.value}`;
}

export async function install(_context : ExtensionContext) {
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
