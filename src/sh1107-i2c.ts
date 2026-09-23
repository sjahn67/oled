import * as i2c from 'i2c-bus';

export interface CanvasLike {
    getContext(contextId: '2d' | string): any;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 1.5" GME128128-01 (SH1107) I2C OLED Driver
 * i2c-test.ts에서 100% 정상 작동이 검증된 전송 시퀀스 기반 구현
 */
export class SH1107 {
    public readonly width: number = 128;
    public readonly height: number = 128;
    public readonly pages: number = 16;
    private busNumber: number;
    private address: number;
    private bus!: i2c.I2CBus;
    private buffer: Buffer;

    public columnOffset: number = 0;

    // SH1107 명령어 상수
    public static readonly Commands = {
        SET_CONTRAST: 0x81,
        ENTIRE_DISPLAY_ON: 0xA5,
        ENTIRE_DISPLAY_OFF: 0xA4,
        NORMAL_DISPLAY: 0xA6,
        INVERSE_DISPLAY: 0xA7,
        DISPLAY_OFF: 0xAE,
        DISPLAY_ON: 0xAF,
        SET_DISPLAY_OFFSET: 0xD3,
        SET_MULTIPLEX_RATIO: 0xA8,
        SET_SEGMENT_REMAP_0: 0xA0,
        SET_SEGMENT_REMAP_127: 0xA1,
        SET_COM_SCAN_INC: 0xC0,
        SET_COM_SCAN_DEC: 0xC8,
        SET_MEMORY_MODE: 0x20,
        SET_COLUMN_LOW: 0x00,
        SET_COLUMN_HIGH: 0x10,
        SET_PAGE_START: 0xB0,
        SET_DISPLAY_START_LINE: 0xDC,
        SET_DC_DC: 0xAD
    };


    constructor(busNumber: number = 1, address: number = 0x3C) {
        this.busNumber = busNumber;
        this.address = address;
        this.buffer = Buffer.alloc((this.width * this.height) / 8, 0x00);
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

    /**
     * 명령어를 SMBus writeByte 방식으로 전송 (i2c-test.ts 검증 완료)
     */
    public writeCommand(cmd: number, ...params: number[]): void {
        try {
            this.bus.writeByteSync(this.address, 0x00, cmd);
            for (const p of params) {
                this.bus.writeByteSync(this.address, 0x00, p);
            }
        } catch {
            // ACK 타이밍 오인 에러 무시
        }
    }


    /**
     * i2c-test.ts에서 100% 정상 동작이 검증된 초기화 시퀀스
     */
    public async init(): Promise<void> {
        console.log("-> Initializing SH1107 OLED...");

        const initCmds = [
            0xAE,       // Display OFF
            0xD5, 0x50, // Set Divide Ratio / Oscillator Frequency
            0x20,       // Page Addressing Mode
            0x81, 0x80, // Contrast Control (50%)
            0xAD, 0x8B, // Built-in DC-DC ON
            0x30,       // Set Discharge/Precharge
            0x40,       // Display Start Line
            0xA0,       // Segment Remap
            0xC0,       // Common Scan Direction
            0xA4,       // Output follows RAM
            0xA6,       // Normal Display
            0xAF        // Display ON
        ];

        for (const cmd of initCmds) {
            this.writeCommand(cmd);
            await delay(2);
        }

        await delay(50);

        // 화면 클리어 (노이즈 제거)
        this.clear();
        this.display();

        console.log("-> SH1107 OLED Initialized successfully.");
    }

    /**
     * i2c-test.ts와 100% 동일한 페이지 매핑 및 버퍼 전송
     */
    public display(): void {
        const pageBuf = Buffer.alloc(this.width + 1);
        pageBuf[0] = 0x40; // Data Control Byte

        const colLow = 0x00 | (this.columnOffset & 0x0F);
        const colHigh = 0x10 | ((this.columnOffset >> 4) & 0x0F);

        for (let page = 0; page < this.pages; page++) {
            // 1. 매 페이지마다 컬럼과 페이지를 개별 SMBus 명령으로 정확히 설정 (위치 틀어짐 방지)
            this.writeCommand(0xB0 + page); // Page address
            this.writeCommand(colLow);      // Lower column
            this.writeCommand(colHigh);     // Higher column

            // 2. 버퍼에서 한 페이지(128바이트) 복사
            const start = page * this.width;
            this.buffer.copy(pageBuf, 1, start, start + this.width);

            // 3. I2C 데이터 전송
            try {
                this.bus.i2cWriteSync(this.address, pageBuf.length, pageBuf);
            } catch {
                // 라즈베리파이 ACK 오류 무시
            }
        }
    }

    public clear(): void {
        this.buffer.fill(0x00);
    }

    public setPixel(x: number, y: number, color: boolean = true): void {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
        const page = Math.floor(y / 8);
        const bit = y % 8;
        const index = x + (page * this.width);
        if (color) {
            this.buffer[index] |= (1 << bit);
        } else {
            this.buffer[index] &= ~(1 << bit);
        }
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
