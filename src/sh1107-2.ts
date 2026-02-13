// sh1107.ts
import { I2CBusAdapter } from "./devices/I2CBusAdapter";
import { I2CDevice } from "./devices/I2CDevice";


const I2C_BUS = 1; // Raspberry Pi의 기본 I2C 버스 번호
const SH1107_ADDR = 0x3C; // 보통 0x3C 또는 0x3D (EREMOTEIO 오류 시 변경 시도)


class SH1107 {
  private i2cBus: I2CBusAdapter | null;
  private i2cBusNumber: number;
  private i2cDevice: I2CDevice | null;
  private deviceAddress: number = SH1107_ADDR;
  private height: number = 128; // 1.5" GME128128-01 (128x128)

  constructor(i2cBusNumber: number, deviceAddress: number) {
    this.i2cBusNumber = i2cBusNumber;
    this.deviceAddress = deviceAddress;
    this.i2cBus = null;
    this.i2cDevice = null;
  }

  /**
   * 명령어를 전송합니다. (Control Byte 0x00 추가)
   */
  async writeCommand(cmd: number, ...params: number[]) {
    if (!this.i2cDevice) return;
    // [Control Byte(0x00), Command, Params...]
    const buffer = Buffer.from([0x00, cmd, ...params]);
    await this.i2cDevice.writeBuffer(buffer);
  }

  /**
   * 데이터를 전송합니다. (Control Byte 0x40 추가)
   */
  async writeData(data: Buffer | number[]) {
    if (!this.i2cDevice) return;
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const buffer = Buffer.concat([Buffer.from([0x40]), dataBuffer]);
    await this.i2cDevice.writeBuffer(buffer);
  }

  async init() {
    this.i2cBus = await I2CBusAdapter.create(this.i2cBusNumber);
    this.i2cDevice = new I2CDevice(this.i2cBus, this.deviceAddress);

    try {
      await this.writeCommand(0xAE);       // Display OFF
      await this.writeCommand(0xDC, 0x00); // Set display start line = 0
      await this.writeCommand(0xA8, this.height - 1); // Set multiplex ratio
      await this.writeCommand(0xD3, 0x00); // Set display offset
      await this.writeCommand(0x81, 0x2F); // Set contrast
      await this.writeCommand(0x20, 0x00); // Set memory addressing mode
      await this.writeCommand(0xA0);       // Segment remap
      await this.writeCommand(0xC0);       // Common output scan direction
      await this.writeCommand(0xA4);       // Entire display ON from RAM
      await this.writeCommand(0xA6);       // Normal display
      await this.writeCommand(0xAD, 0x8A); // DC/DC enabled
      await this.writeCommand(0xAF);       // Display ON
      console.log("SH1107 Initialized successfully");
    } catch (err) {
      console.error("Failed to initialize SH1107:", err);
      throw err; // 초기화 실패 시 에러를 던져서 main 함수가 중단되도록 함
    }
  }

  async close() {
    if (this.i2cDevice) {
      await this.i2cDevice.close();
      this.i2cDevice = null;
    }
  }

  async clear() {
    const empty = Buffer.alloc(128, 0x00);
    const pages = this.height / 8;
    // SH1107 페이지 단위 반복 (128x64 = 8페이지)
    for (let page = 0; page < pages; page++) {
      await this.writeCommand(0xB0 + page); // Page address
      await this.writeCommand(0x00);        // Lower col (0x00)
      await this.writeCommand(0x10);        // Higher col (0x10)
      await this.writeData(empty);
    }
  }

  async drawText(x: number, y: number, text: string) {
    // 간단하게 5x8 비트맵 폰트 사용
    const font: { [key: string]: number[] } = {
      "A": [0x7C, 0x12, 0x11, 0x12, 0x7C],
      "B": [0x7F, 0x49, 0x49, 0x49, 0x36],
      " ": [0x00, 0x00, 0x00, 0x00, 0x00],
      // 필요한 글자 추가 가능
    };

    let page = Math.floor(y / 8);
    let col = x;

    for (let char of text) {
      const glyph = font[char] || font[" "];
      // 화면 범위를 벗어나면 중단 (글자 너비 5 + 여백 1 = 6픽셀)
      if (col + 6 > 128) break;

      await this.writeCommand(0xB0 + page);       // Page
      await this.writeCommand(0x00 + (col & 0x0F)); // Lower col
      await this.writeCommand(0x10 + (col >> 4));   // Higher col
      await this.writeData(Buffer.from([...glyph, 0x00]));
      col += 6;
    }
  }

  async drawBitmap(bitmap: number[][]) {
    // bitmap[y][x] : 0 or 1
    const pages = this.height / 8;
    for (let page = 0; page < pages; page++) {
      let line = Buffer.alloc(128, 0x00);
      for (let x = 0; x < 128; x++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          let y = page * 8 + bit;
          if (y < bitmap.length && x < bitmap[0].length) {
            if (bitmap[y][x]) {
              byte |= (1 << bit);
            }
          }
        }
        line[x] = byte;
      }
      await this.writeCommand(0xB0 + page);
      await this.writeCommand(0x00);
      await this.writeCommand(0x10);
      await this.writeData(line);
    }
  }
}

async function main() {
  const oled = new SH1107(I2C_BUS, SH1107_ADDR);

  await oled.init();
  await oled.clear();
  await oled.drawText(0, 0, "AB BA");

  // 간단한 사각형 비트맵 그리기
  const bitmap = Array.from({ length: 128 }, (_, y) =>
    Array.from({ length: 128 }, (_, x) =>
      (x > 20 && x < 100 && y > 20 && y < 40) ? 1 : 0
    )
  );
  await oled.drawBitmap(bitmap);

  await oled.close();
}

main().catch(console.error);
