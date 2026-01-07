import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, RotateCcw, Home, Share2, AlertTriangle } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { teamInfo } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export default function Result() {
  const [, navigate] = useLocation();
  const { selectedTeam, transformedImage, capturedImage, error, reset } = useApp();
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

  const handleRetry = () => {
    navigate("/captura");
  };

  const handleHome = () => {
    reset();
    navigate("/");
  };

  if (!displayImage && !error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
        <div className="text-center">
          <h1 className="mb-4 text-xl font-semibold">Sin imagen disponible</h1>
          <Button onClick={handleHome} data-testid="button-go-home">
            Volver al inicio
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto flex max-w-2xl flex-col items-center px-4 py-6 md:py-8">
        <div className="mb-6 text-center md:mb-8">
          <h1
            className="text-2xl font-bold md:text-3xl"
            data-testid="text-result-title"
          >
            {hasError ? "Ocurrió un Error" : "Tu Retrato Mundialista"}
          </h1>
          {selectedTeam && !hasError && (
            <p className="mt-2 text-muted-foreground">
              Fan de {teamInfo[selectedTeam].name}
            </p>
          )}
        </div>

        {hasError ? (
          <Card
            className="flex w-full max-w-md flex-col items-center justify-center gap-4 p-8"
            data-testid="card-error"
          >
            <AlertTriangle className="h-16 w-16 text-destructive" />
            <h2 className="text-lg font-semibold">No se pudo transformar la imagen</h2>
            <p className="text-center text-sm text-muted-foreground">
              {error || "Hubo un problema al procesar tu foto. Por favor, intenta de nuevo."}
            </p>
            {capturedImage && (
              <div className="mt-4 w-full">
                <p className="mb-2 text-center text-xs text-muted-foreground">Tu foto original:</p>
                <img
                  src={capturedImage}
                  alt="Foto original"
                  className="aspect-square w-full rounded-md object-cover"
                  data-testid="img-original-fallback"
                />
              </div>
            )}
          </Card>
        ) : (
          <Card
            className="relative aspect-square w-full max-w-md overflow-hidden"
            style={{
              borderColor: teamColors?.primary,
              borderWidth: teamColors ? "3px" : "1px",
            }}
            data-testid="card-result-image"
          >
            <img
              src={displayImage!}
              alt="Retrato mundialista"
              className="h-full w-full object-cover"
              data-testid="img-result"
            />
          </Card>
        )}

        <div className="mt-6 flex w-full max-w-md flex-col gap-3 md:mt-8">
          {!hasError && (
            <div className="flex gap-3">
              <Button
                size="lg"
                className="flex-1 gap-2 py-6 font-semibold"
                onClick={handleDownload}
                data-testid="button-download"
              >
                <Download className="h-5 w-5" />
                Descargar
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="gap-2 py-6"
                onClick={handleShare}
                data-testid="button-share"
              >
                <Share2 className="h-5 w-5" />
              </Button>
            </div>
          )}

          <Button
            size="lg"
            variant={hasError ? "default" : "outline"}
            className="w-full gap-2 py-6"
            onClick={handleRetry}
            data-testid="button-retry"
          >
            <RotateCcw className="h-5 w-5" />
            Volver a Intentar
          </Button>

          <Button
            size="lg"
            variant="ghost"
            className="w-full gap-2"
            onClick={handleHome}
            data-testid="button-home"
          >
            <Home className="h-5 w-5" />
            Inicio
          </Button>
        </div>
      </main>
    </div>
  );
}
