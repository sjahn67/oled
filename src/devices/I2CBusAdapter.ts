// adapters/I2CBusAdapter.ts
import * as i2c from 'i2c-bus';
import { II2CBus } from './II2CBus';

export class I2CBusAdapter implements II2CBus {
    private bus: i2c.PromisifiedBus;

    private constructor(bus: i2c.PromisifiedBus) {
        this.bus = bus;
    }

    static async create(busNumber: number): Promise<I2CBusAdapter> {
        const bus = await i2c.openPromisified(busNumber);
        return new I2CBusAdapter(bus);
    }

    async writeByte(addr: number, cmd: number, byte: number): Promise<void> {
        await this.bus.writeByte(addr, cmd, byte);
    }

    async readByte(addr: number, cmd: number): Promise<number> {
        return await this.bus.readByte(addr, cmd);
    }

    async i2cWrite(addr: number, length: number, buffer: Buffer): Promise<void> {
        await this.bus.i2cWrite(addr, length, buffer);
    }

    async i2cRead(addr: number, length: number, buffer: Buffer): Promise<void> {
        await this.bus.i2cRead(addr, length, buffer);
    }

    async close(): Promise<void> {
        await this.bus.close();
    }
}
