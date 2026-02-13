// @ts-ignore
import * as spi from 'spi-device';
import rpio from 'rpio';
import { createCanvas, Canvas, CanvasRenderingContext2D } from 'canvas';

// --- 하드웨어 설정 ---
const WIDTH = 128;
const HEIGHT = 128;
// [수정] 속도를 1MHz로 낮춰 안정성 확보 (노이즈 방지)
const SPI_SPEED_HZ = 1000000;
const PIN_DC = 24;
const PIN_RST = 25;

// --- 유틸리티 ---
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- SH1107 드라이버 ---
class SH1107 {
    private spiDevice: any;
    private buffer: Buffer;

    constructor() {
        this.buffer = Buffer.alloc((WIDTH * HEIGHT) / 8, 0x00);
        rpio.init({ mapping: 'gpio' });
        rpio.open(PIN_DC, rpio.OUTPUT, rpio.LOW);
        rpio.open(PIN_RST, rpio.OUTPUT, rpio.LOW);
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
        this.spiDevice.transferSync([{ sendBuffer: data, byteLength: data.length, speedHz: SPI_SPEED_HZ }]);
    }

    private writeCommand(cmd: number) {
        rpio.write(PIN_DC, rpio.LOW);
        this.spiDevice.transferSync([{ sendBuffer: Buffer.from([cmd]), byteLength: 1, speedHz: SPI_SPEED_HZ }]);
    }

    public async init() {
        // 1. 하드웨어 리셋
        console.log("-> Hardware Reset...");
        rpio.write(PIN_RST, rpio.HIGH); await delay(50);
        rpio.write(PIN_RST, rpio.LOW); await delay(100);
        rpio.write(PIN_RST, rpio.HIGH); await delay(100);

        // 2. 초기화 커맨드 전송
        const cmds = [
            0xAE,       // Display OFF
            0x00,       // Set Lower Column Address
            0x10,       // Set Higher Column Address
            0x20,       // Set Memory Addressing Mode
            0x81,       // Page Addressing Mode
            0xA0,       // Segment Re-map (좌우 반전이 필요하면 0xA1)
            0xC0,       // Scan Direction (상하 반전이 필요하면 0xC8)
            0xDC, 0x00, // Set Display Start Line
            0x81, 0x80, // Contrast Control
            0xD5, 0x50, // Display Clock Divide Ratio
            0xD9, 0x22, // Pre-charge Period
            0xDB, 0x35, // VCOMH Deselect Level
            0xA8, 0x7F, // Multiplex Ratio (128)
            0xD3, 0x00, // Display Offset
            0xA4,       // Entire Display ON (Resume)
            0xA6,       // Normal Display
            0xAF        // Display ON
        ];

        for (const c of cmds) this.writeCommand(c);
        await delay(100);

        // 3. 초기화 직후 화면 깨끗하게 지우기 (매우 중요)
        this.clear();
        this.display();
        console.log("-> Driver Initialized.");
    }

    public display() {
        const pages = HEIGHT / 8;
        for (let page = 0; page < pages; page++) {
            this.writeCommand(0xB0 + page);

            // [수정] 화면 밀림 방지를 위한 오프셋 (0x02가 일반적)
            // 만약 그래도 밀린다면 0x00 또는 0x04로 변경해보세요.
            this.writeCommand(0x02);

            this.writeCommand(0x10);

            const start = page * WIDTH;
            this.writeData(this.buffer.slice(start, start + WIDTH));
        }
    }

    public clear() {
        this.buffer.fill(0);
    }

    public drawCanvas(canvas: Canvas) {
        const ctx = canvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
        this.clear();
        for (let y = 0; y < HEIGHT; y++) {
            for (let x = 0; x < WIDTH; x++) {
                if (imgData[(y * WIDTH + x) * 4] > 128) {
                    const page = Math.floor(y / 8);
                    const bit = y % 8;
                    const idx = x + (page * WIDTH);
                    if (idx < this.buffer.length) {
                        this.buffer[idx] |= (1 << bit);
                    }
                }
            }
        }
    }

    public cleanup() {
        if (this.spiDevice) this.spiDevice.closeSync();
        rpio.close(PIN_DC);
        rpio.close(PIN_RST);
    }
}

// --- 부팅(초기화) 시퀀스 데모 ---
async function bootSequence(oled: SH1107) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    console.log("-> Playing Boot Sequence...");

    // 단계 1: 화면 완전 삭제 (노이즈 제거)
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    oled.drawCanvas(canvas);
    oled.display();
    await delay(500);

    // 단계 2: 텍스트 및 로딩바 준비
    for (let i = 0; i <= 100; i += 5) { // 5%씩 증가
        // 배경 지우기
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        // 시스템 텍스트
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Sans';
        ctx.textAlign = 'center';
        ctx.fillText("SYSTEM INIT", WIDTH / 2, 45);

        ctx.font = '12px Sans';
        ctx.fillText("SH1107 OLED", WIDTH / 2, 65);

        // 로딩 바 외곽선
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.strokeRect(14, 80, 100, 10);

        // 로딩 바 채우기
        const fillWidth = (100 * (i / 100));
        ctx.fillRect(14, 80, fillWidth, 10);

        // % 텍스트
        ctx.font = '10px Sans';
        ctx.fillText(`${i}%`, WIDTH / 2, 105);

        oled.drawCanvas(canvas);
        oled.display();

        // 속도 조절
        await delay(20);
    }

    // 단계 3: 완료 메시지 깜빡임
    for (let k = 0; k < 3; k++) {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 100, WIDTH, 28); // 하단만 지움
        oled.drawCanvas(canvas);
        oled.display();
        await delay(100);

        ctx.fillStyle = 'white';
        ctx.fillText("READY!", WIDTH / 2, 105);
        oled.drawCanvas(canvas);
        oled.display();
        await delay(200);
    }

    await delay(500);
}

