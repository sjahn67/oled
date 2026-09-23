import * as i2c from "i2c-bus";

const I2C_BUS = 1;
const OLED_ADDR = 0x3C;

async function main() {
  const bus = await i2c.openPromisified(I2C_BUS);

  try {
    console.log("1. writeByte 테스트 (0x00 레지스터에 0xAE 쓰기)...");
    // SMBus write_byte_data: Control byte (0x00) + Command byte (0xAE)
    await bus.writeByte(OLED_ADDR, 0x00, 0xAE);
    console.log("✅ writeByte 성공!");

    console.log("2. Display ON 명령 (0xAF) 전송...");
    await bus.writeByte(OLED_ADDR, 0x00, 0xAF);
    console.log("✅ Display ON 성공!");
  } catch (err) {
    console.error("❌ 실패:", err);
  } finally {
    await bus.close();
  }
}

main();
