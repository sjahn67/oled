import * as i2c from 'i2c-bus';

export interface CanvasLike {
    getContext(contextId: '2d' | string): any;
}


const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class SH1107 {
    public readonly width: number;
    public readonly height: number;
    private busNumber: number;
    private address: number;
    private bus!: i2c.I2CBus;
    private buffer: Buffer;

    constructor(busNumber: number = 1, address: number = 0x3C, width: number = 128, height: number = 128) {
        this.busNumber = busNumber;
        this.address = address;
        this.width = width;
        this.height = height;
        this.buffer = Buffer.alloc((width * height) / 8, 0x00);
    }

    public open(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            try {
                this.bus = i2c.openSync(this.busNumber);
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }

    public writeCommand(cmd: number): void {
        try {
            // Control Byte 0x00: Co=0, D/C#=0 (Command)
            this.bus.writeByteSync(this.address, 0x00, cmd);
        } catch {
            // 라즈베리파이 I2C 컨트롤러의 ACK 타이밍 거짓 에러 무시
        }
    }

    public writeData(data: Buffer): void {
        const buf = Buffer.alloc(data.length + 1);
        buf[0] = 0x40; // Control Byte 0x40: Co=0, D/C#=1 (Data)
        data.copy(buf, 1);
        try {
            this.bus.i2cWriteSync(this.address, buf.length, buf);
        } catch {
            // 라즈베리파이 I2C 컨트롤러의 ACK 타이밍 거짓 에러 무시
        }
    }

    public async init(): Promise<void> {
        console.log("-> Initializing SH1107 (I2C)...");

        // 1. 초기화 커맨드 순차 전송
        const cmds = [
            0xAE,       // Display OFF
            0xD5, 0x50, // Set Display Clock Divide Ratio / Oscillator Frequency
            0x20,       // Set Memory Addressing Mode (Page addressing mode)
            0x81, 0x80, // Contrast Control (50%)
            0xAD, 0x8B, // Built-in DC-DC ON (내장 컨버터 활성화)
            0x30,       // Set Discharge / Pre-charge Period
            0x40,       // Set Display Start Line = 0
            0xA0,       // Segment Re-map normal (0xA0: normal, 0xA1: reverse)
            0xC0,       // Common Scan Direction normal (0xC0: normal, 0xC8: reverse)
            0xA8, 0x7F, // Multiplex Ratio (128)
            0xD3, 0x00, // Display Offset = 0
            0xDB, 0x35, // VCOM Deselect Level
            0xA4,       // Output follows RAM content (노이즈 방지)
            0xA6,       // Normal Display (0: Black, 1: White)
            0xAF        // Display ON
        ];

        for (const c of cmds) {
            this.writeCommand(c);
            await delay(2);
        }
        await delay(50);

        // 2. 초기화 직후 화면 깨끗하게 지우기 (노이즈 제거)
        this.clear();
        this.display();
        console.log("-> SH1107 I2C Driver Initialized.");
    }

    public display(): void {
        const pages = this.height / 8;
        const pageBuf = Buffer.alloc(this.width + 1);
        pageBuf[0] = 0x40; // Data Control Byte

        for (let page = 0; page < pages; page++) {
            this.writeCommand(0xB0 + page); // Page address
            this.writeCommand(0x00);        // Lower Column = 0
            this.writeCommand(0x10);        // Higher Column = 0

            const start = page * this.width;
            this.buffer.copy(pageBuf, 1, start, start + this.width);
            try {
                this.bus.i2cWriteSync(this.address, pageBuf.length, pageBuf);
            } catch {
                // 라즈베리파이 I2C 컨트롤러의 ACK 타이밍 거짓 에러 무시
            }
        }
    }

    public clear(): void {
        this.buffer.fill(0);
    }

    public drawCanvas(canvas: CanvasLike): void {
        const ctx = canvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, this.width, this.height).data;
        this.buffer.fill(0);
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (imgData[(y * this.width + x) * 4] > 128) {
                    const page = Math.floor(y / 8);
                    const bit = y % 8;
                    const idx = x + (page * this.width);
                    if (idx < this.buffer.length) {
                        this.buffer[idx] |= (1 << bit);
                    }
                }
            }
        }
    }

    public cleanup(): void {
        try {
            this.writeCommand(0xAE); // Display OFF
        } catch {}
        if (this.bus) {
            try {
                this.bus.closeSync();
            } catch {}
        }
    }
}
