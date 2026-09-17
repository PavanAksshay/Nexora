import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  X, 
  ArrowRight, 
  Bot, 
  User as UserIcon, 
  Mic, 
  Square, 
  Radio, 
  Loader2 
} from 'lucide-react';
import { toast } from 'sonner';
function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div>
      {lines.map((line, idx) => {
        if (line.startsWith('# ')) return <h3 key={idx} style={{ fontSize: '15px', margin: '4px 0' }}>{line.slice(2)}</h3>;
        if (line.startsWith('## ')) return <h4 key={idx} style={{ fontSize: '14px', margin: '4px 0' }}>{line.slice(3)}</h4>;
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={idx} style={{ marginLeft: '16px' }}>{line.slice(2)}</li>;
        return <p key={idx} style={{ margin: line ? '4px 0' : '8px 0' }}>{line}</p>;
      })}
    </div>
  );
}
import { chatWithRecruiter } from '../services/api';
import type { Candidate, ChatMessage } from '../types';

interface RecruiterChatbotProps {
  candidates?: Candidate[];
}

const suggestedPrompts = [
  'Why is Rahul ranked #1?',
  'Who has Angular experience?',
  'Which candidates are missing AWS?',
  'Compare Rahul and Arjun.',
  'Which required skill has the biggest candidate gap?',
];

