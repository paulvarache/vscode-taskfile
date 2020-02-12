import { LanguageClient, ServerOptions, TransportKind, LanguageClientOptions } from 'vscode-languageclient';
import { ExtensionContext, workspace } from 'vscode';
import { ToolManager, IToolData } from './tools/toolManager';
import { LANGUAGE_SERVER_BINARY_PATH, LAST_CHECKED_TIMESTAMP } from './constants';
import * as path from 'path';
import * as mkdir from 'make-dir';

export function getLSPData(ctx: ExtensionContext) {
	const dataString: string|undefined = ctx.globalState.get(LANGUAGE_SERVER_BINARY_PATH);
	if (!dataString) {
		return null;
	}
	let data: IToolData|null = null;
	try {
		data = JSON.parse(dataString);
	} catch(e) {
		ctx.globalState.update(LANGUAGE_SERVER_BINARY_PATH, null);
		return null;
	}
	return data;
}

export async function getServerOptions(ctx: ExtensionContext, debug = false) {
	if (!ctx.storagePath) {
		throw new Error('Could not initialise language server: Missing context.storagePath');
	}
	// Ensure the storage dir exists
	await mkdir(ctx.storagePath);
	const tm = new ToolManager('paulvarache', 'taskfile-language-server');

	let data = getLSPData(ctx);

	if (!data) {
		data = await tm.install(ctx.storagePath);

		ctx.globalState.update(LANGUAGE_SERVER_BINARY_PATH, JSON.stringify(data));
	} else {
		const checkedAt: number = ctx.globalState.get(LAST_CHECKED_TIMESTAMP) || 0;
		if (checkedAt < Date.now() + 24 * 60 * 60 * 1000) {
			const rel = await tm.checkForUpdate(data.version);
			ctx.globalState.update(LAST_CHECKED_TIMESTAMP, Date.now())
			if (rel) {
				data = await tm.installFromRelease(rel, ctx.storagePath);
			}
		}
	}
	const serverOptions: ServerOptions = {
		debug: {
			command: 'D:/ws/taskfile-language-server/taskfile_language_server',
			args: ["--trace"],
			transport: TransportKind.stdio,
		},
		run: {
			command: path.join(data.binaryPath, 'taskfile_language_server'),
			args: ["--trace"],
			transport: TransportKind.stdio,
		},
	};
	return serverOptions;
}

export async function registerLanguageClient(ctx: ExtensionContext) {
	const serverOptions = await getServerOptions(ctx);

	const clientOpts: LanguageClientOptions = {
		documentSelector: [{ scheme: 'file', language: 'yaml' }],
		synchronize: {
			fileEvents: workspace.createFileSystemWatcher('**/Taskfile.{yml,yaml}'),
		},
	};

	const cl = new LanguageClient('taskfile-ls', 'Taskfile', serverOptions, clientOpts);

	return cl;
}