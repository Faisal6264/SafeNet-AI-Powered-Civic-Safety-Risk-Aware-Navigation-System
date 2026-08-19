export const initVoiceSOS = ({ onEmergencyTrigger, onListeningChange }) => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.warn("Speech recognition not supported in this browser.");
        return null;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        if(onListeningChange) onListeningChange(true);
    };

    recognition.onend = () => {
        if(onListeningChange) onListeningChange(false);
    };

    recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
        console.log("Voice SOS heard:", transcript);
        if (transcript.includes('help') || transcript.includes('emergency') || transcript.includes('sos')) {
            if(onEmergencyTrigger) onEmergencyTrigger();
        }
    };

    recognition.onerror = (event) => {
        console.error("Speech recognition error", event.error);
        if(onListeningChange) onListeningChange(false);
    };

    return recognition;
};
