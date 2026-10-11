// Treina o modelo de risco na base sintética e grava src/risk-model/model.json (determinístico pela semente).
// Uso: npm run risk:train
import { writeFileSync } from "node:fs";
import { buildModel } from "../src/risk-model/train.js";

const model = buildModel();
writeFileSync(new URL("../src/risk-model/model.json", import.meta.url), JSON.stringify(model, null, 2) + "\n");
const m = model.metrics;
console.log(`modelo ${model.version} · ${model.dataset.rows} operações sintéticas · inadimplência ${(model.dataset.defaultRate * 100).toFixed(1)}%`);
console.log(`teste: AUC ${m.auc.toFixed(3)} · KS ${m.ks.toFixed(3)} · Brier ${m.brier.toFixed(4)}`);
console.log("coeficientes (padronizados):", model.features.map((f) => `${f.key}=${f.coef.toFixed(2)}`).join(" "));
console.log("decis (previsto/observado):", m.deciles.map((d) => `${(d.predicted * 100).toFixed(1)}/${(d.observed * 100).toFixed(1)}`).join(" "));
