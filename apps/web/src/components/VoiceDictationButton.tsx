import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: any) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type VoiceDictationButtonProps = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
};

function getSpeechRecognitionCtor() {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export function VoiceDictationButton({ onTranscript, disabled, className }: VoiceDictationButtonProps) {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    setIsSupported(Boolean(getSpeechRecognitionCtor()));
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {}
    };
  }, []);

  const stopListening = () => {
    try {
      recognitionRef.current?.stop();
    } catch {}
    setIsListening(false);
  };

  const startListening = () => {
    const SpeechRecognition = getSpeechRecognitionCtor();
    if (!SpeechRecognition || disabled) return;

    const recognition = new SpeechRecognition() as SpeechRecognitionInstance;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results || [])
        .map((result: any) => result?.[0]?.transcript || '')
        .join(' ')
        .trim();
      if (transcript) onTranscript(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const unavailable = !isSupported;
  const label = unavailable ? 'Voice dictation unavailable' : isListening ? 'Stop dictation' : 'Start dictation';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={isListening ? 'default' : 'outline'}
          size="sm"
          className={className}
          disabled={disabled || unavailable}
          aria-label={label}
          title={label}
          onClick={(event) => {
            event.stopPropagation();
            if (isListening) {
              stopListening();
            } else {
              startListening();
            }
          }}
        >
          {isListening ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
