import { describe, expect, it, vi } from 'vitest';
import {
	getPhotoPrismDownloadToken,
	listPhotoPrismImages,
	PhotoPrismError,
	TOKEN_REJECTED_MESSAGE
} from '$lib/photoprism';

// Placeholder values only. These tests never reach a real PhotoPrism server.
const config = { endpoint: 'http://photoprism.test', token: 'placeholder-token' };

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function mockFetch(...responses: Response[]) {
	const fetchFn = vi.fn();
	responses.forEach((response) => fetchFn.mockResolvedValueOnce(response));
	return fetchFn as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe('listPhotoPrismImages', () => {
	it('pages through the photo list until PhotoPrism returns an empty page', async () => {
		const fetchFn = mockFetch(
			jsonResponse([
				{ UID: 'a', Hash: 'hash-a' },
				{ UID: 'b', Hash: 'hash-b' }
			]),
			jsonResponse([])
		);

		await expect(listPhotoPrismImages(fetchFn, config)).resolves.toEqual([
			'/api/image/hash-a',
			'/api/image/hash-b'
		]);
		expect(fetchFn).toHaveBeenCalledTimes(2);
		expect(String(fetchFn.mock.calls[1][0])).toContain('offset=2');
	});

	it.each([401, 403])('says "PhotoPrism rejected the token" on a %i', async (status) => {
		const fetchFn = mockFetch(jsonResponse({ error: 'Unauthorized' }, status));

		const result = listPhotoPrismImages(fetchFn, config);
		await expect(result).rejects.toBeInstanceOf(PhotoPrismError);
		await expect(result).rejects.toThrow(TOKEN_REJECTED_MESSAGE);
	});

	it('reports an unexpected body instead of crashing on .map', async () => {
		const fetchFn = mockFetch(jsonResponse({ error: 'something else' }));

		await expect(listPhotoPrismImages(fetchFn, config)).rejects.toThrow(
			'PhotoPrism returned an unexpected photo list'
		);
	});

	it('reports other PhotoPrism errors with their status', async () => {
		const fetchFn = mockFetch(new Response('down', { status: 503 }));

		await expect(listPhotoPrismImages(fetchFn, config)).rejects.toThrow('PhotoPrism returned 503');
	});

	it('does not call PhotoPrism when the token is missing', async () => {
		const fetchFn = mockFetch();

		await expect(
			listPhotoPrismImages(fetchFn, { endpoint: config.endpoint, token: '' })
		).rejects.toThrow('PhotoPrism is not configured');
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('never puts the token in an error message', async () => {
		const fetchFn = mockFetch(jsonResponse({ error: 'Unauthorized' }, 401));

		const error = await listPhotoPrismImages(fetchFn, config).catch((e: Error) => e);
		expect((error as Error).message).not.toContain(config.token);
	});
});

describe('getPhotoPrismDownloadToken', () => {
	it('returns the session download token', async () => {
		const fetchFn = mockFetch(jsonResponse({ config: { downloadToken: 'download-abc' } }));

		await expect(getPhotoPrismDownloadToken(fetchFn, config)).resolves.toBe('download-abc');
	});

	it('says "PhotoPrism rejected the token" on a 401', async () => {
		const fetchFn = mockFetch(jsonResponse({ error: 'Unauthorized' }, 401));

		await expect(getPhotoPrismDownloadToken(fetchFn, config)).rejects.toThrow(
			TOKEN_REJECTED_MESSAGE
		);
	});
});
