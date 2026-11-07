// Configuration
const TG_TOKEN = 'YOUR_BOT_TOKEN'; 
const TG_CHAT_ID = 'YOUR_CHAT_ID';

// 1. Initial State: Opacity 20%
window.onload = () => {
    updateOpacity(20);
};
// ตั้งค่าเริ่มต้นทันทีเมื่อโหลดหน้าเว็บ
const initialOpacity = 0.2; // 20%
document.getElementById('core-analyzer-box').style.background = `rgba(255, 255, 255, ${initialOpacity})`;
document.getElementById('opacity-ctrl').value = 20;

// Event listener เดิม
document.getElementById('opacity-ctrl').addEventListener('input', (e) => {
    document.getElementById('core-analyzer-box').style.background = `rgba(255, 255, 255, ${e.target.value / 100})`;
});
// รายชื่อ URL ของเลเยอร์ที่เชื่อมต่อ
const layerUrls = [
    "https://vertical-velocity-900hpa.charaswat.workers.dev/",
    "https://vertical-velocity-850hpa.charaswat.workers.dev/",
    "https://vertical-velocity-500hpa.charaswat.workers.dev/",
    "https://vertical-velocity-200hpa.charaswat.workers.dev/"
];

// ฟังก์ชัน Sync เลเยอร์เมื่อมีการเลื่อนแผนที่ (หากใช้ Leaflet ควบคุม)
function syncAllLayers(lat, lon, zoom) {
    const layers = document.querySelectorAll('.weather-layer');
    layers.forEach(iframe => {
        iframe.contentWindow.postMessage({
            type: 'SYNC_MAP',
            lat: lat,
            lon: lon,
            zoom: zoom
        }, '*');
    });
}

function updateOpacity(value) {
    const val = value / 100;
    document.getElementById('core-analyzer-box').style.background = `rgba(10, 10, 10, ${val})`;
    document.querySelectorAll('.weather-layer').forEach(l => l.style.opacity = val);
}

	document.getElementById('opacity-ctrl').addEventListener('input', (e) => {
		const val = e.target.value / 100;
		// ปรับความโปร่งใสของกล่องวิเคราะห์ (AI Box)
		document.getElementById('core-analyzer-box').style.background = `rgba(255, 255, 255, ${val})`;
		
		// ปรับความโปร่งใสของเลเยอร์อากาศทั้ง 4 พร้อมกัน
		const layers = document.querySelectorAll('.weather-layer');
		layers.forEach(layer => {
			layer.style.opacity = val;
		});
	});

