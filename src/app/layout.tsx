import type { Metadata, Viewport } from "next";
import { PerfilProvider } from "@/lib/auth/PerfilProvider";
import { MontosProvider } from "@/lib/ui/MontosProvider";
import { ModulosProvider } from "@/lib/hooks/useModulos";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import AvisoPagoPlanGlobal from "@/components/aviso-pago-plan";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "CmSports",
  description: "Plataforma de gestión deportiva",
  manifest: "/manifest.json",
  icons: {
    icon: "/logo.png",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CmSports",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#4f46e5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={cn("h-full antialiased", "font-sans", geist.variable)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}` }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegister />
        <PerfilProvider>
          <ModulosProvider>
            <MontosProvider>
              <AvisoPagoPlanGlobal />
              {children}
            </MontosProvider>
          </ModulosProvider>
        </PerfilProvider>
      </body>
    </html>
  );
}
