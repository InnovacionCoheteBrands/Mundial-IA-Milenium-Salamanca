import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Image as ImageIcon, Home } from "lucide-react";
import { Link } from "wouter";
import { type Transformation, teamInfo, type TeamId } from "@shared/schema";
import backgroundImage from "@assets/Captura_de_pantalla_2026-01-05_171649_1767827562768.png";
import mileniumLogo from "@assets/logo_milenium__1767829210784.png";

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
    <div className="relative min-h-screen">
      <div
        className="fixed inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${backgroundImage})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/80" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="flex items-center justify-between gap-4 p-4">
          <img
            src={mileniumLogo}
            alt="Milenium"
            className="h-8 w-auto object-contain sm:h-10"
          />
          <Link href="/">
            <Button variant="outline" size="sm" className="gap-2">
              <Home className="h-4 w-4" />
              Inicio
            </Button>
          </Link>
        </header>

        <main className="flex-1 p-4 sm:p-6 md:p-8">
          <div className="mx-auto max-w-6xl">
            <h1
              className="mb-6 text-center text-2xl font-bold text-white sm:text-3xl"
              data-testid="text-gallery-title"
            >
              Galería de Fans
            </h1>

            {isLoading ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square w-full rounded-md" />
                ))}
              </div>
            ) : !transformations || transformations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ImageIcon className="mb-4 h-16 w-16 text-white/50" />
                <h2
                  className="mb-2 text-xl font-semibold text-white"
                  data-testid="text-empty-state"
                >
                  Sin imágenes aún
                </h2>
                <p className="text-white/70">
                  Las transformaciones realizadas aparecerán aquí
                </p>
              </div>
            ) : (
              <>
                <p className="mb-6 text-center text-white/70">
                  {transformations.length} imágenes guardadas
                </p>

                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                  {transformations.map((transformation) => {
                    const team = transformation.team as TeamId;
                    const teamData = teamInfo[team];

                    return (
                      <Card
                        key={transformation.id}
                        className="group relative aspect-square overflow-hidden"
                        data-testid={`card-image-${transformation.id}`}
                      >
                        <img
                          src={transformation.transformedImageUrl}
                          alt={`Fan de ${teamData?.name || team}`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />

                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-white"
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

                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
                          <p className="text-xs font-medium text-white">
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
      </div>
    </div>
  );
}
