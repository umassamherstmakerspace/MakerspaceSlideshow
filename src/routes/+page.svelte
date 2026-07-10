<script lang="ts">
	import { fade } from 'svelte/transition';
	import type { DateRange, DaySchedule, RoomStatus, ScheduleRanges } from '$lib/types';
	import type { EventJSON } from '$lib/calendar';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import {
		addDays,
		format,
		startOfDay,
		isAfter,
		isBefore,
		max,
		min,
		endOfDay,
		isEqual,
		isWithinInterval,
		formatRelative
	} from 'date-fns';

	async function getImages(): Promise<string[]> {
		const res = await fetch('/api/images');
		const data = await res.json();
		return data.images;
	}

	let images: string[] = [];
	let imagesShown = 0;
	let imageLoopDelayMap = new Map<string, number>();

	let currentImageURL = '';
	let nextImageURL = '';
	let showImage = false;
	let booted = false;
	let lastImageSwap = Date.now();

	let schedule: DaySchedule[] = [];
	let roomStatus: RoomStatus = { open: false, until: '' };

	async function queueNextImage() {
		try {
			// (Re)load the image list on first run and every imageReloadEvery images.
			// This used to live in load() with no error handling: one failed fetch
			// killed the loop permanently (the frozen-photo bug).
			if (images.length === 0 || imagesShown >= $page.data.imageReloadEvery) {
				images = await getImages();
				imagesShown = 0;
				imageLoopDelayMap = new Map<string, number>();
				images.forEach((i) => imageLoopDelayMap.set(i, 0));
			}

			imagesShown++;
			const validImages: string[] = [];
			imageLoopDelayMap.forEach((v, k) => {
				if (v <= 0) {
					validImages.push(k);
				} else {
					imageLoopDelayMap.set(k, v - 1);
				}
			});

			// Small library: every image can be on cooldown at once. Reset instead
			// of picking undefined (which blanked the panel).
			if (validImages.length === 0) {
				imageLoopDelayMap.forEach((_, k) => {
					imageLoopDelayMap.set(k, 0);
					validImages.push(k);
				});
			}

			if (validImages.length === 0) {
				throw new Error('image list is empty');
			}

			const image = validImages[Math.floor(Math.random() * validImages.length)];

			const res = await fetch(image);
			if (!res.ok) {
				throw new Error(`image fetch failed: ${res.status}`);
			}
			const blob = await res.blob();
			imageLoopDelayMap.set(image, $page.data.imageLoopDelay);

			nextImageURL = URL.createObjectURL(blob);
			showImage = false;

			if (!booted) {
				booted = true;
				fadeInNextImage();
			}
		} catch (e) {
			// Never let the loop die: keep the current image up and retry.
			console.error(e);
			window.setTimeout(queueNextImage, $page.data.imageHoldTime);
		}
	}

	const delayedQueueNextImage = () => window.setTimeout(queueNextImage, $page.data.imageHoldTime);

	function fadeInNextImage() {
		URL.revokeObjectURL(currentImageURL);
		currentImageURL = nextImageURL;
		showImage = true;
		lastImageSwap = Date.now();
	}

	function getDaySchedule(data: EventJSON[]): DaySchedule[] {
		const now = new Date();
		const startTime = startOfDay(now);
		const endTime = addDays(startTime, 7);

		const ranges = Array<DateRange[]>(7);
		for (let i = 0; i < 7; i++) {
			ranges[i] = [];
		}

		return data
			.filter((e) => {
				return e.title.toLowerCase().includes('open');
			})
			.map((e) => {
				return {
					start: max([new Date(e.start), startTime]),
					end: min([new Date(e.end), endTime])
				} as DateRange;
			})
			.filter((e) => {
				if (isBefore(e.end, startTime)) {
					return false;
				}

				if (isAfter(e.start, endTime)) {
					return false;
				}

				return true;
			})
			.flatMap((e) => {
				let start = e.start;
				const results = [];

				while (start.getDay() !== e.end.getDay()) {
					results.push({
						start: start,
						end: endOfDay(start)
					} as DateRange);
					start = startOfDay(addDays(start, 1));
				}

				results.push({
					start: start,
					end: e.end
				} as DateRange);

				return results;
			})
			.reduce((acc, e) => {
				const offset = (e.start.getDay() - now.getDay() + 7) % 7;
				acc[offset].push(e);

				return acc;
			}, ranges)
			.map((e) => {
				e = e.sort((a, b) => {
					return isBefore(a.start, b.start) ? -1 : 1;
				});

				if (e.length <= 1) {
					return e;
				}

				let index = 0;

				while (index < e.length) {
					for (let i = index + 1; i < e.length; i++) {
						if (isAfter(e[index].end, e[i].start) || isEqual(e[index].end, e[i].start)) {
							if (isBefore(e[index].end, e[i].end) || isEqual(e[index].end, e[i].end)) {
								e[index].end = e[i].end;
							}

							e.splice(i, 1);
							i--;
						}
					}

					index++;
				}

				return e;
			})
			.map((e, i) => {
				return {
					ranges: e.map((e) => {
						return {
							start: e.start,
							end: e.end
						} as DateRange;
					}),
					day: addDays(startTime, i)
				} as DaySchedule;
			});
	}

	export function getRoomStatus(schedule: DaySchedule[]): RoomStatus {
		console.log(schedule);
		const now = new Date();

		for (let i = 0; i < schedule.length; i++) {
			for (let j = 0; j < schedule[i].ranges.length; j++) {
				const range = schedule[i].ranges[j];
				if (isWithinInterval(now, range)) {
					return {
						open: true,
						until: formatRelative(range.end, now)
					};
				} else if (isBefore(now, range.start)) {
					return {
						open: false,
						until: formatRelative(range.start, now)
					};
				}
			}
		}

		return {
			open: false,
			until: ''
		};
	}

	export function getScheduleRanges(schedule: DaySchedule[]): ScheduleRanges[] {
		return schedule.map((e) => {
			if (e.ranges.length === 0) {
				return { day: e.day, ranges: ['Closed'] } as ScheduleRanges;
			}

			return {
				day: e.day,
				ranges: e.ranges.map((e) => {
					return `${format(e.start, 'h:mm a')} - ${format(e.end, 'h:mm a')}`;
				})
			} as ScheduleRanges;
		});
	}

	async function updateHours() {
		try {
			const now = new Date();
			const startTime = startOfDay(now);
			const endTime = addDays(startTime, 7);
			const res = await fetch(
				'/api/calendar?start=' + startTime.toISOString() + '&end=' + endTime.toISOString()
			);
			const data = (await res.json()) as EventJSON[];

			schedule = getDaySchedule(data);

			roomStatus = getRoomStatus(schedule);

			window.setTimeout(updateHours, $page.data.calendarUpdateTime);
		} catch (e) {
			console.error(e);
			window.setTimeout(updateHours, $page.data.calendarRetryTime);
		}
	}

	onMount(() => {
		// queueNextImage self-retries until the first image is up, then the
		// intro/outro transition events drive the loop.
		queueNextImage();

		// Started exactly once. It used to be (re)started by every image-list
		// reload, leaking a new self-rescheduling timer chain each time.
		updateHours();

		// Watchdog: if no image swap happens for far longer than the slide
		// period, something above has wedged — reload the whole page.
		const slidePeriod =
			$page.data.imageHoldTime + $page.data.imageFadeInTime + $page.data.imageFadeOutTime;
		const watchdogLimit = Math.max(10 * slidePeriod, 10 * 60 * 1000);
		window.setInterval(() => {
			if (Date.now() - lastImageSwap > watchdogLimit) {
				location.reload();
			}
		}, 60 * 1000);
	});
