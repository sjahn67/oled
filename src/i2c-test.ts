import * as i2c from "i2c-bus";

const I2C_BUS = 1;        // 보통 1번
const OLED_ADDR = 0x3C;   // i2cdetect -y 1 로 확인한 주소

async function main() {
  const bus = await i2c.openPromisified(I2C_BUS);

  try {
    // 단순히 Display OFF 명령 (0xAE)만 전송
    await bus.i2cWrite(OLED_ADDR, 2, Buffer.from([0x00, 0xAE]));
    console.log("✅ I2C write 성공");
    await bus.i2cWrite(OLED_ADDR, 2, Buffer.from([0x00, 0x81]));
    console.log("✅ I2C write 성공");
    await bus.i2cWrite(OLED_ADDR, 2, Buffer.from([0x00, 0x2F]));
    console.log("✅ I2C write 성공");
  } catch (err) {
    console.error("❌ I2C write 실패:", err);
  }
}

main();
