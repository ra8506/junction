export function configure(text: string, bridge: string): string;
export function getKey(lines: string[], section: string, key: string): string | undefined;
export function setKey(lines: string[], section: string, key: string, value: string): boolean;
export function setPermissions(lines: string[], perms: Record<string, string>): boolean;
export function syncTokens(configText: string, registrationText: string): string;
