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
 * agreement (lib/detection-model.ts); the voice choice in lib/tts-alerts.ts
 * (findSpokenAlertVoice) and components/settings/SpokenAlertVoice.tsx, the
 * Voice Warnings switch in components/SecurityPanel.tsx and Wildlife's Alert
 * Mode in app/wildlife/page.tsx, and Lost & Found's spoken message in
 * lib/custom-media-player.ts with its Speak alert message switch in
 * components/LostFoundSetup.tsx; the monitor's frames in app/monitor/page.tsx
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
    when: 'Only after you choose an online voice under Spoken alert voice, on Settings, Alert sounds; then each time People, Wildlife or Lost & Found speaks an alert with it.',
    sees: 'People, Wildlife and Lost & Found speak their alerts with a voice on this device. An online voice is a service run by the browser’s maker, which receives the words to speak. Alert sounds names each online voice with “(online)”.',
    stop: 'Choose Use a voice on this device under Spoken alert voice. To stop spoken alerts as well: on People, turn off Voice Warnings; on Wildlife, choose Sound or Silent under Alert Mode; on Lost & Found, turn off Speak alert message under Image Flash Overlay.',
  },
  {
    name: 'A server you connect',
    when: 'Only after you save the address of a server you run and choose a processing mode that uses it.',
    sees: 'The monitor sends camera frames, with their motion and sound readings, to that server, and whoever runs it can see them. With a cloud AI key set, the server sends a frame to that provider when Ollama is down or its analysis fails.',
    stop: 'Choose Local instant under Processing Mode on Settings, Models, or clear the server address.',
  },
];

/** The column names a phone shows inside each connection, where the header row is out of sight. */
const PARTS = ['When', 'Who sees what', 'How to stop it'] as const;

export function DeviceConnections() {
  return (
    <div
      role="region"
      aria-label="What leaves this device"
      tabIndex={0}
      className="overflow-x-auto rounded-xl border border-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
    >
      {/*
        From 640 px: fixed columns, and no break inside a word, so the first
        column keeps its names whole. On a phone each connection stands as one
        block, its parts one under another, each with its column's name; the
        header row stays for a screen reader. The roles are written out, so
        the table stays a table to a screen reader whatever the display.
      */}
      <table
        role="table"
        className="block w-full text-left text-sm text-slate-300 sm:table sm:min-w-[44rem] sm:table-fixed [overflow-wrap:normal] [word-break:normal]"
      >
        <caption className="sr-only">What leaves this device</caption>
        <colgroup className="hidden sm:table-column-group">
          <col className="w-36" />
          <col className="w-[22%]" />
          <col className="w-[36%]" />
          <col />
        </colgroup>
        <thead role="rowgroup" className="sr-only bg-slate-800/60 text-white sm:not-sr-only sm:table-header-group">
          <tr role="row">
            <th role="columnheader" scope="col" className="p-3 font-semibold">Connection</th>
            {PARTS.map((part) => (
              <th key={part} role="columnheader" scope="col" className="p-3 font-semibold">{part}</th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup" className="block sm:table-row-group">
          {CONNECTIONS.map((connection) => (
            <tr
              key={connection.name}
              role="row"
              className="block border-t border-white/10 py-2 align-top first:border-t-0 sm:table-row sm:py-0 sm:first:border-t"
            >
              <th role="rowheader" scope="row" className="block px-3 py-1 font-semibold text-white sm:table-cell sm:p-3">
                {connection.name}
              </th>
              {[connection.when, connection.sees, connection.stop].map((words, index) => (
                <td key={PARTS[index]} role="cell" className="block px-3 py-1 sm:table-cell sm:p-3">
                  <span aria-hidden="true" className="block font-semibold text-slate-400 sm:hidden">
                    {PARTS[index]}
                  </span>
                  {words}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DeviceConnections;
