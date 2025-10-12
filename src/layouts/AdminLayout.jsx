import HeaderAdmin from "../components/headers/HeaderAdmin";
import FooterAdmin from "../components/footers/FooterAdmin";
import { Outlet } from "react-router-dom";

export default function AdminLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <HeaderAdmin />
      <main className="flex-1 container mx-auto p-4"><Outlet /></main>
      <FooterAdmin />
    </div>
  );
}
