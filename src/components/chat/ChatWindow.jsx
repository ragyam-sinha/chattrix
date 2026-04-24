import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchConversation,
  fetchMessages,
  sendMessage,
  markAsRead,
  deleteMessage,
  forwardMessage,
  fetchChats,
} from '../../services/api';
import useAuthStore from '../../store/useAuthStore';
import Avatar from '../common/Avatar';
import EmojiPicker from 'emoji-picker-react';
import { Smile, Trash2, Phone, PhoneOff, Mic, MicOff, MoreVertical } from 'lucide-react';
import { subscribeToConversation, publishConversationEvent } from '../../lib/ably';

function formatMessageTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function isRenderableMessage(message) {
  return !!message && (!message.type || ['text', 'forward'].includes(message.type));
}

function getMessageAuthorLabel(message, currentUserId) {
  const senderId = message?.senderId?._id || message?.senderId;
  if (senderId === currentUserId) return 'You';
  return message?.senderId?.displayName || message?.senderId?.chatrixId || 'Message';
}

function getQuotedMessageText(message) {
  if (!message) return '';
  if (message.isDeleted) return 'This message was deleted';
  const normalized = typeof message.text === 'string' ? message.text.trim() : '';
  return normalized || 'Message';
}

export default function ChatWindow() {
  const { conversationId } = useParams();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [callState, setCallState] = useState('idle');
  const [incomingOffer, setIncomingOffer] = useState(null);
  const [showCallModal, setShowCallModal] = useState(false);
  const [callError, setCallError] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [activeMessageMenuId, setActiveMessageMenuId] = useState(null);
  const [showChatOptions, setShowChatOptions] = useState(false);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardingMessageId, setForwardingMessageId] = useState(null);
  const [forwardTargets, setForwardTargets] = useState([]);
  const [isForwarding, setIsForwarding] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [currentCallId, setCurrentCallId] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const composerInputRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());

  const resetCall = useCallback(() => {
    peerConnectionsRef.current.forEach((peerConnection) => {
      peerConnection.onicecandidate = null;
      peerConnection.ontrack = null;
      peerConnection.close();
    });
    peerConnectionsRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    setIncomingOffer(null);
    setCallState('idle');
    setIsMuted(false);
    setShowCallModal(false);
    setCurrentCallId(null);
    setRemoteStreams({});
  }, []);

  const ensureMediaStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;
    return stream;
  }, []);

  const createPeer = async (targetUserId, callId) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    peerConnectionsRef.current.set(targetUserId, peerConnection);
    const stream = await ensureMediaStream();

    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream);
    });

    peerConnection.ontrack = (event) => {
      setRemoteStreams((prev) => ({ ...prev, [targetUserId]: event.streams[0] }));
    };

    peerConnection.onicecandidate = async (event) => {
      if (!event.candidate) return;
      await publishConversationEvent(conversationId, 'voice_signal', {
        type: 'ice-candidate',
        callId: callId || currentCallId,
        fromUserId: user._id,
        targetUserId,
        candidate: event.candidate,
      });
    };

    return peerConnection;
  };

  const { data: convData } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => fetchConversation(conversationId),
    enabled: !!conversationId,
  });

  const { data: msgData, isLoading: msgLoading } = useQuery({
    queryKey: ['chat', conversationId, 'messages'],
    queryFn: () => fetchMessages(conversationId),
    enabled: !!conversationId,
    refetchInterval: false,
    staleTime: Infinity,
  });

  const { data: chatsData } = useQuery({
    queryKey: ['chats'],
    queryFn: fetchChats,
    refetchInterval: false,
  });

  useEffect(() => {
    if (!conversationId) return;

    let active = true;
    let unsubscribe = () => {};

    subscribeToConversation(conversationId, {
      onNewMessage: ({ message }) => {
        if (!isRenderableMessage(message)) {
          queryClient.invalidateQueries({ queryKey: ['chats'] });
          return;
        }

        queryClient.setQueryData(['chat', conversationId, 'messages'], (old) => {
          if (!old) return old;
          const exists = old.messages.some((existingMessage) => existingMessage._id === message._id);
          if (exists) return old;
          return { ...old, messages: [...old.messages, message] };
        });

        const senderId = message?.senderId?._id || message?.senderId;
        queryClient.invalidateQueries({ queryKey: ['chats'] });
        if (senderId !== user?._id) {
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
        }
      },
      onMessageDeleted: ({ messageId }) => {
        queryClient.setQueryData(['chat', conversationId, 'messages'], (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((message) =>
              message._id === messageId
                ? { ...message, isDeleted: true, text: 'This message was deleted' }
                : message.replyToMessageId?._id === messageId
                  ? {
                      ...message,
                      replyToMessageId: {
                        ...message.replyToMessageId,
                        isDeleted: true,
                        text: 'This message was deleted',
                      },
                    }
                  : message
            ),
          };
        });
        queryClient.invalidateQueries({ queryKey: ['chats'] });
      },
      onVoiceSignal: async (signal) => {
        if (!signal || signal.targetUserId !== user._id) return;

        if (signal.type === 'voice-offer') {
          setIncomingOffer(signal);
          setCallState('ringing');
          setShowCallModal(true);
          setCurrentCallId(signal.callId || null);
          return;
        }

        if (signal.type === 'voice-answer') {
          const peerConnection = peerConnectionsRef.current.get(signal.fromUserId);
          if (!peerConnection) return;
          await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.answer));
          setCallState('connected');
          setShowCallModal(true);
          return;
        }

        if (signal.type === 'ice-candidate' && signal.candidate) {
          const peerConnection = peerConnectionsRef.current.get(signal.fromUserId);
          if (!peerConnection) return;
          await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
          return;
        }

        if (signal.type === 'voice-end') {
          const peerConnection = peerConnectionsRef.current.get(signal.fromUserId);
          if (peerConnection) {
            peerConnection.close();
            peerConnectionsRef.current.delete(signal.fromUserId);
          }
          setRemoteStreams((prev) => {
            const next = { ...prev };
            delete next[signal.fromUserId];
            return next;
          });
          if (peerConnectionsRef.current.size === 0) {
            resetCall();
          }
        }
      },
    }).then((cleanup) => {
      if (!cleanup) return;
      if (!active) {
        cleanup();
        return;
      }
      unsubscribe = cleanup;
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [conversationId, queryClient, resetCall, user?._id]);

  useEffect(() => () => resetCall(), [resetCall]);

  useEffect(() => {
    setReplyingTo(null);
    setActiveMessageMenuId(null);
    setShowForwardModal(false);
    setForwardTargets([]);
    setForwardingMessageId(null);
  }, [conversationId]);

  const conversation = convData?.conversation;
  const messages = (msgData?.messages || []).filter(isRenderableMessage);
  const forwardingMessage = messages.find((message) => message._id === forwardingMessageId) || null;
  const isGroup = conversation?.type === 'group';
  const other = conversation?.participants?.find((participant) => participant._id !== user._id);
  const isRequester = conversation?.connectionId?.requesterId === user._id;
  const customName = isRequester
    ? conversation?.connectionId?.recipientCustomName
    : conversation?.connectionId?.requesterCustomName;
  const displayName = isGroup
    ? conversation?.groupName || 'Group Chat'
    : customName || other?.displayName || other?.chatrixId || 'Loading...';
  const headerSubtitle = isGroup
    ? `${conversation?.participants?.length || 0} members`
    : other?.chatrixId;

  useEffect(() => {
    if (conversationId && messages.length > 0) {
      markAsRead(conversationId).then(() => {
        queryClient.invalidateQueries({ queryKey: ['chats'] });
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      });
    }
  }, [conversationId, messages.length, queryClient]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async (event) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const replyTarget = replyingTo;

    setSending(true);
    setText('');
    setShowEmoji(false);
    setReplyingTo(null);
    try {
      await sendMessage(conversationId, {
        text: trimmed,
        replyToMessageId: replyTarget?._id || null,
      });
      queryClient.invalidateQueries({ queryKey: ['chat', conversationId, 'messages'] });
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    } catch (err) {
      setText(trimmed);
      setReplyingTo(replyTarget);
      console.error('Send error:', err);
    } finally {
      setSending(false);
    }
  };

  const onEmojiClick = (emojiObject) => {
    setText((prev) => prev + emojiObject.emoji);
  };

  const handleDeleteMessage = async (messageId) => {
    if (window.confirm('Delete this message for everyone?')) {
      try {
        await deleteMessage(messageId);
        queryClient.invalidateQueries({ queryKey: ['chat', conversationId, 'messages'] });
        queryClient.invalidateQueries({ queryKey: ['chats'] });
      } catch (err) {
        console.error('Failed to delete message:', err);
      }
    }
  };

  const startVoiceCall = async () => {
    const targets = (conversation?.participants || [])
      .filter((participant) => participant._id !== user._id)
      .map((participant) => participant._id);
    if (targets.length === 0) return;
    setCallError('');
    setCallState('dialing');
    setShowCallModal(true);
    const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setCurrentCallId(callId);
    try {
      for (const targetId of targets) {
        const peerConnection = await createPeer(targetId, callId);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        await publishConversationEvent(conversationId, 'voice_signal', {
          type: 'voice-offer',
          callId,
          fromUserId: user._id,
          targetUserId: targetId,
          offer,
        });
      }
    } catch (err) {
      console.error('Voice call start failed', err);
      setCallError('Microphone access failed. Please allow microphone permission.');
      resetCall();
    }
  };

  const acceptIncomingCall = async () => {
    if (!incomingOffer || !incomingOffer.fromUserId) return;
    setCallError('');
    try {
      const peerConnection = await createPeer(incomingOffer.fromUserId, incomingOffer.callId);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingOffer.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      await publishConversationEvent(conversationId, 'voice_signal', {
        type: 'voice-answer',
        callId: incomingOffer.callId || currentCallId,
        fromUserId: user._id,
        targetUserId: incomingOffer.fromUserId,
        answer,
      });
      setIncomingOffer(null);
      setCallState('connected');
      setShowCallModal(true);
    } catch (err) {
      console.error('Accept call failed', err);
      setCallError('Unable to connect voice call.');
      resetCall();
    }
  };

  const declineIncomingCall = async () => {
    if (incomingOffer?.fromUserId) {
      await publishConversationEvent(conversationId, 'voice_signal', {
        type: 'voice-end',
        callId: incomingOffer.callId || currentCallId,
        fromUserId: user._id,
        targetUserId: incomingOffer.fromUserId,
      });
    }
    resetCall();
  };

  const endVoiceCall = async () => {
    const targets = (conversation?.participants || [])
      .filter((participant) => participant._id !== user._id)
      .map((participant) => participant._id);
    for (const targetId of targets) {
      await publishConversationEvent(conversationId, 'voice_signal', {
        type: 'voice-end',
        callId: currentCallId,
        fromUserId: user._id,
        targetUserId: targetId,
      });
    }
    resetCall();
  };

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !isMuted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setIsMuted(next);
  };

  const openForwardModal = (messageId) => {
    setForwardingMessageId(messageId);
    setForwardTargets([]);
    setShowForwardModal(true);
  };

  const startReply = (message) => {
    setReplyingTo(message);
    setShowEmoji(false);
    setActiveMessageMenuId(null);
    composerInputRef.current?.focus();
  };

  const toggleForwardTarget = (chatId) => {
    setForwardTargets((prev) =>
      prev.includes(chatId) ? prev.filter((id) => id !== chatId) : [...prev, chatId]
    );
  };

  const handleForwardSubmit = async () => {
    if (!forwardingMessageId || forwardTargets.length === 0 || isForwarding) return;
    setIsForwarding(true);
    try {
      await forwardMessage(forwardingMessageId, forwardTargets);
      setShowForwardModal(false);
      setForwardTargets([]);
      setForwardingMessageId(null);
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      queryClient.invalidateQueries({ queryKey: ['chat', conversationId, 'messages'] });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to forward message');
    } finally {
      setIsForwarding(false);
    }
  };

  if (!conversation && !msgLoading) {
    return (
      <div className="empty-state" style={{ height: '100%' }}>
        <h3>Conversation not found</h3>
        <p>This conversation may not exist or you do not have access.</p>
      </div>
    );
  }

  let lastDate = null;

  return (
    <div className="chat-window" onClick={() => setShowChatOptions(false)}>
      <div className="chat-header">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => navigate('/app')}
          style={{ display: 'none' }}
          id="chat-back-btn"
        >
          Back
        </button>
        <Avatar src={isGroup ? '' : other?.avatar} name={displayName} />
        <div className="chat-header-info">
          <h3>{displayName}</h3>
          <p>{headerSubtitle}</p>
        </div>
        <div className="chat-header-actions">
          <button
            className="btn btn-secondary"
            onClick={callState === 'connected' ? () => setShowCallModal(true) : startVoiceCall}
            disabled={callState === 'dialing' || callState === 'ringing'}
            title="Voice call"
          >
            <Phone size={16} />
            {callState === 'connected'
              ? 'In Call'
              : callState === 'dialing'
                ? 'Calling...'
                : 'Voice Call'}
          </button>
          <button
            className="btn btn-ghost"
            onClick={(event) => {
              event.stopPropagation();
              setShowChatOptions((prev) => !prev);
            }}
            title="Chat options"
          >
            <MoreVertical size={18} />
          </button>
          {showChatOptions && (
            <div className="chat-options-menu" onClick={(event) => event.stopPropagation()}>
              <button type="button" onClick={() => alert('Profile view will be added in detail panel soon.')}>
                View profile
              </button>
              <button type="button" onClick={() => alert('Search in chat option coming soon.')}>
                Search
              </button>
              <button type="button" onClick={() => alert('Mute notifications option coming soon.')}>
                Mute notifications
              </button>
              <button type="button" onClick={() => alert('Clear chat option coming soon.')}>
                Clear chat
              </button>
              <button type="button" className="danger" onClick={() => alert('Block user option coming soon.')}>
                Block
              </button>
            </div>
          )}
        </div>
      </div>

      {callError && <div className="voice-call-error">{callError}</div>}

      <div
        className="chat-messages"
        ref={messagesContainerRef}
        onClick={() => setActiveMessageMenuId(null)}
      >
        {msgLoading ? (
          <div className="loading-center">
            <div className="spinner" />
          </div>
        ) : messages.length === 0 ? (
          <div className="empty-state">
            <p>No messages yet. Say hello!</p>
          </div>
        ) : (
          messages.map((message) => {
            const isMine = message.senderId?._id === user._id || message.senderId === user._id;
            const messageDate = formatDateLabel(message.createdAt);
            let showDate = false;
            if (messageDate !== lastDate) {
              showDate = true;
              lastDate = messageDate;
            }

            return (
              <div key={message._id} style={{ display: 'flex', flexDirection: 'column' }}>
                {showDate && <div className="date-separator">{messageDate}</div>}
                <div
                  className={`message-bubble ${isMine ? 'sent' : 'received'} ${
                    message.isDeleted ? 'deleted' : ''
                  }`}
                  style={{ position: 'relative' }}
                >
                  {message.type === 'forward' && (
                    <div className="message-forwarded-label">
                      {message.forwardedFromName
                        ? `Forwarded from ${message.forwardedFromName}`
                        : 'Forwarded message'}
                    </div>
                  )}
                  {message.replyToMessageId && (
                    <div className="message-reply-preview">
                      <div className="message-reply-author">
                        {getMessageAuthorLabel(message.replyToMessageId, user._id)}
                      </div>
                      <div className="message-reply-text">
                        {getQuotedMessageText(message.replyToMessageId)}
                      </div>
                    </div>
                  )}
                  <div className="message-content">{message.text}</div>
                  <div className="message-time">
                    {formatMessageTime(message.createdAt)}
                    {isMine && !message.isDeleted && message.readAt && ' Read'}
                  </div>
                  {!message.isDeleted && (
                    <>
                      <button
                        type="button"
                        className="message-menu-trigger"
                        onClick={(event) => {
                          event.stopPropagation();
                          setActiveMessageMenuId((prev) =>
                            prev === message._id ? null : message._id
                          );
                        }}
                        title="Message options"
                      >
                        ...
                      </button>
                      {activeMessageMenuId === message._id && (
                        <div className="message-menu" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(message.text || '');
                              setActiveMessageMenuId(null);
                            }}
                          >
                            Copy
                          </button>
                          <button type="button" onClick={() => startReply(message)}>
                            Reply
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              openForwardModal(message._id);
                              setActiveMessageMenuId(null);
                            }}
                          >
                            Forward
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              alert(
                                `Sent: ${new Date(message.createdAt).toLocaleString()}${
                                  message.readAt
                                    ? `\nRead: ${new Date(message.readAt).toLocaleString()}`
                                    : '\nNot read yet'
                                }`
                              );
                              setActiveMessageMenuId(null);
                            }}
                          >
                            Message info
                          </button>
                          {isMine && (
                            <button
                              type="button"
                              className="danger"
                              onClick={() => {
                                handleDeleteMessage(message._id);
                                setActiveMessageMenuId(null);
                              }}
                            >
                              <Trash2 size={13} />
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ position: 'relative' }}>
        {showEmoji && (
          <div style={{ position: 'absolute', bottom: '100%', right: 0, zIndex: 10 }}>
            <EmojiPicker onEmojiClick={onEmojiClick} theme="auto" />
          </div>
        )}
        <div className="chat-composer-stack">
          {replyingTo && (
            <div className="composer-reply-banner">
              <div className="composer-reply-banner-content">
                <div className="composer-reply-banner-label">
                  Replying to {getMessageAuthorLabel(replyingTo, user._id)}
                </div>
                <div className="composer-reply-banner-text">
                  {getQuotedMessageText(replyingTo)}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setReplyingTo(null)}
              >
                Cancel
              </button>
            </div>
          )}
          <form
            className="chat-composer"
            onSubmit={handleSend}
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowEmoji(!showEmoji)}
              style={{ padding: '8px' }}
            >
              <Smile size={20} />
            </button>
            <input
              ref={composerInputRef}
              className="input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={replyingTo ? 'Type your reply...' : 'Type a message...'}
              maxLength={4000}
              disabled={sending}
            />
            <button className="btn btn-primary" type="submit" disabled={!text.trim() || sending}>
              Send
            </button>
          </form>
        </div>
      </div>

      {showCallModal && (
        <div className="call-modal-backdrop">
          <div className="call-modal">
            {other && <Avatar src={other.avatar} name={displayName} size="lg" />}
            <h3>{displayName}</h3>
            <p>
              {callState === 'dialing' && 'Calling...'}
              {callState === 'ringing' && 'Incoming voice call'}
              {callState === 'connected' && (isMuted ? 'Connected - Muted' : 'Connected')}
            </p>
            <div className="call-modal-actions">
              {callState === 'ringing' && (
                <>
                  <button className="btn btn-success" onClick={acceptIncomingCall}>
                    Accept
                  </button>
                  <button className="btn btn-danger" onClick={declineIncomingCall}>
                    Decline
                  </button>
                </>
              )}
              {callState === 'dialing' && (
                <button className="btn btn-danger" onClick={endVoiceCall}>
                  <PhoneOff size={16} />
                  Cancel
                </button>
              )}
              {callState === 'connected' && (
                <>
                  <button className="btn btn-secondary" onClick={toggleMute}>
                    {isMuted ? <Mic size={16} /> : <MicOff size={16} />}
                    {isMuted ? 'Unmute' : 'Mute'}
                  </button>
                  <button className="btn btn-danger" onClick={endVoiceCall}>
                    <PhoneOff size={16} />
                    End
                  </button>
                </>
              )}
            </div>
            {!!Object.keys(remoteStreams).length && (
              <p style={{ marginTop: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
                Connected participants: {Object.keys(remoteStreams).length}
              </p>
            )}
          </div>
        </div>
      )}

      {showForwardModal && (
        <div className="call-modal-backdrop" onClick={() => setShowForwardModal(false)}>
          <div className="call-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Forward Message</h3>
            <p>Select chats to forward this message.</p>
            {forwardingMessage && (
              <div
                className="message-reply-preview"
                style={{ marginTop: '12px', textAlign: 'left' }}
              >
                <div className="message-reply-author">
                  {forwardingMessage.type === 'forward'
                    ? forwardingMessage.forwardedFromName
                      ? `Forwarded from ${forwardingMessage.forwardedFromName}`
                      : 'Forwarded message'
                    : getMessageAuthorLabel(forwardingMessage, user._id)}
                </div>
                <div className="message-reply-text">
                  {getQuotedMessageText(forwardingMessage)}
                </div>
              </div>
            )}
            <div
              style={{
                marginTop: '12px',
                maxHeight: '260px',
                overflowY: 'auto',
                border: '1px solid var(--border-soft)',
                borderRadius: '10px',
              }}
            >
              {(chatsData?.conversations || [])
                .filter((conversationOption) => conversationOption._id !== conversationId)
                .map((conversationOption) => {
                  const conversationName =
                    conversationOption.type === 'group'
                      ? conversationOption.groupName || 'Group Chat'
                      : conversationOption.participants?.find(
                            (participant) => participant._id !== user._id
                          )?.displayName ||
                        conversationOption.participants?.find(
                          (participant) => participant._id !== user._id
                        )?.chatrixId ||
                        'Chat';

                  return (
                    <label
                      key={conversationOption._id}
                      style={{
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'center',
                        padding: '9px 10px',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={forwardTargets.includes(conversationOption._id)}
                        onChange={() => toggleForwardTarget(conversationOption._id)}
                      />
                      <span style={{ fontSize: '12px' }}>{conversationName}</span>
                    </label>
                  );
                })}
            </div>
            <div className="call-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowForwardModal(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleForwardSubmit}
                disabled={forwardTargets.length === 0 || isForwarding}
              >
                {isForwarding ? 'Forwarding...' : `Forward (${forwardTargets.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          #chat-back-btn { display: inline-flex !important; }
        }
      `}</style>
      {Object.entries(remoteStreams).map(([userId, stream]) => (
        <audio
          key={userId}
          autoPlay
          ref={(element) => {
            if (element && element.srcObject !== stream) {
              element.srcObject = stream;
              element.play().catch(() => {});
            }
          }}
        />
      ))}
    </div>
  );
}
