import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Download, Image as ImageIcon } from "lucide-react";
import type { Transformation } from "@shared/schema";
import { teamInfo, type TeamId } from "@shared/schema";

export default function AdminGallery() {
  const [, navigate] = useLocation();

  const { data: transformations, isLoading } = useQuery<Transformation[]>({
    queryKey: ["/api/transformations"],
  });

  const handleDownload = (imageUrl: string, id: number, team: string) => {
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `transformacion-${team}-${id}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 flex items-center gap-4 border-b bg-background/95 px-4 py-3 backdrop-blur-sm md:px-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold md:text-xl" data-testid="text-page-title">
          Galería de Administrador
        </h1>
      </header>

      <main className="container mx-auto max-w-6xl px-4 py-6 md:py-8">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square w-full rounded-md" />
            ))}
          </div>
        ) : !transformations || transformations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ImageIcon className="mb-4 h-16 w-16 text-muted-foreground/50" />
            <h2 className="mb-2 text-xl font-semibold" data-testid="text-empty-state">
              Sin transformaciones aún
            </h2>
            <p className="text-muted-foreground">
              Las transformaciones realizadas aparecerán aquí
            </p>
          </div>
        ) : (
          <>
            <p className="mb-6 text-muted-foreground">
              {transformations.length} transformaciones guardadas
            </p>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {transformations.map((transformation) => {
                const team = transformation.team as TeamId;
                const teamData = teamInfo[team];

                return (
                  <Card
                    key={transformation.id}
                    className="group relative aspect-square overflow-hidden"
                    data-testid={`card-transformation-${transformation.id}`}
                  >
                    <img
                      src={transformation.transformedImageUrl}
                      alt={`Transformación ${transformation.id}`}
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
                      <p className="text-xs text-white">
                        {teamData?.name || team}
                      </p>
                      <p className="text-xs text-white/70">
                        {new Date(transformation.createdAt).toLocaleDateString("es-ES")}
                      </p>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
