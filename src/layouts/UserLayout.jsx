import { Outlet, useLocation } from "react-router-dom";

import { Container } from "../components/ui/Container";

import { Navbar } from "../components/headers/Navbar";

import Header from "../components/headers/Header";

import UserFooter from "../components/footers/UserFooter";

import { GradientBackground } from "../components/ui/Gradient";

export default function UserLayout() {
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <div className="min-h-dvh overflow-hidden">
      
      {isHome ? (
        <>
          <Header />
        </>
      ) : (
        <>
          <GradientBackground />
          <Container>
            <Navbar />
          </Container>
        </>
      )}

      <main className="text-gray-950 antialiased">
        <Outlet />
      </main>

      <UserFooter />
    </div>
  );
}
