"use client";

import { useAuth } from "@/lib/auth-context";
import { AdminDashboard } from "@/components/app/admin-dashboard";
import { BarberToday } from "@/components/app/barber-today";

export default function HomePage() {
  const { isAdmin } = useAuth();
  return isAdmin ? <AdminDashboard /> : <BarberToday />;
}
