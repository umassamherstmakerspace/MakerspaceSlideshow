import { env } from '$env/dynamic/private';
import { listPhotoPrismImages, PhotoPrismError } from '$lib/photoprism';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	let images: string[];

	try {
		images = await listPhotoPrismImages(fetch, {
			endpoint: env.PHOTOPRISM_ENDPOINT,
			token: env.PHOTOPRISM_TOKEN
		});
	} catch (e) {
		console.error(e);
		// 502: the slideshow is fine, but PhotoPrism said no. The message
		// (for example "PhotoPrism rejected the token") reaches the screen's log.
		throw error(502, e instanceof PhotoPrismError ? e.message : 'Unable to load the photo list');
	}

	return new Response(JSON.stringify({ images }), {
		headers: {
			'content-type': 'application/json;charset=UTF-8'
		}
	});
};
