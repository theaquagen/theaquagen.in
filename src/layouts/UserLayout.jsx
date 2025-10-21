import { Outlet } from "react-router-dom";

import UserHeader from "../components/headers/UserHeader";

import UserFooter from "../components/footers/UserFooter";

export default function UserLayout() {
    return (
        <div className="min-h-dvh flex flex-col bg-neutral-50">
            <UserHeader />
            
            <main className="mx-auto w-full max-w-5xl flex-1 p-4">
                <Outlet />
            </main>
            
            <UserFooter />
        </div>
    );
}