import { describe, expect, it } from "vitest";
import { ClimateService, climateIndex } from "../src/risk-model/climate.js";

const DAY = 86_400_000;

describe("clima real (Open-Meteo)", () => {
  it("índice: faixa neutra, seca e excesso", () => {
    expect(climateIndex(0)).toBe(0);
    expect(climateIndex(-0.05)).toBe(0);
    expect(climateIndex(0.1)).toBe(0);
    expect(climateIndex(-0.4)).toBe(1);
    expect(climateIndex(-0.25)).toBeCloseTo(0.5, 5);
    expect(climateIndex(0.5)).toBe(1);
  });

  it("compara os últimos 12 meses com a média dos 10 anos anteriores", async () => {
    const now = Date.parse("2026-10-11T12:00:00Z");
    // Série sintética: 3 mm/dia na história e 2 mm/dia no último ano → cerca de 33% abaixo da média.
    const fetcher = async (url: string) => {
      const start = Date.parse(new URL(url).searchParams.get("start_date")! + "T00:00:00Z");
      const end = Date.parse(new URL(url).searchParams.get("end_date")! + "T00:00:00Z");
      const time: string[] = [];
      const rain: number[] = [];
      for (let t = start; t <= end; t += DAY) {
        time.push(new Date(t).toISOString().slice(0, 10));
        rain.push(end - t < 365 * DAY ? 2 : 3);
      }
      return { daily: { time, precipitation_sum: rain } };
    };
    const svc = new ClimateService(fetcher, () => now);
    expect(svc.reading("MT")).toBeNull(); // primeira leitura dispara a busca
    await svc.warm(["MT"]);
    const snap = svc.snapshot("MT")!;
    expect(snap.city).toBe("Sorriso");
    expect(snap.anomaly).toBeCloseTo(-1 / 3, 1);
    expect(snap.index).toBeGreaterThan(0.7);
    expect(svc.reading("MT")!.detail).toContain("abaixo da média");
    expect(svc.reading("XX")).toBeNull();
  });
});
