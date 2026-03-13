import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { getHesherResponse } from "../lib/hesherResponses";

interface ChatMessage {
  id: string;
  text: string;
  isAI: boolean;
  timestamp: number;
}

const STORAGE_KEY = "hesher-chat-messages";
const MAX_MESSAGES = 100;
const MAX_INPUT_LENGTH = 500;

function loadMessages(): ChatMessage[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed: ChatMessage[] = JSON.parse(stored);
    // Trim to max on load in case older data exceeded the limit
    return parsed.slice(-MAX_MESSAGES);
  } catch {
    return [];
  }
}

function saveMessages(messages: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)));
  } catch {
    // localStorage may be full or unavailable
  }
}

export default function HesherChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputValueRef = useRef("");

  // Keep ref in sync with input state for use in callbacks
  useEffect(() => {
    inputValueRef.current = input;
  }, [input]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Save messages to localStorage
  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  // Show welcome message on first open if no messages
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: "welcome",
          text: "Yo! I'm Hesher, your skate buddy. I can help you navigate SkateHubba, learn the S.K.A.T.E. game, find spots, and more. What's up?",
          isAI: true,
          timestamp: Date.now(),
        },
      ]);
    }
  }, [isOpen, messages.length]);

  const sendMessage = useCallback(() => {
    const trimmed = inputValueRef.current.trim();
    if (!trimmed) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      text: trimmed,
      isAI: false,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // Simulate brief typing delay
    setTimeout(
      () => {
        const response = getHesherResponse(trimmed);
        const aiMsg: ChatMessage = {
          id: crypto.randomUUID(),
          text: response,
          isAI: true,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, aiMsg]);
        setIsTyping(false);
      },
      400 + Math.random() * 600
    );
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <>
      {/* Floating bubble */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-20 right-4 z-50 md:bottom-6 md:right-6 w-14 h-14 rounded-full bg-yellow-400 text-black shadow-lg hover:bg-yellow-300 transition-all hover:scale-105 flex items-center justify-center"
          aria-label="Open Hesher chat"
          data-testid="hesher-bubble"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div
          className="fixed bottom-0 right-0 z-50 w-full h-full md:bottom-6 md:right-6 md:w-96 md:h-[32rem] md:rounded-2xl bg-neutral-900 border border-neutral-700 shadow-2xl flex flex-col md:max-h-[calc(100vh-3rem)]"
          role="dialog"
          aria-label="Hesher chat"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700 bg-neutral-800/80 md:rounded-t-2xl shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center text-black font-bold text-sm">
                H
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Hesher</h3>
                <p className="text-xs text-neutral-400">Skate Buddy</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={clearChat}
                className="h-8 w-8 text-neutral-400 hover:text-white"
                aria-label="Clear chat"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8 text-neutral-400 hover:text-white"
                aria-label="Close chat"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.isAI ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                    msg.isAI
                      ? "bg-neutral-800 text-white rounded-bl-md"
                      : "bg-yellow-400 text-black rounded-br-md"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-neutral-800 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-neutral-400">
                  <span className="inline-flex gap-1">
                    <span className="animate-bounce [animation-delay:0ms]">.</span>
                    <span className="animate-bounce [animation-delay:150ms]">.</span>
                    <span className="animate-bounce [animation-delay:300ms]">.</span>
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-neutral-700 shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Hesher anything..."
                maxLength={MAX_INPUT_LENGTH}
                className="flex-1 bg-neutral-800 text-white rounded-xl px-4 py-2.5 text-sm border border-neutral-600 focus:border-yellow-400 focus:outline-none placeholder:text-neutral-500"
                data-testid="hesher-input"
              />
              <Button
                onClick={sendMessage}
                disabled={!input.trim() || isTyping}
                size="icon"
                className="h-10 w-10 rounded-xl bg-yellow-400 text-black hover:bg-yellow-300 disabled:opacity-50"
                aria-label="Send message"
                data-testid="hesher-send"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
