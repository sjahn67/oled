// sh1107.ts
import { I2CBusAdapter } from "./devices/I2CBusAdapter";
import { I2CDevice } from "./devices/I2CDevice";


const I2C_BUS = 1; // Raspberry Pi의 기본 I2C 버스 번호
const SH1107_ADDR = 0x3C; // 보통 0x3C 또는 0x3D


class SH1107 {
  private i2cBus: I2CBusAdapter | null;
  private i2cBusNumber: number;
  private i2cDevice: I2CDevice | null;
  private deviceAddress: number = SH1107_ADDR;

  constructor(i2cBusNumber: number, deviceAddress: number) {
    this.i2cBusNumber = i2cBusNumber;
    this.deviceAddress = deviceAddress;
    this.i2cBus = null;
    this.i2cDevice = null;
  }

  async init() {
    this.i2cBus = await I2CBusAdapter.create(this.i2cBusNumber);
    this.i2cDevice = new I2CDevice(this.i2cBus, this.deviceAddress);


    // const cmds = [
    //   0xAE,       // Display OFF
    //   0xDC, 0x00, // Set display start line = 0
    //   0x81, 0x2F, // Set contrast control (0x00–0x7F)
    //   0x20, 0x00, // Set memory addressing mode = Page addressing
    //   0xA0,       // Segment remap normal
    //   0xC0,       // Common output scan direction normal
    //   0xA4,       // Entire display ON from RAM
    //   0xA6,       // Normal display (not inverted)
    //   0xAD, 0x8A, // Master configuration, built-in DC/DC enabled
    //   0xAF        // Display ON
    // ];
    let cmd = 0;
      try {
        cmd = 0xAE;
        const buffer = Buffer.from([cmd]);
        await this.i2cDevice.writeBuffer(buffer);
        console.log(`Init Command 0x${cmd.toString(16).toUpperCase()} sent`);

        cmd = 0xDC
        await this.i2cDevice.writeByte(cmd, 0x00);
        console.log(`Init Command 0x${cmd.toString(16).toUpperCase()} sent`);

        cmd = 0x81
        await this.i2cDevice.writeByte(cmd, 0x2F);
        console.log(`Init Command 0x${cmd.toString(16).toUpperCase()} sent`);

        cmd = 0x20
        await this.i2cDevice.writeByte(cmd, 0x00);
        console.log(`Init Command 0x${cmd.toString(16).toUpperCase()} sent`);

        cmd = 0xA0
        await this.i2cDevice.writeByte(cmd, 0x00);
        console.log(`Init Command 0x${cmd.toString(16).toUpperCase()} sent`);

        cmd = 0xC0
        await this.i2cDevice.writeByte(cmd, 0x00);
        console.log(`Init Command 0x${cmd.toString(16).toUpperCase()} sent`);

        cmd = 0xA4
        await this.i2cDevice.writeByte(cmd, 0x00);
        console.log(`Init Command 0x${cmd.toString(16).toUpperCase()} sent`);

        cmd = 0xA6
        await this.i2cDevice.writeByte(cmd, 0x00);
        console.log(`Init Command 0x${cmd.toString(16).toUpperCase()} sent`);

        cmd = 0xAD
        await this.i2cDevice.writeByte(cmd, 0x8A);
        console.log(`Init Command 0x${cmd.toString(16).toUpperCase()} sent`);

        cmd = 0xAF
        await this.i2cDevice.writeByte(cmd, 0x00);
        console.log(`Init Command 0x${cmd.toString(16).toUpperCase()} sent`);
      } catch (err) {
        console.error(`Failed to send init command 0x${cmd.toString(16).toUpperCase()}: `, err);
      }
  }


//   async clear() {
//     const empty = Buffer.alloc(128, 0x00);
//     for (let page = 0; page < 16; page++) {
//       await this.i2cBus.writeByteCommand(0xB0 + page, 0x00); // Page address
//       await this.i2cBus.writeByteCommand(0x00, 0x00);        // Lower col
//       await this.command(0x10);        // Higher col
//       await this.data(empty);
//     }
//   }

//   async drawText(x: number, y: number, text: string) {
//     // 간단하게 5x8 비트맵 폰트 사용
//     const font: { [key: string]: number[] } = {
//       "A": [0x7C, 0x12, 0x11, 0x12, 0x7C],
//       "B": [0x7F, 0x49, 0x49, 0x49, 0x36],
//       " ": [0x00, 0x00, 0x00, 0x00, 0x00],
//       // 필요한 글자 추가 가능
//     };

//     let page = Math.floor(y / 8);
//     let col = x;

//     for (let char of text) {
//       const glyph = font[char] || font[" "];
//       await this.command(0xB0 + page);       // Page
//       await this.command(0x00 + (col & 0x0F)); // Lower col
//       await this.command(0x10 + (col >> 4));   // Higher col
//       await this.data(Buffer.from([...glyph, 0x00]));
//       col += 6;
//     }
//   }

//   async drawBitmap(bitmap: number[][]) {
//     // bitmap[y][x] : 0 or 1
//     for (let page = 0; page < 16; page++) {
//       let line = Buffer.alloc(128, 0x00);
//       for (let x = 0; x < 128; x++) {
//         let byte = 0;
//         for (let bit = 0; bit < 8; bit++) {
//           let y = page * 8 + bit;
//           if (y < bitmap.length && x < bitmap[0].length) {
//             if (bitmap[y][x]) {
//               byte |= (1 << bit);
//             }
//           }
//         }
//         line[x] = byte;
//       }
//       await this.command(0xB0 + page);
//       await this.command(0x00);
//       await this.command(0x10);
//       await this.data(line);
//     }
//   }
}

async function main() {
  const oled = new SH1107(I2C_BUS, SH1107_ADDR);

  await oled.init();
  // await oled.clear();
  // await oled.drawText(0, 0, "AB BA");

  // // 간단한 사각형 비트맵 그리기
  // const bitmap = Array.from({ length: 64 }, (_, y) =>
  //   Array.from({ length: 128 }, (_, x) =>
  //     (x > 20 && x < 100 && y > 20 && y < 40) ? 1 : 0
  //   )
  // );
  // await oled.drawBitmap(bitmap);
}

main().catch(console.error);