</script>

<div class="page">
	<div class="content" class:reverse={$page.data.reverseContent}>
		<div class="hours">
			<div class="title">Hours</div>
			<div class="schedule">
				{#each getScheduleRanges(schedule) as days}
					<div class="range">
						<div class="day">{format(days.day, 'EEEE')}</div>
						<div class="times">
							{#each days.ranges as time}
								<div class="time">{time}</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</div>

		<div class="slideshow">
			{#if showImage}
				<img
					src={currentImageURL}
					alt=""
					class="image"
					in:fade={{ duration: $page.data.imageFadeInTime }}
					out:fade={{ duration: $page.data.imageFadeOutTime }}
					on:introend={delayedQueueNextImage}
					on:outroend={fadeInNextImage}
				/>
			{/if}
		</div>
	</div>

	<div class="footer">
		<div class="logos">
			<img src="/logo.svg" class="gear" alt="Makerspace Logo" />
			<img src="/makerspace.png" class="logo" alt="UMass Amherst | Makerspace" />
		</div>
		<div class="nowWrapper">
			<div class="now">
				{#if roomStatus.open}
					<div class="open nowText">OPEN</div>
				{:else}
					<div class="closed nowText">CLOSED</div>
				{/if}
				<div class="subtitle">until {roomStatus.until}</div>
			</div>
		</div>
	</div>
</div>

<style lang="scss">
	@font-face {
		font-family: OpenSans;
		src: url(/fonts/OpenSans-Regular.ttf);
	}

	.title {
		font-family: OpenSans;
		font-size: 10vh;
		color: white;
	}

	.page {
		position: absolute;
		top: 0;
		left: 0;

		width: 100dvw;
		height: 100dvh;
		background-color: #111213;
		font-family: OpenSans;

		display: flex;
		flex-direction: column;
	}

	.content {
		box-sizing: border-box;
		display: flex;
		flex-direction: row;
		justify-content: center;
		align-items: stretch;
		flex: 1;
		height: 85dvh;
		gap: 20vh;
		padding: 5vh 5vw;
	}

	.content.reverse {
		flex-direction: row-reverse;
	}

	.footer {
		color: #111213;
		font-family: OpenSans;

		height: 15dvh;
		background-color: #f1f3f9;
		padding: 0 10vmin;
		display: flex;
	}

	.footer > * {
		flex: 1;
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.logos {
		display: flex;
		flex-direction: row;
		justify-content: left;
		gap: 1vw;
	}

	.gear {
		object-fit: contain;
		height: 100%;
	}

	.logo {
		object-fit: contain;
		height: 100%;
		width: 100%;
		flex: 1;
	}

	.now {
		display: flex;
		flex-direction: row;
		justify-content: center;
		align-items: center;
		gap: 2vw;
	}

	.nowText {
		font-size: 8vh;
	}

	.open {
		color: #28a745;
	}

	.closed {
		color: #dc3545;
	}

	.subtitle {
		font-size: 4vh;
	}

	.hours {
		color: #f1f3f9;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		gap: 1vh;

		min-width: 40vmin;
	}

	.schedule:before {
		content: '';
		border: 1px solid #f1f3f9;
		align-self: stretch;
	}

	.schedule {
		display: flex;
		flex-direction: column;
		justify-content: stretch;
		align-items: center;
		gap: 2vh;
	}

	.range {
		display: flex;
		flex-direction: row;
		justify-content: stretch;
		align-items: top;
		width: 100%;
		gap: 2vw;
	}

	.day {
		font-size: 4vh;
		justify-self: left;
	}

	.times {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: end;
		flex: 1;
		gap: 0.75vh;
		font-size: 2vh;
	}

	.slideshow {
		flex: 1;
		display: flex;
		justify-content: stretch;
		align-items: stretch;
	}

	.image {
		height: 100%;
		width: 100%;
		object-fit: contain;
	}
</style>
