import "dotenv/config";
import { getActiveSnelStartConnections } from "./supabase.js";
import { syncConnection } from "./sync.js";
import { logHeader } from "./logger.js";

async function main(): Promise<void> {
  logHeader("SNELSTART SYNC RUN");
  console.log(`Tijd: ${new Date().toISOString()}`);

  try {
    const connections = await getActiveSnelStartConnections();
    console.log(`Connecties gevonden: ${connections.length}`);

    if (connections.length === 0) {
      console.log("\nGeen actieve SnelStart connecties — klaar.");
      logHeader("STATUS: GEEN CONNECTIES");
      return;
    }

    let totalErrors = 0;

    for (const connection of connections) {
      try {
        const result = await syncConnection(connection);
        totalErrors += result.errors;
      } catch (err) {
        totalErrors++;
        console.error(
          `\n[${connection.company_name ?? "Onbekend"}] FATALE FOUT: ${(err as Error).message}`
        );
      }
    }

    logHeader(totalErrors > 0 ? "STATUS: VOLTOOID MET FOUTEN" : "STATUS: GELUKT");
  } catch (err) {
    console.error(`\nFATALE FOUT: ${(err as Error).message}`);
    logHeader("STATUS: MISLUKT");
    process.exit(1);
  }
}

main();
