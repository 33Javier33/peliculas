import { redirect } from 'next/navigation'

// CineLatino ahora está dentro de Películas
export default function CineRedirect() {
  redirect('/peliculas?tab=cine')
}
