import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Image as ImageIcon, Home, Sparkles, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { type Transformation, teamInfo, type TeamId } from "@shared/schema";
import worldcupBg from "@assets/generated_images/worldcup_background.png";
import mileniumLogo from "@assets/logo_milenium__1767829210784.png";
import trophyImage from "@assets/ChatGPT_Image_6_ene_2026,_15_32_44_1767829210783.png";

export default function ImagesGallery() {
  const { data: transformations, isLoading } = useQuery<Transformation[]>({
    queryKey: ["/api/images"],
    refetchOnMount: "always",
    staleTime: 0,
  });

  const handleDownload = (imageUrl: string, id: number, team: string) => {
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `fan-mundialista-${team}-${id}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      {/* Background — same as homepage */}
      <div
        className="fixed inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${worldcupBg})` }}
      />
      <div className="fixed inset-0 bg-gradient-to-b from-black/72 via-green-950/60 to-black/80" />

      <div className="relative z-10 flex h-full flex-col">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between gap-2 px-3 py-1.5 sm:px-4 sm:py-3 md:px-8 md:py-5">
          <div className="flex items-center gap-2">
            <img
              src={trophyImage}
              alt="Copa Mundial"
              className="h-8 w-auto object-contain drop-shadow-lg sm:h-12"
            />
            <Link href="/">
              <Button
                size="sm"
                className="gap-1.5 bg-red-600 font-semibold text-white hover:bg-red-700"
                data-testid="button-home"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Inicio
              </Button>
            </Link>
          </div>
          <img
            src={mileniumLogo}
            alt="Milenium"
            className="h-7 w-auto object-contain sm:h-9"
          />
        </header>

        {/* Title */}
        <div className="shrink-0 px-3 pb-2 text-center sm:px-4">
          <h1 className="text-xl font-black uppercase tracking-tight text-white drop-shadow-2xl sm:text-3xl">
            Galería de{" "}
            <span className="text-red-500 drop-shadow-[0_2px_8px_rgba(220,38,38,0.6)]">
              Fans
            </span>
          </h1>
        </div>

        {/* Content */}
        <main className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 sm:px-4 sm:pb-3 md:px-8">
          <div className="mx-auto max-w-6xl">
            {isLoading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="aspect-video w-full rounded-xl bg-green-900/40 md:aspect-square"
                  />
                ))}
              </div>
            ) : !transformations || transformations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ImageIcon className="mb-4 h-16 w-16 text-green-400/50" />
                <h2 className="mb-2 text-xl font-semibold text-white" data-testid="text-empty-state">
                  Sin imágenes aún
                </h2>
                <p className="text-white/60">
                  Las transformaciones realizadas aparecerán aquí
                </p>
              </div>
            ) : (
              <>
                <p className="mb-4 text-center text-xs font-semibold uppercase tracking-wide text-green-400/70 sm:text-sm">
                  {transformations.length} imágenes guardadas
                </p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {transformations.map((transformation) => {
                    const team = transformation.team as TeamId;
                    const teamData = teamInfo[team];

                    return (
                      <Card
                        key={transformation.id}
                        className="group relative aspect-video overflow-hidden border-green-700/30 bg-green-950/60 md:aspect-square"
                        data-testid={`card-image-${transformation.id}`}
                      >
                        <img
                          src={transformation.transformedImageUrl}
                          alt={`Fan de ${teamData?.name || team}`}
                          className="h-full w-full bg-black/20 object-contain md:object-cover"
                          loading="lazy"
                        />

                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-white hover:bg-white/20"
                            onClick={() =>
                              handleDownload(
                                transformation.transformedImageUrl,
                                transformation.id,
                                transformation.team
                              )
                            }
                            data-testid={`button-download-${transformation.id}`}
                          >
                            <Download className="h-6 w-6" />
                          </Button>
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-2">
                          <p className="text-[11px] font-semibold text-white">
                            {teamData?.name || team}
                          </p>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="shrink-0 py-1 text-center sm:py-2">
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-white/60 hover:text-white hover:bg-white/10"
            >
              <Home className="h-3.5 w-3.5" />
              Volver al inicio
            </Button>
          </Link>
          <p className="mt-0.5 flex items-center justify-center gap-1 text-[9px] text-white/30">
            <Sparkles className="h-2 w-2" />
            Potenciado por Tecnología de COHETE BRANDS
            <Sparkles className="h-2 w-2" />
          </p>
        </footer>
      </div>
    </div>
  );
}
