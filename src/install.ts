import * as cp from 'child_process';
import * as semver from 'semver';
import * as os from 'os';
import * as path from 'path';
import * as unzip from 'unzipper';
import * as rp from 'request-promise';
import { REPO_URL } from './constants';

function exec(command: string, options: cp.ExecOptions): Promise<{ stdout: string; stderr: string }> {
	return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
		cp.exec(command, options, (error, stdout, stderr) => {
			if (error) {
				reject({ error, stdout, stderr });
			}
			resolve({ stdout, stderr });
		});
	});
}

export function getLatestRelease() {
	return exec(`git ls-remote --tags ${REPO_URL}`, {}) 
		.then(({ stdout }) => {
			const versions: string[] = [];
			stdout.split('\n').forEach((line) => {
				if (line === '') {
					return;
				}
				const items = line.split('\t');
				const m = items[1].match(/refs\/tags\/v(\d\.\d\.\d)$/);
				if (m && m[1]) {
					versions.push(m[1]);
				}
			});

			// Sort to get the latest
			versions.sort((a, b) => semver.gt(a, b) ? 1 : -1);

			const latest = versions[versions.length - 1];

			return latest;
		});
}

export function getOSInfo() {
	const platformMap : { [K: string] : string } = {
		win32: 'windows',
		darwin: 'darwin',
		linux: 'linux',
	};

	const archMap : { [K: string] : string } = {
		x32: '386',
		x64: 'amd64',
	};

	const extMap : { [K: string] : string } = {
		windows: 'zip',
		darwin: 'tar.gz',
		linux: '.tar.gz', // TODO: Find the correct extension
	};

	const platform = platformMap[os.platform()];
	const arch = archMap[os.arch()];
	const ext = extMap[platform];

	return {
		name: `task_${platform}_${arch}.${ext}`,
		platform,
	}
}

export function fetchAssets(version : string) {
	const release = `https://api.github.com/repos/go-task/task/releases/tags/v${version}`;
	return rp(release, { json: true, headers: { 'User-Agent': 'vscode-go-task' } })
		.then((b) => {
			return b.assets as IAsset[];
		});
}

export function downloadAsset(asset : IAsset, platform : string, storagePath : string) {
	if (platform === 'windows') {
		return installWindows(asset as IAsset, storagePath);
	}
	throw new Error('Not supported');
}

export interface IAsset {
	name : string;
	browser_download_url : string;
}

export function installWindows(asset : IAsset, storagePath : string) : Promise<string> {
	return new Promise((resolve, reject) => {
		rp(asset.browser_download_url)
			.pipe(unzip.Extract({ path: storagePath }))
			.once('close', () => resolve(path.join(storagePath, 'task.exe')))
			.once('error', (err) => reject(err));
	})
}
