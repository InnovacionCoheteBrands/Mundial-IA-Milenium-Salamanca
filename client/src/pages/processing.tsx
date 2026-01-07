import { useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { teamInfo } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export default function Processing() {
  const [, navigate] = useLocation();
  const {
    selectedTeam,
    capturedImage,
    setTransformedImage,
    isProcessing,
    setIsProcessing,
    setError,
  } = useApp();

  const hasStartedRef = useRef(false);
  const teamColors = selectedTeam ? teamInfo[selectedTeam].colors : null;

  const processImage = useCallback(async () => {
    if (!selectedTeam || !capturedImage) return;
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    setIsProcessing(true);
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
      const errorMessage = error instanceof Error ? error.message : "Error desconocido";
      setError(errorMessage);
      setTransformedImage(null);
    } finally {
      setIsProcessing(false);
      navigate("/resultado");
    }
  }, [selectedTeam, capturedImage, setIsProcessing, setTransformedImage, setError, navigate]);

  useEffect(() => {
    if (!selectedTeam || !capturedImage) {
      navigate("/");
      return;
    }

    processImage();
  }, [selectedTeam, capturedImage, navigate, processImage]);

  if (!selectedTeam) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="flex flex-col items-center gap-8 text-center">
        <div className="relative">
          <div
            className="absolute inset-0 animate-ping rounded-full opacity-30"
            style={{ backgroundColor: teamColors?.primary }}
          />
          <div
            className="relative flex h-24 w-24 items-center justify-center rounded-full md:h-32 md:w-32"
            style={{ backgroundColor: teamColors?.primary }}
          >
            <Loader2 className="h-12 w-12 animate-spin text-white md:h-16 md:w-16" />
          </div>
        </div>

        <div className="space-y-3">
          <h1
            className="text-2xl font-bold md:text-3xl"
            data-testid="text-processing-title"
          >
            Transformando tu pasión...
          </h1>
          <p
            className="text-muted-foreground md:text-lg"
            data-testid="text-processing-subtitle"
          >
            Estamos creando tu retrato mundialista de {teamInfo[selectedTeam].name}
          </p>
        </div>

        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-3 w-3 animate-bounce rounded-full"
              style={{
                backgroundColor: teamColors?.primary,
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
