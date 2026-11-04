import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import KaziFlowApp from "./pages/KaziFlowApp";
import NotFound from "./pages/NotFound";

function Router() {
  return <Switch>
    <Route path="/" component={Home} />
    <Route path="/register" component={KaziFlowApp} />
    <Route path="/login" component={KaziFlowApp} />
    <Route path="/forgot-password" component={KaziFlowApp} />
    <Route path="/reset-password" component={KaziFlowApp} />
    <Route path="/verify-email" component={KaziFlowApp} />
    <Route path="/admin/login" component={KaziFlowApp} />
    <Route path="/admin/setup" component={KaziFlowApp} />
    <Route path="/dashboard" component={KaziFlowApp} />
    <Route path="/tasks" component={KaziFlowApp} />
    <Route path="/whatsapp-ads" component={KaziFlowApp} />
    <Route path="/submissions" component={KaziFlowApp} />
    <Route path="/earnings" component={KaziFlowApp} />
    <Route path="/wallet" component={KaziFlowApp} />
    <Route path="/withdraw" component={KaziFlowApp} />
    <Route path="/referrals" component={KaziFlowApp} />
    <Route path="/history" component={KaziFlowApp} />
    <Route path="/reviews" component={KaziFlowApp} />
    <Route path="/profile" component={KaziFlowApp} />
    <Route path="/support" component={KaziFlowApp} />
    <Route path="/activate" component={KaziFlowApp} />
    <Route path="/advertiser" component={KaziFlowApp} />
    <Route path="/advertiser/campaigns" component={KaziFlowApp} />
    <Route path="/admin" component={KaziFlowApp} />
    <Route path="/terms" component={KaziFlowApp} />
    <Route path="/privacy" component={KaziFlowApp} />
    <Route path="/payments" component={KaziFlowApp} />
    <Route path="/task-guidelines" component={KaziFlowApp} />
    <Route path="/advertising-guidelines" component={KaziFlowApp} />
    <Route path="/withdrawal-policy" component={KaziFlowApp} />
    <Route path="/404" component={NotFound} />
    <Route component={NotFound} />
  </Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light" switchable><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
