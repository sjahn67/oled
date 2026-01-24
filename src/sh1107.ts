import * as i2c from 'i2c-bus';

/**
 * SH1107 OLED 디스플레이 컨트롤러 클래스
 * 128x64 픽셀 OLED 디스플레이를 I2C로 제어
 */
class SH1107Display {
    private bus: i2c.I2CBus;
    private address: number;
    private width: number = 128;
    private height: number = 64;
    private pages: number = 8; // 64픽셀 ÷ 8 = 8페이지
    private buffer: Buffer;

    // SH1107 명령어 상수
    private static readonly Commands = {
        SET_CONTRAST: 0x8100,
        ENTIRE_DISPLAY_ON: 0xA5,
        ENTIRE_DISPLAY_OFF: 0xA4,
        NORMAL_DISPLAY: 0xA6,
        INVERSE_DISPLAY: 0xA7,
        DISPLAY_OFF: 0xAE,
        DISPLAY_ON: 0xAF,
        SET_DISPLAY_OFFSET: 0xD300,
        SET_MULTIPLEX_RATIO: 0xA800,
        SET_SEGMENT_REMAP_0: 0xA0,
        SET_SEGMENT_REMAP_127: 0xA1,
        SET_COM_SCAN_INC: 0xC0,
        SET_COM_SCAN_DEC: 0xC8,
        SET_COM_PINS: 0xDA,
        SET_DISPLAY_CLOCK_DIV: 0xD550,
        SET_PRECHARGE: 0xD922,
        SET_VCOM_DETECT: 0xDB20,
        SET_CHARGE_PUMP: 0x8D14,
        SET_MEMORY_MODE: 0x2000,
        SET_COLUMN_LOW: 0x00,
        SET_COLUMN_HIGH: 0x10,
        SET_PAGE_START: 0xB0,
        SET_START_LINE: 0x40,
    };

    constructor(busNumber: number = 1, address: number = 0x3c) {
        this.address = address;
        this.buffer = Buffer.alloc((this.width * this.height) / 8);

        // I2C 버스 열기
        this.bus = i2c.openSync(busNumber);
    }

    /**
     * 명령어를 OLED에 전송
     */
    private writeCommand(command: number): void {
        let buffer: Buffer;
        if (command > 0xFF) {
            buffer = Buffer.from([0x40, (0xFF00 & command) >> 8, 0x00ff & command]);
        } else {
            buffer = Buffer.from([0x00, 0x00ff & command]); // 0x00은 명령어 모드
        }
        this.bus.i2cWriteSync(this.address, buffer.length, buffer);
    }

    /**
     * 데이터를 OLED에 전송
     */
    private writeData(data: number[]): void {
        const buffer = Buffer.from([0x40, ...data]); // 0x40은 데이터 모드
        this.bus.i2cWriteSync(this.address, buffer.length, buffer);
    }

    /**
     * OLED 디스플레이 초기화
     */
    public async initialize(): Promise<void> {
        console.log('SH1107 OLED 초기화 중...');

        try {
            // 디스플레이 끄기
            this.writeCommand(SH1107Display.Commands.DISPLAY_OFF);

            // 디스플레이 설정
            this.writeCommand(SH1107Display.Commands.SET_DISPLAY_CLOCK_DIV);

            this.writeCommand(SH1107Display.Commands.SET_MULTIPLEX_RATIO | 0x3F);

            this.writeCommand(SH1107Display.Commands.SET_DISPLAY_OFFSET | 0x00);

            this.writeCommand(SH1107Display.Commands.SET_START_LINE | 0x00); // 시작 라인 0

            this.writeCommand(SH1107Display.Commands.SET_CHARGE_PUMP | 0x14);

            this.writeCommand(SH1107Display.Commands.SET_MEMORY_MODE | 0x00);

            this.writeCommand(SH1107Display.Commands.SET_SEGMENT_REMAP_127); // 세그먼트 재매핑
            this.writeCommand(SH1107Display.Commands.SET_COM_SCAN_DEC); // COM 스캔 방향

            this.writeCommand(SH1107Display.Commands.SET_COM_PINS | 0x12);

            this.writeCommand(SH1107Display.Commands.SET_CONTRAST | 0xCf);

            this.writeCommand(SH1107Display.Commands.SET_PRECHARGE | 0xF1);

            this.writeCommand(SH1107Display.Commands.SET_VCOM_DETECT);
            this.writeCommand(0x40); // VCOM 감지 레벨

            this.writeCommand(SH1107Display.Commands.ENTIRE_DISPLAY_OFF);
            this.writeCommand(SH1107Display.Commands.NORMAL_DISPLAY);

            // 디스플레이 켜기
            this.writeCommand(SH1107Display.Commands.DISPLAY_ON);

            // 화면 클리어
            this.clear();
            this.display();

            console.log('SH1107 OLED 초기화 완료!');
        } catch (error) {
            console.error('OLED 초기화 실패:', error);
            throw error;
        }
    }

