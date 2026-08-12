import { describe, expect, it } from 'vitest';
import { ImageLoadQueue } from './ImageLoadQueue';

const image = {} as HTMLImageElement;

describe('ImageLoadQueue visible-first ordering', () => {
  it('sorts all requests added in one render turn before starting work', async () => {
    const started: string[] = [];
    const queue = new ImageLoadQueue({
      maxConcurrent: 1,
      loader: async url => {
        started.push(url);
        return image;
      },
    });

    const edge = queue.add({ id: 'edge', url: 'edge', priority: 49 });
    const centre = queue.add({ id: 'centre', url: 'centre', priority: 10 });
    const middle = queue.add({ id: 'middle', url: 'middle', priority: 30 });

    await Promise.all([edge, centre, middle]);
    expect(started).toEqual(['centre', 'middle', 'edge']);
  });

  it('reprioritizes a queued image after the viewport moves', async () => {
    const started: string[] = [];
    const releases = new Map<string, (value: HTMLImageElement) => void>();
    const queue = new ImageLoadQueue({
      maxConcurrent: 1,
      loader: url => new Promise(resolve => {
        started.push(url);
        releases.set(url, resolve);
      }),
    });

    const blocker = queue.add({ id: 'blocker', url: 'blocker', priority: 0 });
    await Promise.resolve();
    const oldCentre = queue.add({ id: 'old-centre', url: 'old-centre', priority: 20 });
    const newCentre = queue.add({ id: 'new-centre', url: 'new-centre', priority: 49 });
    expect(queue.reprioritize('new-centre', 10)).toBe(true);

    releases.get('blocker')?.(image);
    await blocker;
    await Promise.resolve();
    expect(started).toEqual(['blocker', 'new-centre']);

    releases.get('new-centre')?.(image);
    await newCentre;
    await Promise.resolve();
    releases.get('old-centre')?.(image);
    await oldCentre;
    expect(started).toEqual(['blocker', 'new-centre', 'old-centre']);
  });

  it('frees an active slot immediately when an offscreen request is cancelled', async () => {
    const started: string[] = [];
    const queue = new ImageLoadQueue({
      maxConcurrent: 1,
      loader: url => {
        started.push(url);
        if (url === 'offscreen') return new Promise(() => undefined);
        return Promise.resolve(image);
      },
    });

    const offscreen = queue.add({ id: 'offscreen', url: 'offscreen', priority: 10 })
      .catch(error => error.error.message);
    await Promise.resolve();
    const visible = queue.add({ id: 'visible', url: 'visible', priority: 10 });
    expect(queue.cancel('offscreen')).toBe(true);

    await expect(offscreen).resolves.toBe('Request cancelled');
    await expect(visible).resolves.toMatchObject({ id: 'visible' });
    expect(started).toEqual(['offscreen', 'visible']);
  });
});
