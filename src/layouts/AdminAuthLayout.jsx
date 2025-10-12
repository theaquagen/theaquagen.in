import HeaderAdmin from "../components/headers/HeaderAdmin";
import FooterAdmin from "../components/footers/FooterAdmin";
import { Outlet } from "react-router-dom";

export default function AdminAuthLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <HeaderAdmin />
      <main className="flex-1 flex items-center justify-center p-6">
        <Outlet />
      </main>
      <FooterAdmin />
    </div>
  );
}