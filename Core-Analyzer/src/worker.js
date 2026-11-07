export default {
  async scheduled(event, env) {
    const alertStatus = await env.DB.prepare("SELECT value FROM settings WHERE key='alert'").first("value");
    if (alertStatus === 'OFF') return;

    const lat = 13.7, lon = 100.5;
    try {
      const res = await fetch("https://api.windy.com/api/point-forecast/v2", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat, lon, model: "gfs",
          parameters: ["wind", "wind_u", "wind_v", "gust", "precip", "temp", "dewpoint", "pm2p5", "no2", "uv", "rh", "pressure"],
          levels: ["surface", "900h", "850h", "500h", "200h"],
          key: env.WINDY_API_KEY
        })
      });
      const d = await res.json();

      const layers = [
        { level: "900h", label: "900hPa (~1km)", warn: 20, danger: 35 },
        { level: "850h", label: "850hPa (~1.5km)", warn: 25, danger: 40 },
        { level: "500h", label: "500hPa (~5.5km)", warn: 30, danger: 50 },
        { level: "200h", label: "200hPa (~12km Jet)", warn: 40, danger: 70 }
      ];

      let alerts = [];
      let maxIntensity = 0, topEvent = null, topColor = "#FFFFFF";

      for (const layer of layers) {
        const windNow = d[`wind-${layer.level}`]?.[0];
        if (windNow == null) continue;
        let eventType = null, color = "#FFFFFF";
        if (windNow >= layer.danger) { eventType = "EXTREME_WIND"; color = "#FF0000"; }
        else if (windNow >= layer.warn) { eventType = "HIGH_WIND"; color = "#FFA500"; }
        if (eventType) {
          alerts.push({ layer: layer.label, level: layer.level, wind: windNow, type: eventType, color });
          if (windNow > maxIntensity) { maxIntensity = windNow; topEvent = eventType; topColor = color; }
        }
      }

      const precip = d["precip-surface"]?.[0] || 0;
      const pm25 = d["pm2p5-surface"]?.[0] || 0;
      if (precip > 15) {
        alerts.push({ layer: "surface", level: "surface", wind: precip, type: "STATIONARY_RAIN", color: "#0000FF" });
        if (precip > maxIntensity) { maxIntensity = precip; topEvent = "STATIONARY_RAIN"; topColor = "#0000FF"; }
      }
      if (pm25 > 50) {
        alerts.push({ layer: "surface", level: "surface", wind: pm25, type: "POLLUTION_CRISIS", color: "#9400D3" });
        if (pm25 > maxIntensity) { maxIntensity = pm25; topEvent = "POLLUTION_CRISIS"; topColor = "#9400D3"; }
      }

      if (alerts.length > 0 && topEvent) {
        await env.DB.prepare(
          "INSERT INTO analysis_logs (lat, lon, signature_type, event_color, intensity, comment) VALUES (?,?,?,?,?,?)"
        ).bind(lat, lon, topEvent, topColor, maxIntensity, `พบ ${topEvent} จาก ${alerts.length} layer`).run();

        let msg = `⚠️ <b>AI ALERT: ${topEvent}</b>\n📍 ${lat}, ${lon}\n📊 รุนแรงสูงสุด: ${maxIntensity}\n🔍 พบ ${alerts.length} การแจ้งเตือน:\n\n`;
        for (const a of alerts) {
          const emoji = a.type === "EXTREME_WIND" ? "🔴" : a.type === "HIGH_WIND" ? "🟠" : a.type === "STATIONARY_RAIN" ? "🔵" : "🟣";
          msg += `${emoji} <b>${a.layer}</b> — ${a.type}: ${a.wind}\n`;
        }
        msg += `\n✅ Archive แล้ว\n⏰ ${new Date().toISOString()}`;
        await sendTelegram(msg, env);
      }
	      // ── วิธีที่ 3: ถ่าย screenshot ส่ง Telegram อัตโนมัติทุกครั้งที่ Cron ทำงาน ──
      try {
        await captureDashboard(env, "https://core-analyzer.charaswat.workers.dev");
      } catch (e) { console.log("Capture error:", e.message); }
    
    } catch (e) { console.log("Cron error:", e.message); }
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    // ─── /capture — Browser Run screenshot → D1 (base64) → Telegram ───
    if (url.pathname === "/capture") {
      try {
        const result = await captureDashboard(env, `${url.protocol}//${url.host}`);
        return jsonResponse({ test: "capture", status: "success", ...result });
      } catch (e) {
        return jsonResponse({ test: "capture", status: "error", error: e.message });
      }
    }

    // ─── /simulate — จำลองข้อมูล + ส่ง Telegram + กราฟ (+ capture ถ้า capture=true) ───
    if (url.pathname === "/simulate") {
      const count = Math.min(parseInt(url.searchParams.get("n") || "50"), 200);
      const doCapture = url.searchParams.get("capture") === "true";
      const lat = 13.7, lon = 100.5;
      const steps = [];

      try {
        const mockData = [];
        for (let i = 0; i < count; i++) {
          const layers = {
            "900h": Math.round((15 + Math.random() * 35) * 10) / 10,
            "850h": Math.round((20 + Math.random() * 40) * 10) / 10,
            "500h": Math.round((25 + Math.random() * 45) * 10) / 10,
            "200h": Math.round((30 + Math.random() * 55) * 10) / 10
          };
          const maxWind = Math.max(...Object.values(layers));
          let eventType = "NORMAL", color = "#22C55E";
          if (maxWind >= 70) { eventType = "EXTREME_WIND"; color = "#FF0000"; }
          else if (maxWind >= 40) { eventType = "HIGH_WIND"; color = "#FFA500"; }
          else if (maxWind >= 25) { eventType = "MODERATE_WIND"; color = "#FACC15"; }
          mockData.push({
            lat: Math.round((lat + (Math.random() - 0.5) * 4) * 100) / 100,
            lon: Math.round((lon + (Math.random() - 0.5) * 4) * 100) / 100,
            layers, maxWind, eventType, color, hour: i
          });
        }

        const stmts = mockData.map(d =>
          env.DB.prepare("INSERT INTO analysis_logs (lat, lon, signature_type, event_color, intensity, comment) VALUES (?,?,?,?,?,?)")
            .bind(d.lat, d.lon, d.eventType, d.color, d.maxWind, JSON.stringify({ layers: d.layers, hour: d.hour }))
        );
        await env.DB.batch(stmts);
        steps.push({ step: `D1 INSERT (${count} records)`, status: "success" });

        const alertCount = mockData.filter(d => d.eventType !== "NORMAL").length;
        const extremeCount = mockData.filter(d => d.eventType === "EXTREME_WIND").length;
        const highCount = mockData.filter(d => d.eventType === "HIGH_WIND").length;
        const moderateCount = mockData.filter(d => d.eventType === "MODERATE_WIND").length;

        let summaryMsg = `📊 <b>Simulation Complete</b>\n🔢 จำนวน: ${count} ชุด\n🔴 EXTREME: ${extremeCount}\n🟠 HIGH: ${highCount}\n🟡 MODERATE: ${moderateCount}\n🟢 NORMAL: ${count - alertCount}\n\n📍 ${lat}, ${lon}\n⏰ ${new Date().toISOString()}`;
        await sendTelegram(summaryMsg, env);
        steps.push({ step: "Telegram Summary", status: "sent" });

        const chartConfig = {
          type: "line",
          data: {
            labels: mockData.map(d => `T+${d.hour}h`),
            datasets: [
              { label: "900hPa", data: mockData.map(d => d.layers["900h"]), borderColor: "#3B82F6", fill: false },
              { label: "850hPa", data: mockData.map(d => d.layers["850h"]), borderColor: "#10B981", fill: false },
              { label: "500hPa", data: mockData.map(d => d.layers["500h"]), borderColor: "#F59E0B", fill: false },
              { label: "200hPa", data: mockData.map(d => d.layers["200h"]), borderColor: "#EF4444", fill: false }
            ]
          },
          options: { title: { display: true, text: "Wind Speed 4 Layer Simulation (m/s)" } }
        };
        const chartUrl = "https://quickchart.io/chart?c=" + encodeURIComponent(JSON.stringify(chartConfig)) + "&w=800&h=400";
        const photoRes = await sendTelegramPhoto(chartUrl, "📊 กราฟลม 4 Layer (Simulation)", env);
        steps.push({ step: "Telegram Chart Photo", status: photoRes.ok ? "sent" : "failed", httpStatus: photoRes.status });

        const topAlerts = mockData.filter(d => d.eventType === "EXTREME_WIND").slice(0, 3);
        for (const a of topAlerts) {
          let alertMsg = `🔴 <b>EXTREME_WIND Alert</b>\n📍 ${a.lat}, ${a.lon}\n💨 200hPa: ${a.layers["200h"]} m/s\n💨 500hPa: ${a.layers["500h"]} m/s\n💨 850hPa: ${a.layers["850h"]} m/s\n💨 900hPa: ${a.layers["900h"]} m/s\n⏰ T+${a.hour}h`;
          await sendTelegram(alertMsg, env);
          await sleep(1000);
        }
        steps.push({ step: "Telegram Top Alerts", status: "sent", count: topAlerts.length });

        // ── Capture screenshot ถ้า capture=true ──
        if (doCapture) {
          try {
            const captureResult = await captureDashboard(env, `${url.protocol}//${url.host}`);
            steps.push({ step: "Browser Run Screenshot", status: "success", imageId: captureResult.imageId });
            steps.push({ step: "Telegram Dashboard Photo", status: "sent" });
          } catch (e) {
            steps.push({ step: "Browser Run Screenshot", status: "error", error: e.message });
          }
        }

        return jsonResponse({
          test: "simulate", timestamp: new Date().toISOString(), totalRecords: count,
          statistics: { extreme: extremeCount, high: highCount, moderate: moderateCount, normal: count - alertCount },
          capture: doCapture, steps, chartUrl
        });
      } catch (e) {
        return jsonResponse({ test: "simulate", status: "error", error: e.message, steps });
      }
    }

    // ─── /test-alert ───
    if (url.pathname === "/test-alert") {
      const lat = 13.7, lon = 100.5;
      const steps = [];
      const mockAlerts = [
        { layer: "900hPa (~1km)", type: "HIGH_WIND", wind: 22.5 },
        { layer: "850hPa (~1.5km)", type: "HIGH_WIND", wind: 28.3 },
        { layer: "500hPa (~5.5km)", type: "EXTREME_WIND", wind: 52.1 },
        { layer: "200hPa (~12km Jet)", type: "EXTREME_WIND", wind: 75.8 }
      ];
      try {
        await env.DB.prepare("INSERT INTO analysis_logs (lat, lon, signature_type, event_color, intensity, comment) VALUES (?,?,?,?,?,?)")
          .bind(lat, lon, "EXTREME_WIND", "#FF0000", 75.8, "พบ EXTREME_WIND จาก 4 layer").run();
        steps.push({ step: "D1 INSERT", status: "success" });
      } catch (e) { steps.push({ step: "D1 INSERT", status: "error", error: e.message }); }
      try {
        let tgMsg = `⚠️ <b>AI ALERT: EXTREME_WIND</b>\n📍 ${lat}, ${lon}\n📊 รุนแรงสูงสุด: 75.8\n🔍 พบ 4 การแจ้งเตือน:\n\n`;
        for (const a of mockAlerts) {
          const emoji = a.type === "EXTREME_WIND" ? "🔴" : "🟠";
          tgMsg += `${emoji} <b>${a.layer}</b> — ${a.type}: ${a.wind}\n`;
        }
        tgMsg += `\n✅ Archive แล้ว\n🤖 Core-Analyzer\n⏰ ${new Date().toISOString()}`;
        const tgRes = await sendTelegram(tgMsg, env);
        steps.push({ step: "Telegram Send", status: tgRes.ok ? "sent" : "failed", httpStatus: tgRes.status });
      } catch (e) { steps.push({ step: "Telegram Send", status: "error", error: e.message }); }
      return jsonResponse({ test: "test-alert", timestamp: new Date().toISOString(), steps });
    }

    // ─── /test-layers ───
    if (url.pathname === "/test-layers") {
      try {
        const lat = parseFloat(url.searchParams.get("lat") || 13.7);
        const lon = parseFloat(url.searchParams.get("lon") || 100.5);
        const res = await fetch("https://api.windy.com/api/point-forecast/v2", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lon, model: "gfs", parameters: ["wind", "wind_u", "wind_v", "gust", "precip", "temp", "dewpoint", "pm2p5", "rh", "pressure"], levels: ["surface", "900h", "850h", "500h", "200h"], key: env.WINDY_API_KEY })
        });
        const d = await res.json();
        const layers = ["surface", "900h", "850h", "500h", "200h"];
        const layerData = {};
        for (const lv of layers) {
          layerData[lv] = { wind: d[`wind-${lv}`]?.[0] ?? null, gust: d[`gust-${lv}`]?.[0] ?? null };
        }
        return jsonResponse({ test: "test-layers", coords: { lat, lon }, layers: layerData, precip: d["precip-surface"]?.[0] ?? null, pm25: d["pm2p5-surface"]?.[0] ?? null, timestamp: new Date().toISOString() });
      } catch (e) {
        return jsonResponse({ test: "test-layers", error: e.message });
      }
    }

    // ─── /test-photo ───
    if (url.pathname === "/test-photo") {
      try {
        const photoUrl = url.searchParams.get("url") || "https://quickchart.io/chart?c=%7B%22type%22%3A%22bar%22%2C%22data%22%3A%7B%22labels%22%3A%5B%22900hPa%22%2C%22850hPa%22%2C%22500hPa%22%2C%22200hPa%22%5D%2C%22datasets%22%3A%5B%7B%22label%22%3A%22Wind%20m%2Fs%22%2C%22data%22%3A%5B18%2C25%2C35%2C55%5D%2C%22backgroundColor%22%3A%5B%22%233B82F6%22%2C%22%2310B981%22%2C%22%23F59E0B%22%2C%22%23EF4444%22%5D%7D%5D%7D%7D&w=600&h=400";
        const tgRes = await sendTelegramPhoto(photoUrl, "📸 ทดสอบส่งภาพจาก Core-Analyzer", env);
        return jsonResponse({ test: "test-photo", status: tgRes.ok ? "sent" : "failed", httpStatus: tgRes.status });
      } catch (e) {
        return jsonResponse({ test: "test-photo", error: e.message });
      }
    }

    // ─── /api/heatmap ───
    if (url.pathname === "/api/heatmap") {
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "500"), 5000);
      const { results } = await env.DB.prepare("SELECT * FROM analysis_logs ORDER BY timestamp DESC LIMIT ?").bind(limit).all();
      return jsonResponse(results);
    }

    // ─── /api/stats ───
    if (url.pathname === "/api/stats") {
      const { results: total } = await env.DB.prepare("SELECT COUNT(*) as count FROM analysis_logs").all();
      const { results: byType } = await env.DB.prepare("SELECT signature_type, COUNT(*) as count FROM analysis_logs GROUP BY signature_type").all();
      const { results: recent } = await env.DB.prepare("SELECT COUNT(*) as count FROM analysis_logs WHERE timestamp > datetime('now', '-1 hour')").all();
      return jsonResponse({ totalRecords: total[0].count, lastHour: recent[0].count, byType, timestamp: new Date().toISOString() });
    }

    // ─── /api/images — ดูรายการ screenshot (ไม่ส่ง base64 กลับ ประหยัด bandwidth) ───
    if (url.pathname === "/api/images") {
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
      const { results } = await env.IMAGE_DB.prepare(
        "SELECT id, timestamp, event_count, caption FROM images ORDER BY timestamp DESC LIMIT ?"
      ).bind(limit).all();
      return jsonResponse({ count: results.length, images: results });
    }

    // ─── /image/:id — เสิร์ฟภาพจาก D1 (base64 → PNG) ───
    if (url.pathname.startsWith("/image/")) {
      const id = parseInt(url.pathname.replace("/image/", ""));
      if (!id) return new Response("Invalid image ID", { status: 400 });
      const row = await env.IMAGE_DB.prepare("SELECT image_data FROM images WHERE id = ?").bind(id).first();
      if (!row) return new Response("Not found", { status: 404 });
      const bytes = base64ToUint8Array(row.image_data);
      return new Response(bytes, {
        headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" }
      });
    }

    // ─── /webhook (LINE) ───
    if (request.method === "POST" && url.pathname === "/webhook") {
      const body = await request.json();
      const event = body.events[0];
      if (!event) return new Response("OK");
      const text = event.message.text.toUpperCase();
      let reply = "🤖 Core-Analyzer: สั่งงานด้วย ON, OFF, SUBSCRIBE หรือ SIMULATE";
      if (text === "SUBSCRIBE") {
        await env.DB.prepare("INSERT OR IGNORE INTO subscribers (user_id) VALUES (?)").bind(event.source.userId).run();
        reply = "🙏 ขอบคุณที่ติดตาม! ระบบเริ่มเก็บข้อมูล 5 ปีให้คุณแล้ว";
      } else if (text === "OFF") {
        await env.DB.prepare("UPDATE settings SET value='OFF' WHERE key='alert'").run();
        reply = "🔴 ปิดระบบแจ้งเตือนแล้ว";
      } else if (text === "ON") {
        await env.DB.prepare("UPDATE settings SET value='ON' WHERE key='alert'").run();
        reply = "🟢 เปิดระบบ AI Scan อัตโนมัติ (4 Layer)";
      } else if (text === "SIMULATE") {
        reply = "📊 สั่ง simulate ได้ที่: https://core-analyzer.charaswat.workers.dev/simulate?n=50";
      }
      await replyLine(event.replyToken, reply, env);
      return new Response("OK");
    }

    // ─── /proxy ───
    if (url.pathname === "/proxy") {
      const target = url.searchParams.get("url");
      const resp = await fetch(target);
      return new Response(resp.body, { headers: { "Access-Control-Allow-Origin": "*", "Content-Type": resp.headers.get("Content-Type") } });
    }

    return new Response("Core-Analyzer Ultimate Engine Online (4 Layer Wind + Browser Run + D1 image_db)", { status: 200 });
  }
};

