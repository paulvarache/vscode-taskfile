import { TaskExecution, Disposable, tasks, TaskEndEvent, EventEmitter } from 'vscode';
import { ITaskInfo } from './tasks';

export class TaskController {
	execution: TaskExecution;
	task: ITaskInfo;
	listener: Disposable;

	private _onDidEndTask = new EventEmitter();
	readonly onDidEndTask = this._onDidEndTask.event;

	constructor(execution: TaskExecution, task: ITaskInfo) {
		this.task = task;
		this.execution = execution;
		this.listener = tasks.onDidEndTask((e: TaskEndEvent) => {
			if (e.execution === this.execution) {
				this._onDidEndTask.fire();
				this.listener.dispose();
			}
		});
	}

	dispose() {
		this.execution.terminate();
		this.listener.dispose();
	}
}