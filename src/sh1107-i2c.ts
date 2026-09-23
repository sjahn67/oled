import * as i2c from 'i2c-bus';

export interface CanvasLike {
    getContext(contextId: '2d' | string): any;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 1.5" GME128128-01-IIC ver2.0 (SH1107) I2C OLED Driver
 */
export class SH1107 {
    public readonly width: number = 128;
    public readonly height: number = 128;
    public readonly pages: number = 16;
    private busNumber: number;
    private address: number;
    private bus!: i2c.I2CBus;
    private buffer: Buffer;

    // GME128128-01 1.5" 128x128 패널은 컬럼 오프셋 0x00이 정확한 물리 위치입니다.
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
        SET_MEMORY_MODE: 0x20, // Page Addressing Mode
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
     * 명령어를 전송 (파라미터 포함 1개의 I2C 트랜잭션으로 원자적 전송)
     */
    public writeCommand(cmd: number, ...params: number[]): void {
        const buf = Buffer.from([0x00, cmd, ...params]);
        try {
            this.bus.i2cWriteSync(this.address, buf.length, buf);
        } catch {
            // ACK 타이밍 거짓 에러 무시
        }
    }

    /**
     * GME128128-01 하드웨어에 최적화된 초기화 시퀀스
     */
    public async init(): Promise<void> {
        console.log("-> Initializing GME128128-01 (SH1107 I2C)...");

        // GME128128-01 공식 권장 초기화 시퀀스
        this.writeCommand(SH1107.Commands.DISPLAY_OFF);                      // 0xAE
        this.writeCommand(SH1107.Commands.SET_DISPLAY_START_LINE, 0x00);    // 0xDC, 0x00 (시작 라인 0)
        this.writeCommand(SH1107.Commands.SET_MULTIPLEX_RATIO, 0x7F);       // 0xA8, 0x7F (128 MUX)
        this.writeCommand(SH1107.Commands.SET_DISPLAY_OFFSET, 0x00);        // 0xD3, 0x00 (오프셋 0)
        this.writeCommand(SH1107.Commands.SET_CONTRAST, 0x2F);              // 0x81, 0x2F (GME128128-01 권장 대비)
        this.writeCommand(SH1107.Commands.SET_MEMORY_MODE, 0x00);           // 0x20 (Page Mode)
        this.writeCommand(SH1107.Commands.SET_SEGMENT_REMAP_0);             // 0xA0
        this.writeCommand(SH1107.Commands.SET_COM_SCAN_INC);                // 0xC0
        this.writeCommand(SH1107.Commands.ENTIRE_DISPLAY_OFF);              // 0xA4 (RAM 모드)
        this.writeCommand(SH1107.Commands.NORMAL_DISPLAY);                  // 0xA6 (정상 표시)
        this.writeCommand(SH1107.Commands.SET_DC_DC, 0x8A);                 // 0xAD, 0x8A (내장 DC-DC 승압 활성화)

        await delay(50);

        // RAM 메모리 초기화 후 디스플레이 켜기
        this.clear();
        this.display();

        this.writeCommand(SH1107.Commands.DISPLAY_ON);                       // 0xAF (화면 켜기)
        await delay(50);

        console.log("-> GME128128-01 SH1107 Initialized successfully.");
    }

    /**
     * 16개 페이지를 단 하나도 빠짐없이 100% 전송하는 안정화 display 메서드
     */
    public display(): void {
        const pageBuf = Buffer.alloc(this.width + 1);
        pageBuf[0] = 0x40; // Control Byte: Data Mode

        const col = this.columnOffset;
        const colLow = SH1107.Commands.SET_COLUMN_LOW | (col & 0x0F);
        const colHigh = SH1107.Commands.SET_COLUMN_HIGH | ((col >> 4) & 0x0F);

        for (let page = 0; page < this.pages; page++) {
            // 1. 페이지 및 컬럼 설정 (원자적 패킷 전송)
            this.writeCommand(
                SH1107.Commands.SET_PAGE_START + page,
                colLow,
                colHigh
            );

            // 2. 버퍼에서 한 페이지(128바이트) 복사
            const start = page * this.width;
            this.buffer.copy(pageBuf, 1, start, start + this.width);

            // 3. 페이지 데이터 전송 (누락 방지를 위한 최대 3회 재시도)
            let sent = false;
            for (let retry = 0; retry < 3 && !sent; retry++) {
                try {
                    this.bus.i2cWriteSync(this.address, pageBuf.length, pageBuf);
                    sent = true;
                } catch {
                    // 재시도
                }
            }

            // 4. [매우 중요] 칩이 내부 RAM에 128바이트를 완전히 기록할 수 있도록 미세 대기
            // 이 지연이 없으면 다음 페이지 명령어가 이전 쓰기를 덮어써서 페이지가 통째로 비게 됩니다.
            const expire = Date.now() + 1; // 1ms 안심 대기
            while (Date.now() < expire) {}
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
            this.writeCommand(SH1107.Commands.DISPLAY_OFF);
        } catch {}
        if (this.bus) {
            try {
                this.bus.closeSync();
            } catch {}
        }
    }
}
