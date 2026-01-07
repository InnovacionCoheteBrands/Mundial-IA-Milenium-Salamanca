import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import backgroundImage from "@assets/Captura_de_pantalla_2026-01-05_171649_1767827562768.png";
import trophyImage from "@assets/Base_Kickoff_2026_1767827570896.jpg";

export default function Welcome() {
  const [, navigate] = useLocation();

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${backgroundImage})` }}
      />
      
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />
      
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-12">
        <div className="flex flex-col items-center gap-6 text-center md:gap-8">
          <div className="relative">
            <img
              src={trophyImage}
              alt="Copa Mundial Milenium"
              className="h-40 w-auto object-contain drop-shadow-2xl md:h-56 lg:h-64"
              data-testid="img-trophy"
            />
          </div>
          
          <div className="space-y-3 md:space-y-4">
            <h1 
              className="text-3xl font-bold tracking-tight text-white drop-shadow-lg md:text-4xl lg:text-5xl"
              data-testid="text-headline"
            >
              Transforma Tu Pasión
            </h1>
            <p 
              className="max-w-md text-base text-white/90 md:text-lg lg:text-xl"
              data-testid="text-subheadline"
            >
              Conviértete en el fan definitivo del Mundial 2026 con un retrato único de tu equipo favorito
            </p>
          </div>
          
          <Button
            size="lg"
            onClick={() => navigate("/seleccionar-equipo")}
            className="mt-4 gap-2 rounded-full bg-white/20 px-8 py-6 text-lg font-semibold text-white backdrop-blur-md border border-white/30 md:px-10 md:py-7 md:text-xl"
            data-testid="button-comenzar"
          >
            Comenzar
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
        
        <footer className="absolute bottom-4 left-0 right-0 text-center">
          <button
            onClick={() => navigate("/admin-secreto")}
            className="text-xs text-white/30 transition-colors hover:text-white/50"
            data-testid="link-admin"
          >
            Admin
          </button>
        </footer>
      </div>
    </div>
  );
}
