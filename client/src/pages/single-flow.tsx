import { useRef, useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ChevronRight,
  Check,
  Camera,
  Upload,
  RotateCcw,
  SwitchCamera,
  AlertCircle,
  Download,
  Share2,
  Home,
  AlertTriangle,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useApp } from "@/lib/app-context";
import { TEAMS, teamInfo, type TeamId } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import backgroundImage from "@assets/Captura_de_pantalla_2026-01-05_171649_1767827562768.png";
import trophyImage from "@assets/Base_Kickoff_2026_1767827570896.jpg";

const teamFlags: Record<TeamId, string> = {
  mexico: "https://flagcdn.com/w80/mx.png",
  usa: "https://flagcdn.com/w80/us.png",
  canada: "https://flagcdn.com/w80/ca.png",
  spain: "https://flagcdn.com/w80/es.png",
  england: "https://flagcdn.com/w80/gb-eng.png",
  brazil: "https://flagcdn.com/w80/br.png",
  argentina: "https://flagcdn.com/w80/ar.png",
  portugal: "https://flagcdn.com/w80/pt.png",
};

const MAX_IMAGE_WIDTH = 1280;
const JPEG_QUALITY = 0.7;

function compressImage(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      let width = img.width;
      let height = img.height;

      if (width > MAX_IMAGE_WIDTH) {
        height = (height * MAX_IMAGE_WIDTH) / width;
        width = MAX_IMAGE_WIDTH;
      }

      canvas.width = width;
      canvas.height = height;

      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function IntroContent({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 p-6 text-center md:p-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-yellow-500">
        <Camera className="h-8 w-8 text-white" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-bold text-foreground md:text-2xl">
          Activa Tu Cámara
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground md:text-base">
          Necesitamos acceso a tu cámara para capturar tu foto y transformarla
          en un momento épico del Mundial.
        </p>
      </div>

      <Button
        size="lg"
        onClick={onContinue}
        className="gap-2 bg-gradient-to-r from-red-500 to-orange-500 px-8 py-6 text-lg font-semibold text-white"
        data-testid="button-comenzar"
      >
        <Camera className="h-5 w-5" />
        Activar Cámara
      </Button>
    </div>
  );
}

function TeamContent({ onContinue }: { onContinue: () => void }) {
  const { selectedTeam, setSelectedTeam } = useApp();

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="text-center">
        <h2 className="text-lg font-bold text-foreground md:text-xl">
          Selecciona Tu Equipo
        </h2>
        <p className="text-sm text-muted-foreground">
          Elige el equipo con el que quieres transformar tu foto
        </p>
      </div>

      <div className="grid grid-cols-4 gap-2 md:gap-3">
        {TEAMS.map((team) => {
          const info = teamInfo[team];
          const isSelected = selectedTeam === team;

          return (
            <button
              key={team}
              className={`relative flex flex-col items-center gap-1 rounded-md p-2 transition-all hover-elevate active-elevate-2 md:p-3 ${
                isSelected
                  ? "bg-primary/20 ring-2 ring-primary"
                  : "bg-muted/50"
              }`}
              onClick={() => setSelectedTeam(team)}
              data-testid={`card-team-${team}`}
            >
              {isSelected && (
                <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" />
                </div>
              )}
              <div className="h-8 w-12 overflow-hidden rounded-sm shadow-sm md:h-10 md:w-14">
                <img
                  src={teamFlags[team]}
                  alt={info.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <span className="text-xs font-medium md:text-sm">{info.name}</span>
            </button>
          );
        })}
      </div>

      <Button
        size="lg"
        disabled={!selectedTeam}
        onClick={onContinue}
        className="mt-2 w-full gap-2 bg-gradient-to-r from-red-500 to-orange-500 py-6 font-semibold text-white"
        data-testid="button-continue"
      >
        Continuar
        <ChevronRight className="h-5 w-5" />
      </Button>
    </div>
  );
}

function CaptureContent({ onContinue }: { onContinue: () => void }) {
  const { selectedTeam, setCapturedImage } = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);

  const teamColors = selectedTeam ? teamInfo[selectedTeam].colors : null;

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      stopCamera();

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          aspectRatio: { ideal: 16 / 9 },
        },
        audio: false,
      });

      streamRef.current = mediaStream;
      setHasPermission(true);
      setError(null);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Camera error:", err);
      setHasPermission(false);
      setError("No se pudo acceder a la cámara.");
    }
  }, [facingMode, stopCamera]);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  useEffect(() => {
    if (hasPermission) {
      startCamera();
    }
  }, [facingMode, hasPermission, startCamera]);

  const switchCamera = () => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

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

  const confirmPhoto = async () => {
    if (capturedPreview) {
      setIsCompressing(true);
      stopCamera();
      try {
        const compressedImage = await compressImage(capturedPreview);
        setCapturedImage(compressedImage);
        onContinue();
      } finally {
        setIsCompressing(false);
      }
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="text-center">
        <h2 className="text-lg font-bold text-foreground md:text-xl">
          Captura Tu Foto
        </h2>
        <p className="text-sm text-muted-foreground">
          Toma una foto horizontal para transformarla
        </p>
      </div>

      <div
        className="relative aspect-video w-full overflow-hidden rounded-lg"
        style={{
          borderColor: teamColors?.primary,
          borderWidth: teamColors ? "3px" : "1px",
          borderStyle: "solid",
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
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-muted p-4 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button
              variant="outline"
              size="sm"
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
            className="absolute right-2 top-2 bg-black/30 text-white backdrop-blur-sm"
            onClick={switchCamera}
            data-testid="button-switch-camera"
          >
            <SwitchCamera className="h-4 w-4" />
          </Button>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <div className="flex flex-col gap-3">
        {capturedPreview ? (
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              className="flex-1 gap-2"
              onClick={retakePhoto}
              disabled={isCompressing}
              data-testid="button-retake"
            >
              <RotateCcw className="h-4 w-4" />
              Volver
            </Button>
            <Button
              size="lg"
              className="flex-1 gap-2 bg-gradient-to-r from-red-500 to-orange-500 font-semibold text-white"
              onClick={confirmPhoto}
              disabled={isCompressing}
              data-testid="button-confirm"
            >
              {isCompressing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Preparando...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Transformar
                </>
              )}
            </Button>
          </div>
        ) : (
          <>
            {hasPermission && (
              <Button
                size="lg"
                className="w-full gap-2 bg-gradient-to-r from-red-500 to-orange-500 font-semibold text-white"
                onClick={capturePhoto}
                data-testid="button-capture"
              >
                <Camera className="h-5 w-5" />
                Capturar Foto
              </Button>
            )}

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">o</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Button
              variant="outline"
              size="lg"
              className="w-full gap-2"
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-upload"
            >
              <Upload className="h-4 w-4" />
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
    </div>
  );
}

function ProcessingContent({ onComplete }: { onComplete: () => void }) {
  const { selectedTeam, capturedImage, setTransformedImage, setError } =
    useApp();

  const hasStartedRef = useRef(false);
  const teamColors = selectedTeam ? teamInfo[selectedTeam].colors : null;

  const processImage = useCallback(async () => {
    if (!selectedTeam || !capturedImage) return;
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    setError(null);

    try {
      const response = await apiRequest("POST", "/api/transform", {
        team: selectedTeam,
        image: capturedImage,
      });

      const data = await response.json();

      if (data.transformedImage) {
        setTransformedImage(data.transformedImage);
        setError(null);
      } else {
        throw new Error("No se recibió la imagen transformada");
      }
    } catch (error) {
      console.error("Error processing image:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Error desconocido";
      setError(errorMessage);
      setTransformedImage(null);
    } finally {
      onComplete();
    }
  }, [selectedTeam, capturedImage, setTransformedImage, setError, onComplete]);

  useEffect(() => {
    processImage();
  }, [processImage]);

  return (
    <div className="flex flex-col items-center gap-6 p-8 text-center">
      <div className="relative">
        <div
          className="absolute inset-0 animate-ping rounded-full opacity-30"
          style={{ backgroundColor: teamColors?.primary || "#22c55e" }}
        />
        <div
          className="relative flex h-20 w-20 items-center justify-center rounded-full"
          style={{ backgroundColor: teamColors?.primary || "#22c55e" }}
        >
          <Loader2 className="h-10 w-10 animate-spin text-white" />
        </div>
      </div>

      <div className="space-y-2">
        <h2
          className="text-xl font-bold text-foreground"
          data-testid="text-processing-title"
        >
          Transformando tu pasión...
        </h2>
        <p
          className="text-sm text-muted-foreground"
          data-testid="text-processing-subtitle"
        >
          Estamos creando tu retrato mundialista
          {selectedTeam && ` de ${teamInfo[selectedTeam].name}`}
        </p>
      </div>

      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-2 w-2 animate-bounce rounded-full"
            style={{
              backgroundColor: teamColors?.primary || "#22c55e",
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ResultContent({
  onRetry,
  onHome,
}: {
  onRetry: () => void;
  onHome: () => void;
}) {
  const { selectedTeam, transformedImage, capturedImage, error } = useApp();
  const { toast } = useToast();

  const teamColors = selectedTeam ? teamInfo[selectedTeam].colors : null;
  const hasError = error !== null || !transformedImage;
  const displayImage = transformedImage || capturedImage;

  const handleDownload = () => {
    const imageToDownload = transformedImage || capturedImage;
    if (!imageToDownload) return;

    const link = document.createElement("a");
    link.href = imageToDownload;
    link.download = `fan-mundialista-${selectedTeam || "foto"}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Imagen descargada",
      description: "Tu retrato mundialista se ha guardado correctamente.",
    });
  };

  const handleShare = async () => {
    const imageToShare = transformedImage || capturedImage;
    if (!imageToShare) return;

    try {
      const blob = await fetch(imageToShare).then((r) => r.blob());
      const file = new File([blob], `fan-mundialista-${selectedTeam}.jpg`, {
        type: "image/jpeg",
      });

      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "Mi retrato mundialista",
          text: `Mira mi transformación como fan de ${selectedTeam ? teamInfo[selectedTeam].name : "mi equipo"}!`,
        });
      } else {
        handleDownload();
      }
    } catch (err) {
      console.error("Share error:", err);
      handleDownload();
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="text-center">
        <h2
          className="text-lg font-bold text-foreground md:text-xl"
          data-testid="text-result-title"
        >
          {hasError ? "Ocurrió un Error" : "Tu Retrato Mundialista"}
        </h2>
        {selectedTeam && !hasError && (
          <p className="text-sm text-muted-foreground">
            Fan de {teamInfo[selectedTeam].name}
          </p>
        )}
      </div>

      {hasError ? (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <p className="text-sm text-muted-foreground">
            {error || "Hubo un problema al procesar tu foto."}
          </p>
          {capturedImage && (
            <img
              src={capturedImage}
              alt="Foto original"
              className="aspect-video w-full max-w-sm rounded-md object-cover"
              data-testid="img-original-fallback"
            />
          )}
        </div>
      ) : (
        <div
          className="relative aspect-video w-full overflow-hidden rounded-lg"
          style={{
            borderColor: teamColors?.primary,
            borderWidth: teamColors ? "3px" : "1px",
            borderStyle: "solid",
          }}
          data-testid="card-result-image"
        >
          <img
            src={displayImage!}
            alt="Retrato mundialista"
            className="h-full w-full object-cover"
            data-testid="img-result"
          />
        </div>
      )}

      <div className="flex flex-col gap-3">
        {!hasError && (
          <div className="flex gap-3">
            <Button
              size="lg"
              className="flex-1 gap-2 bg-gradient-to-r from-red-500 to-orange-500 font-semibold text-white"
              onClick={handleDownload}
              data-testid="button-download"
            >
              <Download className="h-4 w-4" />
              Descargar
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="gap-2"
              onClick={handleShare}
              data-testid="button-share"
            >
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        )}

        <Button
          size="lg"
          variant={hasError ? "default" : "outline"}
          className={`w-full gap-2 ${hasError ? "bg-gradient-to-r from-red-500 to-orange-500 text-white" : ""}`}
          onClick={onRetry}
          data-testid="button-retry"
        >
          <RotateCcw className="h-4 w-4" />
          Volver a Intentar
        </Button>

        <Button
          size="lg"
          variant="ghost"
          className="w-full gap-2"
          onClick={onHome}
          data-testid="button-home"
        >
          <Home className="h-4 w-4" />
          Inicio
        </Button>
      </div>
    </div>
  );
}

export default function SingleFlowPage() {
  const [, navigate] = useLocation();
  const {
    currentStep,
    setCurrentStep,
    goToNextStep,
    reset,
    setCapturedImage,
    setTransformedImage,
    setError,
  } = useApp();

  const handleRetry = () => {
    setCapturedImage(null);
    setTransformedImage(null);
    setError(null);
    setCurrentStep("capture");
  };

  const handleHome = () => {
    reset();
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case "intro":
        return <IntroContent onContinue={goToNextStep} />;
      case "team":
        return <TeamContent onContinue={goToNextStep} />;
      case "capture":
        return <CaptureContent onContinue={goToNextStep} />;
      case "processing":
        return <ProcessingContent onComplete={goToNextStep} />;
      case "result":
        return <ResultContent onRetry={handleRetry} onHome={handleHome} />;
      default:
        return <IntroContent onContinue={goToNextStep} />;
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div
        className="fixed inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${backgroundImage})` }}
      />
      <div className="fixed inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/80" />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="flex items-center justify-between px-4 py-4 md:px-8 md:py-6">
          <img
            src={trophyImage}
            alt="Copa Mundial"
            className="h-12 w-auto object-contain drop-shadow-lg md:h-16"
            data-testid="img-trophy"
          />
          <div className="text-right">
            <span className="text-xs font-bold tracking-wider text-white/80 md:text-sm">
              MILENIUM
            </span>
          </div>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center px-4 py-4 md:py-8">
          <div className="mb-6 text-center md:mb-8">
            <Sparkles className="mx-auto mb-2 h-6 w-6 text-yellow-400" />
            <h1
              className="text-2xl font-bold tracking-tight text-white drop-shadow-lg md:text-4xl lg:text-5xl"
              data-testid="text-headline"
            >
              LEYENDA DEL MUNDIAL
            </h1>
            <div className="mx-auto my-2 h-1 w-16 bg-gradient-to-r from-green-500 to-yellow-500" />
            <p
              className="text-sm text-white/80 md:text-base"
              data-testid="text-subheadline"
            >
              Vive la experiencia del Mundial con Milenium.
            </p>
          </div>

          <Card className="w-full max-w-md bg-background/95 backdrop-blur-md md:max-w-lg">
            {renderStepContent()}
          </Card>
        </main>

        <footer className="py-4 text-center">
          <p className="flex items-center justify-center gap-2 text-xs text-white/50">
            <Sparkles className="h-3 w-3" />
            Potenciado por Tecnología de COHETE BRANDS
            <Sparkles className="h-3 w-3" />
          </p>
          <button
            onClick={() => navigate("/admin-secreto")}
            className="mt-2 text-xs text-white/20 transition-colors hover:text-white/40"
            data-testid="link-admin"
          >
            Admin
          </button>
        </footer>
      </div>
    </div>
  );
}
