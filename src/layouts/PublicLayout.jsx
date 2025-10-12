import HeaderPublic from "../components/headers/HeaderPublic";
import FooterPublic from "../components/footers/FooterPublic";
import { Outlet } from "react-router-dom";

export default function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <HeaderPublic />
      <main className="flex-1 container mx-auto p-4"><Outlet /></main>
      <FooterPublic />
    </div>
  );
}