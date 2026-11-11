import { getApiUrl } from './env';
import { useAuthStore } from '../stores/auth-store';

export async function getServerModelStatus(apiUrl = getApiUrl()): Promise<{
  available: boolean;
  models: Array<{ name: string; size?: string }>;
}> {
  if (!apiUrl) return { available: false, models: [] };
  const token = useAuthStore.getState().sessionToken;
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/status`, {
    signal: AbortSignal.timeout(5000),
    headers: token ? { 'X-Session-Token': token } : {},
  });
  if (!response.ok) throw new Error('Could not read model status from the SafeOS server');
  const data = await response.json();
  return {
    available: data.ollama?.available === true,
    models: Array.isArray(data.ollama?.models) ? data.ollama.models : [],
  };
}
