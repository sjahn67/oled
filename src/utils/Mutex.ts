export class Mutex {
    private mutex = Promise.resolve();

    async lock<T>(fn: () => Promise<T>): Promise<T> {
        let unlockNext!: () => void;
        const next = new Promise<void>(resolve => (unlockNext = resolve));

        const current = this.mutex;
        this.mutex = this.mutex.then(() => next);

        await current;

        try {
            return await fn();
        } finally {
            unlockNext();
        }
    }
}
