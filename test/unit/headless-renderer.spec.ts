import { HeadlessRenderer } from '../../src/player/renderers/headless-renderer';

describe('HeadlessRenderer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resumes a paused video with the remaining time budget', async () => {
    const renderer = new HeadlessRenderer(1_000);
    const onEnded = jest.fn();

    await renderer.renderVideo('video://1', onEnded);
    jest.advanceTimersByTime(400);
    await renderer.pause();

    jest.advanceTimersByTime(1_000);
    expect(onEnded).not.toHaveBeenCalled();

    await renderer.resume();
    jest.advanceTimersByTime(599);
    expect(onEnded).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });
});
