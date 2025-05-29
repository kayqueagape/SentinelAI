import Sentiment from "sentiment";
import config from "../../config.js";

const PT_POSITIVE = {
  "incrível": 5, "adorei": 4, "maravilhoso": 5, "excelente": 5, "perfeito": 5, "ótimo": 4,
  "fantástico": 5, "brilhante": 4, "amei": 4, "gostei": 3, "obrigado": 2, "parabéns": 4,
  "recomendo": 3, "melhor": 3, "satisfeito": 3, "feliz": 3, "alegre": 3, "lindo": 3,
  "rápido": 2, "eficiente": 3, "confiável": 3, "qualidade": 2, "útil": 3, "inovador": 3,
  "surpreendente": 4, "encantador": 4, "delicioso": 4, "incrivel": 5, "otimo": 4,
  "boa": 2, "bom": 2, "ótima": 4, "funciona": 2, "resolveu": 3, "atendeu": 2,
};

const PT_NEGATIVE = {
  "péssimo": -5, "horrível": -5, "terrível": -5, "ruim": -3, "lento": -3, "quebrado": -4,
  "defeituoso": -4, "inútil": -4, "decepcionante": -4, "frustrado": -3, "triste": -3,
  "pior": -4, "falhou": -3, "falha": -3, "problema": -2, "erro": -2, "bug": -2,
  "lixo": -5, "podre": -4, "nojento": -4, "odiei": -4, "detestei": -4, "pessimo": -5,
  "horrivel": -5, "terrivel": -5, "raiva": -3, "ódio": -4, "odio": -4,
  "vergonha": -3, "impossível": -3, "impossivel": -3, "ridículo": -4, "ridiculo": -4,
  "incompetente": -4, "absurdo": -3, "desastre": -4, "decepção": -4,
};

const ES_POSITIVE = {
  "increíble": 5, "maravilloso": 5, "excelente": 5, "perfecto": 5, "genial": 4,
  "fantástico": 5, "brillante": 4, "amé": 4, "gustó": 3, "gracias": 2, "feliz": 3,
  "recomiendo": 3, "mejor": 3, "satisfecho": 3, "encantador": 4, "delicioso": 4, "bueno": 2,
};

const ES_NEGATIVE = {
  "pésimo": -5, "horrible": -5, "terrible": -5, "malo": -3, "lento": -3, "roto": -4,
  "inútil": -4, "decepcionante": -4, "frustrado": -3, "triste": -3, "peor": -4,
  "basura": -5, "odio": -4, "vergüenza": -3, "imposible": -3, "ridículo": -4,
};

const analyzer = new Sentiment();
analyzer.registerLanguage("pt", { labels: { ...PT_POSITIVE, ...PT_NEGATIVE } });
analyzer.registerLanguage("es", { labels: { ...ES_POSITIVE, ...ES_NEGATIVE } });

let toxicityModel = null;
let tfLoading = false;
let tfLoadError = null;

async function loadToxicityModel() {
  if (toxicityModel || tfLoading) return;
  tfLoading = true;
  try {
    const toxicity = require("@tensorflow-models/toxicity");
    require("@tensorflow/tfjs-node");
    toxicityModel = await toxicity.load(config.toxicity.threshold, []);
    console.log("TensorFlow toxicity model loaded");
  } catch (err) {
    tfLoadError = err.message;
    console.warn("TensorFlow unavailable, rule-based fallback active");
  }
  tfLoading = false;
}
loadToxicityModel().catch(() => {});

