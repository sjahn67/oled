import * as i2c from 'i2c-bus';

export interface CanvasLike {
    getContext(contextId: '2d' | string): any;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class SH1107 {
    public readonly width: number;
    public readonly height: number;
    public readonly pages: number;
    private busNumber: number;
    private address: number;
    private bus!: i2c.I2CBus;
    private buffer: Buffer;
    public columnOffset: number = 0; // 패널에 따라 0x00 또는 0x02

    // SH1107 명령어 상수 (sh1107-spi.ts 기준)
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

    constructor(busNumber: number = 1, address: number = 0x3C, width: number = 128, height: number = 128) {
        this.busNumber = busNumber;
        this.address = address;
        this.width = width;
        this.height = height;
        this.pages = height / 8; // 128 / 8 = 16 pages
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

    /**
     * 명령어를 전송 (2바이트 더블 커맨드는 하나의 I2C 트랜잭션으로 원자적 전송)
     */
    public writeCommand(cmd: number, ...params: number[]): void {
        const buf = Buffer.from([0x00, cmd, ...params]);
        try {
            this.bus.i2cWriteSync(this.address, buf.length, buf);
        } catch {
            // 라즈베리파이 I2C 컨트롤러의 ACK 타이밍 거짓 에러 무시
        }
    }

    /**
     * 화면 데이터를 전송 (Control byte 0x40 + Data)
     */
    public writeData(data: Buffer): void {
        const buf = Buffer.alloc(data.length + 1);
        buf[0] = 0x40; // Co=0, D/C#=1 (Data)
        data.copy(buf, 1);
        try {
            this.bus.i2cWriteSync(this.address, buf.length, buf);
        } catch {
            // 라즈베리파이 I2C 컨트롤러의 ACK 타이밍 거짓 에러 무시
        }
    }

    /**
     * sh1107-spi.ts 표준 메모리/레지스터 초기화 적용
     */
    public async init(): Promise<void> {
        console.log("-> Initializing SH1107 (I2C, Memory Align)...");

        // 1. 디스플레이 OFF
        this.writeCommand(SH1107.Commands.DISPLAY_OFF);

        // 2. 디스플레이 시작 라인 설정 (DC 00)
        this.writeCommand(SH1107.Commands.SET_DISPLAY_START_LINE, 0x00);

        // 3. 디스플레이 오프셋 설정 (D3 00)
        this.writeCommand(SH1107.Commands.SET_DISPLAY_OFFSET, 0x00);

        // 4. 멀티플렉스 비율 (A8 7F = 128)
        this.writeCommand(SH1107.Commands.SET_MULTIPLEX_RATIO, this.height - 1);

        // 5. 세그먼트 리매핑 (A0)
        this.writeCommand(SH1107.Commands.SET_SEGMENT_REMAP_0);

        // 6. COM 스캔 방향 (C0)
        this.writeCommand(SH1107.Commands.SET_COM_SCAN_INC);

        // 7. 내장 DC-DC 승압 컨버터 ON (AD 8B)
        this.writeCommand(SH1107.Commands.SET_DC_DC, 0x8B);

        // 8. 명암비(Contrast) 설정 (81 80)
        this.writeCommand(SH1107.Commands.SET_CONTRAST, 0x80);

        // 9. 정상 디스플레이 모드 (A6)
        this.writeCommand(SH1107.Commands.NORMAL_DISPLAY);

        await delay(50);

        // 10. 메모리 초기화 후 화면 송출
        this.clear();
        this.display();

        // 11. 디스플레이 ON
        this.writeCommand(SH1107.Commands.DISPLAY_ON);
        await delay(50);

        console.log("-> SH1107 I2C Driver Initialized.");
    }

    /**
     * sh1107-spi.ts 메모리 매핑 방식과 동일하게 버퍼를 페이지 단위로 화면에 전송
     */
    public display(): void {
        const pageBuf = Buffer.alloc(this.width + 1);
        pageBuf[0] = 0x40; // Control Byte: Data Mode

        for (let page = 0; page < this.pages; page++) {
            // 페이지 시작 주소 (B0 + page)
            this.writeCommand(SH1107.Commands.SET_PAGE_START + page);

            // 컬럼 주소 설정 (Lower Column + Higher Column)
            const col = this.columnOffset;
            this.writeCommand(SH1107.Commands.SET_COLUMN_LOW | (col & 0x0F));
            this.writeCommand(SH1107.Commands.SET_COLUMN_HIGH | ((col >> 4) & 0x0F));

            // 버퍼에서 한 페이지(128바이트) 복사 후 전송
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
        this.buffer.fill(0x00);
    }

    /**
     * sh1107-spi.ts와 동일한 픽셀 단위 조작 메서드
     */
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

    /**
     * Canvas 그래픽 데이터를 버퍼에 매핑
     */
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
            this.writeCommand(SH1107.Commands.DISPLAY_OFF);
        } catch {}
        if (this.bus) {
            try {
                this.bus.closeSync();
            } catch {}
        }
    }
}