// ═══════════════════════════════════════════════════════════
//  Helper Functions
// ═══════════════════════════════════════════════════════════

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

async function sendTelegram(text, env) {
  return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML" })
  });
}

async function sendTelegramPhoto(photoUrl, caption, env) {
  return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, photo: photoUrl, caption: caption || "" })
  });
}

// ── ส่งภาพจาก buffer ไป Telegram แบบ multipart (ไม่ต้องมี URL สาธารณะ) ──
async function sendTelegramPhotoBytes(imageBuffer, caption, env) {
  const formData = new FormData();
  formData.append('chat_id', env.TELEGRAM_CHAT_ID);
  formData.append('photo', new Blob([imageBuffer], { type: 'image/png' }), 'dashboard.png');
  if (caption) formData.append('caption', caption);
  return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    body: formData
  });
}

async function replyLine(token, msg, env) {
  return fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.LINE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ replyToken: token, messages: [{ type: "text", text: msg }] })
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── ArrayBuffer → base64 (แบบ chunk ป้องกัน stack overflow) ──
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

// ── base64 → Uint8Array ──
function base64ToUint8Array(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// ═══════════════════════════════════════════════════════════
//  captureDashboard — ถ่าย screenshot ด้วย Browser Run
//  → เก็บใน D1 image_db (base64) → ส่ง Telegram
// ═══════════════════════════════════════════════════════════

async function captureDashboard(env, baseUrl) {
  const dashboardUrl = `${baseUrl}/`;

  // 1. ถ่าย screenshot ด้วย Browser Run Quick Action
  const screenshotResponse = await env.BROWSER.quickAction("screenshot", {
    url: dashboardUrl,
    viewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
    waitForTimeout: 3000
  });
  const screenshotBuffer = await screenshotResponse.arrayBuffer();

  // 2. แปลงเป็น base64 สำหรับเก็บใน D1
  const base64Data = arrayBufferToBase64(screenshotBuffer);

  // 3. นับ events จาก weather_db
  const { count: eventCount } = await env.DB.prepare("SELECT COUNT(*) as count FROM analysis_logs").first();

  // 4. เก็บใน D1 image_db
  const caption = `📸 Dashboard Screenshot\n📊 ${eventCount} events\n⏰ ${new Date().toISOString()}`;
  const result = await env.IMAGE_DB.prepare(
    "INSERT INTO images (image_data, event_count, caption) VALUES (?, ?, ?)"
  ).bind(base64Data, eventCount, caption).run();

  const imageId = result.meta.last_row_id;

  // 5. ส่งภาพไป Telegram (ส่งจาก buffer ตรง ไม่ผ่าน URL)
  await sendTelegramPhotoBytes(screenshotBuffer, caption, env);

  return { imageId, eventCount, dashboardUrl, timestamp: new Date().toISOString() };
}
