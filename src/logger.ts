export function logHeader(title: string): void {
  console.log("============================================================");
  console.log(title);
  console.log("============================================================");
}

export function logSection(company: string, message: string): void {
  console.log(`\n[${company}] ${message}`);
}

export function logDetail(message: string): void {
  console.log(`  → ${message}`);
}

export function logSummary(
  company: string,
  stats: { found: number; processed: number; errors: number; durationMs: number }
): void {
  console.log(`\n[${company}] Sync voltooid`);
  console.log(
    `  Gevonden: ${stats.found} | Verwerkt: ${stats.processed} | Fouten: ${stats.errors} | Duur: ${(stats.durationMs / 1000).toFixed(1)}s`
  );
}
