import * as dht from 'node-dht-sensor';

// 설정 값 정의
const SENSOR_TYPE = 22; // DHT11인 경우 11, DHT22인 경우 22
const GPIO_PIN = 17;     // BCM GPIO 번호 (물리적 핀 7번)

// 데이터 읽기 인터페이스 정의
interface SensorData {
    temperature: number;
    humidity: number;
}

async function readSensorData(): Promise<void> {
    try {
        // 라이브러리의 promises 모듈을 사용하여 비동기로 읽기
        const res = await dht.promises.read(SENSOR_TYPE, GPIO_PIN);

        // 소수점 둘째 자리까지 반올림
        const data: SensorData = {
            temperature: parseFloat(res.temperature.toFixed(2)),
            humidity: parseFloat(res.humidity.toFixed(2)),
        };

        console.log(`------------------------------`);
        console.log(`[${new Date().toLocaleTimeString()}] 센서 데이터 수신:`);
        console.log(`🌡️  온도: ${data.temperature}°C`);
        console.log(`💧 습도: ${data.humidity}%`);

    } catch (err) {
        console.error("❌ 센서 데이터를 읽는데 실패했습니다:", err);
    }
}

// 2초마다 센서 데이터 읽기 실행
console.log(`🚀 DHT22 센서 모니터링 시작 (GPIO ${GPIO_PIN})...`);
setInterval(readSensorData, 5000);