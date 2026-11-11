/** Provider credentials are write-only; presence flags can be saved back safely. */
type Settings = Record<string, any>;

export function redactNotificationSettings(settings: Settings): Settings {
  const result = { ...settings };
  result.hasBotToken = !!result.telegramBotToken;
  delete result.telegramBotToken;
  for (const [field, secret, flag] of [
    ['smsOverride', 'authToken', 'hasAuthToken'],
    ['emailOverride', 'apiKey', 'hasApiKey'],
  ]) {
    if (!result[field]) continue;
    result[field] = { ...result[field], [flag]: !!result[field][secret] };
    delete result[field][secret];
  }
  return result;
}

export function mergeNotificationSettings(saved: Settings, updates: Settings): Settings {
  const merged = { ...saved, ...updates };
  delete merged.hasBotToken;
  for (const [field, flag] of [['smsOverride', 'hasAuthToken'], ['emailOverride', 'hasApiKey']]) {
    if (!updates[field]) continue;
    // A returned presence flag preserves an omitted credential. An explicit
    // empty object still clears an override, as documented by the API.
    merged[field] = updates[field][flag]
      ? { ...saved[field], ...updates[field] } : { ...updates[field] };
    delete merged[field][flag];
  }
  return merged;
}
