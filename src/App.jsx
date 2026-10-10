import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
// Add page imports here
import PulpLayout from "@/components/PulpLayout";
import Home from "@/pages/Home";
import SlotGame from "@/pages/SlotGame";
import Wallet from "@/pages/Wallet";
import OperatorPortal from "@/pages/OperatorPortal";
import Holdem from "@/pages/Holdem";
import HoldemTable from "@/pages/HoldemTable";
import About from "@/pages/About";
import Contact from "@/pages/Contact";
import Leaderboard from "@/pages/Leaderboard";
import Roulette from "@/pages/Roulette";
import Blackjack from "@/pages/Blackjack";

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      {/* Add your page Route elements here */}
      <Route element={<PulpLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/play/:id" element={<SlotGame />} />
        <Route path="/wallet" element={<Wallet />} />
        <Route path="/operator" element={<OperatorPortal />} />
        <Route path="/holdem" element={<Holdem />} />
        <Route path="/holdem/:tableId" element={<HoldemTable />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/roulette" element={<Roulette />} />
        <Route path="/blackjack" element={<Blackjack />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App