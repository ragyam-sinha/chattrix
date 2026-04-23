import api from '../lib/api';

// Auth
export const loginWithGoogle = (credential) =>
  api.post('/auth/google', { credential }).then((r) => r.data);

// Users
export const fetchMe = () => api.get('/users/me').then((r) => r.data);
export const updateMe = (data) => api.patch('/users/me', data).then((r) => r.data);
export const searchUser = (q) => api.get(`/users/search?q=${encodeURIComponent(q)}`).then((r) => r.data);
export const fetchUser = (userId) => api.get(`/users/${userId}`).then((r) => r.data);

// Connections
export const sendConnectionRequest = (recipientId) =>
  api.post('/connections/request', { recipientId }).then((r) => r.data);
export const fetchIncomingRequests = () => api.get('/connections/incoming').then((r) => r.data);
export const fetchOutgoingRequests = () => api.get('/connections/outgoing').then((r) => r.data);
export const fetchContacts = () => api.get('/connections').then((r) => r.data);
export const acceptConnection = (id) => api.patch(`/connections/${id}/accept`).then((r) => r.data);
export const rejectConnection = (id) => api.patch(`/connections/${id}/reject`).then((r) => r.data);
export const cancelConnection = (id) => api.patch(`/connections/${id}/cancel`).then((r) => r.data);

// Chats
export const fetchChats = () => api.get('/chats').then((r) => r.data);
export const fetchConversation = (id) => api.get(`/chats/${id}`).then((r) => r.data);
export const openChat = (connectionId) =>
  api.post('/chats/open', { connectionId }).then((r) => r.data);
export const fetchMessages = (conversationId, after) => {
  const params = new URLSearchParams({ limit: '30' });
  if (after) params.set('after', after);
  return api.get(`/chats/${conversationId}/messages?${params}`).then((r) => r.data);
};
export const sendMessage = (conversationId, text) =>
  api.post(`/chats/${conversationId}/messages`, { text }).then((r) => r.data);
export const markAsRead = (conversationId) =>
  api.patch(`/chats/${conversationId}/read`).then((r) => r.data);

// Notifications
export const fetchNotifications = () => api.get('/notifications').then((r) => r.data);
