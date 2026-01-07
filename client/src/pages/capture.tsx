import { useRef, useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Camera, Upload, RotateCcw, SwitchCamera, AlertCircle } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { teamInfo } from "@shared/schema";

export default function Capture() {
  const [, navigate] = useLocation();
  const { selectedTeam, setCapturedImage } = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const teamColors = selectedTeam ? teamInfo[selectedTeam].colors : null;

  const startCamera = useCallback(async () => {
    try {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 1280 },
        },
        audio: false,
      });

      setStream(mediaStream);
      setHasPermission(true);
      setError(null);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Camera error:", err);
      setHasPermission(false);
      setError("No se pudo acceder a la cámara. Por favor, permite el acceso o sube una imagen.");
    }
  }, [facingMode, stream]);

  useEffect(() => {
    if (!selectedTeam) {
      navigate("/seleccionar-equipo");
      return;
    }

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const switchCamera = () => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  useEffect(() => {
    if (hasPermission) {
      startCamera();
    }
  }, [facingMode]);

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0);

    const imageData = canvas.toDataURL("image/jpeg", 0.9);
    setCapturedPreview(imageData);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Por favor, selecciona un archivo de imagen válido.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setCapturedPreview(result);
    };
    reader.readAsDataURL(file);
  };

  const retakePhoto = () => {
    setCapturedPreview(null);
    startCamera();
  };

  const confirmPhoto = () => {
    if (capturedPreview) {
      setCapturedImage(capturedPreview);
      navigate("/procesando");
    }
  };

  if (!selectedTeam) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 flex items-center gap-4 border-b bg-background/95 px-4 py-3 backdrop-blur-sm md:px-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/seleccionar-equipo")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold md:text-xl" data-testid="text-page-title">
          Captura Tu Foto
        </h1>
      </header>

      <main className="container mx-auto flex max-w-2xl flex-col items-center px-4 py-6 md:py-8">
        <p className="mb-6 text-center text-muted-foreground">
          Toma una selfie o sube una foto para transformarla
        </p>

        <Card
          className="relative aspect-square w-full max-w-md overflow-hidden"
          style={{
            borderColor: teamColors?.primary,
            borderWidth: teamColors ? "3px" : "1px",
          }}
          data-testid="card-camera-preview"
        >
          {capturedPreview ? (
            <img
              src={capturedPreview}
              alt="Foto capturada"
              className="h-full w-full object-cover"
              data-testid="img-captured-preview"
            />
          ) : hasPermission === false ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-muted p-6 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
                data-testid="button-upload-fallback"
              >
                <Upload className="h-4 w-4" />
                Subir Imagen
              </Button>
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full object-cover ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
              data-testid="video-camera"
            />
          )}

          {hasPermission && !capturedPreview && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3 bg-black/30 text-white backdrop-blur-sm"
              onClick={switchCamera}
              data-testid="button-switch-camera"
            >
              <SwitchCamera className="h-5 w-5" />
            </Button>
          )}
        </Card>

        <canvas ref={canvasRef} className="hidden" />

        <div className="mt-6 flex w-full max-w-md flex-col items-center gap-4">
          {capturedPreview ? (
            <div className="flex w-full gap-4">
              <Button
                variant="outline"
                size="lg"
                className="flex-1 gap-2 py-6"
                onClick={retakePhoto}
                data-testid="button-retake"
              >
                <RotateCcw className="h-5 w-5" />
                Volver a Tomar
              </Button>
              <Button
                size="lg"
                className="flex-1 py-6 font-semibold"
                onClick={confirmPhoto}
                data-testid="button-confirm"
              >
                Transformar
              </Button>
            </div>
          ) : (
            <>
              {hasPermission && (
                <Button
                  size="lg"
                  className="h-20 w-20 rounded-full p-0"
                  onClick={capturePhoto}
                  data-testid="button-capture"
                >
                  <Camera className="h-8 w-8" />
                </Button>
              )}

              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-border" />
                <span className="text-sm text-muted-foreground">o</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <Button
                variant="outline"
                size="lg"
                className="w-full gap-2 py-6"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-upload"
              >
                <Upload className="h-5 w-5" />
                Subir Imagen
              </Button>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
          data-testid="input-file-upload"
        />
      </main>
    </div>
  );
}
