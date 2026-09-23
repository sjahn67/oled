import { createCanvas } from 'canvas';
import { SH1107 } from './sh1107-i2c';

const WIDTH = 128;
const HEIGHT = 128;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let running = true;
let oledInstance: SH1107 | null = null;

function shutdown() {
    console.log("\n-> Ctrl+C 감지: 화면을 끄고 안전하게 종료합니다...");
    running = false;
    if (oledInstance) {
        try {
            oledInstance.clear();
            oledInstance.display();
            oledInstance.cleanup();
        } catch {}
    }
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ==========================================
// 1. 인트로 & 타이틀 씬
// ==========================================
async function sceneTitle(oled: SH1107) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    console.log("-> [Scene 1] Title & Splash");

    for (let frame = 0; frame < 30 && running; frame++) {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        // 테두리
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.strokeRect(2, 2, WIDTH - 4, HEIGHT - 4);
        ctx.strokeRect(5, 5, WIDTH - 10, HEIGHT - 10);

        // 타이틀
        ctx.fillStyle = 'white';
        ctx.font = 'bold 13px Sans';
        ctx.textAlign = 'center';
        ctx.fillText("SH1107 OLED", WIDTH / 2, 38);

        ctx.font = '10px Sans';
        ctx.fillText("128 x 128 PIXELS", WIDTH / 2, 54);
        ctx.fillText("I2C GRAPHICS", WIDTH / 2, 68);

        // 애니메이션 라인
        const lineLen = (frame / 30) * (WIDTH - 20);
        ctx.fillRect(10, 80, lineLen, 2);

        ctx.font = '9px Sans';
        ctx.fillText("ENGINE READY", WIDTH / 2, 102);

        oled.drawCanvas(canvas);
        oled.display();
        await delay(30);
    }
    await delay(600);
}

// ==========================================
// 2. 기본 도형 (Primitives) 쇼케이스
// ==========================================
async function scenePrimitives(oled: SH1107) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    console.log("-> [Scene 2] Geometric Primitives");

    for (let t = 0; t < 50 && running; t++) {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        ctx.fillStyle = 'white';
        ctx.font = '9px Sans';
        ctx.textAlign = 'left';
        ctx.fillText("PRIMITIVES", 4, 11);

        // 스타버스트 라인들
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        const cx = 35, cy = 45;
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
            const r = 18 + Math.sin(t * 0.2 + a) * 5;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            ctx.stroke();
        }

        // 중첩 사각형 & 회전 사각형
        ctx.strokeRect(70, 25, 45, 40);
        ctx.fillRect(80, 35, 25, 20);

        // 동심원 애니메이션
        const radius = (t % 25) + 3;
        ctx.beginPath();
        ctx.arc(35, 95, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(35, 95, Math.max(1, radius - 10), 0, Math.PI * 2);
        ctx.stroke();

        // 둥근 빗살무늬 게이지
        for (let i = 0; i < 8; i++) {
            const barH = 5 + ((i + t) % 15) * 2;
            ctx.fillRect(72 + i * 6, 115 - barH, 4, barH);
        }

        oled.drawCanvas(canvas);
        oled.display();
        await delay(25);
    }
}