// 2. Export & Send to Telegram
async function exportBrandedReport() {
    const date = new Date().toLocaleString('th-TH');
    document.getElementById('snapshot-date').innerText = date;
    
    const branding = document.getElementById('branding-capture');
    const canvas = await html2canvas(branding, { scale: 2 });
    
    canvas.toBlob(async (blob) => {
        const formData = new FormData();
        formData.append('chat_id', TG_CHAT_ID);
        formData.append('photo', blob, 'daily-report.png');
        formData.append('caption', `📊 Daily Weather Summary\n⏰ Time: ${date}\n📍 Mode: Cross-Domain Sync`);

        await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendPhoto`, {
            method: 'POST',
            body: formData
        });
        console.log("✅ Report sent to Telegram");
    }, 'image/png');
	// 1. ระบบควบคุม Opacity เริ่มต้น 20%
const opacityCtrl = document.getElementById('opacity-ctrl');
const layerElements = document.querySelectorAll('.weather-layer');
const analyzerBox = document.getElementById('core-analyzer-box');

function setOpacity(val) {
    const decimal = val / 100;
    analyzerBox.style.background = `rgba(255, 255, 255, ${decimal})`;
    layerElements.forEach(layer => layer.style.opacity = decimal);
    document.getElementById('opacity-val').innerText = val + '%';
}

opacityCtrl.addEventListener('input', (e) => setOpacity(e.target.value));
window.onload = () => setOpacity(20);

// 2. ฟังก์ชัน Capture และส่งเข้า Telegram
async function exportBrandedReport() {
    recordLog("🚀 Processing Cross-Domain Report...");
    document.getElementById('snapshot-date').innerText = new Date().toLocaleString();
    
    // Capture พื้นที่วิเคราะห์
    const branding = document.getElementById('branding-capture');
    const canvas = await html2canvas(branding, { scale: 2 });
    
    canvas.toBlob(async (blob) => {
        const formData = new FormData();
        // เรียกใช้ API ของ Worker เพื่อส่งต่อให้ Telegram (เพื่อความปลอดภัยของ Token)
        formData.append('photo', blob, 'daily-report.png');
        formData.append('caption', `📊 Daily AI Analysis\n📍 Layer Sync: 900/850/500/200 hPa\n⏰ Time: ${new Date().toLocaleTimeString()}`);

        try {
            // เรียก Endpoint ที่ Agent Cloudflare ทำไว้ให้แล้ว
            const res = await fetch('/capture', { method: 'POST', body: formData });
            const data = await res.json();
            if(data.status === 'success') recordLog("✅ Success: Telegram Sent.");
        } catch (e) {
            recordLog("❌ Error: Telegram API connection failed.");
        }
    }, 'image/png');
}
// เพิ่มฟังก์ชันสรุปการเปลี่ยนแปลงใน worker.js
const stats = await env.DB.prepare(
  "SELECT signature_type, COUNT(*) as count, AVG(intensity) as avg_int " +
  "FROM analysis_logs WHERE created_at > datetime('now', '-1 day') " +
  "GROUP BY signature_type"
).all();

let summaryText = `📅 <b>Daily Report (24h Summary)</b>\n`;
stats.results.forEach(row => {
  summaryText += `🔹 ${row.signature_type}: ${row.count} ครั้ง (เฉลี่ย ${row.avg_int.toFixed(1)})\n`;
});

// ส่งภาพ Dashboard + ข้อความสรุป + ก.ราฟ
await captureDashboard(env, "https://core-analyzer.charaswat.workers.dev/", summaryText);
function recordLog(msg) {
    const log = document.getElementById('event-log');
    log.innerHTML = `> ${msg}<br>` + log.innerHTML;
}

function changeBaseMap(type) {
    const baseFrame = document.getElementById('windy-frame');
    const container = document.getElementById('map-container');
    
    // พิกัดเริ่มต้น (Sync กับเลเยอร์อื่น)
    const lat = 13.7, lon = 100.5, zoom = 5;

    switch(type) {
        case 'google-terrain':
            baseFrame.src = `https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}`; // จำเป็นต้องใช้ผ่าน Leaflet หรือ API
            // สำหรับ Iframe ง่ายๆ สามารถใช้ URL ที่ Google/OpenStreetMap รองรับ
            baseFrame.src = `https://www.google.com/maps/embed/v1/view?key=YOUR_KEY&center=${lat},${lon}&zoom=${zoom}&maptype=terrain`;
            break;
        case 'google-satellite':
            baseFrame.src = `https://www.google.com/maps/embed/v1/view?key=YOUR_KEY&center=${lat},${lon}&zoom=${zoom}&maptype=satellite`;
            break;
        case 'canvas-dark':
            baseFrame.src = "about:blank";
            container.style.backgroundColor = "#0a0a0a"; // พื้นหลังดำสนิทเพื่อดู Contrast ของสีเลเยอร์
            break;
        case 'canvas-light':
            baseFrame.src = "about:blank";
            container.style.backgroundColor = "#f0f0f0";
            break;
        default:
            baseFrame.src = `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&zoom=${zoom}&overlay=wind`;
    }
    recordLog(`🌐 Switched to ${type} mode`);
}

// ระบบ Manual Sync เพื่อดึงข้อมูล Lat/Lon จากเลเยอร์หลักไปหาเลเยอร์ย่อย
function manualSync() {
    const lat = 13.7, lon = 100.5, zoom = 5;
    const layers = document.querySelectorAll('.weather-layer');
    layers.forEach(iframe => {
        // ส่งคำสั่งข้าม Iframe เพื่อให้ทุกเลเยอร์ย้ายไปพิกัดเดียวกัน
        iframe.contentWindow.postMessage({
            action: 'goto',
            lat: lat,
            lon: lon,
            zoom: zoom
        }, '*');
    });
    recordLog("🔄 All Layers Synced.");
}
// ดึง Iframe ของแผนที่ฐาน (ถ้าใช้ Windy Embed)
const basemap = document.getElementById('windy-frame');
const layerIframes = document.querySelectorAll('.weather-layer');

// ดักจับเหตุการณ์เมื่อเราเลื่อนแผนที่ (ในกรณีที่ Basemap ส่งข้อมูลออกมาได้)
// หรือใช้ setInterval เพื่อคอยเช็คและ Sync พิกัด (กรณี Embed ทั่วไป)
setInterval(() => {
    // สมมติว่าพิกัดปัจจุบันคือ lat, lon, zoom
    // ในโปรเจกต์จริง คุณอาจต้องดึงจาก Windy API หรือ URL ของตัวแปร map
    const mapState = {
        lat: 13.7, 
        lon: 100.5, 
        zoom: 5
    };

    // ส่งพิกัดไปยังทุกเลเยอร์
    layerIframes.forEach(iframe => {
        iframe.contentWindow.postMessage({
            type: 'MAP_SYNC',
            ...mapState
        }, '*');
    });
}, 500); // เช็คและ Sync ทุก 0.5 วินาที
}