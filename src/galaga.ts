// @ts-ignore
import * as spi from 'spi-device';
import rpio from 'rpio';
import { createCanvas, Canvas, CanvasRenderingContext2D } from 'canvas';

// --- 설정 ---
const WIDTH = 128;
const HEIGHT = 128;
const SPI_SPEED_HZ = 2000000; // 2MHz (안정적이고 빠른 속도)
const PIN_DC = 24;
const PIN_RST = 25;

// --- 유틸리티 ---
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- SH1107 드라이버 (보정값 적용됨) ---
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
                if (err) reject(err); else resolve();
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
        rpio.write(PIN_RST, rpio.HIGH); await delay(50);
        rpio.write(PIN_RST, rpio.LOW); await delay(100);
        rpio.write(PIN_RST, rpio.HIGH); await delay(100);

        const cmds = [
            0xAE, 0x00, 0x10, 0x20, 0x81, 0xA0, 0xC0, 0xDC, 0x00,
            0x81, 0x80, 0xD5, 0x50, 0xD9, 0x22, 0xDB, 0x35,
            0xA8, 0x7F, 0xD3, 0x00, 0xA4, 0xA6, 0xAF
        ];
        for (const c of cmds) this.writeCommand(c);
        await delay(100);
    }

    public display() {
        const pages = HEIGHT / 8;
        for (let page = 0; page < pages; page++) {
            this.writeCommand(0xB0 + page);
            this.writeCommand(0x02); // Column Offset (보정)
            this.writeCommand(0x10);
            const start = page * WIDTH;
            this.writeData(this.buffer.slice(start, start + WIDTH));
        }
    }

    public drawCanvas(canvas: Canvas) {
        const ctx = canvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
        this.buffer.fill(0);
        for (let y = 0; y < HEIGHT; y++) {
            for (let x = 0; x < WIDTH; x++) {
                if (imgData[(y * WIDTH + x) * 4] > 128) {
                    const page = Math.floor(y / 8);
                    const bit = y % 8;
                    this.buffer[x + (page * WIDTH)] |= (1 << bit);
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

// --- 스프라이트 (Sprites) ---
// 갤라거 기체 (11x11)
const SHIP_SPRITE = [
    [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0],
    [0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0],
    [0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0],
    [0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0],
    [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1],
    [1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1],
    [1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]
];

// 적군 (벌/나비 모양) (11x8)
const ENEMY_SPRITE = [
    [0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0],
    [0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0],
    [0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0]
];

function drawBitmap(ctx: CanvasRenderingContext2D, bitmap: number[][], x: number, y: number) {
    ctx.fillStyle = 'white';
    for (let r = 0; r < bitmap.length; r++) {
        for (let c = 0; c < bitmap[r].length; c++) {
            if (bitmap[r][c] === 1) ctx.fillRect(Math.floor(x + c), Math.floor(y + r), 1, 1);
        }
    }
}

// --- 게임 로직 ---

interface Star { x: number; y: number; speed: number; }
interface Entity { x: number; y: number; active: boolean; }
interface Enemy extends Entity {
    state: 'IDLE' | 'DIVING' | 'RETURNING';
    homeX: number; // 원래 대형 위치 X
    homeY: number; // 원래 대형 위치 Y
    diveAngle: number;
}

async function galagaLoop(oled: SH1107) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // 1. 별 배경 초기화 (속도감)
    const stars: Star[] = [];
    for (let i = 0; i < 30; i++) {
        stars.push({
            x: Math.random() * WIDTH,
            y: Math.random() * HEIGHT,
            speed: Math.random() * 2 + 0.5
        });
    }

    // 2. 게임 변수
    let playerX = WIDTH / 2 - 5;
    let bullets: Entity[] = [];
    let enemies: Enemy[] = [];
    let score = 0;
    let frame = 0;
    let stagePhase = 0; // 0: Ready, 1: Playing

    // 3. 적 배치 (상단 대형)
    const initEnemies = () => {
        enemies = [];
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 6; c++) {
                enemies.push({
                    x: 16 + c * 16,
                    y: 10 + r * 12,
                    homeX: 16 + c * 16,
                    homeY: 10 + r * 12,
                    active: true,
                    state: 'IDLE',
                    diveAngle: 0
                });
            }
        }
    };
    initEnemies();

    // --- 메인 루프 ---
    while (true) {
        // 화면 클리어
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        // A. 배경(별) 업데이트 및 그리기
        ctx.fillStyle = 'white';
        stars.forEach(star => {
            star.y += star.speed; // 아래로 이동
            if (star.y > HEIGHT) { // 화면 벗어나면 위로 리셋
                star.y = 0;
                star.x = Math.random() * WIDTH;
            }
            // 속도에 따라 별 크기 다르게 (원근감)
            const size = star.speed > 1.5 ? 2 : 1;
            ctx.fillRect(star.x, star.y, size, size);
        });

        // B. 플레이어 로직
        // (데모: 가장 가까운 다이빙 적을 향해 이동하거나 중앙 유지)
        let targetX = WIDTH / 2;
        const divingEnemy = enemies.find(e => e.state === 'DIVING' && e.active);

        if (divingEnemy) {
            targetX = divingEnemy.x; // 공격해오는 적을 요격하러 이동
        }

        // 부드러운 이동
        if (playerX < targetX - 2) playerX += 3;
        else if (playerX > targetX + 2) playerX -= 3;

        // 화면 경계 제한
        if (playerX < 0) playerX = 0;
        if (playerX > WIDTH - 11) playerX = WIDTH - 11;

        // 플레이어 그리기
        drawBitmap(ctx, SHIP_SPRITE, playerX, HEIGHT - 15);

        // C. 적(Enemy) 로직 - 갤라거의 핵심!
        enemies.forEach(e => {
            if (!e.active) return;

            if (e.state === 'IDLE') {
                // 대형 유지 (약간 흔들거리기)
                e.x = e.homeX + Math.sin(frame * 0.05) * 3;
                e.y = e.homeY;

                // 랜덤하게 다이빙 시작 (DIVE)
                if (Math.random() < 0.005 && stagePhase === 1) {
                    e.state = 'DIVING';
                    e.diveAngle = 0;
                }
            }
            else if (e.state === 'DIVING') {
                // 곡선 비행 (Sine 파형 + 아래로 돌진)
                e.y += 2.5;
                e.diveAngle += 0.1;
                e.x += Math.sin(e.diveAngle) * 3; // 좌우로 흔들며 내려옴

                // 화면 아래로 벗어나면 다시 위로 복귀 (Loop)
                if (e.y > HEIGHT) {
                    e.y = 0;
                    e.state = 'IDLE'; // 대형 복귀 (간소화)
                }
            }

            drawBitmap(ctx, ENEMY_SPRITE, e.x, e.y);
        });

        // D. 총알 로직 (자동 발사)
        if (frame % 15 === 0 && stagePhase === 1) { // 연사 속도
            bullets.push({ x: playerX + 5, y: HEIGHT - 15, active: true });
        }

        ctx.fillStyle = 'white';
        bullets.forEach(b => {
            if (!b.active) return;
            b.y -= 6; // 총알 속도 빠름
            if (b.y < 0) b.active = false;

            // 더블 총알 느낌 (두께)
            ctx.fillRect(b.x, b.y, 2, 5);

            // 충돌 체크
            enemies.forEach(e => {
                if (e.active && b.active) {
                    // 히트 박스
                    if (b.x >= e.x && b.x <= e.x + 11 && b.y >= e.y && b.y <= e.y + 8) {
                        e.active = false;
                        b.active = false;
                        score += 100;

                        // 폭발 이펙트
                        ctx.save();
                        ctx.translate(e.x + 5, e.y + 4);
                        ctx.fillStyle = 'white';
                        ctx.beginPath();
                        ctx.arc(0, 0, 8, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.restore();
                    }
                }
            });
        });
        bullets = bullets.filter(b => b.active);

        // UI (점수 및 상태)
        if (stagePhase === 0) {
            // READY 화면
            ctx.fillStyle = 'white';
            ctx.font = 'bold 16px Sans';
            ctx.textAlign = 'center';
            ctx.fillText("STAGE 1", WIDTH / 2, HEIGHT / 2 - 10);

            ctx.font = '12px Sans';
            if (frame % 20 < 10) ctx.fillText("READY", WIDTH / 2, HEIGHT / 2 + 10);

            if (frame > 100) stagePhase = 1; // 일정 시간 후 시작
        } else {
            // 점수 표시
            ctx.font = '10px Sans';
            ctx.textAlign = 'left';
            ctx.fillText(`SCORE`, 2, 10);
            ctx.fillText(`${score}`, 2, 22);

            // 적 전멸 체크
            const activeCount = enemies.filter(e => e.active).length;
            if (activeCount === 0) {
                stagePhase = 0;
                frame = 0;
                initEnemies(); // 리셋
            }
        }

        // E. 화면 전송
        oled.drawCanvas(canvas);
        oled.display();

        frame++;
        // 속도 조절 (너무 빠르면 주석 해제)
        // await delay(1); 
    }
}

// --- 메인 실행 ---
async function main() {
    const oled = new SH1107();
    try {
        await oled.open();
        await oled.init();
        await galagaLoop(oled);
    } catch (e) {
        console.error(e);
        oled.cleanup();
    }
}

process.on('SIGINT', () => {
    process.exit();
});

main();