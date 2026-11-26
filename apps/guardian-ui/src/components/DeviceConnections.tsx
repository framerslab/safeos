/**
 * What leaves this device
 *
 * One table of the connections SafeOS makes or leads to: the host's log, the
 * detection model's download, a spoken alert and a server the person
 * connects. Each row says when it happens, who sees what and how to stop it.
 * The privacy page renders it; another page can render it too.
 *
 * What each row rests on: GitHub's statement on Pages visitor logs; the
 * model's address in lib/detection-model-facts.ts, fetched only after the
 * agreement (lib/detection-model.ts); the voices in lib/tts-alerts.ts, the
 * Voice Warnings switch in components/SecurityPanel.tsx and Wildlife's Alert
 * Mode in app/wildlife/page.tsx; the monitor's frames in app/monitor/page.tsx
 * and the server's cloud step in src/queues/analysis-queue.ts.
 *
 * @module components/DeviceConnections
 */

interface Connection {
  name: string;
  when: string;
  sees: string;
  stop: string;
}

export const CONNECTIONS: Connection[] = [
  {
    name: 'The host’s log',
    when: 'Each time you open a page of safeos.sh.',
    sees: 'GitHub, which hosts safeos.sh, logs your IP address and keeps it for security purposes.',
    stop: 'Serve your own copy of SafeOS from a host you choose; that host’s own log then applies.',
  },
  {
    name: 'The detection model',
    when: 'Only after you agree to it, on People, Wildlife or Settings, Models; again if the browser’s storage is cleared.',
    sees: 'Google’s storage (storage.googleapis.com) sees your IP address when the browser downloads the model.',
    stop: 'Do not agree to the download. Motion and sound, and Lost & Found, need no model.',
  },
  {
    name: 'A spoken alert',
    when: 'Each time People or Wildlife speaks an alert.',
    sees: 'People and Wildlife speak their alerts through one of the browser’s voices. Some voices are an online service run by the browser’s maker, which receives the words to speak. In Chrome, the voices named Google are.',
    stop: 'On People, turn off Voice Warnings. On Wildlife, choose Sound or Silent under Alert Mode.',
  },
  {
    name: 'A server you connect',
    when: 'Only after you save the address of a server you run and choose a processing mode that uses it.',
    sees: 'The monitor sends camera frames, with their motion and sound readings, to that server, and whoever runs it can see them. With a cloud AI key set, the server sends a frame to that provider when Ollama is down or its analysis fails.',
    stop: 'Choose Local instant under Processing Mode on Settings, Models, or clear the server address.',
  },
];

export function DeviceConnections() {
  return (
    <div
      role="region"
      aria-label="What leaves this device"
      tabIndex={0}
      className="overflow-x-auto rounded-xl border border-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
    >
      <table className="w-full min-w-[40rem] text-left text-sm text-slate-300">
        <caption className="sr-only">What leaves this device</caption>
        <thead className="bg-slate-800/60 text-white">
          <tr>
            <th scope="col" className="p-3 font-semibold">Connection</th>
            <th scope="col" className="p-3 font-semibold">When</th>
            <th scope="col" className="p-3 font-semibold">Who sees what</th>
            <th scope="col" className="p-3 font-semibold">How to stop it</th>
          </tr>
        </thead>
        <tbody>
          {CONNECTIONS.map((connection) => (
            <tr key={connection.name} className="border-t border-white/10 align-top">
              <th scope="row" className="p-3 font-semibold text-white">{connection.name}</th>
              <td className="p-3">{connection.when}</td>
              <td className="p-3">{connection.sees}</td>
              <td className="p-3">{connection.stop}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DeviceConnections;
