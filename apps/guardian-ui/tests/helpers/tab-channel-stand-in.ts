/**
 * A BroadcastChannel for tests
 *
 * jsdom has no BroadcastChannel, so this stand-in carries the messages the
 * way a browser does: later than the post, to every other open channel of
 * the name and never to the sender. `otherTab()` opens one more channel of
 * the app's name, as another tab of the site would: it records what it hears
 * and can say something to every tab.
 */

const NAME = 'safeos';

class ChannelStandIn {
  static instances: ChannelStandIn[] = [];

  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(readonly name: string) {
    ChannelStandIn.instances.push(this);
  }

  postMessage(message: unknown): void {
    if (!ChannelStandIn.instances.includes(this)) throw new Error('This channel is closed.');
    const others = ChannelStandIn.instances.filter((one) => one !== this && one.name === this.name);
    void Promise.resolve().then(() => {
      others
        .filter((one) => ChannelStandIn.instances.includes(one))
        .forEach((one) => one.onmessage?.({ data: JSON.parse(JSON.stringify(message)) }));
    });
  }

  close(): void {
    ChannelStandIn.instances = ChannelStandIn.instances.filter((one) => one !== this);
  }
}

export interface OtherTab {
  /** Every message this tab has heard, in order. */
  heard: unknown[];
  /** Says a message to every other open channel of the name. */
  say: (message: unknown) => void;
  /** Closes this tab's channel, as a closed tab does. */
  close: () => void;
}

/**
 * Puts the stand-in on `globalThis` in place of BroadcastChannel, with no
 * channel open. `instances()` lists the open channels in the order they were
 * made.
 */
export function installTabChannel(): { otherTab: () => OtherTab; instances: () => BroadcastChannel[] } {
  ChannelStandIn.instances = [];
  Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, writable: true, value: ChannelStandIn });
  return {
    otherTab: () => {
      const channel = new ChannelStandIn(NAME);
      const heard: unknown[] = [];
      channel.onmessage = (event) => {
        heard.push(event.data);
      };
      return { heard, say: (message) => channel.postMessage(message), close: () => channel.close() };
    },
    instances: () => [...ChannelStandIn.instances] as unknown as BroadcastChannel[],
  };
}
