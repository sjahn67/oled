import { createCanvas, CanvasRenderingContext2D } from 'canvas';
import { SH1107 } from './sh1107-i2c';


// --- 하드웨어 설정 ---
const WIDTH = 128;
const HEIGHT = 128;

// --- 유틸리티 ---
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));


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