import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { X, Send, Image as ImageIcon, Users, Clock, Mic, Square } from 'lucide-react';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const socket = io(backendUrl);

function App() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  
  // App States
  const [appState, setAppState] = useState('naming'); // 'naming' | 'chatting'
  const [myName, setMyName] = useState('');
  const [myGender, setMyGender] = useState('male');
  const [strangerName, setStrangerName] = useState('Stranger');

  // Chat States
  const [isLooking, setIsLooking] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [stopState, setStopState] = useState('idle'); // 'idle' | 'confirming' | 'stopped'
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  // Sidebar States
  const [onlineCount, setOnlineCount] = useState(0);
  const [activeUsers, setActiveUsers] = useState([]);
  const [recentUsers, setRecentUsers] = useState([]);
  const [isDarkMode, setIsDarkMode] = useState(true); // default dark
  
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [isDarkMode]);

  useEffect(() => {
    socket.on('online_count', (count) => setOnlineCount(count));
    socket.on('user_lists_update', (data) => {
      setActiveUsers(data.activeUsers);
      setRecentUsers(data.recentUsers);
    });

    socket.on('waiting', (data) => {
      setIsLooking(true);
      setIsConnected(false);
      setMessages([{ text: data.message, isSystem: true }]);
    });

    socket.on('chat_start', (data) => {
      setIsLooking(false);
      setIsConnected(true);
      setStopState('idle'); 
      setStrangerName(data.strangerName || 'Stranger');
      setMessages([{ text: data.message, isSystem: true }]);
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
      setStopState('stopped'); 
      setStrangerName('Stranger');
      setMessages((prev) => [...prev, { text: data.message, isSystem: true }]);
    });

    return () => {
      socket.off('online_count');
      socket.off('user_lists_update');
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
      if (e.key === 'Escape' && appState === 'chatting') {
        handleStop(); 
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConnected, isLooking, stopState, appState]);

  const handleJoinChat = (e) => {
    e.preventDefault();
    if (myName.trim()) {
      socket.emit('set_name', myName.trim());
      setAppState('chatting');
      handleNext();
    }
  }

  const sendMessage = (e) => {
    e.preventDefault();
    if (inputValue.trim() && isConnected && !isLooking) {
      const msgData = {
        type: 'text',
        text: inputValue,
        senderId: socket.id,
        senderName: myName,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      
      
      // Removed: setMessages((prev) => [...prev, msgData]); (Server echo handles this now)
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

  // Image File Handling
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file && isConnected && !isLooking) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const msgData = {
          type: 'image',
          mediaData: event.target.result,
          senderId: socket.id,
          senderName: myName,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        // Removed: setMessages((prev) => [...prev, msgData]);
        socket.emit('chat_message', msgData);
      };
      reader.readAsDataURL(file);
    }
  };

  // Voice Recording Handling
  const handleToggleRecording = async () => {
    if (!isConnected || isLooking) return;

    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onload = (event) => {
            const msgData = {
              type: 'audio',
              mediaData: event.target.result,
              senderId: socket.id,
              senderName: myName,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            // Removed: setMessages((prev) => [...prev, msgData]);
            socket.emit('chat_message', msgData);
          };
          reader.readAsDataURL(audioBlob);
          
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Error accessing microphone:", err);
        alert("Could not access microphone.");
      }
    }
  };


  const handleNext = () => {
    if (isConnected || isLooking) {
      socket.emit('stop_chat');
    }
    setStopState('idle');
    setMessages([]);
    setIsConnected(false);
    setIsLooking(true);
    setStrangerName('Stranger');
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    }
    socket.emit('start_chat');
  };

  const handleStop = () => {
    if (isConnected) {
      if (stopState === 'idle') {
        setStopState('confirming'); 
      } else if (stopState === 'confirming') {
        socket.emit('stop_chat');
        setIsConnected(false);
        setIsLooking(false);
        setStopState('stopped'); 
        setMessages((prev) => [...prev, {text: "You have disconnected.", isSystem: true}]);
      }
    } else if (isLooking) {
      socket.emit('stop_chat');
      setIsConnected(false);
      setIsLooking(false);
      setStopState('stopped');
      setMessages((prev) => [...prev, {text: "You have disconnected.", isSystem: true}]);
    } else {
      handleNext();
    }
    
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    }
  };

  if (appState === 'naming') {
    return (
      <div className="tws-app">
        <div className="landing-page">
          <div className="lumi-title-container">
            <div className="logo-wrapper">
              <img src="/logo.png" alt="LetsTalk Logo" className="logo-img-large" />
              <h1 className="lumi-logo">LetsTalk</h1>
            </div>
            <div className="lumi-subtitle">
              INSTANT <span className="dot">●</span> CHAT
            </div>
          </div>

          <form className="entry-form-card" onSubmit={handleJoinChat}>
            <div className="form-input-group">
              <label style={{color: '#9ca3af', fontSize: '0.875rem'}}>Display Name</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Enter a username..." 
                value={myName}
                onChange={(e) => setMyName(e.target.value)}
                maxLength={20}
                autoFocus
              />
            </div>

            <div className="form-input-group">
              <label style={{color: '#9ca3af', fontSize: '0.875rem'}}>I am a</label>
              <div className="gender-toggle">
                <button 
                  type="button" 
                  className={`gender-btn ${myGender === 'ชาย' ? 'active' : ''}`}
                  onClick={() => setMyGender('ชาย')}
                >Male</button>
                <button 
                  type="button" 
                  className={`gender-btn ${myGender === 'หญิง' ? 'active' : ''}`}
                  onClick={() => setMyGender('หญิง')}
                >Female</button>
              </div>
            </div>

            <button type="submit" className="start-chat-btn" disabled={!myName.trim()}>
              Start Chatting
            </button>
            
            <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem', marginTop: '1rem' }}>
              <strong>{onlineCount}+</strong> users online right now
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="tws-app">
      <div className="chat-container">
        {/* Header */}
        <header className="chat-header">
          <div className="header-logo-container">
             <img src="/logo.png" alt="LetsTalk" className="logo-img-small" />
             <span className="header-logo">LetsTalk</span>
          </div>
          
          <div style={{display: 'flex', gap: '1rem', alignItems: 'center'}}>
            <span style={{color: '#9ca3af', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
               <Users size={16} /> {onlineCount} Online
            </span>
            <button className="exit-btn" onClick={() => {
                if (isConnected || isLooking) socket.emit('stop_chat');
                setAppState('naming');
              }}>
              <X size={24} />
            </button>
          </div>
        </header>

        {/* Profiles Area & Sidebar toggle */}
        <div style={{display: 'flex', flex: 1, overflow: 'hidden'}}>
          
          {/* Main Chat Area */}
          <div style={{flex: 3, display: 'flex', flexDirection: 'column'}}>
            <div className="profiles-container">
              <div className="profile-card profile-stranger">
                <span className="profile-name">
                  {isLooking ? 'Searching...' : strangerName}
                </span>
                <span className="profile-details">Stranger</span>
              </div>
              <div className="profile-card profile-you">
                <span className="profile-name">{myName}</span>
                <span className="profile-details">You</span>
                <button 
                  onClick={handleStop}
                  className="next-btn" 
                  style={{marginLeft: 'auto', marginTop: '-1.5rem', zIndex: 10}}
                >
                  {stopState === 'confirming' ? 'Really? (ESC)' : (!isConnected && !isLooking ? 'Next (ESC)' : 'Stop (ESC)')}
                </button>
              </div>
            </div>

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
                const displayName = isOwn ? 'You' : (msg.senderName || 'Stranger');
                
                return (
                  <div key={index} className={`chat-message-wrapper ${isOwn ? 'own' : 'stranger'}`}>
                    <div className="chat-message-bubble">
                      <div style={{fontWeight: 'bold', fontSize: '0.75rem', opacity: 0.7, marginBottom: '0.25rem'}}>
                        {displayName}
                      </div>
                      
                      {msg.type === 'image' && (
                        <img src={msg.mediaData} alt="Shared" className="chat-image" />
                      )}
                      {msg.type === 'audio' && (
                        <audio controls src={msg.mediaData} className="chat-audio" />
                      )}
                      {(msg.type === 'text' || !msg.type) && msg.text && (
                         <span>{msg.text}</span>
                      )}
                      
                      <span className="message-timestamp">{msg.timestamp}</span>
                    </div>
                  </div>
                );
              })}
              {isTyping && (
                <div className="typing-indicator">
                  {strangerName} is typing...
                </div>
              )}
              {isRecording && (
                <div className="typing-indicator" style={{color: '#ef4444'}}>
                  Recording voice message...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-area">
              <div className="chat-input-pill">
                <input 
                  type="file" 
                  accept="image/*" 
                  ref={fileInputRef} 
                  style={{ display: 'none' }} 
                  onChange={handleImageUpload}
                />
                <button type="button" className="attach-btn" onClick={triggerFileInput} disabled={!isConnected || isLooking}>
                  <ImageIcon size={20} />
                </button>
                <button 
                  type="button" 
                  className={`attach-btn ${isRecording ? 'recording' : ''}`} 
                  onClick={handleToggleRecording} 
                  disabled={!isConnected || isLooking}
                >
                  {isRecording ? <Square size={20} color="#ef4444" fill="#ef4444" /> : <Mic size={20} />}
                </button>
                
                <form onSubmit={sendMessage} style={{flex: 1, display: 'flex', alignItems: 'center'}}>
                  <input 
                    type="text" 
                    ref={inputRef}
                    value={inputValue}
                    onChange={handleTyping}
                    placeholder={isRecording ? "Recording..." : "Type a message..."}
                    disabled={!isConnected || isLooking || isRecording}
                    style={{flex: 1}}
                  />
                  <button type="submit" className="send-btn" disabled={!inputValue.trim() || !isConnected || isLooking || isRecording}>
                    <Send size={16} strokeWidth={2.5} />
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Right Sidebar Lists */}
          <div style={{
            flex: 1, 
            minWidth: '250px', 
            maxWidth: '300px', 
            borderLeft: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            flexDirection: 'column'
          }} className="sidebar-hide-mobile">
            
            <div style={{flex: 1, overflowY: 'auto', borderBottom: '1px solid rgba(255,255,255,0.1)'}}>
              <h3 style={{padding: '1rem', fontSize: '0.875rem', color: '#22d3ee', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
                <Users size={16}/> Active Users
              </h3>
              <ul style={{listStyle: 'none', padding: 0, margin: 0}}>
                {activeUsers.map((user, i) => (
                  <li key={i} style={{padding: '0.75rem 1rem', fontSize: '0.875rem', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
                    {user} {user === myName && <span style={{color: '#9ca3af', fontSize: '0.75rem'}}>(You)</span>}
                  </li>
                ))}
              </ul>
            </div>

            <div style={{flex: 1, overflowY: 'auto'}}>
              <h3 style={{padding: '1rem', fontSize: '0.875rem', color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
                <Clock size={16}/> Recent Joins
              </h3>
              <ul style={{listStyle: 'none', padding: 0, margin: 0}}>
                {recentUsers.map((user, i) => (
                  <li key={i} style={{padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
                    <span style={{fontSize: '0.875rem'}}>{user.name}</span>
                    <span style={{fontSize: '0.75rem', color: '#9ca3af'}}>
                      {user.joinedAt ? new Date(user.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}

export default App;
