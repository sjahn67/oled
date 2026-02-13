// @ts-ignore
import * as spi from 'spi-device';
import rpio from 'rpio';
import { createCanvas, Canvas } from 'canvas';

// --- 설정 영역 ---
const DISPLAY_WIDTH = 128;
const DISPLAY_HEIGHT = 128;
const SPI_SPEED_HZ = 2000000; // 속도를 위해 2MHz로 상향 조정 (문제 발생 시 1000000으로 낮추세요)
const PIN_DC = 24;
const PIN_RST = 25;

class SH1107 {
    private spiDevice: any;
    private buffer: Buffer;

    constructor() {
        this.buffer = Buffer.alloc((DISPLAY_WIDTH * DISPLAY_HEIGHT) / 8, 0x00);
        rpio.init({ mapping: 'gpio' });
        rpio.open(PIN_DC, rpio.OUTPUT, rpio.LOW);
        rpio.open(PIN_RST, rpio.OUTPUT, rpio.LOW);
    }

    private async delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    public open() {
        return new Promise<void>((resolve, reject) => {
            this.spiDevice = spi.open(0, 0, { mode: 0 }, (err: any) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    private writeData(data: Buffer) {
        rpio.write(PIN_DC, rpio.HIGH);
        const message = [{ sendBuffer: data, byteLength: data.length, speedHz: SPI_SPEED_HZ }];
        this.spiDevice.transferSync(message);
    }

    private writeCommand(cmd: number) {
        rpio.write(PIN_DC, rpio.LOW);
        const message = [{ sendBuffer: Buffer.from([cmd]), byteLength: 1, speedHz: SPI_SPEED_HZ }];
        this.spiDevice.transferSync(message);
    }

    public async init() {
        rpio.write(PIN_RST, rpio.HIGH); await this.delay(50);
        rpio.write(PIN_RST, rpio.LOW); await this.delay(100);
        rpio.write(PIN_RST, rpio.HIGH); await this.delay(100);

        const cmds = [
            0xAE, 0x00, 0x10, 0x20, 0x81, 0xA0, 0xC0, 0xDC, 0x00,
            0x81, 0x80, 0xD5, 0x50, 0xD9, 0x22, 0xDB, 0x35,
            0xA8, 0x7F, 0xD3, 0x00, 0xA4, 0xA6, 0xAF
        ];
        for (const c of cmds) this.writeCommand(c);
        await this.delay(100);
    }

    public display() {
        const pages = DISPLAY_HEIGHT / 8;
        for (let page = 0; page < pages; page++) {
            this.writeCommand(0xB0 + page);
            this.writeCommand(0x00);
            this.writeCommand(0x10);
            const start = page * DISPLAY_WIDTH;
            const end = start + DISPLAY_WIDTH;
            this.writeData(this.buffer.slice(start, end));
        }
    }

    public clear() {
        this.buffer.fill(0);
    }

    public cleanup() {
        if (this.spiDevice) this.spiDevice.closeSync();
        rpio.close(PIN_DC);
        rpio.close(PIN_RST);
    }

    // Canvas -> Buffer 변환 (최적화됨)
    public drawCanvas(canvas: Canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
        const data = imageData.data;

        this.clear(); // 버퍼 비우기

        for (let y = 0; y < DISPLAY_HEIGHT; y++) {
            for (let x = 0; x < DISPLAY_WIDTH; x++) {
                // RGBA 중 R값만 확인하여 속도 향상 (흑백이므로)
                const offset = (y * DISPLAY_WIDTH + x) * 4;
                if (data[offset] > 128) { // 밝기가 128 이상이면 ON
                    const page = Math.floor(y / 8);
                    const bit = y % 8;
                    const bufIdx = x + (page * DISPLAY_WIDTH);
                    this.buffer[bufIdx] |= (1 << bit);
                }
            }
        }
    }
}

// --- 애니메이션 데모 로직 ---
async function main() {
    const oled = new SH1107();
    try {
        await oled.open();
        await oled.init();

        const canvas = createCanvas(DISPLAY_WIDTH, DISPLAY_HEIGHT);
        const ctx = canvas.getContext('2d');

        console.log("-> Animation Started! (Press Ctrl+C to stop)");

        // 애니메이션 변수들
        let x = 64, y = 64;
        let dx = 3, dy = 3;
        const radius = 10;
        let textX = DISPLAY_WIDTH;
        let frameCount = 0;

        // 무한 루프
        while (true) {
            // 1. 화면 클리어 (메모리 상)
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);

            // 2. 테두리 그리기
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.strokeRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);

            // 3. 튀어다니는 공 (Bouncing Ball) 계산
            x += dx;
            y += dy;

            // 벽 충돌 처리
            if (x + radius >= DISPLAY_WIDTH || x - radius <= 0) dx = -dx;
            if (y + radius >= DISPLAY_HEIGHT || y - radius <= 0) dy = -dy;

            // 공 그리기
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = 'white';
            ctx.fill();

            // 공 안에 + 표시
            ctx.strokeStyle = 'black';
            ctx.beginPath();
            ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y);
            ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5);
            ctx.stroke();

            // 4. 흐르는 텍스트 (Scrolling Text)
            ctx.fillStyle = 'white';
            ctx.font = '16px Sans';
            ctx.fillText("Raspberry Pi TypeScript Demo", textX, 20); // 상단에 출력

            textX -= 4; // 텍스트 이동 속도
            if (textX < -250) { // 글자가 화면 밖으로 완전히 나가면 리셋
                textX = DISPLAY_WIDTH;
            }

            // 5. FPS 카운터 (하단)
            frameCount++;
            ctx.font = '10px Sans';
            ctx.fillText(`Frame: ${frameCount}`, 5, DISPLAY_HEIGHT - 5);

            // 6. OLED로 전송
            oled.drawCanvas(canvas);
            oled.display();

            // 7. 속도 조절 (너무 빠르면 줄이세요)
            // SPI 전송 자체가 시간이 걸리므로 딜레이가 없어도 되지만,
            // CPU 점유율을 위해 약간의 틈을 줍니다.
            // await new Promise(resolve => setTimeout(resolve, 1)); 
        }

    } catch (e) {
        console.error("Error:", e);
        oled.cleanup();
    }
}

process.on('SIGINT', () => {
    console.log("\n-> Stopping Animation...");
    process.exit();
});

main();