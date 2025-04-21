# API de Análise de Sentimento e Moderação em Tempo Real

---

## Arquitetura

```
sentiment-api/
├── src/
│   ├── server.js              # Express + Socket.io (entrypoint)
│   ├── routes/
│   │   ├── analyze.js         # POST /api/analyze (single + batch)
│   │   ├── webhooks.js        # CRUD de webhooks
│   │   └── stats.js           # /api/stats, /api/health
│   └── services/
│       ├── analyzer.js        # TensorFlow.js toxicity + Sentiment.js
│       ├── rateLimiter.js     # Rate limit com Redis/memória
│       ├── store.js           # Abstração Redis / in-memory
│       ├── webhook.js         # Dispatch + retry + assinatura HMAC
│       └── eventLog.js        # Circular buffer + métricas em tempo real
├── public/
│   └── index.html             # Dashboard real-time (Socket.io)
├── tests/
│   └── api.test.js            # Smoke test + seed de dados demo
├── config/
│   └── index.js               # Configuração centralizada
├── .env.example
└── package.json
```

---

## Início Rápido

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar ambiente

```bash
cp .env.example .env
# Edite .env conforme necessário
```

### 3. Rodar

```bash
# Desenvolvimento (com auto-reload)
npm run dev

# Produção
npm start
```

**Opcional: Redis** (para rate limiting persistente entre reinicializações)
```bash
# Com Docker:
docker run -d -p 6379:6379 redis:alpine

# Depois configure no .env:
REDIS_URL=redis://localhost:6379
```

---

## API Reference

### `POST /api/analyze`

Analisa um único texto.

**Body:**
```json
{
  "text": "Produto incrível! Adorei tudo.",
  "source": "forum",
  "metadata": { "userId": "123", "postId": "456" }
}
```

**Resposta:**
```json
{
  "id": "uuid-v4",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "analysis": {
    "sentiment": {
      "label": "very_positive",
      "score": 8,
      "comparative": 0.8,
      "intensity": "high",
      "positiveWords": ["incrível", "adorei"],
      "negativeWords": []
    },
    "toxicity": {
      "isToxic": false,
      "score": 0.02,
      "labels": [],
      "source": "tensorflow"
    },
    "categories": ["Praise"],
    "language": "pt",
    "temperature": 5,
    "processingMs": 45,
    "textStats": { "wordCount": 4, "charCount": 30 }
  }
}
```

### `POST /api/analyze/batch`

Analisa até **20 textos** de uma vez.

```json
{
  "texts": ["Texto 1", "Texto 2", "..."],
  "source": "import"
}
```

### `GET /api/stats`

Métricas agregadas para o dashboard.

### `GET /api/health`

Status dos serviços (Redis, TensorFlow, memória).

---

## Webhooks

### Registrar um endpoint

```bash
curl -X POST http://localhost:3000/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://seu-servico.com/webhook",
    "events": ["toxic_content"],
    "label": "Notificação Slack"
  }'
```

### Eventos disponíveis

| Evento | Disparado quando |
|--------|-----------------|
| `toxic_content` | Texto com toxicidade acima do threshold |
| `analysis_complete` | Toda análise concluída |
| `*` | Todos os eventos |

### Verificar assinatura HMAC-SHA256

```javascript
const crypto = require('crypto');

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (signature !== expected) {
    return res.status(401).send('Invalid signature');
  }

  const { event, data } = req.body;
  console.log(`Event: ${event}`, data);
  res.sendStatus(200);
});
```

---

## Rate Limiting

O rate limiter usa uma **sliding window** com backing store em Redis (ou memória).

| Header | Descrição |
|--------|-----------|
| `X-RateLimit-Limit` | Máximo de requests por janela |
| `X-RateLimit-Remaining` | Requests restantes |
| `X-RateLimit-Reset` | Timestamp ISO do reset |
| `Retry-After` | Segundos até poder tentar novamente (se bloqueado) |

**Configuração no `.env`:**
```
RATE_LIMIT_WINDOW_MS=60000       # janela de 1 minuto
RATE_LIMIT_MAX_REQUESTS=30       # 30 requests por janela
RATE_LIMIT_BLOCK_DURATION_MS=300000  # bloqueia por 5min se exceder
```

---

## Pipeline de Análise

```
texto → [Sentiment.js] → score sentimento
      → [TensorFlow Toxicity Model] → score toxicidade por categoria
      → [Regras categorizadoras] → categorias (Support/Spam/Praise/etc)
      → [Detector de idioma] → pt/en/es
      → temperatura agregada (0-100)
      → [Se tóxico] → disparo de webhooks (com retry 3x)
      → [Socket.io] → atualização do dashboard em tempo real
```

**Fallback**: Se o modelo TensorFlow não carregar (primeira vez pode demorar ~30s para download), o sistema usa detecção baseada em regras automaticamente.

---

## Dashboard

Acesse `http://localhost:3000` após iniciar o servidor.

**Recursos:**
- 🌡️ **Termômetro** de temperatura dos comentários (0–100)
- 📈 **Timeline** de volume por minuto (total vs tóxicos)
- 📊 **Distribuição** de sentimentos em tempo real  
- 🔴 **Feed ao vivo** com cada análise colorizada
- 🧪 **Painel "Testar"** para enviar textos diretamente

---

## Testes

```bash
# Smoke test + seed de dados demo no dashboard
node tests/api.test.js
```

---

## Variáveis de Ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `PORT` | `3000` | Porta do servidor |
| `REDIS_URL` | — | URL do Redis (opcional) |
| `TOXICITY_THRESHOLD` | `0.7` | Limiar de toxicidade (0.0–1.0) |
| `RATE_LIMIT_MAX_REQUESTS` | `30` | Máx requests por janela |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Janela de rate limit (ms) |
| `WEBHOOK_SECRET` | — | Segredo para HMAC dos webhooks |
