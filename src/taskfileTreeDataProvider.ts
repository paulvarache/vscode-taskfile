import { TreeDataProvider, TreeItem, EventEmitter, Event, ExtensionContext, tasks, TreeItemCollapsibleState, Task, WorkspaceFolder, ThemeIcon, Uri, workspace, TaskGroup, TaskDefinition } from 'vscode';
import * as path from 'path';
import { provideTasks, ITaskInfo } from './tasks';
import { isRunning } from './commands';

class NoTasks extends TreeItem {
	constructor() {
		super('No tasks found', TreeItemCollapsibleState.None);
		this.contextValue = 'notasks';
	}
}

type ExplorerCommands = 'open' | 'run' | 'none';

export class TaskfileTask extends TreeItem {
	task: ITaskInfo;
	taskfile: Taskfile;

	constructor(context: ExtensionContext, taskfile: Taskfile, task: ITaskInfo) {
		super(task.task.value, TreeItemCollapsibleState.None);
		const command: ExplorerCommands = workspace.getConfiguration('taskfile').get<ExplorerCommands>('taskExplorerAction') || 'open';

		const commandList = {
			'open': {
				title: 'Edit',
				command: 'taskfile.open',
				arguments: [task]
			},
			'run': {
				title: 'Run',
				command: 'taskfile.run',
				arguments: [task]
			}
		};
		this.setRunning(isRunning(task));
		this.taskfile = taskfile;
		this.task = task;
		if (command != 'none') {
			this.command = commandList[command];
		}

		this.iconPath = {
			light: context.asAbsolutePath(path.join('resources', 'light', 'task.svg')),
			dark: context.asAbsolutePath(path.join('resources', 'dark', 'task.svg'))
		};
	}

	setRunning(v: boolean) {
		this.contextValue = v ? 'running-task' : 'task';
	}

	getFolder(): WorkspaceFolder {
		return this.taskfile.folder.workspaceFolder;
	}
}

class Taskfile extends TreeItem {
	path: string;
	folder: Folder;
	tasks: TaskfileTask[] = [];

	static getLabel(folder: WorkspaceFolder, taskfilePath: string): string {
		return path.relative(folder.uri.fsPath, taskfilePath);
	}

	constructor(folder: Folder, taskfilePath: string) {
		super(Taskfile.getLabel(folder.workspaceFolder, taskfilePath), TreeItemCollapsibleState.Expanded);
		this.folder = folder;
		this.path = taskfilePath;
		this.contextValue = 'Taskfile';
		this.iconPath = ThemeIcon.File;
		this.resourceUri = Uri.file(taskfilePath);
	}

	addTask(task: TaskfileTask) {
		this.tasks.push(task);
	}
}

class Folder extends TreeItem {
	taskfiles: Taskfile[] = [];
	workspaceFolder: WorkspaceFolder;

	constructor(folder: WorkspaceFolder) {
		super(folder.name, TreeItemCollapsibleState.Expanded);
		this.contextValue = 'folder';
		this.resourceUri = folder.uri;
		this.workspaceFolder = folder;
		this.iconPath = ThemeIcon.Folder;
	}

	addTaskfile(taskfile: Taskfile) {
		this.taskfiles.push(taskfile);
	}
}

export class TaskfileTreeDataProvider implements TreeDataProvider<TreeItem> {
	private _onDidChangeTreeData: EventEmitter<TreeItem | null> = new EventEmitter<TreeItem | null>();
	readonly onDidChangeTreeData: Event<TreeItem | null> = this._onDidChangeTreeData.event;
	private taskTree: Folder[] | Taskfile[] | NoTasks[] | null = null;
	private extensionContext: ExtensionContext;
	constructor(context: ExtensionContext) {
		this.extensionContext = context;
		context.subscriptions;
	}
	public refresh() {
		this.taskTree = null;
		this._onDidChangeTreeData.fire();
	}
	getTreeItem(element: TreeItem) {
		return element;
	}
	async getChildren(element?: TreeItem): Promise<TreeItem[]> {
		if (!this.taskTree) {
			let taskItems = await provideTasks();
			if (taskItems) {
				this.taskTree = this.buildTaskTree(taskItems);
				if (this.taskTree.length === 0) {
					this.taskTree = [new NoTasks()];
				}
			}
		}
		if (element instanceof Folder) {
			return element.taskfiles;
		}
		if (element instanceof Taskfile) {
			return element.tasks;
		}
		if (element instanceof NoTasks) {
			return [];
		}
		if (!element) {
			if (this.taskTree) {
				return this.taskTree;
			}
		}
		return [];
	}
	buildTaskTree(tasks: ITaskInfo[]) {
		let folders: Map<string, Folder> = new Map();
		let taskfiles: Map<string, Taskfile> = new Map();

		let folder = null;
		let taskfile = null;

		tasks.forEach((task) => {
			const wsFolder = workspace.getWorkspaceFolder(Uri.file(task.scope));
			if (!wsFolder) {
				return;
			}
			const folderKey = wsFolder.uri.fsPath;
			folder = folders.get(folderKey);
			if (!folder) {
				folder = new Folder(wsFolder);
				folders.set(folderKey, folder);
			}
			taskfile = taskfiles.get(task.scope);
			if (!taskfile) {
				taskfile = new Taskfile(folder, task.scope);
				folder.addTaskfile(taskfile);
				taskfiles.set(task.scope, taskfile);
			}
			let t = new TaskfileTask(this.extensionContext, taskfile, task);
			taskfile.addTask(t);
		});
		if (folders.size === 1) {
			return [...taskfiles.values()];
		}
		return [...folders.values()];
	}
	dispose() { }
}

export interface TaskfileTaskDefinition extends TaskDefinition {
	task: string;
	path?: string;
}

export function isWorkspaceFolder(value: any): value is WorkspaceFolder {
	return value && typeof value !== 'number';
}