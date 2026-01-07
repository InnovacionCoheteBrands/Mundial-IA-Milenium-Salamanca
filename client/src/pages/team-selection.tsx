import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Check } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { TEAMS, teamInfo, type TeamId } from "@shared/schema";

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

export default function TeamSelection() {
  const [, navigate] = useLocation();
  const { selectedTeam, setSelectedTeam } = useApp();

  const handleTeamSelect = (team: TeamId) => {
    setSelectedTeam(team);
  };

  const handleContinue = () => {
    if (selectedTeam) {
      navigate("/captura");
    }
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
          Selecciona Tu Equipo
        </h1>
      </header>

      <main className="container mx-auto max-w-4xl px-4 py-6 md:py-8">
        <p className="mb-6 text-center text-muted-foreground md:mb-8 md:text-lg">
          Elige el equipo con el que quieres transformar tu foto
        </p>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
          {TEAMS.map((team) => {
            const info = teamInfo[team];
            const isSelected = selectedTeam === team;

            return (
              <Card
                key={team}
                className={`relative cursor-pointer overflow-visible p-4 transition-all duration-200 hover-elevate active-elevate-2 md:p-6 ${
                  isSelected
                    ? "ring-2 ring-primary ring-offset-2"
                    : ""
                }`}
                onClick={() => handleTeamSelect(team)}
                data-testid={`card-team-${team}`}
              >
                {isSelected && (
                  <div className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-4 w-4" />
                  </div>
                )}

                <div className="flex flex-col items-center gap-3">
                  <div className="relative h-12 w-16 overflow-hidden rounded-sm shadow-sm md:h-14 md:w-20">
                    <img
                      src={teamFlags[team]}
                      alt={`Bandera de ${info.name}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <span className="text-center text-sm font-medium md:text-base">
                    {info.name}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="mt-8 flex justify-center md:mt-10">
          <Button
            size="lg"
            disabled={!selectedTeam}
            onClick={handleContinue}
            className="w-full max-w-xs gap-2 py-6 text-lg font-semibold md:max-w-sm"
            data-testid="button-continue"
          >
            Continuar
          </Button>
        </div>
      </main>
    </div>
  );
}
