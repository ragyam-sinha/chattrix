import Ably from 'ably';

// Server-side Ably REST client (uses full API key, never sent to browser)
let ablyClient = null;

export function getAbly() {
  if (!ablyClient) {
    if (!process.env.ABLY_API_KEY) {
      throw new Error('ABLY_API_KEY environment variable is not set');
    }
    ablyClient = new Ably.Rest(process.env.ABLY_API_KEY);
  }
  return ablyClient;
}

/**
 * Publish an event to a conversation channel.
 * Channel name: conversation:{conversationId}
 */
export async function publishToConversation(conversationId, eventName, data) {
  const ably = getAbly();
  const channel = ably.channels.get(`conversation:${conversationId}`);
  await channel.publish(eventName, data);
}
