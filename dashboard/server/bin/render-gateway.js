#!/usr/bin/env node
// Render run/gateway/{litellm.yaml,gateway.env} from config/providers.json.
// Called by bin/gateway.sh so the bash side never parses the key file itself.
import { renderGateway } from '../services/providers.js';

const dir = process.argv[2];
if (!dir) { console.error('usage: render-gateway.js <dir>'); process.exit(64); }
renderGateway(dir);