    /**
     * 버퍼의 내용을 OLED에 표시
     */
    public display(): void {
        for (let page = 0; page < this.pages; page++) {
            // 페이지 설정
            this.writeCommand(SH1107Display.Commands.SET_PAGE_START + page);
            this.writeCommand(SH1107Display.Commands.SET_COLUMN_LOW | 0x00);
            this.writeCommand(SH1107Display.Commands.SET_COLUMN_HIGH | 0x00);

            // 한 페이지의 데이터 전송 (128바이트)
            const pageData: number[] = [];
            for (let x = 0; x < this.width; x++) {
                const bufferIndex = x + (page * this.width);
                pageData.push(this.buffer[bufferIndex]);
            }

            this.writeData(pageData);
        }
    }

    /**
     * 버퍼 클리어
     */
    public clear(): void {
        this.buffer.fill(0x00);
    }

    /**
     * 픽셀 설정
     */
    public setPixel(x: number, y: number, color: boolean = true): void {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return; // 범위 밖
        }

        const page = Math.floor(y / 8);
        const bit = y % 8;
        const index = x + (page * this.width);

        if (color) {
            this.buffer[index] |= (1 << bit); // 픽셀 켜기
        } else {
            this.buffer[index] &= ~(1 << bit); // 픽셀 끄기
        }
    }

    /**
     * 직사각형 그리기
     */
    public drawRect(x: number, y: number, width: number, height: number, fill: boolean = false): void {
        if (fill) {
            for (let i = x; i < x + width; i++) {
                for (let j = y; j < y + height; j++) {
                    this.setPixel(i, j, true);
                }
            }
        } else {
            // 테두리만 그리기
            for (let i = x; i < x + width; i++) {
                this.setPixel(i, y, true); // 위쪽
                this.setPixel(i, y + height - 1, true); // 아래쪽
            }
            for (let j = y; j < y + height; j++) {
                this.setPixel(x, j, true); // 왼쪽
                this.setPixel(x + width - 1, j, true); // 오른쪽
            }
        }
    }

    /**
     * 선 그리기 (Bresenham 알고리즘)
     */
    public drawLine(x0: number, y0: number, x1: number, y1: number): void {
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;

        let x = x0;
        let y = y0;

        while (true) {
            this.setPixel(x, y, true);

            if (x === x1 && y === y1) break;

            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x += sx;
            }
            if (e2 < dx) {
                err += dx;
                y += sy;
            }
        }
    }

    /**
     * 원 그리기
     */
    public drawCircle(centerX: number, centerY: number, radius: number, fill: boolean = false): void {
        if (fill) {
            for (let x = -radius; x <= radius; x++) {
                for (let y = -radius; y <= radius; y++) {
                    if (x * x + y * y <= radius * radius) {
                        this.setPixel(centerX + x, centerY + y, true);
                    }
                }
            }
        } else {
            // 원 둘레만 그리기 (Midpoint Circle Algorithm)
            let x = 0;
            let y = radius;
            let d = 3 - 2 * radius;

            while (y >= x) {
                // 8개의 대칭점에 픽셀 설정
                this.setPixel(centerX + x, centerY + y, true);
                this.setPixel(centerX + y, centerY + x, true);
                this.setPixel(centerX - x, centerY + y, true);
                this.setPixel(centerX - y, centerY + x, true);
                this.setPixel(centerX + x, centerY - y, true);
                this.setPixel(centerX + y, centerY - x, true);
                this.setPixel(centerX - x, centerY - y, true);
                this.setPixel(centerX - y, centerY - x, true);

                x++;
                if (d > 0) {
                    y--;
                    d = d + 4 * (x - y) + 10;
                } else {
                    d = d + 4 * x + 6;
                }
            }
        }
    }

    /**
     * 간단한 텍스트 표시 (5x8 폰트)
     */
    public drawText(x: number, y: number, text: string): void {
        const font5x8: { [key: string]: number[] } = {
            'A': [0x7C, 0x12, 0x11, 0x12, 0x7C],
            'B': [0x7F, 0x49, 0x49, 0x49, 0x36],
            'C': [0x3E, 0x41, 0x41, 0x41, 0x22],
            'D': [0x7F, 0x41, 0x41, 0x22, 0x1C],
            'E': [0x7F, 0x49, 0x49, 0x49, 0x41],
            'F': [0x7F, 0x09, 0x09, 0x09, 0x01],
            'G': [0x3E, 0x41, 0x49, 0x49, 0x7A],
            'H': [0x7F, 0x08, 0x08, 0x08, 0x7F],
            'I': [0x00, 0x41, 0x7F, 0x41, 0x00],
            'J': [0x20, 0x40, 0x41, 0x3F, 0x01],
            'K': [0x7F, 0x08, 0x14, 0x22, 0x41],
            'L': [0x7F, 0x40, 0x40, 0x40, 0x40],
            'M': [0x7F, 0x02, 0x0C, 0x02, 0x7F],
            'N': [0x7F, 0x04, 0x08, 0x10, 0x7F],
            'O': [0x3E, 0x41, 0x41, 0x41, 0x3E],
            'P': [0x7F, 0x09, 0x09, 0x09, 0x06],
            'Q': [0x3E, 0x41, 0x51, 0x21, 0x5E],
            'R': [0x7F, 0x09, 0x19, 0x29, 0x46],
            'S': [0x46, 0x49, 0x49, 0x49, 0x31],
            'T': [0x01, 0x01, 0x7F, 0x01, 0x01],
            'U': [0x3F, 0x40, 0x40, 0x40, 0x3F],
            'V': [0x1F, 0x20, 0x40, 0x20, 0x1F],
            'W': [0x3F, 0x40, 0x30, 0x40, 0x3F],
            'X': [0x63, 0x14, 0x08, 0x14, 0x63],
            'Y': [0x07, 0x08, 0x70, 0x08, 0x07],
            'Z': [0x61, 0x51, 0x49, 0x45, 0x43],
            ' ': [0x00, 0x00, 0x00, 0x00, 0x00],
            '0': [0x3E, 0x51, 0x49, 0x45, 0x3E],
            '1': [0x00, 0x42, 0x7F, 0x40, 0x00],
            '2': [0x42, 0x61, 0x51, 0x49, 0x46],
            '3': [0x21, 0x41, 0x45, 0x4B, 0x31],
            '4': [0x18, 0x14, 0x12, 0x7F, 0x10],
            '5': [0x27, 0x45, 0x45, 0x45, 0x39],
            '6': [0x3C, 0x4A, 0x49, 0x49, 0x30],
            '7': [0x01, 0x71, 0x09, 0x05, 0x03],
            '8': [0x36, 0x49, 0x49, 0x49, 0x36],
            '9': [0x06, 0x49, 0x49, 0x29, 0x1E],
        };

        let currentX = x;
        for (const char of text.toUpperCase()) {
            if (font5x8[char]) {
                const charData = font5x8[char];
                for (let col = 0; col < 5; col++) {
                    const columnData = charData[col];
                    for (let row = 0; row < 8; row++) {
                        if (columnData & (1 << row)) {
                            this.setPixel(currentX + col, y + row, true);
                        }
                    }
                }
                currentX += 6; // 문자 간격
            }
        }
    }

    /**
     * 리소스 정리
     */
    public close(): void {
        try {
            this.writeCommand(SH1107Display.Commands.DISPLAY_OFF);
            this.bus.closeSync();
            console.log('SH1107 OLED 연결 종료');
        } catch (error) {
            console.error('OLED 종료 중 오류:', error);
        }
    }
}

