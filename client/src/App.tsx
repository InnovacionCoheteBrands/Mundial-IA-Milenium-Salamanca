import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider } from "@/lib/app-context";
import Welcome from "@/pages/welcome";
import TeamSelection from "@/pages/team-selection";
import Capture from "@/pages/capture";
import Processing from "@/pages/processing";
import Result from "@/pages/result";
import AdminGallery from "@/pages/admin-gallery";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Welcome} />
      <Route path="/seleccionar-equipo" component={TeamSelection} />
      <Route path="/captura" component={Capture} />
      <Route path="/procesando" component={Processing} />
      <Route path="/resultado" component={Result} />
      <Route path="/admin-secreto" component={AdminGallery} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppProvider>
          <Toaster />
          <Router />
        </AppProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
