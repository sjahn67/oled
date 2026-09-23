import * as i2c from 'i2c-bus';

const I2C_BUS = 1;
const OLED_ADDR = 0x3C;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const bus = await i2c.openPromisified(I2C_BUS);

  const writeCmd = async (cmd: number) => {
    try {
      await bus.writeByte(OLED_ADDR, 0x00, cmd);
    } catch {}
    await sleep(2);
  };

  try {
    console.log("SH1107 초기화...");
    await writeCmd(0xAE); // Display OFF
    await writeCmd(0xDC); await writeCmd(0x00); // Display start line = 0
    await writeCmd(0xD3); await writeCmd(0x00); // Display offset = 0
    await writeCmd(0xA8); await writeCmd(0x7F); // Multiplex ratio = 128
    await writeCmd(0xD5); await writeCmd(0x50); // Clock divide ratio
    await writeCmd(0x20); // Page addressing mode
    await writeCmd(0x81); await writeCmd(0x80); // Contrast
    await writeCmd(0xAD); await writeCmd(0x8B); // DC-DC ON
    await writeCmd(0xA0); // Segment remap (0xA0)
    await writeCmd(0xC0); // COM scan direction (0xC0)
    await writeCmd(0xA4); // Output follows RAM
    await writeCmd(0xA6); // Normal display
    await writeCmd(0xAF); // Display ON

    // 128x128 버퍼 (16페이지 x 128열)
    const buf = Buffer.alloc(16 * 128, 0x00);

    // [테스트 1] 맨 윗줄 (y=0) 수평선 긋기:
    // Page 0의 모든 128개 열에 bit 0 (0x01) 켜기
    for (let x = 0; x < 128; x++) {
      buf[x] |= 0x01; // 맨 위 라인
    }

    // [테스트 2] 맨 아랫줄 (y=127) 수평선 긋기:
    // Page 15의 모든 128개 열에 bit 7 (0x80) 켜기
    for (let x = 0; x < 128; x++) {
      buf[15 * 128 + x] |= 0x80; // 맨 아래 라인
    }

    // [테스트 3] 맨 왼쪽 세로선 (x=0):
    // 16개 모든 페이지의 x=0에 0xFF (세로 8비트 전체) 켜기
    for (let p = 0; p < 16; p++) {
      buf[p * 128 + 0] = 0xFF; // 맨 왼쪽
    }

    // [테스트 4] 맨 오른쪽 세로선 (x=127):
    // 16개 모든 페이지의 x=127에 0xFF 켜기
    for (let p = 0; p < 16; p++) {
      buf[p * 128 + 127] = 0xFF; // 맨 오른쪽
    }

    // [테스트 5] 화면 정중앙 십자가 (+):
    // y=64 (Page 8의 bit 0) 수평선
    for (let x = 20; x < 108; x++) {
      buf[8 * 128 + x] |= 0x01;
    }
    // x=64 수직선
    for (let p = 3; p < 13; p++) {
      buf[p * 128 + 64] = 0xFF;
    }

    console.log("테스트 박스 및 십자가 화면 전송 중...");
    const pageBuf = Buffer.alloc(129, 0x00);
    pageBuf[0] = 0x40;

    for (let page = 0; page < 16; page++) {
      await writeCmd(0xB0 + page);
      await writeCmd(0x00); // col low = 0
      await writeCmd(0x10); // col high = 0

      buf.copy(pageBuf, 1, page * 128, (page + 1) * 128);
      try {
        await bus.i2cWrite(OLED_ADDR, pageBuf.length, pageBuf);
      } catch {}
      await sleep(2);
    }

    console.log("✅ 전송 완료!");
    console.log("화면 외곽선 사각형과 중앙 십자가가 어떻게 보이는지 확인해 주세요.");

  } finally {
    await bus.close();
  }
}

main();