// 사용 예제
async function main() {
    const display = new SH1107Display(1, 0x3C); // I2C 버스 1, 주소 0x3C

    try {
        await display.initialize();

        // 테스트 패턴 그리기
        console.log('테스트 패턴 표시 중...');

        // 텍스트 표시
        display.drawText(10, 5, "HELLO WORLD");
        display.drawText(10, 15, "SH1107 OLED");
        display.drawText(10, 25, "I2C TEST");

        // 도형 그리기
        display.drawRect(5, 35, 40, 20, false); // 빈 사각형
        display.drawRect(50, 40, 20, 10, true);  // 채운 사각형

        display.drawCircle(100, 45, 8, false); // 빈 원
        display.drawCircle(110, 20, 5, true);  // 채운 원

        display.drawLine(0, 0, 127, 63); // 대각선
        display.drawLine(127, 0, 0, 63); // 반대 대각선

        display.display();
        console.log('테스트 패턴 표시 완료');

        // 5초 후 종료
        setTimeout(() => {
            display.clear();
            display.display();
            display.close();
            console.log('프로그램 종료');
            process.exit(0);
        }, 5000);

    } catch (error) {
        console.error('오류 발생:', error);
        display.close();
        process.exit(1);
    }
}

// 프로세스 종료 시 정리
process.on('SIGINT', () => {
    console.log('\n프로그램 중단됨');
    process.exit(0);
});

process.on('exit', () => {
    console.log('프로그램 종료');
});

// 프로그램 실행
if (require.main === module) {
    main();
}

export default SH1107Display;