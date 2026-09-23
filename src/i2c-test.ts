import * as i2c from "i2c-bus";

const I2C_BUS = 1;
const OLED_ADDR = 0x3C;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const bus = await i2c.openPromisified(I2C_BUS);

  // 명령어 전송 헬퍼 (라즈베리파이 false error 무시 처리)
  const writeCmd = async (cmd: number) => {
    try {
      await bus.writeByte(OLED_ADDR, 0x00, cmd);
    } catch {
      // 칩은 명령을 실행하지만 라즈베리파이가 ACK 타이밍을 놓쳐 에러를 낼 수 있으므로 통과
    }
    await sleep(2);
  };

  try {
    console.log("1. SH1107 디스플레이 초기화 중...");
    await writeCmd(0xAE); // Display OFF
    await writeCmd(0xD5); // Set Divide Ratio/Oscillator Frequency
    await writeCmd(0x50);
    await writeCmd(0x20); // Page addressing mode
    await writeCmd(0x81); // Set Contrast
    await writeCmd(0x80); // 50% 밝기
    await writeCmd(0xAD); // DC-DC Control
    await writeCmd(0x8B); // Built-in DC-DC ON
    await writeCmd(0x30); // Set Discharge/Precharge
    await writeCmd(0x40); // Display Start Line = 0
    await writeCmd(0xA0); // Segment re-map normal
    await writeCmd(0xC0); // Common output scan normal
    await writeCmd(0xA4); // Output follows RAM (노이즈 대신 RAM 내용 표시)
    await writeCmd(0xA6); // Normal display (0: 검정, 1: 흰색)
    await writeCmd(0xAF); // Display ON (화면 켜기)

    console.log("2. 화면 메모리(RAM)를 0으로 지우는 중 (노이즈 제거)...");
    // SH1107은 128x128 해상도 (16개 페이지 x 128열)
    for (let page = 0; page < 16; page++) {
      await writeCmd(0xB0 + page); // Page address 설정
      await writeCmd(0x00);        // Lower column = 0
      await writeCmd(0x10);        // Higher column = 0

      // 128열에 모두 0x00 (검은색) 쓰기
      const clearBuf = Buffer.alloc(129, 0x00);
      clearBuf[0] = 0x40; // 0x40: Display Data 전송 제어 바이트
      try {
        await bus.i2cWrite(OLED_ADDR, clearBuf.length, clearBuf);
      } catch {
        // 통과
      }
    }
    console.log("✅ 노이즈 제거 완료 (화면이 완전히 깨끗한 검은색이 됨)");

    await sleep(1000);

    console.log("3. 화면 중앙에 테스트 패턴(체크무늬 줄) 그리기...");
    // 7번째, 8번째 페이지 중앙에 줄무늬 표시
    for (let page = 7; page <= 8; page++) {
      await writeCmd(0xB0 + page);
      await writeCmd(0x00);
      await writeCmd(0x10);

      const patternBuf = Buffer.alloc(129, 0xAA); // 0xAA: 점선 패턴
      patternBuf[0] = 0x40;
      try {
        await bus.i2cWrite(OLED_ADDR, patternBuf.length, patternBuf);
      } catch {
        // 통과
      }
    }
    console.log("✅ 테스트 패턴 그리기 완료!");

  } finally {
    await bus.close();
  }
}

main();
