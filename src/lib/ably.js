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

  if (handlers.onNewMessage) {
    await channel.subscribe('new_message', (msg) => {
      handlers.onNewMessage(msg.data);
    });
  }

  if (handlers.onMessageDeleted) {
    await channel.subscribe('message_deleted', (msg) => {
      handlers.onMessageDeleted(msg.data);
    });
  }

  // Return cleanup function
  return () => {
    channel.unsubscribe();
    channel.detach();
  };
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
