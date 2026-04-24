import * as Ably from 'ably';
import api from './api';

let ablyClient = null;

/**
 * Get (or lazily create) the Ably Realtime client.
 * Uses token auth so the server's API key is never exposed to the browser.
 */
export async function getAblyClient() {
  if (ablyClient) return ablyClient;

  ablyClient = new Ably.Realtime({
    authCallback: async (tokenParams, callback) => {
      try {
        const { data } = await api.get('/realtime/token');
        callback(null, data.tokenRequest);
      } catch (err) {
        callback(err, null);
      }
    },
  });

  return ablyClient;
}

/**
 * Subscribe to a conversation channel.
 * Returns an unsubscribe function to call on cleanup.
 */
export async function subscribeToConversation(conversationId, handlers) {
  const client = await getAblyClient();
  const channel = client.channels.get(`conversation:${conversationId}`);
  const subscriptions = [];

  if (handlers.onNewMessage) {
    const listener = (msg) => {
      handlers.onNewMessage(msg.data);
    };
    subscriptions.push(['new_message', listener]);
    await channel.subscribe('new_message', listener);
  }

  if (handlers.onMessageDeleted) {
    const listener = (msg) => {
      handlers.onMessageDeleted(msg.data);
    };
    subscriptions.push(['message_deleted', listener]);
    await channel.subscribe('message_deleted', listener);
  }

  if (handlers.onVoiceSignal) {
    const listener = (msg) => {
      handlers.onVoiceSignal(msg.data);
    };
    subscriptions.push(['voice_signal', listener]);
    await channel.subscribe('voice_signal', listener);
  }

  // Return cleanup function
  return () => {
    subscriptions.forEach(([eventName, listener]) => {
      channel.unsubscribe(eventName, listener);
    });
  };
}

export async function publishConversationEvent(conversationId, eventName, payload) {
  const client = await getAblyClient();
  const channel = client.channels.get(`conversation:${conversationId}`);
  await channel.publish(eventName, payload);
}

/**
 * Destroy the Ably client (e.g. on logout)
 */
export function destroyAblyClient() {
  if (ablyClient) {
    ablyClient.close();
    ablyClient = null;
  }
}
