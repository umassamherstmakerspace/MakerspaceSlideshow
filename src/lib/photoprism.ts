export const TOKEN_REJECTED_MESSAGE = 'PhotoPrism rejected the token';

type Fetch = typeof fetch;

interface GetImagesResults {
	UID: string;
	Hash: string;
}

export interface PhotoPrismConfig {
	endpoint?: string;
	token?: string;
}

// A PhotoPrism problem with a message that is safe to show in the photo
// list response. It never includes the token.
export class PhotoPrismError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PhotoPrismError';
	}
}

function requireConfig(config: PhotoPrismConfig): { endpoint: string; token: string } {
	if (!config.endpoint || !config.token) {
		throw new PhotoPrismError('PhotoPrism is not configured');
	}
	return { endpoint: config.endpoint, token: config.token };
}

async function photoPrismGet(fetchFn: Fetch, url: string, token: string): Promise<unknown> {
	const response = await fetchFn(url, {
		method: 'GET',
		mode: 'cors',
		headers: {
			Authorization: `Bearer ${token}`,
			Accepts: 'application/json'
		}
	});

	if (response.status === 401 || response.status === 403) {
		throw new PhotoPrismError(TOKEN_REJECTED_MESSAGE);
	}
	if (!response.ok) {
		throw new PhotoPrismError(`PhotoPrism returned ${response.status}`);
	}

	try {
		return await response.json();
	} catch {
		throw new PhotoPrismError('PhotoPrism returned a response that is not JSON');
	}
}

function isPhotoList(value: unknown): value is GetImagesResults[] {
	return (
		Array.isArray(value) &&
		value.every(
			(item) =>
				item !== null &&
				typeof item === 'object' &&
				typeof (item as Record<string, unknown>).Hash === 'string'
		)
	);
}

export async function listPhotoPrismImages(
	fetchFn: Fetch,
	config: PhotoPrismConfig
): Promise<string[]> {
	const { endpoint, token } = requireConfig(config);
	let images: string[] = [];

	for (;;) {
		const result = await photoPrismGet(
			fetchFn,
			`${endpoint}/api/v1/photos?count=1000&quality=0&offset=${images.length}`,
			token
		);

		if (!isPhotoList(result)) {
			throw new PhotoPrismError('PhotoPrism returned an unexpected photo list');
		}
		if (result.length === 0) return images;

		images = images.concat(result.map((r) => `/api/image/${r.Hash}`));
	}
}

export async function getPhotoPrismDownloadToken(
	fetchFn: Fetch,
	config: PhotoPrismConfig
): Promise<string> {
	const { endpoint, token } = requireConfig(config);
	type SessionResponse = { config?: { downloadToken?: unknown } } | null;
	const session = (await photoPrismGet(
		fetchFn,
		`${endpoint}/api/v1/session`,
		token
	)) as SessionResponse;

	const downloadToken = session?.config?.downloadToken;
	if (typeof downloadToken !== 'string' || !downloadToken) {
		throw new PhotoPrismError('PhotoPrism session has no download token');
	}
	return downloadToken;
}