const TOXIC_RULES = {
  TOXICITY: [/\b(hate|kill|die|stupid|idiot|moron|dumb|loser|idiota|imbecil|burro|bobo|otário|maldito|odeio|matar|destruir|inútil|inutil)\b/gi],
  SEVERE_TOXICITY: [/\b(fuck|shit|bastard|bitch|asshole|cunt|merda|porra|caralho|viado|fdp)\b/gi],
  INSULT: [/\b(ugly|fat|pathetic|worthless|useless|trash|garbage|lixo|incompetente|ridículo|ridiculo|estúpido|estupido|palhaço)\b/gi],
  THREAT: [/\b(threaten|hurt|harm|destroy|ruin|attack|beat|ameaç|agredir|machucar)\b/gi, /i('ll| will) (kill|hurt|destroy|harm)/gi],
  IDENTITY_ATTACK: [/\b(racist|sexist|homophob|racista|sexista|preconceito|discrimina|xenofob)\b/gi],
  OBSCENE: [/\b(porn|nude|explicit|obsceno|vulgar|putaria)\b/gi],
};

function ruleBasedToxicity(text) {
  const words = Math.max(1, text.split(/\s+/).length);
  const predictions = [];
  let maxScore = 0;
  for (const [label, patterns] of Object.entries(TOXIC_RULES)) {
    let matches = 0;
    for (const p of patterns) matches += (text.match(p) || []).length;
    const score = Math.min(1, (matches / words) * 6);
    predictions.push({ label, results: [{ match: score >= config.toxicity.threshold, probabilities: [1 - score, score] }] });
    if (score > maxScore) maxScore = score;
  }
  return { predictions, overallScore: maxScore, source: "rule-based" };
}

function detectLanguage(text) {
  const t = text.toLowerCase();
  const ptMarkers = /\b(que|não|nao|com|para|mas|uma|por|isso|muito|bem|obrigado|boa|dia|produto|serviço|atendimento|adorei|péssimo|ótimo|você|voce|estou|estava|seria|temos|poderia|gostei|amei)\b/g;
  const esMarkers = /\b(que|no|con|para|pero|una|por|eso|muy|bien|gracias|hola|producto|servicio|excelente|usted|nosotros|tenemos|podría)\b/g;
  const ptCount = (t.match(ptMarkers) || []).length;
  const esCount = (t.match(esMarkers) || []).length;
  if (ptCount >= 2 || (ptCount > 0 && /[ãõáéíóúâêîôûç]/i.test(text))) return "pt";
  if (esCount >= 2) return "es";
  return "en";
}

function analyzeSentiment(text, lang = "en") {
  const opts = lang !== "en" ? { language: lang } : {};
  const result = analyzer.analyze(text, opts);
  const c = result.comparative;
  const label = c >= 0.5 ? "very_positive" : c > 0.1 ? "positive" : c >= -0.1 ? "neutral" : c > -0.5 ? "negative" : "very_negative";
  const intensity = Math.abs(c) >= 0.5 ? "high" : Math.abs(c) >= 0.1 ? "medium" : "low";
  return { label, score: result.score, comparative: c, intensity, positiveWords: result.positive, negativeWords: result.negative };
}

const CATEGORY_RULES = [
  { name: "Technical Support", patterns: [/\b(bug|error|crash|fix|help|issue|problem|broken|not work|erro|problema|falha|ajuda|suporte|instala|atualiza|não funciona|nao funciona)\b/gi] },
  { name: "Feedback", patterns: [/\b(feature|suggest|improve|wish|please add|sugestão|sugestao|melhoria|gostaria|seria|poderia adicionar)\b/gi] },
  { name: "Complaint", patterns: [/\b(bad|terrible|awful|horrible|disappointed|worst|useless|péssimo|horrível|terrível|ruim|decepcionante|pior|absurdo)\b/gi] },
  { name: "Praise", patterns: [/\b(great|amazing|love|excellent|perfect|fantastic|wonderful|awesome|incrível|perfeito|maravilhoso|adorei|amei|excelente|parabéns)\b/gi] },
  { name: "Question", patterns: [/(\?)|(\b(how|what|when|where|why|can you|could you|como|quando|onde|porque|qual|posso|consigo|tem como)\b)/gi] },
  { name: "Spam", patterns: [/\b(click here|buy now|discount|free|win|prize|lottery|clique aqui|compre|grátis|ganhe|promoção)\b/gi] },
];

function categorizeText(text) {
  const scores = {};
  for (const { name, patterns } of CATEGORY_RULES) {
    let matches = 0;
    for (const p of patterns) matches += (text.match(p) || []).length;
    if (matches > 0) scores[name] = matches;
  }
  if (!Object.keys(scores).length) return ["General"];
  return Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => c);
}

async function analyzeText(text) {
  const start = Date.now();
  const language = detectLanguage(text);

  const [sentiment, toxicity] = await Promise.all([
    Promise.resolve(analyzeSentiment(text, language)),
    (async () => {
      if (toxicityModel) {
        try {
          const preds = await toxicityModel.classify([text]);
          let maxScore = 0;
          for (const p of preds) {
            const prob = p.results[0]?.probabilities[1] ?? 0;
            if (prob > maxScore) maxScore = prob;
          }
          return { predictions: preds, overallScore: maxScore, source: "tensorflow" };
        } catch { }
      }
      return ruleBasedToxicity(text);
    })(),
  ]);

  const isToxic = toxicity.overallScore >= config.toxicity.threshold;
  const toxicLabels = toxicity.predictions
    .filter(p => p.results[0]?.match === true || (p.results[0]?.probabilities[1] ?? 0) >= config.toxicity.threshold)
    .map(p => p.label);

  const toxicHeat = toxicity.overallScore * 55;
  const sentHeat = sentiment.comparative < 0 ? Math.min(45, Math.abs(sentiment.comparative) * 45) : 0;
  const temperature = Math.min(100, Math.round(toxicHeat + sentHeat));

  return {
    sentiment,
    toxicity: { isToxic, score: Math.round(toxicity.overallScore * 100) / 100, labels: toxicLabels, source: toxicity.source },
    categories: categorizeText(text),
    language,
    temperature,
    processingMs: Date.now() - start,
    textStats: { wordCount: text.split(/\s+/).filter(Boolean).length, charCount: text.length },
  };
}

function getModelStatus() {
  return { tensorflowLoaded: !!toxicityModel, tensorflowError: tfLoadError, fallback: !toxicityModel ? "rule-based" : null };
}

module.exports = { analyzeText, getModelStatus };
