export default class Mutex {
  queue: Array<(_: void) => void> = [];

  async synchronize<T>(fn: () => Promise<T>): Promise<T> {
    const lock = new Promise(resolve => this.queue.push(resolve));
    if (this.queue.length === 1) this.queue[0]();
    await lock;
    try {
      return await fn();
    } finally {
      this.queue.shift();
      this.queue[0]?.();
    }
  }
}
