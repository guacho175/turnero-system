/**
 * Raíz del sitio
 * Redirige a /login
 */
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/login");
}