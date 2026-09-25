import { app } from 'electron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Explicit packaging metadata: never infer a local build from version ordering
// or change the user's persisted update preference for official releases.
export function isLocalBuild(): boolean {
  try {
    return JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')).goliveLocalBuild === true;
  } catch { return false; }
}