// ==========================================
// 3. 3D 와이어프레임 회전 큐브 (3D Rotating Cube)
// ==========================================
async function scene3DCube(oled: SH1107) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    console.log("-> [Scene 3] 3D Wireframe Cube");

    // 큐브의 8개 꼭짓점
    const vertices = [
        [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
        [-1, -1, 1],  [1, -1, 1],  [1, 1, 1],  [-1, 1, 1]
    ];

    // 12개 모서리 연결 정보
    const edges = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    let rotX = 0;
    let rotY = 0;
    let rotZ = 0;

    for (let frame = 0; frame < 65 && running; frame++) {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        ctx.fillStyle = 'white';
        ctx.font = '9px Sans';
        ctx.textAlign = 'center';
        ctx.fillText("3D VECTOR CUBE", WIDTH / 2, 12);

        rotX += 0.07;
        rotY += 0.09;
        rotZ += 0.04;

        // 3D 회전 및 2D 원근 투영
        const projected: { x: number; y: number }[] = [];
        const scale = 28;
        const distance = 3.2;

        for (const [vx, vy, vz] of vertices) {
            // Y축 회전
            let x1 = vx * Math.cos(rotY) + vz * Math.sin(rotY);
            let y1 = vy;
            let z1 = -vx * Math.sin(rotY) + vz * Math.cos(rotY);

            // X축 회전
            let x2 = x1;
            let y2 = y1 * Math.cos(rotX) - z1 * Math.sin(rotX);
            let z2 = y1 * Math.sin(rotX) + z1 * Math.cos(rotX);

            // Z축 회전
            let x3 = x2 * Math.cos(rotZ) - y2 * Math.sin(rotZ);
            let y3 = x2 * Math.sin(rotZ) + y2 * Math.cos(rotZ);
            let z3 = z2;

            // 원근 투영
            const fov = scale / (z3 + distance);
            projected.push({
                x: WIDTH / 2 + x3 * fov,
                y: HEIGHT / 2 + 6 + y3 * fov
            });
        }

        // 모서리 선 그리기
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        for (const [p1, p2] of edges) {
            ctx.beginPath();
            ctx.moveTo(projected[p1].x, projected[p1].y);
            ctx.lineTo(projected[p2].x, projected[p2].y);
            ctx.stroke();
        }

        // 꼭짓점에 점 표시
        for (const pt of projected) {
            ctx.fillRect(pt.x - 1, pt.y - 1, 3, 3);
        }

        oled.drawCanvas(canvas);
        oled.display();
        await delay(20);
    }
}

// ==========================================
// 4. 사이버펑크 계기판 / 대시보드 (Dashboard & Gauges)
// ==========================================
async function sceneDashboard(oled: SH1107) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    console.log("-> [Scene 4] Cyber Dashboard");

    for (let frame = 0; frame < 55 && running; frame++) {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        // 상단 상태바
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, WIDTH, 12);
        ctx.fillStyle = 'black';
        ctx.font = 'bold 9px Sans';
        ctx.textAlign = 'left';
        ctx.fillText("SYS: ONLINE", 4, 10);
        ctx.textAlign = 'right';
        ctx.fillText("128x128", WIDTH - 4, 10);

        // 원형 아날로그 타코미터
        const cx = 40, cy = 60, r = 24;
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25);
        ctx.stroke();

        // 바늘 회전 애니메이션
        const needleAngle = Math.PI * 0.75 + (Math.sin(frame * 0.15) * 0.5 + 0.5) * (Math.PI * 1.5);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(needleAngle) * (r - 4), cy + Math.sin(needleAngle) * (r - 4));
        ctx.stroke();

        ctx.fillStyle = 'white';
        ctx.font = '8px Sans';
        ctx.textAlign = 'center';
        ctx.fillText("RPM", cx, cy + 12);

        // 우측 파라미터 그래프 & 수치
        ctx.font = '9px Sans';
        ctx.textAlign = 'left';
        ctx.fillText("PWR", 76, 35);
        ctx.strokeRect(76, 38, 46, 8);
        const pwrW = (Math.sin(frame * 0.2) * 0.5 + 0.5) * 42;
        ctx.fillRect(78, 40, pwrW, 4);

        ctx.fillText("TEMP", 76, 58);
        ctx.strokeRect(76, 61, 46, 8);
        const tempW = ((frame * 2) % 42);
        ctx.fillRect(78, 63, tempW, 4);

        // 하단 실시간 오실로스코프 파형
        ctx.strokeRect(4, 90, WIDTH - 8, 32);
        ctx.beginPath();
        for (let x = 0; x < WIDTH - 12; x++) {
            const waveY = 106 + Math.sin((x + frame * 4) * 0.15) * 8 + Math.cos((x - frame * 2) * 0.08) * 3;
            if (x === 0) ctx.moveTo(6 + x, waveY);
            else ctx.lineTo(6 + x, waveY);
        }
        ctx.stroke();

        oled.drawCanvas(canvas);
        oled.display();
        await delay(25);
    }
}

