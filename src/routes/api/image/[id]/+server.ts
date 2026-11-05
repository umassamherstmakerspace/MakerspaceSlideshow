import { env } from '$env/dynamic/private';
import { Cached } from '$lib/cache';
import { getPhotoPrismDownloadToken, PhotoPrismError } from '$lib/photoprism';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

let downloadToken: Cached<string> | undefined = undefined;

export const GET: RequestHandler = async ({ params, fetch }) => {
	if (!downloadToken) {
		downloadToken = new Cached<string>(
			() =>
				getPhotoPrismDownloadToken(fetch, {
					endpoint: env.PHOTOPRISM_ENDPOINT,
					token: env.PHOTOPRISM_TOKEN
				}),
			60 * 1000
		);
	}

	let token;
	try {
		token = await downloadToken.get();
	} catch (e) {
		downloadToken = undefined;
		console.error(e);
		throw error(502, {
			message: e instanceof PhotoPrismError ? e.message : 'Internal Service Error'
		});
	}

	const data = await fetch(`${env.PHOTOPRISM_ENDPOINT}/api/v1/t/${params.id}/${token}/fit_2560/`);
	return new Response(data.body, {
		headers: {
			'content-type': 'image/jpeg'
		}
	});
};
