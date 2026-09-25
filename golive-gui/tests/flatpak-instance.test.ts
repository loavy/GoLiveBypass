import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const source = readFileSync(new URL('../../standalone/golivebypass-standalone.sh', import.meta.url), 'utf8');
const fn = source.match(/^flatpak_pid_for_id\(\) \{[\s\S]*?^\}/m)![0];
function select(rows: string, inside: string, legacy = false) {
  // Synthetic flatpak table and namespace oracle; never starts a real client/VPN.
  return execFileSync('/bin/sh', ['-c', [
    'have() { return 0; }',
    'flatpak() { case "$*" in *child-pid*) [ "$LEGACY" = 1 ] && return 1 ;; esac; printf "%s\\n" "$ROWS"; }',
    'discord_pid_in_netns_elevated() { [ "$1" = "$INSIDE" ]; }',
    fn,
    'flatpak_pid_for_id dev.vencord.Vesktop || true',
  ].join('\n')], { env: { ...process.env, ROWS: rows, INSIDE: inside, LEGACY: legacy ? '1' : '0' }, encoding: 'utf8' }).trim();
}
describe('Flatpak/Zypak instance selection', () => {
  it('ignores a zygote listed before the client in the tunnel', () => {
    expect(select('410 dev.vencord.Vesktop\n420 dev.vencord.Vesktop', '420')).toBe('420');
  });
  it('is independent of table order', () => {
    expect(select('420 dev.vencord.Vesktop\n410 dev.vencord.Vesktop', '420')).toBe('420');
  });
  it('rejects transient zero, malformed IDs and another app with a similar name', () => {
    expect(select('0 dev.vencord.Vesktop\nNaN dev.vencord.Vesktop\n420 dev.vencord.VesktopExtra', '420')).toBe('');
  });
  it('keeps an outside PID only as diagnostic fallback; it cannot satisfy the namespace oracle', () => {
    expect(select('410 dev.vencord.Vesktop\n430 dev.vencord.Vesktop', '420')).toBe('410');
  });
  it('supports old Flatpak without child-pid', () => {
    expect(select('420 dev.vencord.Vesktop', '420', true)).toBe('420');
  });
});