// ==========================================
// 5. 워프 스피드 스타필드 (Warp Starfield)
// ==========================================
async function sceneStarfield(oled: SH1107) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    console.log("-> [Scene 5] Warp Starfield");

    // 80개의 별 생성
    const stars: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < 80; i++) {
        stars.push({
            x: (Math.random() - 0.5) * WIDTH,
            y: (Math.random() - 0.5) * HEIGHT,
            z: Math.random() * WIDTH
        });
    }

    for (let frame = 0; frame < 60 && running; frame++) {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        ctx.fillStyle = 'white';
        ctx.font = '9px Sans';
        ctx.textAlign = 'center';
        ctx.fillText("WARP SPEED", WIDTH / 2, 15);

        for (const star of stars) {
            star.z -= 3.5; // 앞으로 전진
            if (star.z <= 0) {
                star.x = (Math.random() - 0.5) * WIDTH;
                star.y = (Math.random() - 0.5) * HEIGHT;
                star.z = WIDTH;
            }

            const k = 50 / star.z;
            const px = WIDTH / 2 + star.x * k;
            const py = HEIGHT / 2 + star.y * k;

            if (px >= 0 && px < WIDTH && py >= 0 && py < HEIGHT) {
                const size = star.z < 35 ? 2 : 1;
                ctx.fillRect(px, py, size, size);
            }
        }

        oled.drawCanvas(canvas);
        oled.display();
        await delay(20);
    }
}

// ==========================================
// 6. 하드웨어 기능 (Invert & Contrast Fade)
// ==========================================
async function sceneHardwareFeatures(oled: SH1107) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    console.log("-> [Scene 6] Hardware Invert & Fade");

    // 패턴 그리기
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px Sans';
    ctx.textAlign = 'center';
    ctx.fillText("HARDWARE CTRL", WIDTH / 2, 35);
    ctx.font = '10px Sans';
    ctx.fillText("INVERSE & FADE", WIDTH / 2, 55);

    // 체크무늬
    for (let y = 70; y < 110; y += 8) {
        for (let x = 14; x < WIDTH - 14; x += 8) {
            if (((x + y) / 8) % 2 === 0) ctx.fillRect(x, y, 8, 8);
        }
    }

    oled.drawCanvas(canvas);
    oled.display();

    // 1) 반전 깜빡임 테스트 (0xA7 -> 0xA6)
    for (let i = 0; i < 4 && running; i++) {
        oled.writeCommand(SH1107.Commands.INVERSE_DISPLAY); // 화면 반전 (검정<->흰색)
        await delay(250);
        oled.writeCommand(SH1107.Commands.NORMAL_DISPLAY);  // 정상 화면
        await delay(250);
    }

    // 2) 밝기(Contrast) 페이드 아웃/인 (0x81, step)
    for (let contrast = 0x80; contrast >= 0x05 && running; contrast -= 0x10) {
        oled.writeCommand(SH1107.Commands.SET_CONTRAST, contrast);
        await delay(50);
    }
    for (let contrast = 0x05; contrast <= 0x80 && running; contrast += 0x10) {
        oled.writeCommand(SH1107.Commands.SET_CONTRAST, contrast);
        await delay(50);
    }

    // 기본 밝기로 복귀
    oled.writeCommand(SH1107.Commands.SET_CONTRAST, 0x2F);
    await delay(500);
}

// ==========================================
// 메인 루프 (Main Loop)
// ==========================================
async function main() {
    const oled = new SH1107();
    oledInstance = oled;

    try {
        console.log("========================================");
        console.log("  SH1107 128x128 I2C Graphics Demo");
        console.log("  종료하려면 언제든 Ctrl+C 를 누르세요.");
        console.log("========================================");

        await oled.open();
        await oled.init();

        // 무한 반복 데모 루프
        while (running) {
            await sceneTitle(oled);
            if (!running) break;

            await scenePrimitives(oled);
            if (!running) break;

            await scene3DCube(oled);
            if (!running) break;

            await sceneDashboard(oled);
            if (!running) break;

            await sceneStarfield(oled);
            if (!running) break;

            await sceneHardwareFeatures(oled);
            if (!running) break;
        }

    } catch (err) {
        console.error("❌ 오류 발생:", err);
    } finally {
        if (oledInstance) {
            oledInstance.clear();
            oledInstance.display();
            oledInstance.cleanup();
        }
    }
}

main();
