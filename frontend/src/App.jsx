import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001');

const FloatingIcons = () => {
  const icons = ['💬', '🌐', '✨', '⚡', '🎵', '🎮', '🔥', '🚀', '🌟', '💡'];
  const [elements, setElements] = useState([]);

  useEffect(() => {
    const iconElements = Array.from({ length: 15 }).map((_, i) => ({
      id: i,
      icon: icons[Math.floor(Math.random() * icons.length)],
      left: `${Math.random() * 100}%`,
      animationDuration: `${15 + Math.random() * 20}s`,
      animationDelay: `${Math.random() * 10}s`,
      fontSize: `${20 + Math.random() * 30}px`,
    }));
    setElements(iconElements);
  }, []);

  return (
    <>
      {elements.map((el) => (
        <div
          key={el.id}
          className="floating-icon"
          style={{
            left: el.left,
            animationDuration: el.animationDuration,
            animationDelay: el.animationDelay,
            fontSize: el.fontSize,
          }}
        >
          {el.icon}
        </div>
      ))}
    </>
  );
};

function App() {
  // App Phase State
  const [hasStarted, setHasStarted] = useState(false);

  // User Profile State
  const [profile, setProfile] = useState({
    name: '',
    location: '',
    age: '',
    topic: '',
    gender: 'Male',
  });
  const [agreeToRules, setAgreeToRules] = useState(false);

  // Chat State
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLooking, setIsLooking] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  // We could potentially store stranger's profile info if the backend passed it,
  // but for now we'll mock it or just use "Stranger".
  const [strangerProfile, setStrangerProfile] = useState({
    name: 'Stranger',
    location: 'Unknown',
    age: '?',
    gender: '?',
  });

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    socket.on('waiting', (data) => {
      setIsLooking(true);
      setIsConnected(false);
      setMessages([{ text: data.message, isSystem: true }]);
    });

    socket.on('chat_start', (data) => {
      setIsLooking(false);
      setIsConnected(true);
      setMessages([{ text: data.message, isSystem: true }]);
      // In a real implementation, 'data' from backend would contain stranger's profile.
      setStrangerProfile({
        name: 'Stranger',
        location: 'Unknown',
        age: '?',
        gender: '?',
      });
      setTimeout(() => inputRef.current?.focus(), 100);
    });

    socket.on('chat_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
      setIsTyping(false);
    });

    socket.on('typing', () => {
      setIsTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 2000);
    });

    socket.on('stranger_disconnected', (data) => {
      setIsConnected(false);
      setMessages((prev) => [...prev, { text: data.message, isSystem: true }]);
    });

    return () => {
      socket.off('waiting');
      socket.off('chat_start');
      socket.off('chat_message');
      socket.off('typing');
      socket.off('stranger_disconnected');
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages, isTyping]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (hasStarted && e.key === 'Escape') {
        handleStop();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasStarted, isConnected, isLooking]);

  const handleStartChat = () => {
    setHasStarted(true);
    socket.emit('start_chat');
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (inputValue.trim() && isConnected && !isLooking) {
      const msgData = {
        text: inputValue,
        senderId: socket.id,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, msgData]);
      socket.emit('chat_message', msgData);
      setInputValue('');
      inputRef.current?.focus();
    }
  };

  const handleTyping = (e) => {
    setInputValue(e.target.value);
    if (isConnected && !isLooking) {
      socket.emit('typing');
    }
  };

  const handleNext = () => {
    if (isConnected || isLooking) {
      socket.emit('stop_chat');
    }
    setMessages([]);
    setIsConnected(false);
    setIsLooking(true);
    socket.emit('start_chat');
  };

  const handleStop = () => {
    socket.emit('stop_chat');
    setIsConnected(false);
    setIsLooking(false);
    setHasStarted(false); // Go back to landing page
    setMessages([]);
  };

  // ---------------------------------------------------------------------------
  // RENDER: Landing Page
  // ---------------------------------------------------------------------------
  if (!hasStarted) {
    return (
      <div className="tws-app">
        <FloatingIcons />
        <div className="landing-page">
          <div className="lumi-title-container">
            <div className="logo-wrapper">
              <img src="/logo.png" alt="letstalk logo" className="logo-img-large" />
              <h1 className="lumi-logo">letstalk</h1>
            </div>
            <div className="lumi-subtitle">
              <span className="dot">•</span> RANDOM <span className="dot">•</span> ANONYMOUS <span className="dot">•</span> ZEN <span className="dot">•</span>
            </div>
          </div>

          <div className="entry-form-card">
            <div className="form-input-group">
              <input
                type="text"
                className="form-input"
                placeholder="Your Name"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              />
            </div>

            <div className="form-input-group">
              <input
                type="text"
                className="form-input"
                placeholder="Location"
                value={profile.location}
                onChange={(e) => setProfile({ ...profile, location: e.target.value })}
              />
            </div>

            <div className="form-row">
              <input
                type="text"
                className="form-input"
                placeholder="Age"
                value={profile.age}
                onChange={(e) => setProfile({ ...profile, age: e.target.value })}
              />
              <input
                type="text"
                className="form-input"
                placeholder="Topic"
                value={profile.topic}
                onChange={(e) => setProfile({ ...profile, topic: e.target.value })}
              />
            </div>

            <div className="gender-toggle">
              <button
                className={`gender-btn ${profile.gender === 'Male' ? 'active' : ''}`}
                onClick={() => setProfile({ ...profile, gender: 'Male' })}
              >
                Male
              </button>
              <button
                className={`gender-btn ${profile.gender === 'Female' ? 'active' : ''}`}
                onClick={() => setProfile({ ...profile, gender: 'Female' })}
              >
                Female
              </button>
            </div>

            <label className="agreements">
              <input
                type="checkbox"
                checked={agreeToRules}
                onChange={(e) => setAgreeToRules(e.target.checked)}
              />
              <span>Agree to Rules</span>
            </label>

            <button
              className="start-chat-btn"
              disabled={!agreeToRules}
              onClick={handleStartChat}
            >
              START CHAT
            </button>
          </div>

          <div className="community-section">
            <h3>Community Groups</h3>
            <button className="create-btn">+ Create</button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: Chat Interface
  // ---------------------------------------------------------------------------
  return (
    <div className="tws-app">
      <FloatingIcons />
      <div className="chat-container">
        {/* Header */}
        <header className="chat-header">
          <button className="exit-btn" onClick={handleStop} title="Exit (ESC)">
            ✕
          </button>
          <div className="header-logo-container">
            <img src="/logo.png" alt="letstalk logo" className="logo-img-small" />
            <div className="header-logo">letstalk</div>
          </div>
          <button className="next-btn" onClick={handleNext}>
            NEXT ⏭️
          </button>
        </header>

        {/* Profiles */}
        <div className="profiles-container">
          <div className="profile-card profile-stranger">
            <span className="profile-name">{isConnected ? strangerProfile.name : 'Waiting...'}</span>
            <span className="profile-details">
              {isConnected ? `${strangerProfile.age} | ${strangerProfile.gender} | ${strangerProfile.location}` : 'Looking for someone you can chat with...'}
            </span>
          </div>
          <div className="profile-card profile-you">
            <span className="profile-name">{profile.name || 'You'}</span>
            <span className="profile-details">
              {profile.age || '?'} | {profile.gender.charAt(0)} | {profile.location || 'Unknown'}
            </span>
          </div>
        </div>

        {/* Chat Log */}
        <div className="chat-log">
          {messages.map((msg, index) => {
            if (msg.isSystem) {
              return (
                <div key={index} className="system-message">
                  {msg.text}
                </div>
              );
            }

            const isOwn = msg.senderId === socket.id;
            return (
              <div key={index} className={`chat-message-wrapper ${isOwn ? 'own' : 'stranger'}`}>
                <div className="chat-message-bubble">
                  {msg.text}
                  {msg.timestamp && <span className="message-timestamp">{msg.timestamp}</span>}
                </div>
              </div>
            );
          })}

          {isTyping && (
            <div className="typing-indicator">
              {strangerProfile.name} is typing...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="chat-input-area">
          <form
            className="chat-input-pill"
            onSubmit={sendMessage}
          >
            <button type="button" className="attach-btn" title="Attach">
              📎
            </button>
            <input
              ref={inputRef}
              type="text"
              placeholder="Message..."
              value={inputValue}
              onChange={handleTyping}
              disabled={!isConnected || isLooking}
            />
            <button
              type="submit"
              className="send-btn"
              disabled={!inputValue.trim() || !isConnected || isLooking}
              title="Send (Enter)"
            >
              ➤
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;
