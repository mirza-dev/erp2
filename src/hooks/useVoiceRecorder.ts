"use client";

/**
 * useVoiceRecorder — MediaRecorder tabanlı ses kaydı hook'u.
 * Toggle: tıkla başlat / tıkla durdur.
 * Max süre: 90 saniye (otomatik durdurur).
 * Sessizlik algılama: YOK.
 * V2: AudioContext AnalyserNode ile anlık mikrofon seviyesi (volume).
 */

import { useState, useRef, useCallback, useEffect } from "react";

const MAX_DURATION_SEC = 90;

export interface VoiceRecorderResult {
    blob: Blob;
    filename: string; // "recording.webm" veya "recording.mp4"
}

interface UseVoiceRecorder {
    isRecording: boolean;
    isProcessing: boolean;
    duration: number;       // saniye cinsinden kayıt süresi
    volume: number;         // 0-255 arası anlık mikrofon seviyesi (kayıt sırasında)
    error: string | null;
    startRecording: () => Promise<void>;
    stopRecording: () => void;
    cancelRecording: () => void;
}

export function useVoiceRecorder(
    onResult: (result: VoiceRecorderResult) => Promise<void>,
): UseVoiceRecorder {
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const mediaRecorder = useRef<MediaRecorder | null>(null);
    const chunks = useRef<Blob[]>([]);
    const stream = useRef<MediaStream | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancelledRef = useRef(false);

    // Web Audio API refs (görselleştirme için)
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animFrameRef = useRef<number | null>(null);

    // Timer temizleme yardımcısı
    const clearTimers = useCallback(() => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null; }
    }, []);

    // Stream'i serbest bırak
    const releaseStream = useCallback(() => {
        stream.current?.getTracks().forEach(t => t.stop());
        stream.current = null;
    }, []);

    // AudioContext ve AnalyserNode'u serbest bırak
    const releaseAudio = useCallback(() => {
        if (animFrameRef.current !== null) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = null;
        }
        audioContextRef.current?.close().catch(() => {});
        audioContextRef.current = null;
        analyserRef.current = null;
        setVolume(0);
    }, []);

    const startRecording = useCallback(async () => {
        setError(null);
        cancelledRef.current = false;

        if (!navigator.mediaDevices?.getUserMedia) {
            setError("Tarayıcınız mikrofon erişimini desteklemiyor.");
            return;
        }

        if (typeof MediaRecorder === "undefined") {
            setError("Tarayıcınız ses kaydını desteklemiyor.");
            return;
        }

        let userStream: MediaStream;
        try {
            userStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
            setError("Mikrofon izni reddedildi. Tarayıcı ayarlarından izin verin.");
            return;
        }

        stream.current = userStream;
        chunks.current = [];

        // Format seçimi: WebM > MP4 (Safari fallback)
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4"
            : "";

        const options = mimeType ? { mimeType } : {};
        const recorder = new MediaRecorder(userStream, options);
        mediaRecorder.current = recorder;

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.current.push(e.data);
        };

        recorder.onstop = async () => {
            clearTimers();
            releaseAudio();
            releaseStream();
            setIsRecording(false);
            setDuration(0);

            if (cancelledRef.current) {
                chunks.current = [];
                return;
            }

            const blob = new Blob(chunks.current, { type: mimeType || "audio/webm" });
            chunks.current = [];

            if (blob.size === 0) {
                setError("Ses kaydı boş. Tekrar deneyin.");
                return;
            }

            const filename = mimeType.includes("mp4") ? "recording.mp4" : "recording.webm";

            setIsProcessing(true);
            try {
                await onResult({ blob, filename });
            } catch (err) {
                setError(err instanceof Error ? err.message : "Ses işlenemedi.");
            } finally {
                setIsProcessing(false);
            }
        };

        recorder.start(250); // 250ms chunk'lar
        setIsRecording(true);
        setDuration(0);

        // Saniye sayacı
        timerRef.current = setInterval(() => {
            setDuration(d => d + 1);
        }, 1000);

        // 90sn maksimum
        autoStopRef.current = setTimeout(() => {
            if (mediaRecorder.current?.state === "recording") {
                mediaRecorder.current.stop();
            }
        }, MAX_DURATION_SEC * 1000);

        // Ses dalgası görselleştirme (non-critical — AudioContext yoksa atla)
        try {
            const audioCtx = new AudioContext();
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            audioCtx.createMediaStreamSource(userStream).connect(analyser);
            audioContextRef.current = audioCtx;
            analyserRef.current = analyser;

            const data = new Uint8Array(analyser.frequencyBinCount);
            const tick = () => {
                if (!analyserRef.current) return;
                analyserRef.current.getByteFrequencyData(data);
                const avg = data.reduce((a, b) => a + b, 0) / data.length;
                setVolume(Math.round(avg));
                animFrameRef.current = requestAnimationFrame(tick);
            };
            animFrameRef.current = requestAnimationFrame(tick);
        } catch {
            // AudioContext desteklenmiyorsa görselleştirme atla — kayıt devam eder
        }
    }, [onResult, clearTimers, releaseAudio, releaseStream]);

    const stopRecording = useCallback(() => {
        if (mediaRecorder.current?.state === "recording") {
            mediaRecorder.current.stop();
        }
    }, []);

    const cancelRecording = useCallback(() => {
        cancelledRef.current = true;
        clearTimers();
        releaseAudio();
        if (mediaRecorder.current?.state === "recording") {
            mediaRecorder.current.stop();
        }
        releaseStream();
        setIsRecording(false);
        setDuration(0);
        setError(null);
    }, [clearTimers, releaseAudio, releaseStream]);

    // Unmount'ta temizlik
    useEffect(() => {
        return () => {
            cancelledRef.current = true;
            clearTimers();
            releaseAudio();
            releaseStream();
        };
    }, [clearTimers, releaseAudio, releaseStream]);

    return { isRecording, isProcessing, duration, volume, error, startRecording, stopRecording, cancelRecording };
}
