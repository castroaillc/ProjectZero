// Imported first in main.tsx: zod probes for eval support (`new Function`) when schemas are
// built at module load, and the CSP forbids eval, so the probe itself is a CSP violation.
import { z } from "zod";

z.config({ jitless: true });
