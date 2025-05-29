import http from http;

const BASE = process.env.API_URL || "http://localhost:3000";

const SAMPLE_TEXTS = [
  "Adorei o produto, superou todas as minhas expectativas! Atendimento impecável.",
  "Que serviço incrível! Voltarei com certeza e recomendo a todos os amigos.",
  "The feature you added is exactly what I needed. Thank you so much!",
  "Gostaria de saber o horário de funcionamento da loja no fim de semana.",
  "Could you confirm my order status? Order #12345.",
  "When will the new update be released?",
  "O atendimento foi péssimo, fiquei esperando 40 minutos sem resposta.",
  "Very disappointed with the product quality. Not what was advertised.",
  "Terrible experience. I will not be coming back.",
  "Esse produto é um lixo completo, vocês são incompetentes!",
  "I hate this garbage service. Absolutely useless team!",
  "Suggestion: it would be great to have dark mode in the app.",
  "Feature request: please add export to CSV functionality.",
  "The app crashes every time I try to login. iOS 17, iPhone 15.",
  "Bug: the search bar returns no results even with valid queries.",
];

async function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(path, BASE);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    }, res => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function get(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    http.get({ hostname: url.hostname, port: url.port, path: url.pathname }, res => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    }).on("error", reject);
  });
}

async function main() {
  console.log(`\nTesting API at ${BASE}\n`);

  console.log("1. Health check...");
  const health = await get("/api/health");
  console.log(`   Status: ${health.status === 200 ? "OK" : "FAIL"} ${health.status}`);
  console.log(`   Store: ${health.data.services?.store}`);
  console.log(`   Model: ${health.data.services?.tensorflowModel}\n`);

  console.log("2. Single text analysis...");
  const single = await post("/api/analyze", { text: "Produto incrível! Amei cada detalhe.", source: "test" });
  if (single.status === 200) {
    const a = single.data.analysis;
    console.log(`   OK - Sentiment: ${a.sentiment.label} | Temp: ${a.temperature} | Toxic: ${a.toxicity.isToxic}`);
    console.log(`   Categories: ${a.categories.join(", ")} | Lang: ${a.language}\n`);
  } else {
    console.log(`   FAIL ${single.status}: ${JSON.stringify(single.data)}\n`);
  }

  console.log("3. Batch analysis (5 texts)...");
  const batch = await post("/api/analyze/batch", { texts: SAMPLE_TEXTS.slice(0, 5), source: "test-batch" });
  if (batch.status === 200) {
    console.log(`   OK - Processed: ${batch.data.count} texts`);
    batch.data.items.forEach(item => {
      if (item.success) {
        const a = item.analysis;
        console.log(`   [${item.index}] ${a.sentiment.label} | temp:${a.temperature} | toxic:${a.toxicity.isToxic}`);
      }
    });
    console.log();
  }

  console.log("4. Seeding dashboard with demo data...");
  let seeded = 0;
  for (const text of SAMPLE_TEXTS) {
    const r = await post("/api/analyze", { text, source: "demo-seed" });
    if (r.status === 200) seeded++;
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(`   OK - Seeded ${seeded}/${SAMPLE_TEXTS.length} texts\n`);

  console.log("5. Stats check...");
  const stats = await get("/api/stats");
  if (stats.status === 200) {
    const s = stats.data;
    console.log(`   Total: ${s.totalAnalyzed} | Toxic: ${s.totalToxic} (${s.toxicRate}%)`);
    console.log(`   Avg temperature: ${s.avgTemperature}`);
    console.log(`   Sentiment dist:`, s.sentimentDistribution);
  }

  console.log(`\nAll tests complete!`);
  console.log(`Open dashboard: ${BASE}/\n`);
}

main().catch(err => {
  console.error("Test failed:", err.message);
  process.exit(1);
});
