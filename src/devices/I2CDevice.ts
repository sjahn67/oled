// devices/I2CDevice.ts
import { II2CBus } from './II2CBus';
import { I2CBusManager } from './I2CBusManager';

export class I2CDevice {
    private address: number;
    private busManager: I2CBusManager;

    constructor(bus: II2CBus, address: number) {
        this.address = address;
        this.busManager = I2CBusManager.getInstance(bus);
    }

    async writeByte(cmd: number, byte: number): Promise<void> {
        await this.busManager.withLock(async (bus) => {
            await bus.writeByte(this.address, cmd, byte);
        });
    }

    async readByte(cmd: number): Promise<number> {
        return await this.busManager.withLock(async (bus) => {
            return await bus.readByte(this.address, cmd);
        });
    }

    async writeBuffer(buffer: Buffer): Promise<void> {
        await this.busManager.withLock(async (bus) => {
            await bus.i2cWrite(this.address, buffer.length, buffer);
        });
    }

    async readBuffer(length: number): Promise<Buffer> {
        return await this.busManager.withLock(async (bus) => {
            const buffer = Buffer.alloc(length);
            await bus.i2cRead(this.address, length, buffer);
            return buffer;
        });
    }

    async close(): Promise<void> {
        await this.busManager.close();
    }
}