// --- 게임 에셋 ---
const SPRITE_ALIEN = [
    [0, 0, 0, 1, 1, 0, 0, 0], [0, 0, 1, 1, 1, 1, 0, 0], [0, 1, 1, 1, 1, 1, 1, 0], [1, 1, 0, 1, 1, 0, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1], [0, 1, 0, 1, 1, 0, 1, 0], [1, 0, 0, 0, 0, 0, 0, 1], [0, 1, 0, 0, 0, 0, 1, 0]
];
const SPRITE_PLAYER = [
    [0, 0, 0, 1, 1, 0, 0, 0], [0, 0, 1, 1, 1, 1, 0, 0], [0, 1, 1, 1, 1, 1, 1, 0], [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1, 1]
];

function drawBitmap(ctx: CanvasRenderingContext2D, bitmap: number[][], x: number, y: number) {
    ctx.fillStyle = 'white';
    for (let r = 0; r < bitmap.length; r++) {
        for (let c = 0; c < bitmap[r].length; c++) {
            if (bitmap[r][c] === 1) ctx.fillRect(x + c, y + r, 1, 1);
        }
    }
}

// --- 메인 게임 루프 ---
async function gameLoop(oled: SH1107) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // 게임 변수 초기화
    let playerX = WIDTH / 2 - 4;
    let bullets: any[] = [];
    let aliens: any[] = [];
    let alienDir = 1;
    let score = 0;

    const resetAliens = () => {
        aliens = [];
        for (let row = 0; row < 4; row++)
            for (let col = 0; col < 6; col++)
                aliens.push({ x: 10 + col * 14, y: 20 + row * 10, active: true });
    };
    resetAliens();

    while (true) {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        // 외계인 이동
        let hitEdge = false;
        let targetX = -1;
        aliens.forEach(a => {
            if (!a.active) return;
            a.x += alienDir * 2;
            if (targetX === -1 || Math.abs(a.x - playerX) < Math.abs(targetX - playerX)) targetX = a.x;
            if (a.x <= 2 || a.x >= WIDTH - 10) hitEdge = true;
        });

        if (hitEdge) {
            alienDir *= -1;
            aliens.forEach(a => a.y += 4);
        }

        // 플레이어 AI
        if (targetX !== -1) {
            if (playerX < targetX) playerX += 3;
            else if (playerX > targetX) playerX -= 3;
        }

        // 총알 발사
        if (Math.random() < 0.1 && bullets.length < 3)
            bullets.push({ x: playerX + 3, y: HEIGHT - 10, active: true });

        // 총알 이동 및 충돌
        bullets.forEach(b => {
            if (!b.active) return;
            b.y -= 5;
            if (b.y < 0) b.active = false;
            aliens.forEach(a => {
                if (a.active && b.active && b.x >= a.x && b.x <= a.x + 8 && b.y >= a.y && b.y <= a.y + 8) {
                    a.active = false; b.active = false; score += 10;
                    ctx.fillStyle = 'white'; ctx.fillRect(a.x, a.y, 8, 8); // 폭발
                }
            });
        });
        bullets = bullets.filter(b => b.active);

        // 그리기
        ctx.fillStyle = 'white';
        ctx.font = '10px Sans';
        ctx.fillText(`SCORE: ${score}`, 2, 10);
        ctx.fillRect(0, HEIGHT - 2, WIDTH, 1); // 바닥

        drawBitmap(ctx, SPRITE_PLAYER, playerX, HEIGHT - 10);

        let activeCount = 0;
        aliens.forEach(a => {
            if (a.active) {
                drawBitmap(ctx, SPRITE_ALIEN, a.x, a.y);
                activeCount++;
            }
        });
        bullets.forEach(b => ctx.fillRect(b.x, b.y, 2, 4));

        oled.drawCanvas(canvas);
        oled.display();

        if (activeCount === 0) {
            await delay(1000);
            resetAliens();
        }

        // await delay(1); // CPU 점유율 조절 필요 시 주석 해제
    }
}

// --- 실행 진입점 ---
async function main() {
    const oled = new SH1107();
    try {
        await oled.open();

        // 1. 드라이버 초기화
        await oled.init();

        // 2. 부팅 시퀀스 실행 (로딩 바)
        await bootSequence(oled);

        // 3. 게임 시작
        await gameLoop(oled);

    } catch (e) {
        console.error(e);
        oled.cleanup();
    }
}

process.on('SIGINT', () => {
    process.exit();
});

main();