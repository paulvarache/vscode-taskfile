import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as yaml from 'yaml';
import { BINARY_PATH_KEY } from './constants';
import { getTaskfile, provideTasks, ITaskInfo } from './tasks';

export function taskFromInfo(info: ITaskInfo, binaryPath: string, watch = false) {
	let kind: TaskfileTaskDefinition = {
		type: TaskfileTaskProvider.TaskfileType,
		task: info.task.value,
	};
	// Extend the environment with the path to the local binary
	const env = Object.assign({}, process.env, { PATH: `${path.dirname(binaryPath)}:${process.env.PATH}` });
	const se = new vscode.ShellExecution(`task ${info.task.value}${watch ? ' --watch' : ''}`, { cwd: path.dirname(info.scope), env });
	const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(info.scope));
	if (!folder) {
		throw new Error('OOOPS');
	}
	return new vscode.Task(kind, folder, info.task.value, 'task', se, "taskfile");
}

export class TaskfileTaskProvider implements vscode.TaskProvider {
	static TaskfileType: string = 'taskfile';
	private state: vscode.Memento;

	constructor(state : vscode.Memento) {
		this.state = state;
	}

	public async provideTasks() {
		const tasks = await provideTasks();

		const binaryPath: string|undefined = this.state.get(BINARY_PATH_KEY);
		if (!binaryPath) {
			throw new Error('Not installed');
		}

		return tasks.map(info => taskFromInfo(info, binaryPath));
	}

	public resolveTask(_task: vscode.Task): vscode.Task | undefined {
		const task = _task.definition.task;
		if (task) {
			const definition: TaskfileTaskDefinition = <any>_task.definition;
			const binaryPath = this.state.get(BINARY_PATH_KEY) || 'task';
			const se = new vscode.ShellExecution(`${binaryPath} ${definition.task}`);
			return new vscode.Task(definition, definition.task, 'task', se);
		}
		return undefined;
	}
}

export interface TaskfileTaskDefinition extends vscode.TaskDefinition {
	/**
	 * The task name
	 */
	task: string;

	/**
	 * The Taskfile containing the task
	 */
	file?: string;
}

const buildNames: string[] = ['build', 'compile', 'watch'];
export function isBuildTask(name: string): boolean {
	for (let buildName of buildNames) {
		if (name.indexOf(buildName) !== -1) {
			return true;
		}
	}
	return false;
}

const testNames: string[] = ['test'];
export function isTestTask(name: string): boolean {
	for (let testName of testNames) {
		if (name.indexOf(testName) !== -1) {
			return true;
		}
	}
	return false;
}

export async function getTasks(): Promise<vscode.Task[]> {
	let emptyTasks: vscode.Task[] = [];
	let taskFile = await getTaskfile();
	if (!taskFile) {
		return emptyTasks;
	}

	const contents = fs.readFileSync(taskFile, 'utf-8');

	const doc = yaml.parse(contents);

	let result: vscode.Task[] = [];

	if (!doc.tasks) {
		return emptyTasks;
	}

	Object.keys(doc.tasks).forEach((name) => {
		let kind: TaskfileTaskDefinition = {
			type: TaskfileTaskProvider.TaskfileType,
			task: name
		};
		let task = new vscode.Task(kind, name, 'task', new vscode.ShellExecution(`task ${name}`));
		result.push(task);
		let lowerCaseLine = name.toLowerCase();
		if (isBuildTask(lowerCaseLine)) {
			task.group = vscode.TaskGroup.Build;
		} else if (isTestTask(lowerCaseLine)) {
			task.group = vscode.TaskGroup.Test;
		}
	});

	return result;
}
