// bus/I2CBusManager.ts
import { Mutex } from '../utils/Mutex';
import { II2CBus } from './II2CBus';

export class I2CBusManager {
    private static managers = new Map<II2CBus, I2CBusManager>();
    private mutex: Mutex;
    private bus: II2CBus;
    private enabled: boolean;
    private refCount: number = 0;

    private constructor(bus: II2CBus) {
        this.bus = bus;
        this.enabled = true;
        this.mutex = new Mutex();
    }

    static getInstance(bus: II2CBus): I2CBusManager {
        if (!this.managers.has(bus)) {
            this.managers.set(bus, new I2CBusManager(bus));
        }
        const manager = this.managers.get(bus)!;
        manager.refCount++;
        return manager;
    }

    async withLock<T>(fn: (bus: II2CBus) => Promise<T>): Promise<T> {
        return this.mutex.lock(() => fn(this.bus));
    }

    async close(): Promise<void> {
        this.refCount--;
        if (this.refCount <= 0 && this.bus && this.enabled) {
            await this.bus.close();
            I2CBusManager.managers.delete(this.bus);
            this.enabled = false;
        }
    }
}
