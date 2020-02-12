import * as semver from 'semver';
import * as rp from 'request-promise-native';
import * as os from 'os';
import { unZip, unTar } from './extract';
import { Readable } from 'stream';

export interface IAsset {
	name: string;
	browser_download_url: string;
}

export interface IRelease {
	url: string;
	assets_url: string;
	id: number;
	node_id: string;
	tag_name: string;
	assets: IAsset[];
}

export interface IToolData {
	version: string;
	binaryPath: string;
}

export interface IMachineProfile {
    os: 'windows'|'darwin'|'linux';
    arch: '386'|'amd64';
}

function parseArch(arch: string) {
    return arch === 'x64' ? 'amd64' : '386';
}

export function getMachineProfile(): IMachineProfile {
    const o = os.platform();
    const arch = os.arch();

    if (o === 'win32') {
        return {
            os: 'windows',
            arch: parseArch(arch),
        }
    } else if (o === 'darwin') {
        return {
            os: 'darwin',
            arch: parseArch(arch),
        }
    } else if (o === 'linux') {
        return {
            os: 'linux',
            arch: parseArch(arch),
        }
    }

    throw new Error(`Could not parse machine profile. Unkonwn OS or CPU architecture: '${o}', '${arch}'`);
}

export function getAssetName(name: string, p: IMachineProfile) {
    let assetName = `${name}_${p.os}_${p.arch}`;
    if (p.os === 'windows') {
        assetName += '.zip';
    } else {
        assetName += '.tar.gz';
    }
    return assetName;
}

export class ToolManager {
	owner: string;
	repo: string;
	constructor(owner: string, repo: string) {
		this.owner = owner;
		this.repo = repo;
	}
	async getLatestRelease() {
		const release = `https://api.github.com/repos/${this.owner}/${this.repo}/releases`;
		const releases: IRelease[] = await rp(release, { json: true, headers: { 'User-Agent': 'vscode-go-task' } })
		releases.sort((a, b) => semver.gt(a.tag_name, b.tag_name) ? 1 : -1);

		const latest = releases[releases.length - 1];

		if (!latest) {
			throw new Error(`Could not find latest release: No releases available`);
		}

		return latest;
	}
	async install(dest: string) {
		const release = await this.getLatestRelease();
		return await this.installFromRelease(release, dest);
	}
	async installFromRelease(release: IRelease, dest: string) {
		const p = getMachineProfile();
		const assetName = getAssetName('taskfile_language_server', p);
		const asset = release.assets.find(a => a.name === assetName);
		if (!asset) {
			throw new Error(`Could not find asset '${assetName}' in release '${release.tag_name}'`);
		}
		let pr = Promise.resolve();
		const reader = rp(asset.browser_download_url) as unknown as Readable;
		if (asset.browser_download_url.endsWith('.zip')) {
			pr = unZip(reader, dest);
		} else if (asset.browser_download_url.endsWith('.tar.gz')) {
			pr = unTar(reader, dest);
		} else {
			throw new Error(`Could not download binary: Archive type not supported '${asset.browser_download_url}'`) 
		}
		return pr.then(() => {
			return {
				version: release.tag_name,
				binaryPath: dest,
			};
		});
	}
	async checkForUpdate(version: string) {
		const rel = await this.getLatestRelease();
		return semver.gt(rel.tag_name, version) ? rel : null;
	}
}