export function RecruiterChatbot({ candidates }: RecruiterChatbotProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState(false);

  // STT Voice Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Initialize WebSocket connection when drawer opens
  useEffect(() => {
    if (!open) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
      return;
    }

    const wsUrl = 'ws://127.0.0.1:8001/ws/transcribe';
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Real-time Partial or Final Transcription streamed to input box
          if (data.event === 'partial_transcript' && data.text) {
            setInput(data.text.trim());
          } else if (data.event === 'final_transcript') {
            if (data.text && data.text.trim()) {
              setInput(data.text.trim());
              toast.success(`Transcribed with Moonshine Base (${data.latency_ms || 30}ms)`);
            }
          }
        } catch (e) {
          console.error('WebSocket parse error', e);
        }
      };

      ws.onerror = () => {
        setWsConnected(false);
      };

      ws.onclose = () => {
        setWsConnected(false);
      };
    } catch (err) {
      console.warn('Could not connect to Moonshine WebSocket server', err);
      setWsConnected(false);
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [open]);

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      // Optional Browser Speech Recognition for instant 0ms visual streaming
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';

          recognition.onresult = (event: any) => {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              interimTranscript += event.results[i][0].transcript;
            }
            if (interimTranscript.trim()) {
              setInput(interimTranscript.trim());
            }
          };

          recognition.onerror = () => {};
          recognition.start();
          speechRecognitionRef.current = recognition;
        } catch (e) {
          console.warn('Native SpeechRecognition unavailable, using Moonshine WebSocket streaming', e);
        }
      }

      // MediaRecorder streaming binary chunks to Moonshine WebSocket
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: 'start' }));
      }

      mediaRecorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const buffer = await e.data.arrayBuffer();
            wsRef.current.send(buffer);
          }
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());

        if (speechRecognitionRef.current) {
          try {
            speechRecognitionRef.current.stop();
          } catch (e) {}
          speechRecognitionRef.current = null;
        }

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ action: 'stop' }));
        } else {
          // REST Fallback if WebSocket not open
          try {
            const blob = new Blob(audioChunksRef.current, { type: mimeType });
            const formData = new FormData();
            formData.append('audio_file', blob, 'recording.webm');
            
            const res = await fetch('http://127.0.0.1:8001/api/stt/transcribe', {
              method: 'POST',
              body: formData,
            });
            const data = await res.json();
            if (data.text && data.text.trim()) {
              setInput(data.text.trim());
            }
          } catch (err) {
            console.error('REST STT error', err);
          }
        }
      };

      mediaRecorder.start(250); // Emit audio chunks every 250ms
      setIsRecording(true);
      toast.info('Listening... speak into your microphone.');
    } catch (err: any) {
      console.error('Microphone error:', err);
      toast.error('Could not access microphone. Please grant browser microphone permission.');
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopVoiceRecording();
    } else {
      startVoiceRecording();
    }
  };

  const handleAsk = async (queryText?: string) => {
    const q = (queryText || input).trim();
    if (!q) return;

    if (isRecording) {
      stopVoiceRecording();
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setTyping(true);

    try {
      const reply = await chatWithRecruiter(q, candidates);
      setMessages((prev) => [...prev, reply]);
    } catch {
      toast.error('Recruiter Assistant encountered an issue. Please retry.');
    } finally {
      setTyping(false);
    }
  };

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        type="button"
        className="chat-fab-btn"
        onClick={() => setOpen(true)}
        aria-label="Open Recruiter Intelligence Assistant"
      >
        <Sparkles size={16} />
        <span>Recruiter Assistant</span>
      </button>

      {/* Slide-Over Drawer */}
      {open && (
        <div className="drawer-backdrop chat-backdrop" onClick={() => setOpen(false)}>
          <aside
            className="chat-drawer-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-title"
          >
            {/* Header */}
            <header className="chat-header">
              <div className="chat-header-info">
                <div className="chat-bot-icon">
                  <Sparkles size={16} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <h3 id="chat-title">Recruiter Assistant</h3>
                    <span 
                      className={`status-badge-inline ${wsConnected ? 'status-strong' : ''}`}
                      style={{ fontSize: '9px', padding: '1px 6px' }}
                      title={wsConnected ? 'Moonshine Base STT WebSocket Connected' : 'Connecting to Moonshine STT...'}
                    >
                      <Radio size={10} style={{ color: wsConnected ? 'var(--success)' : 'var(--text-light)' }} />
                      Moonshine Base STT
                    </span>
                  </div>
                  <small>Context: Active candidate pool & job requirements</small>
                </div>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
              >
                <X size={18} />
              </button>
            </header>

            {/* Chat Body */}
            <div className="chat-body">
              {messages.length === 0 && (
                <div className="chat-welcome">
                  <div className="welcome-icon">
                    <Bot size={28} />
                  </div>
                  <h4>How can I assist your hiring decision?</h4>
                  <p>
                    Ask questions using text or real-time voice with <b>Moonshine Base STT</b>. I have full context over candidate rankings, qualifications, and skill evidence.
                  </p>

                  <div className="prompts-list">
                    {suggestedPrompts.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className="prompt-chip-btn"
                        onClick={() => handleAsk(p)}
                      >
                        <span>{p}</span>
                        <ArrowRight size={13} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="messages-stream">
                {messages.map((m) => (
                  <div key={m.id} className={`chat-bubble-row ${m.role}`}>
                    <div className="chat-avatar">
                      {m.role === 'assistant' ? <Sparkles size={13} /> : <UserIcon size={13} />}
                    </div>
                    <div className="chat-bubble">
                      <div className="chat-bubble-text">
                        {m.role === 'assistant' ? (
                          <SimpleMarkdown content={m.content} />
                        ) : (
                          m.content
                        )}
                      </div>
                      <span className="chat-timestamp">{m.timestamp}</span>
                    </div>
                  </div>
                ))}

                {typing && (
                  <div className="chat-bubble-row assistant">
                    <div className="chat-avatar">
                      <Sparkles size={13} />
                    </div>
                    <div className="chat-bubble typing-bubble">
                      <span className="dot" />
                      <span className="dot" />
                      <span className="dot" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Input Footer with Direct Real-time Transcription in Input Box */}
            <form
              className="chat-input-footer"
              onSubmit={(e) => {
                e.preventDefault();
                void handleAsk();
              }}
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isRecording ? 'Listening... speaking will transcribe here in real-time' : 'Ask Nexora about your candidates...'}
                aria-label="Ask Recruiter Assistant"
                style={{ 
                  borderColor: isRecording ? '#ef4444' : undefined,
                  boxShadow: isRecording ? '0 0 0 3px rgba(239, 68, 68, 0.2)' : undefined
                }}
              />

              {/* Voice Microphone Button (Click to start/stop) */}
              <button
                type="button"
                onClick={toggleRecording}
                className={`btn btn-secondary ${isRecording ? 'active-recording' : ''}`}
                style={{
                  height: '48px',
                  width: '48px',
                  minWidth: '48px',
                  padding: 0,
                  display: 'grid',
                  placeItems: 'center',
                  backgroundColor: isRecording ? '#ef4444' : undefined,
                  color: isRecording ? '#ffffff' : 'var(--text-secondary)',
                  border: isRecording ? '1px solid #dc2626' : undefined,
                  borderRadius: 'var(--radius-lg)',
                  transition: 'all 0.15s ease',
                  flexShrink: 0
                }}
                title={isRecording ? 'Click to stop listening' : 'Click to speak with Moonshine Base STT'}
                aria-label="Voice input"
              >
                {isRecording ? <Square size={18} /> : <Mic size={18} />}
              </button>

              {/* Send Button */}
              <button 
                type="submit" 
                className="send-btn" 
                disabled={!input.trim() || typing}
                title="Send message"
              >
                <ArrowRight size={18} />
              </button>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}
