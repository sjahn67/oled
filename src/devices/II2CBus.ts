// interfaces/II2CBus.ts
export interface II2CBus {
    writeByte(addr: number, cmd: number, byte: number): Promise<void>;
    readByte(addr: number, cmd: number): Promise<number>;
    i2cWrite(addr: number, length: number, buffer: Buffer): Promise<void>;
    i2cRead(addr: number, length: number, buffer: Buffer): Promise<void>;
    close(): Promise<void>;
}
